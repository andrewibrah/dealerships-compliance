import { describe, it, expect } from "vitest";
import {
  generateWISP,
  generateBoardReport,
  computeOverallScore,
  type DealershipInfo,
  type ComplianceAnswerRow,
} from "../shared/pdf-generator";
import { SAFEGUARDS_SECTIONS } from "../shared/safeguards-questions";

const dealership: DealershipInfo = {
  name: "Test Motors",
  address: "1 Main St",
  city: "Austin",
  state: "TX",
  dmsVendor: "CDK",
  rooftopCount: 2,
  qualifiedIndividual: "Jane Doe",
  qiEmail: "jane@testmotors.com",
};

function answersForAllSections(value: "yes" | "no"): ComplianceAnswerRow[] {
  return SAFEGUARDS_SECTIONS.map((sec) => ({
    section: sec.number,
    sectionName: sec.name,
    answers: Object.fromEntries(sec.questions.map((q) => [q.id, value])),
    score: value === "yes" ? 100 : 0,
    completed: true,
  }));
}

describe("PDF generation", () => {
  it("generates a WISP PDF from real answers", async () => {
    const bytes = await generateWISP(dealership, answersForAllSections("no"));
    expect(bytes.length).toBeGreaterThan(1000);
    // %PDF header
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("generates a board report PDF with no answers saved", async () => {
    const bytes = await generateBoardReport(dealership, []);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("computes overall score consistently with answers", () => {
    expect(computeOverallScore(answersForAllSections("yes"))).toBe(100);
    expect(computeOverallScore(answersForAllSections("no"))).toBe(0);
    expect(computeOverallScore([])).toBe(0);
  });
});
