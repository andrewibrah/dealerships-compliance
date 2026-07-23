import { describe, it, expect } from "vitest";
import {
  generateWISP,
  generateBoardReport,
  generateSecurityArchitectureAssessment,
  generateRiskAssessment,
  generateIncidentResponsePlan,
  generatePolicy,
  computeOverallScore,
  type DealershipInfo,
  type ComplianceAnswerRow,
  type ArchitectureEntities,
} from "../shared/pdf-generator";
import { SAFEGUARDS_SECTIONS } from "../shared/safeguards-questions";
import { POLICY_TYPES } from "../shared/policy-templates";

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

const EMPTY_ENTITIES: ArchitectureEntities = { assets: [], dataFlows: [], risks: [] };
const SAMPLE_ENTITIES: ArchitectureEntities = {
  assets: [
    { name: "DMS Server", assetType: "database", description: "", owner: "IT", location: "on-prem", storesNpi: true, criticality: "critical", vendor: "CDK" },
  ],
  dataFlows: [
    { name: "Lender submission", description: "", externalParty: "RouteOne", dataTypes: "SSN, credit app", direction: "outbound", transportEncryption: "tls" },
  ],
  risks: [
    { title: "Unencrypted backups", description: "Nightly backups not encrypted", likelihood: "high", impact: "high", severity: "critical", status: "open" },
  ],
};

describe("Security Architecture Assessment PDF", () => {
  it("generates a PDF from answers with no entities inventoried", async () => {
    const bytes = await generateSecurityArchitectureAssessment(
      dealership,
      answersForAllSections("no"),
      EMPTY_ENTITIES,
    );
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("generates a PDF grounded in inventoried assets, flows, and risks", async () => {
    const bytes = await generateSecurityArchitectureAssessment(
      dealership,
      answersForAllSections("yes"),
      SAMPLE_ENTITIES,
    );
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("accepts optional per-domain narratives without changing the PDF header", async () => {
    const bytes = await generateSecurityArchitectureAssessment(
      dealership,
      answersForAllSections("no"),
      EMPTY_ENTITIES,
      { access_identity: "Expert prose about access controls." },
    );
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("Written Risk Assessment PDF", () => {
  it("generates a PDF with an empty inventory", async () => {
    const bytes = await generateRiskAssessment(dealership, [], EMPTY_ENTITIES);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("generates a PDF from a populated risk register", async () => {
    const bytes = await generateRiskAssessment(
      dealership,
      answersForAllSections("partial"),
      SAMPLE_ENTITIES,
    );
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("Incident Response Plan PDF", () => {
  it("generates a PDF with no answers saved", async () => {
    const bytes = await generateIncidentResponsePlan(dealership, []);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("generates a PDF from real section-7 answers", async () => {
    const bytes = await generateIncidentResponsePlan(dealership, answersForAllSections("no"));
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("Written policy PDFs", () => {
  it("generates each policy type without throwing", async () => {
    for (const policyType of POLICY_TYPES) {
      const bytes = await generatePolicy(dealership, answersForAllSections("no"), { policyType });
      expect(bytes.length).toBeGreaterThan(1000);
      expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    }
  });
});
