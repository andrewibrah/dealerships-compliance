import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { SAFEGUARDS_SECTIONS } from "@shared/safeguards-questions";
import { calculateSectionScore, calculateOverallScore } from "@shared/scoring";
import { getApplicability, applicableQuestions } from "@shared/applicability";
import { AlertCircle, CheckCircle2, AlertTriangle, Loader2, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const ANSWER_OPTIONS = {
  yes_no: [
    { value: "yes", label: "Yes", selectedClass: "bg-green-600 hover:bg-green-700" },
    { value: "no", label: "No", selectedClass: "bg-red-600 hover:bg-red-700" },
  ],
  yes_no_partial: [
    { value: "yes", label: "Yes", selectedClass: "bg-green-600 hover:bg-green-700" },
    { value: "partial", label: "Partial", selectedClass: "bg-yellow-600 hover:bg-yellow-700" },
    { value: "no", label: "No", selectedClass: "bg-red-600 hover:bg-red-700" },
  ],
} as const;

// Conversational phrasing (PRD #11/#39) — DISPLAY ONLY. Swaps in an LLM-rephrased version of
// the question TEXT when conversational mode is on and a rephrasing is available; otherwise
// renders the canonical question text. It never touches the answer controls, so the structured
// radiogroup stays the sole writer of state. With no ANTHROPIC_API_KEY the query passes the
// original text straight through, so this degrades to today's plain form view.
function QuestionText({
  questionId,
  fallback,
  conversational,
}: {
  questionId: string;
  fallback: string;
  conversational: boolean;
}) {
  const rephrase = trpc.interview.rephrase.useQuery(
    { questionId },
    { enabled: conversational, staleTime: Infinity }
  );
  return <>{conversational && rephrase.data?.text ? rephrase.data.text : fallback}</>;
}

export default function Wizard() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Record<string, any>>>({});
  const [sectionScores, setSectionScores] = useState<Record<number, number>>({});
  const [overallScore, setOverallScore] = useState(0);
  const [riskLevel, setRiskLevel] = useState<"critical" | "high" | "medium" | "low">("critical");
  const [conversational, setConversational] = useState(false);

  const totalSections = SAFEGUARDS_SECTIONS.length;
  const progress = ((currentSection + 1) / totalSections) * 100;
  const section = SAFEGUARDS_SECTIONS[currentSection];
  const sectionNumber = section.number;

  // Load existing answers through the backend (compliance_answers is keyed by dealership)
  const answersQuery = trpc.compliance.getAnswers.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const isLoadingAnswers = isAuthenticated && answersQuery.isLoading;

  // Applicability (PRD #7): under the §314.6 exemption, out-of-scope questions are hidden and
  // excluded from scoring. Default (no consumer count) is identity — every question shows and
  // counts, byte-identical to today.
  const dealershipQuery = trpc.dealership.getCurrent.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const consumerCount = dealershipQuery.data?.consumerCount ?? null;
  const applicability = getApplicability({ consumerCount });
  const visibleQuestions = applicableQuestions(section.questions, applicability);
  const hiddenCount = section.questions.length - visibleQuestions.length;
  const applicableSectionList = SAFEGUARDS_SECTIONS.filter(
    (sec) => applicableQuestions(sec.questions, applicability).length > 0
  );

  useEffect(() => {
    if (!answersQuery.data) return;
    const grouped: Record<number, Record<string, any>> = {};
    answersQuery.data.forEach((row) => {
      grouped[row.section] = (row.answers as Record<string, any>) ?? {};
    });
    setAnswers(grouped);
  }, [answersQuery.data]);

  const saveSection = trpc.compliance.saveSection.useMutation({
    onError: (error) => {
      toast.error("Failed to save answer: " + error.message);
    },
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending debounced save when the component unmounts
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Calculate scores whenever answers change
  useEffect(() => {
    const newScores: Record<number, number> = {};
    const allScores = [];

    for (const sec of SAFEGUARDS_SECTIONS) {
      const sectionAnswers = answers[sec.number] || {};
      const scoreResult = calculateSectionScore(
        sectionAnswers,
        applicableQuestions(sec.questions, applicability)
      );
      newScores[sec.number] = scoreResult.score;
      allScores.push({
        ...scoreResult,
        section: sec.number,
        sectionName: sec.name,
      });
    }

    setSectionScores(newScores);

    if (allScores.length > 0) {
      const overall = calculateOverallScore(allScores);
      setOverallScore(overall.overall);
      setRiskLevel(overall.riskLevel);
    }
    // applicability is derived purely from consumerCount; that primitive is the real dep.
  }, [answers, consumerCount]);

  const persistSection = (nextSectionAnswers: Record<string, any>) => {
    // Score + completion track only the in-scope questions for this dealer (PRD #7).
    const scoreResult = calculateSectionScore(nextSectionAnswers, visibleQuestions);
    const completed = visibleQuestions.every(
      (q) => nextSectionAnswers[q.id] !== undefined && nextSectionAnswers[q.id] !== ""
    );

    saveSection.mutate({
      section: sectionNumber,
      sectionName: section.name,
      answers: nextSectionAnswers,
      score: scoreResult.score,
      completed,
    });
  };

  const handleAnswer = (questionId: string, value: any) => {
    if (!isAuthenticated) {
      toast.error("Please log in to save your answers");
      return;
    }

    const nextSectionAnswers = {
      ...(answers[sectionNumber] ?? {}),
      [questionId]: value,
    };

    // Update local state immediately
    setAnswers((prev) => ({
      ...prev,
      [sectionNumber]: nextSectionAnswers,
    }));

    persistSection(nextSectionAnswers);
  };

  const handleTextChange = (questionId: string, value: string) => {
    if (!isAuthenticated) {
      toast.error("Please log in to save your answers");
      return;
    }

    const nextSectionAnswers = {
      ...(answers[sectionNumber] ?? {}),
      [questionId]: value,
    };

    // Update local state immediately so typing stays responsive
    setAnswers((prev) => ({
      ...prev,
      [sectionNumber]: nextSectionAnswers,
    }));

    // Debounce the network save so we don't fire a mutation per keystroke
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistSection(nextSectionAnswers), 600);
  };

  const getRiskColor = () => {
    switch (riskLevel) {
      case "critical":
        return "text-red-500";
      case "high":
        return "text-orange-500";
      case "medium":
        return "text-yellow-500";
      case "low":
        return "text-green-500";
      default:
        return "text-slate-400";
    }
  };

  const getRiskBgColor = () => {
    switch (riskLevel) {
      case "critical":
        return "bg-red-950/30 border-red-600";
      case "high":
        return "bg-orange-950/30 border-orange-600";
      case "medium":
        return "bg-yellow-950/30 border-yellow-600";
      case "low":
        return "bg-green-950/30 border-green-600";
      default:
        return "bg-slate-900/30 border-slate-600";
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Card className="bg-slate-800 border-slate-700 p-8 max-w-md">
          <h2 className="text-2xl font-bold text-white mb-4">Sign In Required</h2>
          <p className="text-slate-300 mb-6">
            You need to be logged in to access the compliance wizard.
          </p>
          <Button
            className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950"
            onClick={() => setLocation("/login")}
          >
            Go to Login
          </Button>
        </Card>
      </div>
    );
  }

  if (isLoadingAnswers) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-amber-500 mx-auto mb-4" size={40} />
          <p className="text-slate-300">Loading your compliance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900/50 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white">FTC Safeguards Compliance Wizard</h1>
              <p className="text-slate-400">Section {currentSection + 1} of {totalSections}</p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${getRiskColor()}`}>
                {overallScore.toFixed(0)}%
              </div>
              <p className="text-slate-400 text-sm">Overall Compliance</p>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Questions */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-800 border-slate-700 p-8">
              <h2 className="text-2xl font-bold text-white mb-2">{section.name}</h2>
              <div className="flex items-start justify-between gap-4 mb-8">
                <p className="text-slate-400">{section.description}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={conversational}
                  onClick={() => setConversational((value) => !value)}
                  className="flex-shrink-0"
                >
                  {conversational ? "Plain questions" : "Conversational mode"}
                </Button>
              </div>

              <div className="space-y-8">
                {visibleQuestions.length === 0 && (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                    <p className="font-medium text-white mb-1">
                      This element does not apply to your dealership
                    </p>
                    <p className="text-sm text-slate-400">
                      Under the 16 CFR &sect;314.6 small-institution exemption (fewer than 5,000
                      consumers), none of this element&rsquo;s safeguards are required, so it is
                      excluded from your compliance score.
                    </p>
                  </div>
                )}
                {visibleQuestions.map((question) => {
                  const selected = answers[sectionNumber]?.[question.id];
                  const isText = question.type === "text";
                  const options =
                    question.type === "yes_no_partial"
                      ? ANSWER_OPTIONS.yes_no_partial
                      : ANSWER_OPTIONS.yes_no;

                  return (
                  <div key={question.id} className="border-b border-slate-700 pb-8 last:border-0">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="flex-1">
                        {isText ? (
                          <label
                            htmlFor={`q-${question.id}`}
                            className="text-white font-medium block mb-2"
                          >
                            <QuestionText
                              questionId={question.id}
                              fallback={question.text}
                              conversational={conversational}
                            />
                          </label>
                        ) : (
                          // Not a <label>: its control is a radio group, and <label>
                          // can only name a single form control.
                          <span
                            id={`q-${question.id}-label`}
                            className="text-white font-medium block mb-2"
                          >
                            <QuestionText
                              questionId={question.id}
                              fallback={question.text}
                              conversational={conversational}
                            />
                          </span>
                        )}
                        {question.hint && (
                          <p id={`q-${question.id}-hint`} className="text-sm text-slate-400 mb-4">
                            {question.hint}
                          </p>
                        )}
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${
                          question.weight === "critical"
                            ? "bg-red-900/50 text-red-200"
                            : question.weight === "important"
                              ? "bg-orange-900/50 text-orange-200"
                              : "bg-yellow-900/50 text-yellow-200"
                        }`}
                      >
                        {question.weight}
                      </div>
                    </div>

                    {!isText && (
                      <div
                        role="radiogroup"
                        aria-labelledby={`q-${question.id}-label`}
                        aria-describedby={question.hint ? `q-${question.id}-hint` : undefined}
                        className="flex gap-4"
                      >
                        {options.map(({ value, label, selectedClass }) => {
                          const isOn = selected === value;
                          return (
                            <Button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={isOn}
                              variant={isOn ? "default" : "outline"}
                              className={isOn ? selectedClass : ""}
                              onClick={() => handleAnswer(question.id, value)}
                            >
                              {/* Shape channel: selection must not rest on hue alone.
                                  Reserved when unselected so the row does not reflow. */}
                              <Check
                                aria-hidden="true"
                                className={isOn ? "size-4" : "size-4 invisible"}
                              />
                              {label}
                            </Button>
                          );
                        })}
                      </div>
                    )}

                    {isText && (
                      <textarea
                        id={`q-${question.id}`}
                        aria-describedby={question.hint ? `q-${question.id}-hint` : undefined}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500"
                        placeholder="Enter your response..."
                        value={selected || ""}
                        onChange={(e) => handleTextChange(question.id, e.target.value)}
                        rows={3}
                      />
                    )}
                  </div>
                  );
                })}
                {visibleQuestions.length > 0 && hiddenCount > 0 && (
                  <p className="text-sm text-slate-400">
                    {hiddenCount} question{hiddenCount === 1 ? "" : "s"} in this element{" "}
                    {hiddenCount === 1 ? "is" : "are"} not applicable under the &sect;314.6
                    exemption and {hiddenCount === 1 ? "was" : "were"} excluded from your score.
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Risk Alert */}
            <Card className={`border-2 p-6 ${getRiskBgColor()}`}>
              <div className="flex items-start gap-3 mb-3">
                {riskLevel === "critical" && <AlertTriangle className="text-red-500 flex-shrink-0" />}
                {riskLevel === "high" && <AlertCircle className="text-orange-500 flex-shrink-0" />}
                {riskLevel === "medium" && <AlertCircle className="text-yellow-500 flex-shrink-0" />}
                {riskLevel === "low" && <CheckCircle2 className="text-green-500 flex-shrink-0" />}
                <div>
                  <h3 className="font-bold text-white capitalize">{riskLevel} Risk</h3>
                  <p className="text-sm text-slate-300 mt-1">
                    {riskLevel === "critical" &&
                      "Immediate action required. Critical compliance gaps detected."}
                    {riskLevel === "high" &&
                      "High priority. Significant compliance gaps need attention."}
                    {riskLevel === "medium" && "Moderate risk. Address these gaps soon."}
                    {riskLevel === "low" && "Good compliance posture. Continue monitoring."}
                  </p>
                </div>
              </div>
            </Card>

            {/* Section Scores */}
            <Card className="bg-slate-800 border-slate-700 p-6">
              <h3 className="font-bold text-white mb-4">Section Scores</h3>
              <div className="space-y-3">
                {applicableSectionList.map((sec) => (
                  <div key={sec.number} className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">{sec.name}</span>
                    <span
                      className={`font-bold ${
                        (sectionScores[sec.number] || 0) >= 80
                          ? "text-green-500"
                          : (sectionScores[sec.number] || 0) >= 60
                            ? "text-yellow-500"
                            : "text-red-500"
                      }`}
                    >
                      {(sectionScores[sec.number] || 0).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Navigation */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCurrentSection(Math.max(0, currentSection - 1))}
                disabled={currentSection === 0}
              >
                Previous
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-slate-950"
                onClick={() => {
                  if (currentSection === totalSections - 1) {
                    setLocation("/dashboard");
                  } else {
                    setCurrentSection(Math.min(totalSections - 1, currentSection + 1));
                  }
                }}
              >
                {currentSection === totalSections - 1 ? "Complete" : "Next"}
              </Button>
            </div>

            {/* Dashboard Link */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/dashboard")}
            >
              View Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
