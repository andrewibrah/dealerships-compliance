import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { REQUIREMENT_CATALOG } from '@shared/requirements';

// Seed drift-guard (requested in the slice-1 review). The 0005 migration hand-maintains a
// SQL seed of the requirement catalog; shared/requirements.ts derives the same catalog from
// the questionnaire. server/requirements.test.ts already pins the TS catalog to the
// questionnaire — this pins the SQL SEED to the TS catalog, so the two can never silently
// drift. We parse the `code` of each INSERT value row (e.g. `('q1_1', ...)`) and compare the
// set to REQUIREMENT_CATALOG's codes.

const SEED_SQL = readFileSync(
  new URL('../supabase/migrations/0005_core_object_model.sql', import.meta.url),
  'utf8',
);

// Match the leading `('q<n>_<n>',` of each value row. `(code,` in the column list and
// `(code)` in the ON CONFLICT clause are unquoted, so they never match.
function seededCodes(sql: string): string[] {
  return [...sql.matchAll(/\(\s*'(q\d+_\d+)'\s*,/g)].map((m) => m[1]);
}

describe('0005 requirement seed <-> REQUIREMENT_CATALOG parity', () => {
  const seeded = seededCodes(SEED_SQL);
  const catalogCodes = REQUIREMENT_CATALOG.map((r) => r.code);

  it('seeds a code for every catalog requirement, and no extras', () => {
    expect(new Set(seeded)).toEqual(new Set(catalogCodes));
  });

  it('seeds each code exactly once (no duplicate rows)', () => {
    expect(seeded.length).toBe(new Set(seeded).size);
    expect(seeded.length).toBe(catalogCodes.length);
  });
});
