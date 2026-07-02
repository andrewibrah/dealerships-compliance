/**
 * Compliance Scoring Algorithm
 * 
 * Question weights:
 * - Critical (3 points): Most important compliance requirements
 * - Important (2 points): Significant compliance requirements
 * - Standard (1 point): Basic compliance requirements
 * 
 * Section multipliers:
 * - Sections 4, 5, 7 (Access Controls, Encryption, Incident Response) are 1.5x weighted
 *   (highest FTC enforcement focus)
 */

export const CRITICAL_WEIGHT = 3;
export const IMPORTANT_WEIGHT = 2;
export const STANDARD_WEIGHT = 1;
export const HIGH_ENFORCEMENT_MULTIPLIER = 1.5;
export const HIGH_ENFORCEMENT_SECTIONS = [4, 5, 7]; // Access Controls, Encryption, Incident Response

export interface QuestionScore {
  questionId: string;
  weight: number;
  answered: boolean;
  value: number; // 0-100
}

export interface SectionScore {
  section: number;
  sectionName: string;
  score: number; // 0-100
  maxPoints: number;
  earnedPoints: number;
  gaps: string[];
  criticalGaps: string[];
}

export interface OverallScore {
  overall: number; // 0-100
  riskLevel: "critical" | "high" | "medium" | "low";
  sections: SectionScore[];
}

/**
 * Calculate score for a single section
 * Returns { score: 0-100, gaps: [], criticalGaps: [] }
 */
export function calculateSectionScore(
  answers: Record<string, any>,
  questions: Array<{ id: string; weight: "critical" | "important" | "standard"; text: string }>
): SectionScore {
  let totalPoints = 0;
  let earnedPoints = 0;
  const gaps: string[] = [];
  const criticalGaps: string[] = [];

  for (const question of questions) {
    const weight =
      question.weight === "critical"
        ? CRITICAL_WEIGHT
        : question.weight === "important"
          ? IMPORTANT_WEIGHT
          : STANDARD_WEIGHT;

    totalPoints += weight;

    const answer = answers[question.id];
    if (answer === "yes" || answer === true || answer === 1) {
      earnedPoints += weight;
    } else if (answer === "partial" || answer === 0.5) {
      earnedPoints += weight * 0.5;
      gaps.push(question.text);
      if (question.weight === "critical") {
        criticalGaps.push(question.text);
      }
    } else {
      gaps.push(question.text);
      if (question.weight === "critical") {
        criticalGaps.push(question.text);
      }
    }
  }

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  return {
    section: 0, // Will be set by caller
    sectionName: "", // Will be set by caller
    score,
    maxPoints: totalPoints,
    earnedPoints,
    gaps,
    criticalGaps,
  };
}

/**
 * Calculate overall compliance score across all sections
 * Applies 1.5x multiplier to high-enforcement sections
 */
export function calculateOverallScore(sectionScores: SectionScore[]): OverallScore {
  let totalWeightedPoints = 0;
  let totalMaxPoints = 0;

  for (const section of sectionScores) {
    const multiplier = HIGH_ENFORCEMENT_SECTIONS.includes(section.section)
      ? HIGH_ENFORCEMENT_MULTIPLIER
      : 1;

    const weightedMax = section.maxPoints * multiplier;
    const weightedEarned = section.earnedPoints * multiplier;

    totalMaxPoints += weightedMax;
    totalWeightedPoints += weightedEarned;
  }

  const overall = totalMaxPoints > 0 ? Math.round((totalWeightedPoints / totalMaxPoints) * 100) : 0;

  // Determine risk level based on overall score
  let riskLevel: "critical" | "high" | "medium" | "low";
  if (overall < 40) {
    riskLevel = "critical";
  } else if (overall < 60) {
    riskLevel = "high";
  } else if (overall < 80) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  return {
    overall,
    riskLevel,
    sections: sectionScores,
  };
}

/**
 * Generate gap narrative for AI insertion
 * Formats critical gaps for Claude API to generate narrative
 */
export function generateGapNarrative(gaps: string[], sectionName: string): string {
  if (gaps.length === 0) {
    return `${sectionName} is fully compliant with FTC Safeguards Rule requirements.`;
  }

  const gapList = gaps.map((gap, i) => `${i + 1}. ${gap}`).join("\n");
  return `${sectionName} has the following compliance gaps:\n\n${gapList}\n\nThese gaps should be addressed to meet FTC Safeguards Rule requirements.`;
}
