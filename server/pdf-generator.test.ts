import { describe, it, expect } from "vitest";
import {
  generateWISP,
  generateBoardReport,
  generateSecurityArchitectureAssessment,
  generateRiskAssessment,
  generateIncidentResponsePlan,
  generatePolicy,
  generateExaminerPackage,
  examinerAuditLines,
  computeOverallScore,
  type DealershipInfo,
  type ComplianceAnswerRow,
  type ArchitectureEntities,
  type ExaminerPackageData,
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

const SAMPLE_EXAMINER_DATA: ExaminerPackageData = {
  documents: [
    { docType: "wisp", version: 1, generatedAt: new Date("2026-01-02T10:00:00Z") },
    { docType: "risk_assessment", version: 2, generatedAt: "2026-02-03T12:00:00Z" },
  ],
  evidence: [
    {
      title: "MFA screenshot",
      fileName: "mfa.png",
      linkedControls: ["§314.4(c)(5) Multi-factor authentication"],
    },
    { title: "Retention policy", fileName: "retention.pdf", linkedControls: [] },
  ],
  auditLog: [
    {
      action: "document.generate",
      actorEmail: "qi@testmotors.com",
      entityType: "generated_document",
      entityId: "12",
      createdAt: new Date("2026-03-01T09:00:00Z"),
    },
    {
      action: "compliance.save_section",
      actorEmail: "qi@testmotors.com",
      entityType: "compliance_answer",
      entityId: "4",
      createdAt: "2026-03-02T09:30:00Z",
    },
  ],
};

describe("Examiner Package PDF", () => {
  it("renders a combined PDF from posture, documents, evidence, and audit rows", async () => {
    const bytes = await generateExaminerPackage(
      dealership,
      answersForAllSections("partial"),
      SAMPLE_EXAMINER_DATA,
    );
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("renders with an empty package (no docs, evidence, or audit rows) without throwing", async () => {
    const bytes = await generateExaminerPackage(dealership, [], {
      documents: [],
      evidence: [],
      auditLog: [],
    });
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("audit extract prints exactly the provided rows — never a fabricated one", () => {
    const lines = examinerAuditLines(SAMPLE_EXAMINER_DATA.auditLog);
    // One line per provided row — no more, no fewer.
    expect(lines).toHaveLength(SAMPLE_EXAMINER_DATA.auditLog.length);
    // Each provided row is represented, with its real action + actor.
    expect(lines[0]).toContain("document.generate");
    expect(lines[0]).toContain("qi@testmotors.com");
    expect(lines[1]).toContain("compliance.save_section");
    // No line references an action that was not in the input (no fabrication).
    const joined = lines.join("\n");
    expect(joined).not.toContain("risk.create");
    expect(joined).not.toContain("policy.create");
  });

  it("audit extract yields a single honest line when there are no rows", () => {
    const lines = examinerAuditLines([]);
    expect(lines).toHaveLength(1);
    expect(lines[0].toLowerCase()).toContain("no audit");
  });
});
