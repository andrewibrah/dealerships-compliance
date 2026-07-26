import { describe, it, expect } from "vitest";
import {
  buildIncidentResponsePlan,
  IRP_SECTION,
  type IrpElementKey,
} from "../shared/incident-response";
import { REQUIREMENT_CATALOG } from "../shared/requirements";

const DEALERSHIP = {
  name: "Test Motors",
  qualifiedIndividual: "Jane Doe",
  qiEmail: "jane@testmotors.com",
};

const SECTION7_CODES = REQUIREMENT_CATALOG.filter((r) => r.section === IRP_SECTION).map((r) => r.code);

describe("Incident Response Plan model (§314.4(h))", () => {
  it("covers all seven §314.4(h) elements in order", () => {
    const plan = buildIncidentResponsePlan(DEALERSHIP, {});
    const keys = plan.elements.map((e) => e.key);
    const expected: IrpElementKey[] = ["h1", "h2", "h3", "h4", "h5", "h6", "h7"];
    expect(keys).toEqual(expected);
    // Every element carries a §314.4(h) subsection citation and non-empty content.
    for (const el of plan.elements) {
      expect(el.citation).toMatch(/^§314\.4\(h\)\(\d\)$/);
      expect(el.paragraphs.length).toBeGreaterThan(0);
      expect(el.paragraphs.join(" ").length).toBeGreaterThan(0);
    }
  });

  it("grounds the Incident Response Lead in the dealership's Qualified Individual", () => {
    const plan = buildIncidentResponsePlan(DEALERSHIP, {});
    expect(plan.lead.designated).toBe(true);
    const roles = plan.elements.find((e) => e.key === "h3")!.paragraphs.join(" ");
    expect(roles).toContain("Jane Doe");
    expect(roles).toContain("jane@testmotors.com");
  });

  it("states the requirement honestly when no QI is designated (no false claim)", () => {
    const plan = buildIncidentResponsePlan(
      { name: "X", qualifiedIndividual: "", qiEmail: "" },
      {},
    );
    expect(plan.lead.designated).toBe(false);
    const roles = plan.elements.find((e) => e.key === "h3")!.paragraphs.join(" ");
    expect(roles).toContain("No Qualified Individual is currently designated");
    expect(roles).toContain("§314.4(a)");
  });

  it("cites §314.4(j) as the FTC 30-day / 500-consumer breach-notification obligation", () => {
    const plan = buildIncidentResponsePlan(DEALERSHIP, {});
    const notice = plan.breachNotice.join(" ");
    // The operative duty is §314.4(j); §314.5 is only its effective-date section.
    expect(notice).toContain("§314.4(j)");
    expect(notice).toContain("30 days");
    expect(notice).toContain("500");
    expect(notice).toContain("Federal Trade Commission");
  });

  it("reports honest readiness: all-no answers produce section-7 gaps, no confirmed controls", () => {
    const answers = Object.fromEntries(SECTION7_CODES.map((c) => [c, "no"]));
    const plan = buildIncidentResponsePlan(DEALERSHIP, answers);
    expect(plan.readiness.score).toBe(0);
    expect(plan.readiness.confirmed).toHaveLength(0);
    expect(plan.readiness.gaps.length).toBe(SECTION7_CODES.length);
    // Every gap carries a §314.4(h) citation and a triggering answer.
    for (const gap of plan.readiness.gaps) {
      expect(gap.citation).toContain("§314.4(h)");
      expect(gap.triggeringAnswer).toBe("no");
    }
    expect(plan.readiness.criticalGaps.length).toBeGreaterThan(0);
  });

  it("reports honest readiness: all-yes answers confirm controls with no gaps", () => {
    const answers = Object.fromEntries(SECTION7_CODES.map((c) => [c, "yes"]));
    const plan = buildIncidentResponsePlan(DEALERSHIP, answers);
    expect(plan.readiness.score).toBe(100);
    expect(plan.readiness.gaps).toHaveLength(0);
    expect(plan.readiness.confirmed.length).toBe(SECTION7_CODES.length);
  });

  it("is deterministic and marks the §314.6(a) exemption for small institutions", () => {
    const exempt = buildIncidentResponsePlan({ ...DEALERSHIP, consumerCount: 100 }, {});
    expect(exempt.isExempt).toBe(true);
    const notExempt = buildIncidentResponsePlan({ ...DEALERSHIP, consumerCount: 9000 }, {});
    expect(notExempt.isExempt).toBe(false);
    // Pure: same inputs -> identical model.
    expect(buildIncidentResponsePlan(DEALERSHIP, {})).toEqual(buildIncidentResponsePlan(DEALERSHIP, {}));
  });
});
