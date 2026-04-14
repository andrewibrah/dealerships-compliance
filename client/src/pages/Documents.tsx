import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, Download, FileText, Lock } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";

export default function Documents() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasSubscription] = useState(false); // TODO: Load from trpc.stripe.getSubscriptionStatus

  if (loading) {
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

  const handleGenerateWISP = async () => {
    if (!hasSubscription) {
      setLocation("/pricing");
      return;
    }
    setIsGenerating(true);
    // TODO: Call trpc.pdf.generateWISP.mutate()
    setTimeout(() => setIsGenerating(false), 2000);
  };

  const handleGenerateBoardReport = async () => {
    if (!hasSubscription) {
      setLocation("/pricing");
      return;
    }
    setIsGenerating(true);
    // TODO: Call trpc.pdf.generateBoardReport.mutate()
    setTimeout(() => setIsGenerating(false), 2000);
  };

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
                <h3 className="font-semibold text-amber-300">Premium Feature</h3>
                <p className="text-sm text-amber-200">Upgrade to Core plan to generate documents</p>
              </div>
            </div>
            <Button
              onClick={() => setLocation("/pricing")}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Upgrade Now - $199/month
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
                <span>Dealership-specific content</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>All 9 compliance sections</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>FTC-compliant format</span>
              </div>
            </div>

            <Button
              onClick={handleGenerateWISP}
              disabled={isGenerating || !hasSubscription}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isGenerating ? "Generating..." : "Generate WISP PDF"}
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
                <span>Executive summary</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Risk assessment</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-green-500">✓</span>
                <span>Actionable recommendations</span>
              </div>
            </div>

            <Button
              onClick={handleGenerateBoardReport}
              disabled={isGenerating || !hasSubscription}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {isGenerating ? "Generating..." : "Generate Board Report"}
            </Button>
          </Card>
        </div>

        {/* Previously Generated Documents */}
        <Card className="bg-slate-800 border-slate-700 p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Previously Generated Documents</h2>

          <div className="text-center py-12">
            <AlertCircle className="mx-auto text-slate-500 mb-4" size={48} />
            <p className="text-slate-400 mb-4">No documents generated yet</p>
            <p className="text-sm text-slate-500">
              Generate your first WISP or Board Report to see them here
            </p>
          </div>
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
