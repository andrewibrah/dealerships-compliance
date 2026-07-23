import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, ArrowLeft, ShieldCheck, Sparkles, Database } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  buildSecurityArchitectureAssessment,
  domainStatusLabel,
  type ArchitectureDomain,
  type DomainStatus,
} from "@shared/security-architecture";
import { REQUIREMENT_GUIDANCE } from "@shared/requirements";
import type { DerivedGap } from "@shared/derivation";
import type { AnswerValue } from "@shared/controls";

// Security Architecture Assessment view (Phase 2 #20). Fully deterministic: every domain posture,
// gap, citation, and observation is computed client-side by buildSecurityArchitectureAssessment
// from the dealer's saved answers + inventoried assets/data-flows/risks. No LLM, no fetch beyond
// the tRPC data queries. The AI & Emerging Tech domain is clearly-labelled advisory (no score, no
// §314.4 citation). The disclaimer is persistent (banner + footer).

/** The dealer's saved answer for a gap, phrased for the reader (grounded in the derived status). */
function triggeringAnswerLabel(gap: DerivedGap): string {
  if (gap.status === "partial") return "You answered: Partially in place";
  if (gap.status === "not_implemented") return "You answered: No";
  return "Not answered yet";
}

function statusText(status: DomainStatus): string {
  if (status === "strong") return "text-green-400";
  if (status === "moderate") return "text-yellow-400";
  if (status === "weak") return "text-orange-400";
  if (status === "critical") return "text-red-400";
  return "text-slate-400";
}

function statusBadge(status: DomainStatus): string {
  if (status === "strong") return "bg-green-950/40 border-green-700 text-green-300";
  if (status === "moderate") return "bg-yellow-950/40 border-yellow-700 text-yellow-300";
  if (status === "weak") return "bg-orange-950/40 border-orange-700 text-orange-300";
  if (status === "critical") return "bg-red-950/40 border-red-700 text-red-300";
  return "bg-slate-800 border-slate-600 text-slate-300";
}

function overallText(score: number): string {
  if (score < 40) return "text-red-500";
  if (score < 60) return "text-orange-500";
  if (score < 80) return "text-yellow-500";
  return "text-green-500";
}

function overallBg(score: number): string {
  if (score < 40) return "bg-red-950/30 border-red-600";
  if (score < 60) return "bg-orange-950/30 border-orange-600";
  if (score < 80) return "bg-yellow-950/30 border-yellow-600";
  return "bg-green-950/30 border-green-600";
}

