import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, ArrowLeft, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { deriveAssessmentFromAnswers, type DerivedGap } from "@shared/derivation";
import { REQUIREMENT_CATALOG, REQUIREMENT_GUIDANCE } from "@shared/requirements";
import type { AnswerValue } from "@shared/controls";

// Signature one-pager (PRD #30): "here's your risk -> why it matters -> here's the fix."
// Fully deterministic — every line traces to shared/derivation.ts (the derived gap + its
// §314.4 citation and triggering answer) joined with REQUIREMENT_GUIDANCE. No LLM, no fetch.

const HIGH_ENFORCEMENT_SECTIONS = [4, 5, 7];

/** The dealer's saved answer for a gap, phrased for the reader (grounded in the derived status). */
function triggeringAnswerLabel(gap: DerivedGap): string {
  if (gap.status === "partial") return "You answered: Partially in place";
  if (gap.status === "not_implemented") return "You answered: No";
  return "Not answered yet";
}

function riskColor(score: number): string {
  if (score < 40) return "text-red-500";
  if (score < 60) return "text-orange-500";
  if (score < 80) return "text-yellow-500";
  return "text-green-500";
}

function riskBgColor(score: number): string {
  if (score < 40) return "bg-red-950/30 border-red-600";
  if (score < 60) return "bg-orange-950/30 border-orange-600";
  if (score < 80) return "bg-yellow-950/30 border-yellow-600";
  return "bg-green-950/30 border-green-600";
}

function riskLabel(score: number): string {
  if (score < 40) return "Critical Risk";
  if (score < 60) return "High Risk";
  if (score < 80) return "Medium Risk";
  return "Low Risk";
}

export default function Summary() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();

  const answersQuery = trpc.compliance.getAnswers.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const dealershipQuery = trpc.dealership.getCurrent.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const isLoadingData = isAuthenticated && (answersQuery.isLoading || dealershipQuery.isLoading);

  if (loading || isLoadingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading your risk summary...</div>
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
  const assessment = deriveAssessmentFromAnswers(REQUIREMENT_CATALOG, flatAnswers);

  // Rank every open gap: critical first, high-enforcement sections (Access, Encryption,
  // Incident Response) ahead of the rest — the same weighting the PDFs use.
  const rankedGaps = assessment.sections
    .flatMap((section) => {
      const boost = HIGH_ENFORCEMENT_SECTIONS.includes(section.section) ? 1 : 0;
      const critical = section.criticalGaps.map((gap) => ({
        gap,
        sectionName: section.sectionName,
        isCritical: true,
        weight: 2 + boost,
      }));
      const other = section.gaps
        .filter((g) => !section.criticalGaps.includes(g))
        .map((gap) => ({ gap, sectionName: section.sectionName, isCritical: false, weight: boost }));
      return [...critical, ...other];
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  const dealership = dealershipQuery.data;
  const dealershipName =
    dealership?.name && dealership.name !== "My Dealership" ? dealership.name : null;
  const overall = assessment.overall;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Compliance Risk Summary</h1>
            <p className="text-slate-400">
              {dealershipName ? `${dealershipName} — ` : ""}FTC Safeguards Rule (16 CFR Part 314)
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setLocation("/dashboard")}>
              <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
              Dashboard
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer size={16} className="mr-2" aria-hidden="true" />
              Print
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Overall risk */}
        <Card className={`border-2 p-8 mb-10 ${riskBgColor(overall)}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-2">Overall Compliance Score</h2>
              <div className="flex items-baseline gap-3">
                <span className={`text-5xl font-bold ${riskColor(overall)}`}>{overall}%</span>
                <span className="text-lg text-slate-300">{riskLabel(overall)}</span>
              </div>
            </div>
            <p className="text-sm text-slate-300 max-w-md">
              This one-page summary lists your highest-priority Safeguards Rule gaps, why each one
              matters, and the concrete fix. Every item is drawn from your saved assessment answers.
            </p>
          </div>
        </Card>

        {rankedGaps.length === 0 ? (
          <Card className="bg-slate-800 border-slate-700 p-8">
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle2 size={24} aria-hidden="true" />
              <div>
                <h2 className="text-xl font-bold text-white">No open gaps</h2>
                <p className="text-slate-300">
                  Your assessment shows no outstanding Safeguards Rule gaps. Keep it current and
                  re-run the assessment quarterly.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white">Your Top Risks</h2>
            {rankedGaps.map(({ gap, sectionName, isCritical }) => {
              const guidance = REQUIREMENT_GUIDANCE[gap.requirementCode];
              return (
                <Card
                  key={gap.requirementCode}
                  className="bg-slate-800 border-slate-700 p-6"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      className={isCritical ? "text-red-500 flex-shrink-0 mt-1" : "text-yellow-500 flex-shrink-0 mt-1"}
                      size={20}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {isCritical && (
                          <span className="rounded bg-red-950/50 border border-red-700 px-2 py-0.5 text-xs font-semibold text-red-300">
                            Critical
                          </span>
                        )}
                        <span className="text-xs uppercase tracking-wide text-slate-400">{sectionName}</span>
                        <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-mono text-slate-200">
                          {gap.citation}
                        </span>
                      </div>
                      <h3 className="font-semibold text-white mb-1">{gap.title}</h3>
                      <p className="text-xs font-medium text-amber-300 mb-3">
                        {triggeringAnswerLabel(gap)}
                      </p>
                      {guidance?.whyItMatters && (
                        <p className="text-sm text-slate-300 mb-2">
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
                </Card>
              );
            })}

            <Card className="bg-slate-800 border-slate-700 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-slate-300 max-w-lg">
                  Ready to formalize this? Generate your WISP and board report — they carry the same
                  citations, findings, and fixes in a regulator-ready format.
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
        )}
      </div>
    </div>
  );
}
