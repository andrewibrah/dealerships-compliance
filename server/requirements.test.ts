import { describe, it, expect } from 'vitest';
import {
  REQUIREMENT_CATALOG,
  CITATION_BY_SECTION,
  REQUIREMENT_CATALOG_VERSION,
} from '@shared/requirements';
import { SAFEGUARDS_SECTIONS, getAllQuestions } from '@shared/safeguards-questions';

const VALID_WEIGHTS = new Set(['critical', 'important', 'standard']);

// Section -> §314.4 element (section-level; per-requirement refinement is task #5). Kept
// independent of the source map so a typo in CITATION_BY_SECTION is actually caught.
const EXPECTED_CITATIONS: Record<number, string> = {
  1: '§314.4(a)',
  2: '§314.4(b)',
  3: '§314.4(c)(2)',
  4: '§314.4(c)(1)',
  5: '§314.4(c)(3)',
  6: '§314.4(f)',
  7: '§314.4(h)',
  8: '§314.4(e)',
  9: '§314.4(d)',
};

describe('REQUIREMENT_CATALOG', () => {
  it('has exactly 45 entries (9 sections x 5 questions)', () => {
    expect(REQUIREMENT_CATALOG).toHaveLength(45);
    expect(REQUIREMENT_CATALOG).toHaveLength(getAllQuestions().length);
  });

  it('has unique codes', () => {
    const codes = REQUIREMENT_CATALOG.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('maps every code to a real (section, question) in SAFEGUARDS_SECTIONS', () => {
    const bySection = new Map(SAFEGUARDS_SECTIONS.map((s) => [s.number, s]));
    for (const req of REQUIREMENT_CATALOG) {
      const section = bySection.get(req.section);
      expect(section, `section ${req.section} exists`).toBeDefined();
      expect(section!.name).toBe(req.sectionName);
      const question = section!.questions.find((q) => q.id === req.code);
      expect(question, `question ${req.code} exists in section ${req.section}`).toBeDefined();
      // title is the verbatim question text; weight is carried straight through.
      expect(req.title).toBe(question!.text);
      expect(req.weight).toBe(question!.weight);
    }
  });

  it('gives every requirement a valid weight and a non-empty citation', () => {
    for (const req of REQUIREMENT_CATALOG) {
      expect(VALID_WEIGHTS.has(req.weight)).toBe(true);
      expect(req.citation.length).toBeGreaterThan(0);
    }
  });

  it('uses the correct section -> §314.4 citation mapping', () => {
    for (const req of REQUIREMENT_CATALOG) {
      expect(req.citation).toBe(EXPECTED_CITATIONS[req.section]);
    }
    expect(CITATION_BY_SECTION).toEqual(EXPECTED_CITATIONS);
  });

  it('reserves applicability empty and stamps the catalog version (for #7 / seed parity)', () => {
    for (const req of REQUIREMENT_CATALOG) {
      expect(req.applicability).toEqual({});
      expect(req.version).toBe(REQUIREMENT_CATALOG_VERSION);
    }
  });
});
