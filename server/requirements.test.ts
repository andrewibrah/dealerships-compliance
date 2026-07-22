import { describe, it, expect } from 'vitest';
import {
  REQUIREMENT_CATALOG,
  CITATION_BY_SECTION,
  CITATION_BY_CODE,
  REQUIREMENT_GUIDANCE,
  REQUIREMENT_CATALOG_VERSION,
} from '@shared/requirements';
import { SAFEGUARDS_SECTIONS, getAllQuestions } from '@shared/safeguards-questions';

const VALID_WEIGHTS = new Set(['critical', 'important', 'standard']);

// Section -> §314.4 element (the coarse fallback). Kept independent of the source map so a
// typo in CITATION_BY_SECTION is actually caught.
const EXPECTED_CITATION_BY_SECTION: Record<number, string> = {
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

// Per-requirement §314.4 citation (task #5). Authored INDEPENDENTLY from the source map so a
// typo or a mistaken subsection in CITATION_BY_CODE is caught here. Every value must be a real
// subsection of 16 CFR §314.4 (see the grounding comment in shared/requirements.ts); a value
// equal to its section's element means the Rule is no more specific than the section there.
const EXPECTED_CITATION_BY_CODE: Record<string, string> = {
  q1_1: '§314.4(a)', q1_2: '§314.4(a)', q1_3: '§314.4(i)', q1_4: '§314.4(a)', q1_5: '§314.4(a)',
  q2_1: '§314.4(b)(1)', q2_2: '§314.4(b)(1)', q2_3: '§314.4(b)(1)', q2_4: '§314.4(b)(2)', q2_5: '§314.4(b)(2)',
  q3_1: '§314.4(c)(2)', q3_2: '§314.4(c)(6)', q3_3: '§314.4(c)(2)', q3_4: '§314.4(c)(6)', q3_5: '§314.4(c)(2)',
  q4_1: '§314.4(c)(5)', q4_2: '§314.4(c)(1)', q4_3: '§314.4(c)(1)', q4_4: '§314.4(c)(8)', q4_5: '§314.4(c)(1)',
  q5_1: '§314.4(c)(3)', q5_2: '§314.4(c)(3)', q5_3: '§314.4(c)(3)', q5_4: '§314.4(c)(3)', q5_5: '§314.4(c)(3)',
  q6_1: '§314.4(f)(2)', q6_2: '§314.4(f)(3)', q6_3: '§314.4(f)(2)', q6_4: '§314.4(f)(1)', q6_5: '§314.4(f)(3)',
  q7_1: '§314.4(h)', q7_2: '§314.4(h)', q7_3: '§314.4(h)(4)', q7_4: '§314.4(h)(3)', q7_5: '§314.4(h)(6)',
  q8_1: '§314.4(e)(1)', q8_2: '§314.4(e)(1)', q8_3: '§314.4(e)(1)', q8_4: '§314.4(e)(1)', q8_5: '§314.4(e)(1)',
  q9_1: '§314.4(d)(2)', q9_2: '§314.4(d)(2)', q9_3: '§314.4(d)(2)', q9_4: '§314.4(d)', q9_5: '§314.4(d)',
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

  it('uses the refined per-requirement §314.4 citation for every requirement', () => {
    for (const req of REQUIREMENT_CATALOG) {
      expect(req.citation, `citation for ${req.code}`).toBe(EXPECTED_CITATION_BY_CODE[req.code]);
    }
    expect(CITATION_BY_CODE).toEqual(EXPECTED_CITATION_BY_CODE);
    expect(CITATION_BY_SECTION).toEqual(EXPECTED_CITATION_BY_SECTION);
  });

  it('keeps the section-level fallback consistent for un-refined requirements', () => {
    // Where a code carries no finer subsection than its section, its citation is exactly the
    // section element — proving CITATION_BY_SECTION is a real fallback, not dead code.
    for (const req of REQUIREMENT_CATALOG) {
      if (CITATION_BY_CODE[req.code] === CITATION_BY_SECTION[req.section]) {
        expect(req.citation).toBe(CITATION_BY_SECTION[req.section]);
      }
    }
  });

  it('every citation is a well-formed §314.4 subsection', () => {
    // Guards against fabricated shapes: §314.4(x) with 0-2 further ( ... ) groups.
    const shape = /^§314\.4\([a-z]\)(\(\d+\))?(\([a-z]+\))?$/;
    for (const req of REQUIREMENT_CATALOG) {
      expect(req.citation, `well-formed citation for ${req.code}`).toMatch(shape);
    }
  });

  it('carries authored why-it-matters / fix guidance for all 45 requirements', () => {
    for (const req of REQUIREMENT_CATALOG) {
      expect(req.whyItMatters.length, `whyItMatters for ${req.code}`).toBeGreaterThan(0);
      expect(req.fix.length, `fix for ${req.code}`).toBeGreaterThan(0);
      expect(req.whyItMatters).toBe(REQUIREMENT_GUIDANCE[req.code].whyItMatters);
      expect(req.fix).toBe(REQUIREMENT_GUIDANCE[req.code].fix);
    }
    // No stray guidance entries beyond the 45 catalog codes.
    expect(Object.keys(REQUIREMENT_GUIDANCE).sort()).toEqual(
      REQUIREMENT_CATALOG.map((r) => r.code).sort(),
    );
  });

  it('reserves applicability empty and stamps the catalog version (bumped to 2 for #5)', () => {
    expect(REQUIREMENT_CATALOG_VERSION).toBe(2);
    for (const req of REQUIREMENT_CATALOG) {
      expect(req.applicability).toEqual({});
      expect(req.version).toBe(REQUIREMENT_CATALOG_VERSION);
    }
  });
});
