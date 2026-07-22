import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { REQUIREMENT_CATALOG, REQUIREMENT_CATALOG_VERSION } from '@shared/requirements';

// Seed drift-guard. The migrations hand-maintain the SQL form of the requirement catalog;
// shared/requirements.ts derives the same catalog from the questionnaire. server/
// requirements.test.ts already pins the TS catalog to the questionnaire — this pins the SQL
// SEED to the TS catalog so the two can never silently drift:
//   * 0005 seeds the CODES (INSERT ... VALUES). We parse each value row's `code`.
//   * 0009 rewrites each requirement's CITATION + VERSION to the refined per-requirement
//     values (superseding 0005's coarse section-level citations). We parse its
//     (code, citation, version) rows and compare to the catalog.

const SEED_0005 = readFileSync(
  new URL('../supabase/migrations/0005_core_object_model.sql', import.meta.url),
  'utf8',
);
const REFINE_0009 = readFileSync(
  new URL('../supabase/migrations/0009_requirement_citation_refinement.sql', import.meta.url),
  'utf8',
);

// Match the leading `('q<n>_<n>',` of each 0005 value row. `(code,` in the column list and
// `(code)` in the ON CONFLICT clause are unquoted, so they never match.
function seededCodes(sql: string): string[] {
  return [...sql.matchAll(/\(\s*'(q\d+_\d+)'\s*,/g)].map((m) => m[1]);
}

// Match each 0009 refinement row: `('q1_3', '§314.4(i)', 2)`.
function refinedCitations(sql: string): Array<{ code: string; citation: string; version: number }> {
  return [...sql.matchAll(/\(\s*'(q\d+_\d+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*\)/g)].map((m) => ({
    code: m[1],
    citation: m[2],
    version: Number(m[3]),
  }));
}

describe('0005 requirement seed <-> REQUIREMENT_CATALOG parity', () => {
  const seeded = seededCodes(SEED_0005);
  const catalogCodes = REQUIREMENT_CATALOG.map((r) => r.code);

  it('seeds a code for every catalog requirement, and no extras', () => {
    expect(new Set(seeded)).toEqual(new Set(catalogCodes));
  });

  it('seeds each code exactly once (no duplicate rows)', () => {
    expect(seeded.length).toBe(new Set(seeded).size);
    expect(seeded.length).toBe(catalogCodes.length);
  });
});

describe('0009 citation refinement <-> REQUIREMENT_CATALOG parity', () => {
  const refined = refinedCitations(REFINE_0009);
  const byCode = new Map(refined.map((r) => [r.code, r]));

  it('refines a citation for every catalog requirement, and no extras', () => {
    expect(new Set(refined.map((r) => r.code))).toEqual(
      new Set(REQUIREMENT_CATALOG.map((r) => r.code)),
    );
    expect(refined.length).toBe(REQUIREMENT_CATALOG.length);
  });

  it('matches the catalog citation + version for every requirement', () => {
    for (const req of REQUIREMENT_CATALOG) {
      const row = byCode.get(req.code);
      expect(row, `0009 row for ${req.code}`).toBeDefined();
      expect(row!.citation, `citation for ${req.code}`).toBe(req.citation);
      expect(row!.version, `version for ${req.code}`).toBe(req.version);
    }
  });

  it('stamps the bumped catalog version (2) on every refinement row', () => {
    for (const row of refined) {
      expect(row.version).toBe(REQUIREMENT_CATALOG_VERSION);
    }
  });
});