function GapCard({ gap, critical }: { gap: DerivedGap; critical: boolean }) {
  const guidance = REQUIREMENT_GUIDANCE[gap.requirementCode];
  return (
    <li className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={critical ? "text-red-500 flex-shrink-0 mt-0.5" : "text-yellow-500 flex-shrink-0 mt-0.5"}
          size={16}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {critical && (
              <span className="rounded bg-red-950/50 border border-red-700 px-2 py-0.5 text-xs font-semibold text-red-300">
                Critical
              </span>
            )}
            <span className="font-medium text-slate-100">{gap.title}</span>
            <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-mono text-slate-200">
              {gap.citation}
            </span>
          </div>
          <p className="text-xs font-medium text-amber-300 mb-2">{triggeringAnswerLabel(gap)}</p>
          {guidance?.whyItMatters && (
            <p className="text-sm text-slate-300 mb-1">
              <span className="font-semibold text-slate-200">Why it matters: </span>
              {guidance.whyItMatters}
            </p>
          )}
          {guidance?.fix && (
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-slate-200">The fix: </span>
              {guidance.fix}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function DomainSection({ domain }: { domain: ArchitectureDomain }) {
  const otherGaps = domain.gaps.filter((g) => !domain.criticalGaps.includes(g));
  return (
    <Card className="bg-slate-800 border-slate-700 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {domain.advisory ? (
            <Sparkles className="text-amber-400 flex-shrink-0" size={22} aria-hidden="true" />
          ) : (
            <ShieldCheck className="text-blue-400 flex-shrink-0" size={22} aria-hidden="true" />
          )}
          <h3 className="text-xl font-bold text-white">{domain.title}</h3>
        </div>
        {domain.advisory ? (
          <span className="rounded-full border px-3 py-1 text-xs font-semibold bg-amber-950/40 border-amber-700 text-amber-300">
            Advisory — not scored
          </span>
        ) : domain.posture ? (
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(domain.posture.status)}`}
          >
            {domain.posture.score}% · {domainStatusLabel(domain.posture.status)}
          </span>
        ) : (
          <span className="rounded-full border px-3 py-1 text-xs font-semibold bg-slate-800 border-slate-600 text-slate-300">
            Not assessed
          </span>
        )}
      </div>

      <p className="text-sm text-slate-400 mb-3">{domain.summary}</p>

      {domain.posture && (
        <p className={`text-sm mb-3 ${statusText(domain.posture.status)}`}>
          {domain.posture.confirmedControls} of {domain.posture.totalControls} in-scope safeguards confirmed in place.
        </p>
      )}

      <p className="text-sm text-slate-200 mb-3">{domain.narrative}</p>

      {domain.citations.length > 0 && (
        <p className="text-xs text-slate-400 mb-3">
          <span className="font-semibold text-slate-300">Safeguards elements in scope: </span>
          {domain.citations.join(", ")}
        </p>
      )}

      {domain.signals.length > 0 && (
        <div className="mb-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-2">
            <Database size={14} className="text-slate-400" aria-hidden="true" />
            Observations from your inventory
          </h4>
          <ul className="space-y-1">
            {domain.signals.map((signal, i) => (
              <li key={i} className="text-sm text-slate-300">
                {signal.text}{" "}
                <span className="text-xs font-mono text-slate-500">[{signal.grounding.replace(/_/g, " ")}]</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {domain.advisoryFindings.length > 0 && (
        <div className="mb-2 rounded-lg border border-amber-800/60 bg-amber-950/20 p-4">
          <h4 className="text-sm font-semibold text-amber-300 mb-2">Advisory findings</h4>
          <ul className="space-y-2 list-disc pl-5">
            {domain.advisoryFindings.map((finding, i) => (
              <li key={i} className="text-sm text-slate-300">
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {domain.gaps.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-200 mb-2">Open items</h4>
          <ul className="space-y-3">
            {domain.criticalGaps.map((gap) => (
              <GapCard key={gap.requirementCode} gap={gap} critical />
            ))}
            {otherGaps.map((gap) => (
              <GapCard key={gap.requirementCode} gap={gap} critical={false} />
            ))}
          </ul>
        </div>
      )}

      {!domain.advisory && domain.gaps.length === 0 && domain.posture && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircle2 size={16} aria-hidden="true" />
          No open items in this domain.
        </div>
      )}
    </Card>
  );
}

export default function Architecture() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();

  const answersQuery = trpc.compliance.getAnswers.useQuery(undefined, { enabled: isAuthenticated });
  const dealershipQuery = trpc.dealership.getCurrent.useQuery(undefined, { enabled: isAuthenticated });
  const assetsQuery = trpc.assets.list.useQuery(undefined, { enabled: isAuthenticated });
  const dataFlowsQuery = trpc.dataFlows.list.useQuery(undefined, { enabled: isAuthenticated });
  const risksQuery = trpc.risks.list.useQuery(undefined, { enabled: isAuthenticated });

  const isLoadingData =
    isAuthenticated &&
    (answersQuery.isLoading ||
      dealershipQuery.isLoading ||
      assetsQuery.isLoading ||
      dataFlowsQuery.isLoading ||
      risksQuery.isLoading);

  if (loading || isLoadingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading your architecture assessment...</div>
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const flatAnswers: Record<string, AnswerValue> = {};
  (answersQuery.data ?? []).forEach((row) => {
    Object.assign(flatAnswers, (row.answers as Record<string, AnswerValue>) ?? {});
  });

  const dealership = dealershipQuery.data;
  const assessment = buildSecurityArchitectureAssessment({
    answers: flatAnswers,
    assets: assetsQuery.data ?? [],
    dataFlows: dataFlowsQuery.data ?? [],
    risks: risksQuery.data ?? [],
    dmsVendor: dealership?.dmsVendor ?? "",
    consumerCount: dealership?.consumerCount ?? null,
  });
  const dealershipName =
    dealership?.name && dealership.name !== "My Dealership" ? dealership.name : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Security Architecture Assessment</h1>
            <p className="text-slate-400">
              {dealershipName ? `${dealershipName} — ` : ""}Expert cybersecurity architecture review, FTC Safeguards Rule (16 CFR Part 314)
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setLocation("/dashboard")}>
              <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
              Dashboard
            </Button>
            <Button
              onClick={() => setLocation("/documents")}
              className="bg-amber-600 hover:bg-amber-500 text-slate-950"
            >
              Generate PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Persistent disclaimer */}
      <div className="border-b border-slate-700 bg-slate-900/40">
        <div className="container mx-auto px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="text-slate-400 flex-shrink-0 mt-0.5" size={16} aria-hidden="true" />
          <p className="text-xs text-slate-400">{assessment.disclaimer}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Overall posture */}
        <Card className={`border-2 p-8 mb-10 ${overallBg(assessment.overall)}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-2">Overall Architecture Posture</h2>
              <div className="flex items-baseline gap-3">
                <span className={`text-5xl font-bold ${overallText(assessment.overall)}`}>
                  {assessment.overall}%
                </span>
                <span className="text-lg text-slate-300 capitalize">{assessment.riskLevel} risk</span>
              </div>
            </div>
            <p className="text-sm text-slate-300 max-w-md">
              Your saved answers and inventoried assets, data flows, and risks, reframed into six
              cybersecurity-architecture domains. Every posture, gap, and citation is derived from that data.
            </p>
          </div>
          {assessment.isExempt && (
            <p className="text-xs text-slate-400 mt-4">
              This dealership qualifies for the §314.6(a) small-institution exemption; exempt requirements are
              excluded from the posture and gaps below.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          {assessment.domains.map((domain) => (
            <DomainSection key={domain.key} domain={domain} />
          ))}
        </div>

        {/* Footer disclaimer + CTA */}
        <Card className="mt-8 bg-slate-800 border-slate-700 p-6">
          <p className="text-xs text-slate-400 mb-4">{assessment.disclaimer}</p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-slate-300 max-w-lg">
              Generate the Security Architecture Assessment and Written Risk Assessment PDFs — they carry the
              same domains, findings, and citations in a regulator-ready format.
            </p>
            <Button
              onClick={() => setLocation("/documents")}
              className="bg-amber-600 hover:bg-amber-500 text-slate-950"
            >
              Generate Documents
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
