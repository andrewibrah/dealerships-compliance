import { describe, it, expect } from "vitest";
import {
  POLICY_DEFINITIONS,
  POLICY_TYPES,
  buildPolicyPosture,
  renderPolicyText,
  type PolicyType,
} from "../shared/policy-templates";
import { REQUIREMENT_CATALOG } from "../shared/requirements";

const CATALOG_CODES = new Set(REQUIREMENT_CATALOG.map((r) => r.code));
const DEALERSHIP = { name: "Test Motors", qualifiedIndividual: "Jane Doe", qiEmail: "jane@testmotors.com" };

// The §314.4(c) subsection each policy must fulfill (grounded in the Rule text).
const EXPECTED_CITATION: Record<PolicyType, string> = {
  access_control: "§314.4(c)(1)",
  encryption: "§314.4(c)(3)",
  mfa: "§314.4(c)(5)",
  disposal: "§314.4(c)(6)",
  change_management: "§314.4(c)(7)",
};

describe("POLICY_DEFINITIONS integrity", () => {
  it("defines exactly the five required §314.4(c) policies", () => {
    expect(POLICY_TYPES).toEqual([
      "access_control",
      "encryption",
      "mfa",
      "disposal",
      "change_management",
    ]);
    expect(Object.keys(POLICY_DEFINITIONS).sort()).toEqual([...POLICY_TYPES].sort());
  });

  it("each policy cites its §314.4(c) subsection, has a unique docType, and non-empty clauses", () => {
    const docTypes = new Set<string>();
    for (const type of POLICY_TYPES) {
      const def = POLICY_DEFINITIONS[type];
      expect(def.policyType).toBe(type);
      expect(def.citation).toBe(EXPECTED_CITATION[type]);
      expect(def.docType.startsWith("policy_")).toBe(true);
      expect(docTypes.has(def.docType)).toBe(false);
      docTypes.add(def.docType);
      expect(def.clauses.length).toBeGreaterThan(0);
      for (const clause of def.clauses) {
        expect(clause.heading.length).toBeGreaterThan(0);
        expect(clause.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("grounding codes and any primary code reference real catalog requirements", () => {
    for (const type of POLICY_TYPES) {
      const def = POLICY_DEFINITIONS[type];
      expect(def.groundingCodes.length).toBeGreaterThan(0);
      for (const code of def.groundingCodes) expect(CATALOG_CODES.has(code)).toBe(true);
      if (def.primaryCode) expect(CATALOG_CODES.has(def.primaryCode)).toBe(true);
    }
    // change_management (§314.4(c)(7)) has no direct questionnaire control -> no primaryCode.
    expect(POLICY_DEFINITIONS.change_management.primaryCode).toBeUndefined();
  });
});

describe("buildPolicyPosture — honest grounding", () => {
  it("never claims a control is in place when the answer is no/partial/unanswered", () => {
    for (const type of POLICY_TYPES) {
      const def = POLICY_DEFINITIONS[type];
      // All grounding controls answered "no" -> all gaps, nothing confirmed.
      const noAnswers = Object.fromEntries(def.groundingCodes.map((c) => [c, "no"]));
      const noPosture = buildPolicyPosture(def, noAnswers);
      expect(noPosture.confirmed).toHaveLength(0);
      expect(noPosture.gaps.length).toBe(def.groundingCodes.length);

      // Unanswered -> still a gap ("unknown"), never a false confirmed.
      const emptyPosture = buildPolicyPosture(def, {});
      expect(emptyPosture.confirmed).toHaveLength(0);
      expect(emptyPosture.gaps.length).toBe(def.groundingCodes.length);
    }
  });

  it("confirms a control only when the answer is yes", () => {
    const def = POLICY_DEFINITIONS.mfa; // grounded in q4_1
    const posture = buildPolicyPosture(def, { q4_1: "yes" });
    expect(posture.gaps).toHaveLength(0);
    expect(posture.confirmed).toHaveLength(1);
    expect(posture.confirmed[0].requirement.code).toBe("q4_1");
  });
});

describe("renderPolicyText — content grounding", () => {
  it("cites the requirement and reflects the honest posture for a gap control", () => {
    const def = POLICY_DEFINITIONS.encryption;
    const text = renderPolicyText(def, DEALERSHIP, { q5_1: "no", q5_2: "partial" });
    expect(text).toContain(def.title.toUpperCase());
    expect(text).toContain("§314.4(c)(3)");
    expect(text).toContain("Test Motors");
    expect(text).toContain("DRAFT");
    // Honest posture: encryption-at-rest answered "no" surfaces as an open item, not "implemented".
    expect(text).toContain("Required — not yet confirmed in place:");
    expect(text).toContain("Current answer: No");
    expect(text).toContain("Current answer: Partially in place");
    expect(text).not.toContain("Current answer: Yes");
    // The mandated disclaimer is embedded.
    expect(text).toContain("generated software output");
  });

  it("labels confirmed controls when the answer is yes", () => {
    const def = POLICY_DEFINITIONS.access_control;
    const text = renderPolicyText(def, DEALERSHIP, { q4_2: "yes", q4_3: "yes", q4_5: "yes" });
    expect(text).toContain("Confirmed in place:");
    expect(text).toContain("Current answer: Yes");
    expect(text).not.toContain("Required — not yet confirmed in place:");
  });
});
