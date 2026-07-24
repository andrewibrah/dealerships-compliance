import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import { SAFEGUARDS_SECTIONS } from "./safeguards-questions.ts";
import { calculateSectionScore, calculateOverallScore, type SectionScore } from "./scoring.ts";
import {
  deriveAssessmentFromAnswers,
  type DerivedGap,
  type DerivedSectionScore,
} from "./derivation.ts";
import { REQUIREMENT_CATALOG, REQUIREMENT_GUIDANCE } from "./requirements.ts";
import type { AnswerValue } from "./controls.ts";
import {
  getApplicability,
  applicableQuestions,
  applicableRequirements,
  type Applicability,
} from "./applicability.ts";
import {
  buildSecurityArchitectureAssessment,
  domainStatusLabel,
  sectionMeta,
  ASSESSMENT_DISCLAIMER,
  type DomainKey,
} from "./security-architecture.ts";
import { buildIncidentResponsePlan, BREACH_NOTICE_CITATION } from "./incident-response.ts";
import {
  POLICY_DEFINITIONS,
  buildPolicyPosture,
  policyAnswerLabel,
  type PolicyType,
} from "./policy-templates.ts";

/**
 * PDF generation for WISP and board report.
 * Shared between the Express dev server (Node) and the Supabase Edge Function (Deno,
 * via the functions import map), so keep imports bare and runtime-neutral.
 */

export interface DealershipInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  dmsVendor: string;
  rooftopCount: number;
  qualifiedIndividual: string;
  qiEmail: string;
  /** Drives the §314.6(a) exemption (PRD #7). Null/undefined -> nothing exempt (default). */
  consumerCount?: number | null;
}

export interface ComplianceAnswerRow {
  section: number;
  sectionName: string;
  answers: unknown;
  score: number | null;
  completed: boolean | null;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const NAVY = rgb(0.13, 0.17, 0.32);
const SLATE = rgb(0.35, 0.38, 0.45);
const RED = rgb(0.75, 0.1, 0.1);
const ORANGE = rgb(0.85, 0.45, 0);
const AMBER = rgb(0.7, 0.55, 0);
const GREEN = rgb(0.1, 0.5, 0.2);

function riskColor(score: number): RGB {
  if (score < 40) return RED;
  if (score < 60) return ORANGE;
  if (score < 80) return AMBER;
  return GREEN;
}

function riskLabel(score: number): string {
  if (score < 40) return "CRITICAL RISK";
  if (score < 60) return "HIGH RISK";
  if (score < 80) return "MEDIUM RISK";
  return "LOW RISK";
}

/**
 * Compute section results from raw answers so PDFs always reflect the saved data. Scope-aware
 * (PRD #7): questions out of scope under §314.6 are dropped from their section's denominator,
 * and a section left with no in-scope questions is omitted entirely. The default applicability
 * (no consumer count) is identity — every question in every section, byte-identical to before.
 */
export function computeSectionResults(
  rows: ComplianceAnswerRow[],
  applicability: Applicability = getApplicability({}),
): SectionScore[] {
  const bySection = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    bySection.set(row.section, (row.answers as Record<string, unknown>) ?? {});
  }
  const results: SectionScore[] = [];
  for (const sec of SAFEGUARDS_SECTIONS) {
    const questions = applicableQuestions(sec.questions, applicability);
    if (questions.length === 0) continue;
    results.push({
      ...calculateSectionScore(bySection.get(sec.number) ?? {}, questions),
      section: sec.number,
      sectionName: sec.name,
    });
  }
  return results;
}

export function computeOverallScore(rows: ComplianceAnswerRow[]): number {
  return calculateOverallScore(computeSectionResults(rows)).overall;
}

class PdfWriter {
  private doc: PDFDocument;
  private page: PDFPage;
  private y: number;
  private font: PDFFont;
  private bold: PDFFont;

