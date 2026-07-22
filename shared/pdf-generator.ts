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

/** Compute section results from raw answers so PDFs always reflect the saved data. */
export function computeSectionResults(rows: ComplianceAnswerRow[]): SectionScore[] {
  const bySection = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    bySection.set(row.section, (row.answers as Record<string, unknown>) ?? {});
  }
  return SAFEGUARDS_SECTIONS.map((sec) => ({
    ...calculateSectionScore(bySection.get(sec.number) ?? {}, sec.questions),
    section: sec.number,
    sectionName: sec.name,
  }));
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
  const results = computeSectionResults(complianceAnswers);
  const overall = calculateOverallScore(results);
  // Explainability spine: same numbers as `results` (proven equivalent in
  // server/derivation.test.ts), but each gap carries its §314.4 citation + triggering answer.
  const assessment = deriveAssessmentFromAnswers(REQUIREMENT_CATALOG, flattenAnswers(complianceAnswers));
  const derivedBySection = new Map(assessment.sections.map((s) => [s.section, s]));
  const w = await PdfWriter.create();

  w.text("WRITTEN INFORMATION SECURITY PROGRAM (WISP)", { size: 17, bold: true, color: NAVY });
  w.text("FTC Safeguards Rule — 16 CFR Part 314", { size: 11, color: SLATE, gapAfter: 12 });

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

  for (const sec of SAFEGUARDS_SECTIONS) {
    const result = results.find((r) => r.section === sec.number)!;
    w.heading(`Element ${sec.number}: ${sec.name}`, 12);
    w.text(sec.description, { color: SLATE });
    w.text(`Section score: ${result.score}%`, {
      bold: true,
      color: riskColor(result.score),
    });

    const answered = sec.questions.length - result.gaps.length;
    if (answered > 0) {
      w.text(
        `${answered} of ${sec.questions.length} safeguards in this element are confirmed in place.`
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
  const results = computeSectionResults(complianceAnswers);
  const overall = calculateOverallScore(results);
  const assessment = deriveAssessmentFromAnswers(REQUIREMENT_CATALOG, flattenAnswers(complianceAnswers));
  const w = await PdfWriter.create();

  w.text("ANNUAL COMPLIANCE REPORT", { size: 17, bold: true, color: NAVY });
  w.text("FTC Safeguards Rule Assessment — prepared for the Board of Directors", {
    size: 11,
    color: SLATE,
    gapAfter: 12,
  });

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
  w.text("Confidential — intended for board members and the Qualified Individual.", {
    size: 8,
    color: SLATE,
  });
  w.text(`Generated ${new Date().toLocaleString()}`, { size: 8, color: SLATE });

  return w.save();
}
