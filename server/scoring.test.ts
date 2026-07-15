import { describe, it, expect } from "vitest";
import {
  calculateSectionScore,
  calculateOverallScore,
  CRITICAL_WEIGHT,
  IMPORTANT_WEIGHT,
  STANDARD_WEIGHT,
} from "../shared/scoring";

describe("Scoring Algorithm", () => {
  describe("calculateSectionScore", () => {
    it("should calculate 100% score when all answers are yes", () => {
      const answers = {
        q1: "yes",
        q2: "yes",
        q3: "yes",
      };

      const questions = [
        { id: "q1", weight: "critical" as const, text: "Question 1" },
        { id: "q2", weight: "important" as const, text: "Question 2" },
        { id: "q3", weight: "standard" as const, text: "Question 3" },
      ];

      const result = calculateSectionScore(answers, questions);

      expect(result.score).toBe(100);
      expect(result.earnedPoints).toBe(result.maxPoints);
      expect(result.gaps.length).toBe(0);
    });

    it("should calculate 0% score when all answers are no", () => {
      const answers = {
        q1: "no",
        q2: "no",
        q3: "no",
      };

      const questions = [
        { id: "q1", weight: "critical" as const, text: "Question 1" },
        { id: "q2", weight: "important" as const, text: "Question 2" },
        { id: "q3", weight: "standard" as const, text: "Question 3" },
      ];

      const result = calculateSectionScore(answers, questions);

      expect(result.score).toBe(0);
      expect(result.earnedPoints).toBe(0);
      expect(result.gaps.length).toBe(3);
    });

    it("should calculate 50% score for partial answers", () => {
      const answers = {
        q1: "partial",
        q2: "no",
      };

      const questions = [
        { id: "q1", weight: "critical" as const, text: "Question 1" },
        { id: "q2", weight: "critical" as const, text: "Question 2" },
      ];

      const result = calculateSectionScore(answers, questions);

      // (0.5 * CRITICAL_WEIGHT + 0 * CRITICAL_WEIGHT) / (2 * CRITICAL_WEIGHT) = 1.5 / 6 = 25%
      expect(result.score).toBe(25);
    });

    it("should identify critical gaps", () => {
      const answers = {
        q1: "no",
        q2: "yes",
      };

      const questions = [
        { id: "q1", weight: "critical" as const, text: "Critical Question" },
        { id: "q2", weight: "important" as const, text: "Important Question" },
      ];

      const result = calculateSectionScore(answers, questions);

      expect(result.criticalGaps.length).toBe(1);
      expect(result.criticalGaps[0]).toBe("Critical Question");
    });

    it("should apply correct weights", () => {
      const answers = {
        q1: "yes",
        q2: "yes",
        q3: "yes",
      };

      const questions = [
        { id: "q1", weight: "critical" as const, text: "Q1" },
        { id: "q2", weight: "important" as const, text: "Q2" },
        { id: "q3", weight: "standard" as const, text: "Q3" },
      ];

      const result = calculateSectionScore(answers, questions);

      const expectedMax = CRITICAL_WEIGHT + IMPORTANT_WEIGHT + STANDARD_WEIGHT;
      expect(result.maxPoints).toBe(expectedMax);
      expect(result.earnedPoints).toBe(expectedMax);
    });
  });

  describe("calculateOverallScore", () => {
    it("should calculate overall score from section scores", () => {
      const sectionScores = [
        {
          section: 1,
          sectionName: "Section 1",
          score: 100,
          maxPoints: 10,
          earnedPoints: 10,
          gaps: [],
          criticalGaps: [],
        },
        {
          section: 2,
          sectionName: "Section 2",
          score: 50,
          maxPoints: 10,
          earnedPoints: 5,
          gaps: [],
          criticalGaps: [],
        },
      ];

      const result = calculateOverallScore(sectionScores);

      // Both sections have equal weight (not in high-enforcement list)
      // (10 + 5) / (10 + 10) = 75%
      expect(result.overall).toBe(75);
    });

    it("should apply 1.5x multiplier to high-enforcement sections", () => {
      const sectionScores = [
        {
          section: 4, // Access Controls (high-enforcement)
          sectionName: "Access Controls",
          score: 100,
          maxPoints: 10,
          earnedPoints: 10,
          gaps: [],
          criticalGaps: [],
        },
        {
          section: 1, // Qualified Individual (normal)
          sectionName: "Qualified Individual",
          score: 0,
          maxPoints: 10,
          earnedPoints: 0,
          gaps: [],
          criticalGaps: [],
        },
      ];

      const result = calculateOverallScore(sectionScores);

      // (10 * 1.5 + 0) / (10 * 1.5 + 10) = 15 / 25 = 60%
      expect(result.overall).toBe(60);
    });

    it("should determine risk level based on score", () => {
      const atScore = (score: number, earnedPoints: number) => [
        {
          section: 1,
          sectionName: "S1",
          score,
          maxPoints: 10,
          earnedPoints,
          gaps: [],
          criticalGaps: [],
        },
      ];

      expect(calculateOverallScore(atScore(30, 3)).riskLevel).toBe("critical");
      expect(calculateOverallScore(atScore(50, 5)).riskLevel).toBe("high");
      expect(calculateOverallScore(atScore(70, 7)).riskLevel).toBe("medium");
      expect(calculateOverallScore(atScore(90, 9)).riskLevel).toBe("low");
    });
  });
});