  private constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  static async create(): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    return new PdfWriter(doc, font, bold);
  }

  private ensureSpace(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  text(
    content: string,
    opts: { size?: number; bold?: boolean; color?: RGB; indent?: number; gapAfter?: number } = {}
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    const maxWidth = PAGE_WIDTH - MARGIN * 2 - indent;
    const lines = wrapText(content, font, size, maxWidth);
    for (const line of lines) {
      this.ensureSpace(size + 4);
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y - size,
        size,
        font,
        color: opts.color ?? rgb(0.1, 0.1, 0.1),
      });
      this.y -= size + 4;
    }
    this.y -= opts.gapAfter ?? 4;
  }

  heading(content: string, size = 13) {
    this.ensureSpace(size + 14);
    this.y -= 6;
    this.text(content, { size, bold: true, color: NAVY, gapAfter: 6 });
  }

  spacer(height = 8) {
    this.y -= height;
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Flatten per-section answer rows into one code -> value map for the derivation pass. */
function flattenAnswers(rows: ComplianceAnswerRow[]): Record<string, AnswerValue> {
  const flat: Record<string, AnswerValue> = {};
  for (const row of rows) {
    Object.assign(flat, (row.answers as Record<string, AnswerValue>) ?? {});
  }
  return flat;
}

/** The dealer's saved answer for a gap, phrased for the reader (grounded in the derived status). */
function triggeringAnswerLabel(gap: DerivedGap): string {
  if (gap.status === "partial") return "Current answer: Partially in place";
  if (gap.status === "not_implemented") return "Current answer: No";
  return "Not answered yet";
}

/** Write one gap as an explainable block: citation + triggering answer + why + fix. */
function writeGapDetail(w: PdfWriter, gap: DerivedGap, critical: boolean) {
  const guidance = REQUIREMENT_GUIDANCE[gap.requirementCode];
  w.text(`• ${gap.title}  [${gap.citation}]`, {
    indent: 12,
    color: critical ? RED : rgb(0.1, 0.1, 0.1),
  });
  w.text(triggeringAnswerLabel(gap), { indent: 22, size: 9, color: SLATE });
  if (guidance?.whyItMatters) {
    w.text(`Why it matters: ${guidance.whyItMatters}`, { indent: 22, size: 9, color: SLATE });
  }
  if (guidance?.fix) {
    w.text(`Fix: ${guidance.fix}`, { indent: 22, size: 9, color: SLATE, gapAfter: 6 });
  }
}

interface RemediationItem {
  sectionName: string;
  gap: DerivedGap;
  critical: boolean;
}

function remediationPriorities(sections: DerivedSectionScore[]): RemediationItem[] {
  const items: (RemediationItem & { weight: number })[] = [];
  for (const section of sections) {
    const enforcementBoost = [4, 5, 7].includes(section.section) ? 1 : 0;
    for (const gap of section.criticalGaps) {
      items.push({ sectionName: section.sectionName, gap, critical: true, weight: 2 + enforcementBoost });
    }
    for (const gap of section.gaps.filter((g) => !section.criticalGaps.includes(g))) {
      items.push({ sectionName: section.sectionName, gap, critical: false, weight: enforcementBoost });
    }
  }
  return items.sort((a, b) => b.weight - a.weight).slice(0, 10);
}

/**
 * Written Information Security Program (WISP) — FTC Safeguards Rule 16 CFR Part 314.
 */
export async function generateWISP(
  dealership: DealershipInfo,
  complianceAnswers: ComplianceAnswerRow[]
): Promise<Uint8Array> {
  const applicability = getApplicability({ consumerCount: dealership.consumerCount ?? null });
  const results = computeSectionResults(complianceAnswers, applicability);
  const overall = calculateOverallScore(results);
  // Explainability spine: same numbers as `results` (proven equivalent in
  // server/derivation.test.ts), but each gap carries its §314.4 citation + triggering answer.
  // Same in-scope requirement set as the scoring path, so the two agree for exempt dealers too.
  const assessment = deriveAssessmentFromAnswers(
    applicableRequirements(REQUIREMENT_CATALOG, applicability),
    flattenAnswers(complianceAnswers),
  );
  const derivedBySection = new Map(assessment.sections.map((s) => [s.section, s]));
  const w = await PdfWriter.create();

  w.text("WRITTEN INFORMATION SECURITY PROGRAM (WISP)", { size: 17, bold: true, color: NAVY });
  w.text("FTC Safeguards Rule — 16 CFR Part 314", { size: 11, color: SLATE, gapAfter: 12 });
  writeDisclaimer(w);

  w.heading("Covered Entity");
  w.text(`Dealership: ${dealership.name || "Not provided"}`, { bold: true });
  if (dealership.address) w.text(`Address: ${dealership.address}, ${dealership.city}, ${dealership.state}`);
  if (dealership.dmsVendor) w.text(`DMS Vendor: ${dealership.dmsVendor}`);
  w.text(`Rooftops covered: ${dealership.rooftopCount || 1}`);
  w.text(
    `Qualified Individual: ${dealership.qualifiedIndividual || "Not designated"}${dealership.qiEmail ? ` (${dealership.qiEmail})` : ""}`
  );
  w.text(`Program date: ${new Date().toLocaleDateString()}`, { gapAfter: 8 });

  w.heading("Purpose & Scope");
  w.text(
    "This Written Information Security Program documents the administrative, technical, and physical " +
      "safeguards the dealership maintains to protect customer information, as required by the FTC " +
      "Safeguards Rule. It applies to all customer nonpublic personal information collected in connection " +
      "with financing, leasing, and related consumer transactions, across all rooftops listed above."
  );

  w.heading("Current Compliance Posture");
  w.text(`Overall assessment score: ${overall.overall}% — ${riskLabel(overall.overall)}`, {
    bold: true,
    color: riskColor(overall.overall),
    gapAfter: 8,
  });

  const resultBySection = new Map(results.map((r) => [r.section, r]));
  for (const sec of SAFEGUARDS_SECTIONS) {
    w.heading(`Element ${sec.number}: ${sec.name}`, 12);
    w.text(sec.description, { color: SLATE });

    const applicableQ = applicableQuestions(sec.questions, applicability);
    if (applicableQ.length === 0) {
      w.text(
        "Not applicable under the 16 CFR §314.6 small-institution exemption (fewer than 5,000 consumers).",
        { color: SLATE, gapAfter: 6 },
      );
      continue;
    }
    const result = resultBySection.get(sec.number)!;
    w.text(`Section score: ${result.score}%`, {
      bold: true,
      color: riskColor(result.score),
    });

    const answered = applicableQ.length - result.gaps.length;
    if (answered > 0) {
      w.text(
        `${answered} of ${applicableQ.length} safeguards in this element are confirmed in place.`
      );
    } else {
      w.text("No safeguards in this element are confirmed in place yet.", { color: SLATE });
    }

    const derived = derivedBySection.get(sec.number);
    const criticalGaps = derived?.criticalGaps ?? [];
    const otherGaps = derived
      ? derived.gaps.filter((g) => !derived.criticalGaps.includes(g))
      : [];
    if (criticalGaps.length > 0) {
      w.text("Open critical items:", { bold: true, color: RED });
      for (const gap of criticalGaps) {
        writeGapDetail(w, gap, true);
      }
    }
    if (otherGaps.length > 0) {
      w.text("Other open items:", { bold: true, color: SLATE });
      for (const gap of otherGaps) {
        writeGapDetail(w, gap, false);
      }
    }
    w.spacer(4);
  }

  w.heading("Remediation Priorities");
  const priorities = remediationPriorities(assessment.sections);
  if (priorities.length === 0) {
    w.text("No open remediation items. Maintain current controls and reassess quarterly.");
  } else {
    priorities.forEach((item, i) => {
      w.text(
        `${i + 1}. [${item.critical ? "CRITICAL" : "Recommended"}] ${item.sectionName}: ${item.gap.title} [${item.gap.citation}]`,
        { color: item.critical ? RED : rgb(0.1, 0.1, 0.1) }
      );
      const fix = REQUIREMENT_GUIDANCE[item.gap.requirementCode]?.fix;
      if (fix) w.text(`Fix: ${fix}`, { indent: 16, size: 9, color: SLATE });
    });
  }

  w.heading("Program Maintenance");
  w.text(
    "The Qualified Individual reviews this program at least annually, reports in writing to the board " +
      "or governing body, and updates the program after material changes to operations, systems, vendors, " +
      "or after any security event. This document was generated from the dealership's current assessment " +
      "answers and should be regenerated after material updates."
  );

  w.spacer(10);
  writeDisclaimer(w);
  w.text("Confidential — for internal, board, auditor, and regulator use.", { size: 8, color: SLATE });
  w.text(`Generated ${new Date().toLocaleString()}`, { size: 8, color: SLATE });

  return w.save();
}

/**
 * Board-level annual compliance report — executive summary of the assessment.
 */
export async function generateBoardReport(
  dealership: DealershipInfo,
  complianceAnswers: ComplianceAnswerRow[]
): Promise<Uint8Array> {
  const applicability = getApplicability({ consumerCount: dealership.consumerCount ?? null });
  const results = computeSectionResults(complianceAnswers, applicability);
  const overall = calculateOverallScore(results);
  const assessment = deriveAssessmentFromAnswers(
    applicableRequirements(REQUIREMENT_CATALOG, applicability),
    flattenAnswers(complianceAnswers),
  );
  const w = await PdfWriter.create();

  w.text("ANNUAL COMPLIANCE REPORT", { size: 17, bold: true, color: NAVY });
  w.text("FTC Safeguards Rule Assessment — prepared for the Board of Directors", {
    size: 11,
    color: SLATE,
    gapAfter: 12,
  });
  writeDisclaimer(w);

  w.text(`Dealership: ${dealership.name || "Not provided"}`, { bold: true });
  w.text(`Report date: ${new Date().toLocaleDateString()}`);
  w.text(
    `Qualified Individual: ${dealership.qualifiedIndividual || "Not designated"}`,
    { gapAfter: 8 }
  );

  w.heading("Executive Summary");
  w.text(`Overall compliance score: ${overall.overall}% — ${riskLabel(overall.overall)}`, {
    size: 13,
    bold: true,
    color: riskColor(overall.overall),
  });
  const criticalCount = results.reduce((n, r) => n + r.criticalGaps.length, 0);
  const openCount = results.reduce((n, r) => n + r.gaps.length, 0);
  w.text(
    `The assessment covers all nine Safeguards Rule elements. ${openCount} safeguard item(s) remain open, ` +
      `of which ${criticalCount} are critical. ` +
      (criticalCount > 0
        ? "Critical items expose the dealership to FTC enforcement risk and should be resolved first."
        : "No critical items are open; focus is on maintaining and documenting current controls.")
  );

  w.heading("Scores by Safeguards Element");
  for (const result of results) {
    w.text(`${result.section}. ${result.sectionName} — ${result.score}%`, {
      color: riskColor(result.score),
    });
  }

  w.heading("Key Findings");
  const criticalSections = assessment.sections.filter((s) => s.criticalGaps.length > 0);
  if (criticalSections.length === 0) {
    w.text("No critical gaps identified in the current assessment.");
  } else {
    for (const section of criticalSections) {
      w.text(`${section.sectionName} (${section.score}%):`, { bold: true, color: RED });
      for (const gap of section.criticalGaps) {
        writeGapDetail(w, gap, true);
      }
    }
  }

  w.heading("Recommended Actions (next 90 days)");
  const priorities = remediationPriorities(assessment.sections).slice(0, 5);
  if (priorities.length === 0) {
    w.text("1. Maintain current security posture and reassess quarterly.");
    w.text("2. Confirm annual QI report to the board is on the calendar.");
    w.text("3. Monitor regulatory changes to 16 CFR Part 314.");
  } else {
    priorities.forEach((item, i) => {
      w.text(`${i + 1}. ${item.sectionName}: ${item.gap.title} [${item.gap.citation}]`);
      const fix = REQUIREMENT_GUIDANCE[item.gap.requirementCode]?.fix;
      if (fix) w.text(`Fix: ${fix}`, { indent: 16, size: 9, color: SLATE });
    });
  }

  w.heading("Board Oversight Notes");
  w.text(
    "The Safeguards Rule requires the Qualified Individual to report to the board in writing at least " +
      "annually on the program's status, risk assessment results, and material events. This report was " +
      "generated from the dealership's current assessment answers in the compliance platform."
  );

  w.spacer(10);
  writeDisclaimer(w);
  w.text("Confidential — intended for board members and the Qualified Individual.", {
    size: 8,
    color: SLATE,
  });
  w.text(`Generated ${new Date().toLocaleString()}`, { size: 8, color: SLATE });

  return w.save();
}

// --- Phase 2 #20: Security Architecture Assessment + Written Risk Assessment ---------------
//
// Both reuse PdfWriter/writeGapDetail and the derivation spine, and embed ASSESSMENT_DISCLAIMER
// (the P0 non-negotiable) at the top AND bottom. Every rendered line traces to a saved answer, an
// entity row, or a §314.4 citation. The architecture generator accepts an OPTIONAL per-domain prose
// map: when the guardrailed LLM layer is enabled it supplies rephrased narratives; when it is not
// (no ANTHROPIC_API_KEY) the deterministic per-domain narrative is used instead. Either way the
// structured findings below the narrative are the source of truth — prose can never change them.

/** Structural asset row for the Written Risk Assessment inventory (Drizzle Asset rows satisfy it). */
export interface AssetRow {
  name: string;
  assetType: string;
  description: string;
  owner: string;
  location: string;
  storesNpi: boolean;
  criticality: string;
  vendor: string;
}

/** Structural data-flow row for the NPI data-flow map (Drizzle DataFlow rows satisfy it). */
export interface DataFlowRow {
  name: string;
  description: string;
  externalParty: string;
  dataTypes: string;
  direction: string;
  transportEncryption: string;
}

/** Structural risk row for the risk register (Drizzle Risk rows satisfy it). */
export interface RiskRow {
  title: string;
  description: string;
  likelihood?: string | null;
  impact?: string | null;
  severity?: string | null;
  status: string;
}

export interface ArchitectureEntities {
  assets: AssetRow[];
  dataFlows: DataFlowRow[];
  risks: RiskRow[];
}

/** Render the mandatory disclaimer as an emphasized block (PRD #4). */
function writeDisclaimer(w: PdfWriter) {
  w.text("IMPORTANT — DISCLAIMER", { bold: true, size: 9, color: SLATE });
  w.text(ASSESSMENT_DISCLAIMER, { size: 9, color: SLATE, gapAfter: 10 });
}

function writeCoveredEntity(w: PdfWriter, dealership: DealershipInfo) {
  w.heading("Covered Entity");
  w.text(`Dealership: ${dealership.name || "Not provided"}`, { bold: true });
  if (dealership.address)
    w.text(`Address: ${dealership.address}, ${dealership.city}, ${dealership.state}`);
  if (dealership.dmsVendor) w.text(`DMS Vendor: ${dealership.dmsVendor}`);
  w.text(`Rooftops covered: ${dealership.rooftopCount || 1}`);
  w.text(
    `Qualified Individual: ${dealership.qualifiedIndividual || "Not designated"}${dealership.qiEmail ? ` (${dealership.qiEmail})` : ""}`,
  );
  w.text(`Assessment date: ${new Date().toLocaleDateString()}`, { gapAfter: 8 });
}

/**
 * Security Architecture Assessment (Phase 2 #20). A domain-organized expert review: six
 * cybersecurity-architecture domains, five with a derived posture + grounded gaps, and one
 * (AI & Emerging Tech) that is clearly-labelled ADVISORY with no score and no §314.4 citation.
 */
export async function generateSecurityArchitectureAssessment(
  dealership: DealershipInfo,
  complianceAnswers: ComplianceAnswerRow[],
  entities: ArchitectureEntities,
  narratives?: Partial<Record<DomainKey, string>>,
): Promise<Uint8Array> {
  const assessment = buildSecurityArchitectureAssessment({
    answers: flattenAnswers(complianceAnswers),
    assets: entities.assets,
    dataFlows: entities.dataFlows,
    risks: entities.risks,
    dmsVendor: dealership.dmsVendor,
    consumerCount: dealership.consumerCount ?? null,
  });
  const w = await PdfWriter.create();

  w.text("SECURITY ARCHITECTURE ASSESSMENT", { size: 17, bold: true, color: NAVY });
  w.text("Expert Cybersecurity Architecture Review — FTC Safeguards Rule (16 CFR Part 314)", {
    size: 11,
    color: SLATE,
    gapAfter: 10,
  });
  writeDisclaimer(w);

  writeCoveredEntity(w, dealership);

  w.heading("Overall Architecture Posture");
  w.text(`Overall assessment score: ${assessment.overall}% — ${riskLabel(assessment.overall)}`, {
    bold: true,
    color: riskColor(assessment.overall),
  });
  if (assessment.isExempt) {
    w.text(
      "This dealership qualifies for the §314.6(a) small-institution exemption (fewer than 5,000 " +
        "consumers); exempt requirements are excluded from the posture and gaps below.",
      { size: 9, color: SLATE },
    );
  }
  w.text(
    "The assessment reframes the dealership's saved answers and inventoried assets, data flows, and " +
      "risks into six cybersecurity-architecture domains. Every posture, gap, and citation below is " +
      "derived from that data.",
    { color: SLATE, gapAfter: 6 },
  );

  for (const domain of assessment.domains) {
    if (domain.advisory) {
      w.heading(`${domain.title}  —  ADVISORY`, 12);
      w.text("Advisory guidance only — not a §314.4 determination and not scored.", {
        size: 9,
        bold: true,
        color: AMBER,
      });
    } else if (domain.posture) {
      w.heading(`${domain.title}  —  ${domain.posture.score}% (${domainStatusLabel(domain.posture.status)})`, 12);
      w.text(
        `${domain.posture.confirmedControls} of ${domain.posture.totalControls} in-scope safeguards confirmed in place.`,
        { size: 9, color: riskColor(domain.posture.score) },
      );
    } else {
      w.heading(`${domain.title}  —  Not assessed`, 12);
      w.text("No in-scope requirements for this dealership under the §314.6 exemption.", {
        size: 9,
        color: SLATE,
      });
    }

    w.text(domain.summary, { size: 9, color: SLATE });

    const narrative = narratives?.[domain.key] ?? domain.narrative;
    w.text(narrative, { gapAfter: 4 });

    if (domain.citations.length > 0) {
      w.text(`Safeguards elements in scope: ${domain.citations.join(", ")}`, {
        size: 9,
        color: SLATE,
      });
    }

    if (domain.signals.length > 0) {
      w.text("Observations from your inventory:", { bold: true, size: 9, color: SLATE });
      for (const signal of domain.signals) {
        w.text(`• ${signal.text}  [source: ${signal.grounding.replace(/_/g, " ")}]`, {
          indent: 12,
          size: 9,
          color: SLATE,
        });
      }
    }

    if (domain.criticalGaps.length > 0) {
      w.text("Open critical items:", { bold: true, color: RED });
      for (const gap of domain.criticalGaps) writeGapDetail(w, gap, true);
    }
    const otherGaps = domain.gaps.filter((g) => !domain.criticalGaps.includes(g));
    if (otherGaps.length > 0) {
      w.text("Other open items:", { bold: true, color: SLATE });
      for (const gap of otherGaps) writeGapDetail(w, gap, false);
    }

    if (domain.advisoryFindings.length > 0) {
      w.text("Advisory findings:", { bold: true, size: 9, color: AMBER });
      for (const finding of domain.advisoryFindings) {
        w.text(`• ${finding}`, { indent: 12, size: 9, color: SLATE });
      }
    }
    w.spacer(4);
  }

  w.heading("Scope of this Assessment");
  w.text(
    "This is generated software output that organizes the dealership's compliance data into an " +
      "architecture view. It does not replace an independent penetration test, audit, or the " +
      "dealership's own risk judgment.",
    { size: 9, color: SLATE },
  );
  w.spacer(6);
  writeDisclaimer(w);
  w.text("Confidential — for internal, board, auditor, and regulator use.", { size: 8, color: SLATE });
  w.text(`Generated ${new Date().toLocaleString()}`, { size: 8, color: SLATE });

  return w.save();
}

const riskListLabel = (r: RiskRow): string => {
  const bits = [r.severity ? `${r.severity} severity` : null, r.status].filter(Boolean);
  const meta = bits.length > 0 ? ` (${bits.join(", ")})` : "";
  return `${r.title}${meta}`;
};

/**
 * Written Risk Assessment (§314.4(b) / PRD #20). The FTC-required written risk assessment:
 * the systems/assets in scope, how customer NPI flows, the identified risks, and the derived
 * §314.4(b) findings. Every line traces to an asset/data-flow/risk row, a saved answer, or a
 * §314.4 citation.
 */
export async function generateRiskAssessment(
  dealership: DealershipInfo,
  complianceAnswers: ComplianceAnswerRow[],
  entities: ArchitectureEntities,
): Promise<Uint8Array> {
  const applicability = getApplicability({ consumerCount: dealership.consumerCount ?? null });
  const assessment = deriveAssessmentFromAnswers(
    applicableRequirements(REQUIREMENT_CATALOG, applicability),
    flattenAnswers(complianceAnswers),
  );
  const riskSection = assessment.sections.find((s) => s.section === 2);
  const w = await PdfWriter.create();

  w.text("WRITTEN RISK ASSESSMENT", { size: 17, bold: true, color: NAVY });
  w.text("FTC Safeguards Rule §314.4(b) — 16 CFR Part 314", { size: 11, color: SLATE, gapAfter: 10 });
  writeDisclaimer(w);

  writeCoveredEntity(w, dealership);

  w.heading("Purpose & Scope");
  w.text(
    "16 CFR §314.4(b) requires a written risk assessment that identifies reasonably foreseeable " +
      "internal and external risks to the security, confidentiality, and integrity of customer " +
      "information, and assesses the sufficiency of the safeguards in place to control those risks. " +
      "This document records that assessment across the systems, data flows, and risks the dealership " +
      "has inventoried, together with the findings derived from the risk-assessment self-assessment.",
    { color: SLATE, gapAfter: 6 },
  );

  w.heading("Methodology");
  w.text(
    "Risks are evaluated deterministically from (1) the dealership's weighted answers to the " +
      "risk-assessment safeguards element, (2) the inventoried asset register, (3) the mapped customer-NPI " +
      "data flows, and (4) the logged risk register. No conclusion is generated by an AI model.",
    { size: 9, color: SLATE, gapAfter: 4 },
  );

  // 1. Asset inventory
  w.heading("Information Systems & Asset Inventory");
  if (entities.assets.length === 0) {
    w.text(
      "No assets have been inventoried yet. An asset inventory is a prerequisite for a complete risk " +
        "assessment — record every system, application, database, device, and vendor service that handles NPI.",
      { color: SLATE },
    );
  } else {
    w.text(`${entities.assets.length} asset(s) inventoried:`, { color: SLATE });
    for (const asset of entities.assets) {
      const npi = asset.storesNpi ? "stores NPI" : "no NPI recorded";
      const vendor = asset.vendor ? `, vendor ${asset.vendor}` : "";
      w.text(`• ${asset.name} — ${asset.assetType}, ${asset.criticality} criticality, ${npi}${vendor}`, {
        indent: 12,
        size: 9,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
  }
  w.spacer(4);

  // 2. Data flows
  w.heading("Customer NPI Data Flows");
  if (entities.dataFlows.length === 0) {
    w.text(
      "No data flows have been mapped. Mapping how NPI moves between systems and to external parties is " +
        "how internal and external transmission risks are identified.",
      { color: SLATE },
    );
  } else {
    w.text(`${entities.dataFlows.length} data flow(s) mapped:`, { color: SLATE });
    for (const flow of entities.dataFlows) {
      const ext = flow.externalParty ? `, external party ${flow.externalParty}` : "";
      const types = flow.dataTypes ? `, data: ${flow.dataTypes}` : "";
      w.text(
        `• ${flow.name} — ${flow.direction}, transport ${flow.transportEncryption}${ext}${types}`,
        { indent: 12, size: 9, color: rgb(0.1, 0.1, 0.1) },
      );
    }
  }
  w.spacer(4);

  // 3. Identified risks
  w.heading("Identified Risks");
  if (entities.risks.length === 0) {
    w.text(
      "No risks have been logged in the risk register. As threats and vulnerabilities are identified, " +
        "record each here with its likelihood, impact, and treatment status.",
      { color: SLATE },
    );
  } else {
    w.text(`${entities.risks.length} risk(s) logged:`, { color: SLATE });
    for (const risk of entities.risks) {
      w.text(`• ${riskListLabel(risk)}`, { indent: 12, color: rgb(0.1, 0.1, 0.1) });
      if (risk.description) {
        w.text(risk.description, { indent: 22, size: 9, color: SLATE });
      }
      const li = [risk.likelihood ? `likelihood ${risk.likelihood}` : null, risk.impact ? `impact ${risk.impact}` : null]
        .filter(Boolean)
        .join(", ");
      if (li) w.text(li, { indent: 22, size: 9, color: SLATE });
    }
  }
  w.spacer(4);

  // 4. Risk-assessment element findings (§314.4(b))
  w.heading("Risk-Assessment Element Findings (§314.4(b))");
  if (!riskSection) {
    w.text("The risk-assessment element is not in scope for this dealership.", { color: SLATE });
  } else {
    w.text(`Risk-assessment element score: ${riskSection.score}%`, {
      bold: true,
      color: riskColor(riskSection.score),
    });
    if (riskSection.criticalGaps.length > 0) {
      w.text("Open critical items:", { bold: true, color: RED });
      for (const gap of riskSection.criticalGaps) writeGapDetail(w, gap, true);
    }
    const otherGaps = riskSection.gaps.filter((g) => !riskSection.criticalGaps.includes(g));
    if (otherGaps.length > 0) {
      w.text("Other open items:", { bold: true, color: SLATE });
      for (const gap of otherGaps) writeGapDetail(w, gap, false);
    }
    if (riskSection.gaps.length === 0) {
      w.text("No open items in the risk-assessment element.", { color: GREEN });
    }
  }
  w.spacer(6);

  w.heading("Reassessment");
  w.text(
    "The Qualified Individual updates this risk assessment at least annually and whenever there is a " +
      "material change to operations, systems, vendors, or after any security event (§314.4(b)(2)).",
    { size: 9, color: SLATE, gapAfter: 6 },
  );

  writeDisclaimer(w);
  w.text("Confidential — for internal, board, auditor, and regulator use.", { size: 8, color: SLATE });
  w.text(`Generated ${new Date().toLocaleString()}`, { size: 8, color: SLATE });

  return w.save();
}

// --- Phase 2 #23: Incident Response Plan + #22: written §314.4(c) policies -------------------
//
// Both reuse PdfWriter / writeGapDetail / writeCoveredEntity / writeDisclaimer, embed
// ASSESSMENT_DISCLAIMER (P0), and pull their content from the deterministic models in
// shared/incident-response.ts and shared/policy-templates.ts. Every element/clause is authored,
// grounded content; every status/citation/gap traces to a saved answer or the Rule. Where a
// control is a gap the document states the requirement + the honest current posture, never a
// false "we have implemented X". No LLM sits in this path.

/**
 * Incident Response Plan (§314.4(h) / PRD #23). Covers the seven required elements of §314.4(h),
 * states the §314.4(j) FTC breach-notification timeline, grounds the Incident Response Lead in the
 * dealership's Qualified Individual, and reports honest section-7 readiness with each open item's
 * §314.4 citation + triggering answer.
 */
export async function generateIncidentResponsePlan(
  dealership: DealershipInfo,
  complianceAnswers: ComplianceAnswerRow[],
): Promise<Uint8Array> {
  const plan = buildIncidentResponsePlan(dealership, flattenAnswers(complianceAnswers));
  const w = await PdfWriter.create();

  w.text("INCIDENT RESPONSE PLAN", { size: 17, bold: true, color: NAVY });
  w.text("FTC Safeguards Rule §314.4(h) — 16 CFR Part 314", { size: 11, color: SLATE, gapAfter: 10 });
  writeDisclaimer(w);

  writeCoveredEntity(w, dealership);

  w.heading("Purpose & Authority");
  w.text(
    "16 CFR §314.4(h) requires a written incident response plan for promptly responding to, and " +
      "recovering from, any security event materially affecting the confidentiality, integrity, or " +
      "availability of customer information. This document is that plan, and it addresses each of the " +
      "seven elements the Rule requires.",
    { color: SLATE, gapAfter: 4 },
  );
  if (plan.isExempt) {
    w.text(
      "Your dealership may qualify for the §314.6(a) small-institution exemption (fewer than 5,000 " +
        "consumers), under which §314.4(h) does not strictly apply. Maintaining this plan remains strong " +
        "practice and is recommended.",
      { size: 9, color: AMBER, gapAfter: 4 },
    );
  }

  for (const element of plan.elements) {
    w.heading(`${element.title}  [${element.citation}]`, 12);
    for (const paragraph of element.paragraphs) {
      w.text(paragraph, { color: rgb(0.1, 0.1, 0.1) });
    }
    w.spacer(2);
  }

  w.heading(`Regulatory Breach-Notification Timeline (${BREACH_NOTICE_CITATION})`);
  for (const paragraph of plan.breachNotice) {
    w.text(paragraph, { color: rgb(0.1, 0.1, 0.1) });
  }
  w.spacer(2);

  w.heading("Current Readiness (§314.4(h))");
  w.text(`Incident-response element score: ${plan.readiness.score}%`, {
    bold: true,
    color: riskColor(plan.readiness.score),
  });
  if (plan.readiness.confirmed.length > 0) {
    w.text(
      `${plan.readiness.confirmed.length} of the incident-response safeguards are confirmed in place:`,
      { size: 9, color: SLATE },
    );
    for (const control of plan.readiness.confirmed) {
      w.text(`• ${control.requirement.title} [${control.requirement.citation}] — Current answer: Yes`, {
        indent: 12,
        size: 9,
        color: SLATE,
      });
    }
  }
  if (plan.readiness.criticalGaps.length > 0) {
    w.text("Open critical items:", { bold: true, color: RED });
    for (const gap of plan.readiness.criticalGaps) writeGapDetail(w, gap, true);
  }
  const otherGaps = plan.readiness.gaps.filter((g) => !plan.readiness.criticalGaps.includes(g));
  if (otherGaps.length > 0) {
    w.text("Other open items:", { bold: true, color: SLATE });
    for (const gap of otherGaps) writeGapDetail(w, gap, false);
  }
  if (plan.readiness.gaps.length === 0 && plan.readiness.confirmed.length === 0) {
    w.text("No incident-response answers have been saved yet.", { color: SLATE });
  }
  w.spacer(6);

  writeDisclaimer(w);
  w.text("Confidential — for internal, board, auditor, and regulator use.", { size: 8, color: SLATE });
  w.text(`Generated ${new Date().toLocaleString()}`, { size: 8, color: SLATE });

  return w.save();
}

// --- Phase 3b #36: audit-ready Examiner Package ---------------------------------------------
//
// One combined PDF an FTC examiner or the board can receive: cover + overall posture, a posture
// summary by element with each critical gap's §314.4 citation, a manifest of the dealership's
// generated documents, an evidence index, and an append-only audit-trail extract. Reuses
// PdfWriter / writeDisclaimer / writeCoveredEntity / writeGapDetail and the derivation spine —
// NO new PDF library. Every line traces to a REAL row (generated_documents, evidence, audit_log)
// or the deterministic posture derivation / a §314.4 citation. No LLM sits in this path; the
// audit extract reproduces the recorded who/what/when rows verbatim and never fabricates one.

/** Structural generated-document row for the manifest (Drizzle GeneratedDocument rows satisfy it). */
export interface GeneratedDocumentRow {
  docType: string;
  version: number;
  generatedAt: Date | string;
}

/** One evidence item for the index: its metadata + the controls it substantiates. The control
 *  labels come from REAL evidence_controls links (surfaced control-by-control via
 *  listEvidenceForControl) joined to the requirement catalog — never invented. */
export interface EvidenceIndexItem {
  title: string;
  fileName: string;
  linkedControls: string[];
}

/** Structural audit row for the extract (Drizzle AuditLogEntry rows satisfy it). Read-only: the
 *  extract prints these real who/what/when rows verbatim, never a fabricated one. */
export interface AuditLogRow {
  action: string;
  actorEmail: string;
  entityType: string;
  entityId: string;
  createdAt: Date | string;
}

export interface ExaminerPackageData {
  documents: GeneratedDocumentRow[];
  evidence: EvidenceIndexItem[];
  auditLog: AuditLogRow[];
}

/** Human-readable label for a generated-document type, mirroring the client's DOC_TYPE_LABELS.
 *  Unknown types fall back to the raw docType so the manifest never hides a real row. */
const EXAMINER_DOC_TYPE_LABELS: Record<string, string> = {
  wisp: "WISP (Written Information Security Program)",
  board_report: "Board Report",
  security_architecture: "Security Architecture Assessment",
  risk_assessment: "Written Risk Assessment",
  incident_response_plan: "Incident Response Plan",
  policy_access_control: "Access Control Policy",
  policy_encryption: "Encryption Policy",
  policy_mfa: "Multi-Factor Authentication Policy",
  policy_disposal: "Data Retention & Secure Disposal Policy",
  policy_change_management: "Change Management Policy",
  examiner_package: "Examiner Package",
};

function examinerDocLabel(docType: string): string {
  return EXAMINER_DOC_TYPE_LABELS[docType] ?? docType;
}

/** Format a timestamp for the examiner package (accepts a Date or an ISO string from the DB). */
function formatExaminerTimestamp(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

/**
 * The audit-trail extract as one line per REAL audit row (timestamp, action, actor email,
 * entity). Pure + total: it prints EXACTLY the provided rows and never invents one, so the
 * extract is a faithful who/what/when record. Empty input yields a single honest "none yet"
 * line — never a fabricated entry. Exported for the no-fabrication unit test.
 */
export function examinerAuditLines(rows: AuditLogRow[]): string[] {
  if (rows.length === 0) {
    return ["No audit-trail entries have been recorded for this dealership yet."];
  }
  return rows.map((row) => {
    const when = formatExaminerTimestamp(row.createdAt);
    const entity = [row.entityType, row.entityId].filter(Boolean).join(" ");
    const actor = row.actorEmail || "system";
    return `${when}  —  ${row.action}  —  ${actor}${entity ? `  —  ${entity}` : ""}`;
  });
}

/**
 * Examiner Package (PRD #36). One combined, audit-ready PDF: (1) cover + overall posture,
 * (2) posture summary by element with each critical gap's §314.4 citation, (3) a manifest of
 * the dealership's generated documents, (4) an evidence index, and (5) an append-only
 * audit-trail extract. Grounded end-to-end: posture comes from the deterministic derivation
 * (the same numbers as the Dashboard / WISP / board report), and the manifest / evidence /
 * audit sections print only real generated_documents / evidence / audit_log rows.
 * ASSESSMENT_DISCLAIMER top + bottom.
 */
export async function generateExaminerPackage(
  dealership: DealershipInfo,
  complianceAnswers: ComplianceAnswerRow[],
  data: ExaminerPackageData,
): Promise<Uint8Array> {
  const applicability = getApplicability({ consumerCount: dealership.consumerCount ?? null });
  const results = computeSectionResults(complianceAnswers, applicability);
  const overall = calculateOverallScore(results);
  const assessment = deriveAssessmentFromAnswers(
    applicableRequirements(REQUIREMENT_CATALOG, applicability),
    flattenAnswers(complianceAnswers),
  );
  const w = await PdfWriter.create();

  // 1. Cover + overall posture
  w.text("EXAMINER PACKAGE", { size: 17, bold: true, color: NAVY });
  w.text("FTC Safeguards Rule Compliance Dossier — 16 CFR Part 314", {
    size: 11,
    color: SLATE,
    gapAfter: 10,
  });
  writeDisclaimer(w);

  writeCoveredEntity(w, dealership);

  w.heading("Overall Compliance Posture");
  w.text(`Overall assessment score: ${overall.overall}% — ${riskLabel(overall.overall)}`, {
    size: 13,
    bold: true,
    color: riskColor(overall.overall),
  });
  w.text(
    "This package assembles the dealership's compliance posture, generated program documents, " +
      "supporting evidence, and an append-only audit-trail extract into a single record for an " +
      "examiner or the board. Every figure and row below is derived from the dealership's saved data.",
    { color: SLATE, gapAfter: 6 },
  );

  // 2. Posture summary by element + key findings
  w.heading("Compliance Posture by Safeguards Element");
  if (results.length === 0) {
    w.text("No assessment answers have been saved yet.", { color: SLATE });
  } else {
    for (const result of results) {
      w.text(`${result.section}. ${result.sectionName} — ${result.score}%`, {
        color: riskColor(result.score),
      });
    }
  }

  w.heading("Key Findings (open critical items)");
  const criticalSections = assessment.sections.filter((s) => s.criticalGaps.length > 0);
  if (criticalSections.length === 0) {
    w.text("No critical gaps identified in the current assessment.", { color: GREEN });
  } else {
    for (const section of criticalSections) {
      w.text(`${section.sectionName} (${section.score}%):`, { bold: true, color: RED });
      for (const gap of section.criticalGaps) writeGapDetail(w, gap, true);
    }
  }
  w.spacer(4);

  // 3. Document manifest — one row per real generated_documents row
  w.heading("Generated Document Manifest");
  if (data.documents.length === 0) {
    w.text("No compliance documents have been generated yet.", { color: SLATE });
  } else {
    w.text(`${data.documents.length} document(s) on file:`, { color: SLATE });
    const ordered = [...data.documents].sort(
      (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );
    for (const doc of ordered) {
      w.text(
        `• ${examinerDocLabel(doc.docType)} (v${doc.version}) — generated ${formatExaminerTimestamp(doc.generatedAt)}`,
        { indent: 12, size: 9, color: rgb(0.1, 0.1, 0.1) },
      );
    }
  }
  w.spacer(4);

  // 4. Evidence index — one row per real evidence row + the controls it substantiates
  w.heading("Evidence Index");
  if (data.evidence.length === 0) {
    w.text(
      "No evidence artifacts have been uploaded yet. Evidence substantiates the controls the " +
        "dealership reports as in place.",
      { color: SLATE },
    );
  } else {
    w.text(`${data.evidence.length} evidence item(s) on file:`, { color: SLATE });
    for (const item of data.evidence) {
      const file = item.fileName ? ` (${item.fileName})` : "";
      w.text(`• ${item.title}${file}`, { indent: 12, size: 9, color: rgb(0.1, 0.1, 0.1) });
      if (item.linkedControls.length > 0) {
        w.text(`Linked controls: ${item.linkedControls.join("; ")}`, {
          indent: 22,
          size: 9,
          color: SLATE,
        });
      } else {
        w.text("Not yet linked to a control.", { indent: 22, size: 9, color: SLATE });
      }
    }
  }
  w.spacer(4);

  // 5. Audit-trail extract — reproduces the recorded rows verbatim (no fabrication)
  w.heading("Audit-Trail Extract (append-only)");
  w.text(
    "The most recent entries from the dealership's tamper-evident audit log (who did what, when). " +
      "The log is append-only and hash-chained; this extract reproduces the recorded rows verbatim.",
    { size: 9, color: SLATE, gapAfter: 4 },
  );
  for (const line of examinerAuditLines(data.auditLog)) {
    w.text(line, { indent: 12, size: 9, color: rgb(0.1, 0.1, 0.1) });
  }
  w.spacer(6);

  writeDisclaimer(w);
  w.text("Confidential — for internal, board, auditor, and regulator use.", { size: 8, color: SLATE });
  w.text(`Generated ${new Date().toLocaleString()}`, { size: 8, color: SLATE });

  return w.save();
}

/**
 * Written policy generator (§314.4(c) / PRD #22). One parameterized generator over
 * POLICY_DEFINITIONS: renders the policy's authored clauses citing the §314.4(c) subsection it
 * fulfills, then a "current posture" block grounded honestly in the dealer's saved answers to the
 * related controls (each with its own §314.4 citation + triggering answer). Never claims a control
 * is in place when the answer says otherwise.
 */
export async function generatePolicy(
  dealership: DealershipInfo,
  complianceAnswers: ComplianceAnswerRow[],
  opts: { policyType: PolicyType },
): Promise<Uint8Array> {
  const def = POLICY_DEFINITIONS[opts.policyType];
  const posture = buildPolicyPosture(def, flattenAnswers(complianceAnswers));
  const w = await PdfWriter.create();

  w.text(def.title.toUpperCase(), { size: 17, bold: true, color: NAVY });
  w.text(`FTC Safeguards Rule ${def.citation} — 16 CFR Part 314`, { size: 11, color: SLATE, gapAfter: 10 });
  writeDisclaimer(w);

  writeCoveredEntity(w, dealership);

  w.heading("Status");
  w.text(
    "DRAFT — this policy was generated from your saved answers. Review it with counsel and formally " +
      "adopt it before relying on it.",
    { color: SLATE, gapAfter: 6 },
  );

  w.heading("Purpose");
  w.text(def.purpose, { color: SLATE, gapAfter: 4 });
  w.text(`This policy implements the safeguard required by 16 CFR ${def.citation}.`, {
    size: 9,
    color: SLATE,
    gapAfter: 4,
  });

  w.heading("Policy Statements");
  def.clauses.forEach((clause, i) => {
    w.text(`${i + 1}. ${clause.heading}`, { bold: true });
    w.text(clause.body, { indent: 12, color: rgb(0.1, 0.1, 0.1), gapAfter: 4 });
  });

  w.heading(`Current Posture (${def.citation})`);
  if (posture.confirmed.length === 0 && posture.gaps.length === 0) {
    w.text("No related self-assessment answers were found for this control area.", { color: SLATE });
  } else {
    if (posture.confirmed.length > 0) {
      w.text("Confirmed in place:", { bold: true, color: GREEN });
      for (const item of posture.confirmed) {
        w.text(`• ${item.requirement.title} [${item.requirement.citation}] — Current answer: Yes`, {
          indent: 12,
          size: 9,
          color: SLATE,
        });
      }
    }
    if (posture.gaps.length > 0) {
      w.text("Required — not yet confirmed in place:", { bold: true, color: RED });
      for (const item of posture.gaps) {
        w.text(`• ${item.requirement.title} [${item.requirement.citation}]`, {
          indent: 12,
          size: 9,
          color: rgb(0.1, 0.1, 0.1),
        });
        w.text(policyAnswerLabel(item.status), { indent: 22, size: 9, color: SLATE });
      }
      w.text(
        "These controls are required by the Safeguards Rule but are not yet confirmed in place. Adopting " +
          "this policy is the first step; implement and evidence each item to close the gap.",
        { size: 9, color: SLATE, gapAfter: 4 },
      );
    }
  }
  w.spacer(6);

  writeDisclaimer(w);
  w.text("Confidential — for internal, board, auditor, and regulator use.", { size: 8, color: SLATE });
  w.text(`Generated ${new Date().toLocaleString()}`, { size: 8, color: SLATE });

  return w.save();
}
