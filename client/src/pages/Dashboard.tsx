import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, AlertCircle, TrendingUp, Loader2, FileText, ListChecks, ShieldCheck, Paperclip } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { SAFEGUARDS_SECTIONS } from "@shared/safeguards-questions";
import {
  calculateSectionScore,
  calculateOverallScore,
  type SectionScore,
} from "@shared/scoring";
import {
  deriveAssessmentFromAnswers,
  type DerivedGap,
  type DerivedSectionScore,
} from "@shared/derivation";
import { REQUIREMENT_CATALOG, REQUIREMENT_GUIDANCE } from "@shared/requirements";
import type { AnswerValue } from "@shared/controls";
import {
  getApplicability,
  applicableQuestions,
  applicableRequirements,
} from "@shared/applicability";

/** The dealer's saved answer for a gap, phrased for the reader (grounded in the derived status). */
function triggeringAnswerLabel(gap: DerivedGap): string {
  if (gap.status === "partial") return "You answered: Partially in place";
  if (gap.status === "not_implemented") return "You answered: No";
  return "Not answered yet";
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();

  const answersQuery = trpc.compliance.getAnswers.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const dealershipQuery = trpc.dealership.getCurrent.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const tasksQuery = trpc.tasks.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const postureQuery = trpc.posture.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const isLoadingScores = isAuthenticated && (answersQuery.isLoading || dealershipQuery.isLoading);

  // Open remediation tasks = anything not resolved (PRD #38 dashboard surfacing). Additive:
  // never blocks the score render — defaults to 0 until tasks.list resolves.
  const openTaskCount = (tasksQuery.data ?? []).filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  ).length;

  const grouped: Record<number, Record<string, any>> = {};
  const flatAnswers: Record<string, AnswerValue> = {};
  (answersQuery.data ?? []).forEach((row) => {
    const rowAnswers = (row.answers as Record<string, AnswerValue>) ?? {};
    grouped[row.section] = rowAnswers;
    Object.assign(flatAnswers, rowAnswers);
  });

  // Scope-aware (PRD #7): under the §314.6 exemption, out-of-scope questions leave the
  // denominator and fully-exempt sections drop out entirely. Default (no consumer count) is
  // identity — all nine sections, every question — so scores stay identical to today.
  const applicability = getApplicability({
    consumerCount: dealershipQuery.data?.consumerCount ?? null,
  });
  const applicableSections = SAFEGUARDS_SECTIONS.filter(
    (sec) => applicableQuestions(sec.questions, applicability).length > 0
  );

  const sectionResults: SectionScore[] = applicableSections.map((sec) => ({
    ...calculateSectionScore(grouped[sec.number] || {}, applicableQuestions(sec.questions, applicability)),
    section: sec.number,
    sectionName: sec.name,
  }));

  // Explainability spine: same scores as sectionResults (proven equivalent in
  // server/derivation.test.ts), but each gap carries its §314.4 citation + triggering answer.
  const assessment = deriveAssessmentFromAnswers(
    applicableRequirements(REQUIREMENT_CATALOG, applicability),
    flatAnswers
  );

  const sectionScores: Record<number, number> = {};
  sectionResults.forEach((r) => {
    sectionScores[r.section] = r.score;
  });

  const overallScore = calculateOverallScore(sectionResults).overall;
  const dealership = dealershipQuery.data;
  const dealershipName = dealership?.name && dealership.name !== "My Dealership"
    ? dealership.name
    : null;
  const missingProfileFields = [
    !dealershipName ? "dealership name" : null,
    !dealership?.address ? "address" : null,
    !dealership?.city ? "city" : null,
    !dealership?.state ? "state" : null,
    !dealership?.qualifiedIndividual ? "Qualified Individual" : null,
    !dealership?.qiEmail ? "QI email" : null,
  ].filter(Boolean);

  // Owner priorities: worst sections first, critical gaps ahead of standard ones
  const prioritySections: DerivedSectionScore[] = [...assessment.sections]
    .filter((r) => r.score < 80)
    .sort(
      (a, b) =>
        b.criticalGaps.length - a.criticalGaps.length || a.score - b.score
    );

  if (loading || isLoadingScores) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-amber-500 mx-auto mb-4" size={40} />
          <p className="text-slate-300">Loading your compliance data...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const getRiskColor = (score: number) => {
    if (score < 40) return "text-red-500";
    if (score < 60) return "text-orange-500";
    if (score < 80) return "text-yellow-500";
    return "text-green-500";
  };

  const getRiskBgColor = (score: number) => {
    if (score < 40) return "bg-red-950/30 border-red-600";
    if (score < 60) return "bg-orange-950/30 border-orange-600";
    if (score < 80) return "bg-yellow-950/30 border-yellow-600";
    return "bg-green-950/30 border-green-600";
  };

  const sectionNames = SAFEGUARDS_SECTIONS.reduce<Record<number, string>>(
    (acc, sec) => { acc[sec.number] = sec.name; return acc; },
    {}
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur">
        <div className="container mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white">
              {dealershipName ? `${dealershipName} Dashboard` : "Compliance Dashboard"}
            </h1>
            <p className="text-slate-400">Welcome, {user.name || user.email}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setLocation("/profile")}>
              Dealership Profile
            </Button>
            <Button variant="outline" onClick={() => setLocation("/summary")}>
              <FileText size={16} className="mr-2" aria-hidden="true" />
              Risk Summary
            </Button>
            <Button variant="outline" onClick={() => setLocation("/architecture")}>
              <ShieldCheck size={16} className="mr-2" aria-hidden="true" />
              Architecture
            </Button>
            <Button variant="outline" onClick={() => setLocation("/evidence")}>
              <Paperclip size={16} className="mr-2" aria-hidden="true" />
              Evidence
            </Button>
            <Button onClick={() => setLocation("/wizard")} className="bg-amber-600 hover:bg-amber-500 text-slate-950">
              Continue Assessment
            </Button>
          </div>
        </div>
      </div>

      {missingProfileFields.length > 0 && (
        <div className="border-b border-amber-600 bg-amber-950/30">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-amber-300">Complete your dealership profile</h3>
                <p className="text-sm text-amber-200">
                  Your WISP and board report will look sharper with {missingProfileFields.join(", ")} filled in.
                </p>
              </div>
            </div>
            <Button onClick={() => setLocation("/profile")} className="bg-amber-600 hover:bg-amber-500 text-slate-950">
              Complete Profile
            </Button>
          </div>
        </div>
      )}

      {/* FTC Urgency Banner */}
      <div className="border-b border-orange-600 bg-orange-950/30">
        <div className="container mx-auto px-4 py-4 flex items-start gap-4">
          <AlertTriangle className="text-orange-500 flex-shrink-0 mt-1" size={24} />
          <div>
            <h3 className="font-semibold text-orange-300 mb-1">⚠️ FTC Safeguards Rule Compliance Required</h3>
            <p className="text-sm text-orange-200">
              All auto dealerships must comply with FTC Safeguards Rule (16 CFR Part 314). Non-compliance can result in
              significant penalties. Ensure your dealership has a Written Information Security Program (WISP) in place.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        {/* Overall Score Card */}
        <Card className={`border-2 p-8 mb-12 ${getRiskBgColor(overallScore)}`}>
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-4">Overall Compliance Score</h2>
              <div className="flex items-baseline gap-3">
                <div className={`text-5xl font-bold ${getRiskColor(overallScore)}`}>{overallScore}%</div>
                <div className="text-lg text-slate-400">
                  {overallScore < 40 && "🔴 Critical"}
                  {overallScore >= 40 && overallScore < 60 && "🟠 High Risk"}
                  {overallScore >= 60 && overallScore < 80 && "🟡 Medium Risk"}
                  {overallScore >= 80 && "🟢 Low Risk"}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Sections Completed</h3>
              <div className="text-3xl font-bold text-white">
                {Object.values(sectionScores).filter((s) => s > 0).length}{" "}
                <span className="text-lg text-slate-400">/ {applicableSections.length}</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Next Steps</h3>
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">{openTaskCount}</span>
                <span className="text-sm text-slate-400">
                  open remediation task{openTaskCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => setLocation("/documents")}
                  className="bg-amber-600 hover:bg-amber-500 text-slate-950 w-full"
                >
                  Generate Documents
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation("/tasks")}
                  className="w-full"
                >
                  <ListChecks size={16} className="mr-2" aria-hidden="true" />
                  View Tasks
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Compliance Posture Trend (PRD #33) — overall score over time from posture_snapshots. */}
        <Card className="bg-slate-800 border-slate-700 p-8 mb-12">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="text-amber-500" size={24} aria-hidden="true" />
            <h2 className="text-2xl font-bold text-white">Compliance Posture Trend</h2>
          </div>
          {(() => {
            const history = (postureQuery.data ?? []).map((s) => ({
              score: s.overallScore,
              at: new Date(s.createdAt).toLocaleDateString(),
            }));
            if (history.length < 2) {
              return (
                <p className="text-slate-400 text-sm">
                  Your posture history builds as you update the assessment. Once your overall score
                  changes, the trend will chart here.
                </p>
              );
            }
            const w = 600;
            const h = 120;
            const pad = 8;
            const xs = (i: number) => pad + (i * (w - 2 * pad)) / (history.length - 1);
            const ys = (v: number) => h - pad - (v / 100) * (h - 2 * pad);
            const points = history.map((p, i) => `${xs(i)},${ys(p.score)}`).join(" ");
            const first = history[0];
            const last = history[history.length - 1];
            const label = `Compliance posture trend across ${history.length} snapshots, from ${first.score}% on ${first.at} to ${last.score}% on ${last.at}.`;
            return (
              <div>
                <svg
                  viewBox={`0 0 ${w} ${h}`}
                  className="w-full h-32"
                  role="img"
                  aria-label={label}
                  preserveAspectRatio="none"
                >
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                  {history.map((p, i) => (
                    <circle key={i} cx={xs(i)} cy={ys(p.score)} r={2.5} fill="#f59e0b" />
                  ))}
                </svg>
                <div className="flex justify-between text-xs text-slate-400 mt-2">
                  <span>{first.at}: {first.score}%</span>
                  <span>{last.at}: {last.score}%</span>
                </div>
              </div>
            );
          })()}
        </Card>

        {/* Section Scores Grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Section Scores</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(sectionScores).map(([sectionNum, score]) => {
              const num = parseInt(sectionNum);
              return (
                <Card key={num} className="bg-slate-800 border-slate-700 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-white">{sectionNames[num]}</h3>
                      <p className="text-sm text-slate-400">Section {num}</p>
                    </div>
                    {score >= 80 && <CheckCircle2 className="text-green-500" size={20} />}
                    {score < 80 && score >= 60 && <AlertCircle className="text-yellow-500" size={20} />}
                    {score < 60 && <AlertTriangle className="text-red-500" size={20} />}
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">Progress</span>
                      <span className={`font-bold ${getRiskColor(score)}`}>{score}%</span>
                    </div>
                    <Progress value={score} className="h-2" />
                  </div>

                  {score < 80 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLocation("/wizard")}
                      className="w-full text-xs"
                    >
                      Complete Section
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Priority Gaps & Next Actions */}
        <Card className="bg-slate-800 border-slate-700 p-8">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="text-amber-500" size={24} />
            <h2 className="text-2xl font-bold text-white">Priority Gaps &amp; Next Actions</h2>
          </div>

          {prioritySections.length === 0 ? (
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle2 size={20} />
              <p>No significant gaps. Keep your assessment current and re-run it quarterly.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {prioritySections.map((result) => (
                <div key={result.section} className="border-b border-slate-700 pb-6 last:border-b-0">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-slate-200">
                      {result.sectionName}
                      {result.criticalGaps.length > 0 && (
                        <span className="ml-2 text-xs font-semibold text-red-400">
                          {result.criticalGaps.length} critical gap{result.criticalGaps.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-slate-400">{100 - result.score}% gap</span>
                  </div>
                  <Progress value={result.score} className="h-1 mb-3" />
                  <ul className="space-y-3">
                    {(result.criticalGaps.length > 0 ? result.criticalGaps : result.gaps)
                      .slice(0, 3)
                      .map((gap) => {
                        const isCritical = result.criticalGaps.includes(gap);
                        const guidance = REQUIREMENT_GUIDANCE[gap.requirementCode];
                        return (
                          <li
                            key={gap.requirementCode}
                            className="rounded-lg border border-slate-700 bg-slate-900/40 p-4"
                          >
                            <div className="flex items-start gap-2">
                              <AlertTriangle
                                className={
                                  isCritical
                                    ? "text-red-500 flex-shrink-0 mt-0.5"
                                    : "text-yellow-500 flex-shrink-0 mt-0.5"
                                }
                                size={16}
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="font-medium text-slate-100">{gap.title}</span>
                                  <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-mono text-slate-200">
                                    {gap.citation}
                                  </span>
                                </div>
                                <p className="text-xs font-medium text-amber-300 mb-2">
                                  {triggeringAnswerLabel(gap)}
                                </p>
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
                      })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 p-4 bg-slate-700/50 rounded-lg">
            <p className="text-sm text-slate-300">
              Start with the critical gaps above — these are the items FTC examiners look for first. Answer the
              remaining wizard questions to get a complete picture, then generate your WISP and board report.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
