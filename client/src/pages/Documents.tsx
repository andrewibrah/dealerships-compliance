import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, Download, FileText, Lock } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const DOC_TYPE_LABELS: Record<string, string> = {
  wisp: "WISP Document",
  board_report: "Board Report",
  security_architecture: "Security Architecture Assessment",
  risk_assessment: "Written Risk Assessment",
};

export default function Documents() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();

  const subscriptionQuery = trpc.stripe.getSubscriptionStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const documentsQuery = trpc.documents.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const dealershipQuery = trpc.dealership.getCurrent.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const hasSubscription =
    subscriptionQuery.data != null &&
    subscriptionQuery.data.plan !== "free" &&
    subscriptionQuery.data.status === "active";

  const onGenerated = (url: string | null, label: string) => {
    toast.success(`${label} generated`);
    documentsQuery.refetch();
    if (url) window.open(url, "_blank");
  };
  const onGenerateError = (message: string) => {
    toast.error(message);
  };

  const generateWISP = trpc.pdf.generateWISP.useMutation({
    onSuccess: (res) => onGenerated(res.url, "WISP"),
    onError: (e) => onGenerateError(e.message),
  });
  const generateBoardReport = trpc.pdf.generateBoardReport.useMutation({
    onSuccess: (res) => onGenerated(res.url, "Board report"),
    onError: (e) => onGenerateError(e.message),
  });
  const generateArchitecture = trpc.pdf.generateSecurityArchitectureAssessment.useMutation({
    onSuccess: (res) => onGenerated(res.url, "Security Architecture Assessment"),
    onError: (e) => onGenerateError(e.message),
  });
  const generateRiskAssessment = trpc.pdf.generateRiskAssessment.useMutation({
    onSuccess: (res) => onGenerated(res.url, "Written Risk Assessment"),
    onError: (e) => onGenerateError(e.message),
  });
  const isGenerating =
    generateWISP.isPending ||
    generateBoardReport.isPending ||
    generateArchitecture.isPending ||
    generateRiskAssessment.isPending;

  if (loading || (isAuthenticated && (subscriptionQuery.isLoading || dealershipQuery.isLoading))) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const handleGenerateWISP = () => {
    if (!hasSubscription) {
      setLocation("/pricing");
      return;
    }
    generateWISP.mutate();
  };

  const handleGenerateBoardReport = () => {
    if (!hasSubscription) {
      setLocation("/pricing");
      return;
    }
    generateBoardReport.mutate();
  };

  const handleGenerateArchitecture = () => {
    if (!hasSubscription) {
      setLocation("/pricing");
      return;
    }
    generateArchitecture.mutate();
  };

  const handleGenerateRiskAssessment = () => {
    if (!hasSubscription) {
      setLocation("/pricing");
      return;
    }
    generateRiskAssessment.mutate();
  };

  const documents = documentsQuery.data ?? [];
  const dealership = dealershipQuery.data;
  const missingWispFields = [
    !dealership?.name || dealership.name === "My Dealership" ? "dealership name" : null,
    !dealership?.address ? "address" : null,
    !dealership?.city ? "city" : null,
    !dealership?.state ? "state" : null,
    !dealership?.qualifiedIndividual ? "Qualified Individual" : null,
    !dealership?.qiEmail ? "QI email" : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white">Document Vault</h1>
          <p className="text-slate-400">Generate and download your compliance documents</p>
        </div>
      </div>

      {/* Subscription Banner */}
      {!hasSubscription && (
        <div className="border-b border-amber-600 bg-amber-950/30">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="text-amber-500" size={20} />
              <div>
                <h3 className="font-semibold text-amber-300">Core plan required</h3>
                <p className="text-sm text-amber-200">
                  Document generation is included in the Core plan. Your assessment and gap analysis stay
                  free.
                </p>
              </div>
            </div>
            <Button
              onClick={() => setLocation("/pricing")}
              className="bg-amber-600 hover:bg-amber-500 text-slate-950"
            >
              Upgrade Now - $199/month
            </Button>
          </div>
        </div>
      )}

      {missingWispFields.length > 0 && (
        <div className="border-b border-blue-600 bg-blue-950/30">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-blue-200">Profile details are missing</h3>
                <p className="text-sm text-blue-100">
                  Your WISP will say "My Dealership" or "Not designated" until you complete: {missingWispFields.join(", ")}.
                </p>
              </div>
            </div>
            <Button onClick={() => setLocation("/profile")} className="bg-blue-600 hover:bg-blue-700">
              Fix Profile
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        {/* Document Generation Cards */}
        <div className="grid gap-8 md:grid-cols-2 mb-12">
          {/* WISP Document */}
          <Card className="bg-slate-800 border-slate-700 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="text-blue-500" size={28} />
              <h2 className="text-2xl font-bold text-white">WISP Document</h2>
            </div>

            <p className="text-slate-300 mb-6 flex-1">
              Written Information Security Program (WISP) - A comprehensive document outlining your dealership's
              information security measures in compliance with FTC Safeguards Rule 16 CFR Part 314.
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Built from your saved assessment answers</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>All 9 Safeguards elements with open gaps flagged</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Prioritized remediation list</span>
              </div>
            </div>

            <Button
              onClick={handleGenerateWISP}
              disabled={isGenerating}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {generateWISP.isPending
                ? "Generating..."
                : hasSubscription
                  ? "Generate WISP PDF"
                  : "Upgrade to generate"}
            </Button>
          </Card>

          {/* Board Report */}
          <Card className="bg-slate-800 border-slate-700 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="text-purple-500" size={28} />
              <h2 className="text-2xl font-bold text-white">Board Report</h2>
            </div>

            <p className="text-slate-300 mb-6 flex-1">
              Annual Compliance Report - An executive summary for your board of directors highlighting compliance
              status, risk assessment, and recommendations for improving your security posture.
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Executive summary with overall score</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Critical findings by Safeguards element</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Recommended actions for the next 90 days</span>
              </div>
            </div>

            <Button
              onClick={handleGenerateBoardReport}
              disabled={isGenerating}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {generateBoardReport.isPending
                ? "Generating..."
                : hasSubscription
                  ? "Generate Board Report"
                  : "Upgrade to generate"}
            </Button>
          </Card>

          {/* Security Architecture Assessment */}
          <Card className="bg-slate-800 border-slate-700 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="text-emerald-500" size={28} aria-hidden="true" />
              <h2 className="text-2xl font-bold text-white">Security Architecture Assessment</h2>
            </div>

            <p className="text-slate-300 mb-6 flex-1">
              An expert cybersecurity architecture review organized into six domains — Cloud &amp; Infrastructure,
              Access &amp; Identity, Data Protection, Risk Assessment, Vendor, and an advisory AI &amp; Emerging Tech
              lens — every finding grounded in your saved answers and inventory.
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Six architecture domains with derived posture</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Every gap traced to a §314.4 citation and your answer</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Grounded in your assets, data flows, and risks</span>
              </div>
            </div>

            <Button
              onClick={handleGenerateArchitecture}
              disabled={isGenerating}
              className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950"
            >
              {generateArchitecture.isPending
                ? "Generating..."
                : hasSubscription
                  ? "Generate Architecture Assessment"
                  : "Upgrade to generate"}
            </Button>
          </Card>

          {/* Written Risk Assessment */}
          <Card className="bg-slate-800 border-slate-700 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="text-cyan-500" size={28} aria-hidden="true" />
              <h2 className="text-2xl font-bold text-white">Written Risk Assessment</h2>
            </div>

            <p className="text-slate-300 mb-6 flex-1">
              The FTC-required written risk assessment (§314.4(b)) — your inventoried systems, mapped customer-NPI
              data flows, logged risks, and the derived risk-assessment findings in one regulator-ready document.
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Asset inventory and NPI data-flow map</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Your risk register with likelihood and impact</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>§314.4(b) findings with reassessment cadence</span>
              </div>
            </div>

            <Button
              onClick={handleGenerateRiskAssessment}
              disabled={isGenerating}
              className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950"
            >
              {generateRiskAssessment.isPending
                ? "Generating..."
                : hasSubscription
                  ? "Generate Risk Assessment"
                  : "Upgrade to generate"}
            </Button>
          </Card>
        </div>

        {/* Previously Generated Documents */}
        <Card className="bg-slate-800 border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Previously Generated Documents</h2>

          {documents.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="mx-auto text-slate-500 mb-4" size={48} />
              <p className="text-slate-400 mb-4">No documents generated yet</p>
              <p className="text-sm text-slate-500">
                Generate your first WISP or Board Report to see them here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...documents]
                .sort(
                  (a, b) =>
                    new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
                )
                .map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between border border-slate-700 rounded-lg px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="text-slate-400" size={20} />
                      <div>
                        <p className="text-white font-medium">
                          {DOC_TYPE_LABELS[doc.docType] ?? doc.docType} (v{doc.version})
                        </p>
                        <p className="text-xs text-slate-400">
                          Generated {new Date(doc.generatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {doc.url ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={doc.url} target="_blank" rel="noreferrer">
                          <Download size={16} className="mr-2" />
                          Download
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-500">Download unavailable</span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </Card>

        {/* Document Information */}
        <Card className="mt-12 bg-slate-800 border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-white mb-6">About Your Documents</h2>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-white mb-2">WISP (Written Information Security Program)</h3>
              <p className="text-slate-300">
                The WISP is a comprehensive document that outlines your dealership's information security measures. It
                covers all nine sections of the FTC Safeguards Rule and is designed to be shared with your board,
                management, and auditors. The document is populated with your dealership-specific information and
                compliance answers.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-2">Board-Level Annual Compliance Report</h3>
              <p className="text-slate-300">
                This executive summary is designed for your board of directors. It provides a high-level overview of
                your compliance status, identifies critical gaps, and includes recommendations for improvement. This
                document is ideal for quarterly or annual board meetings.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-2">Document Updates</h3>
              <p className="text-slate-300">
                Your documents are generated based on your current compliance answers. If you update your answers in
                the wizard, you can regenerate your documents to reflect the latest information. We recommend updating
                your documents quarterly.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
