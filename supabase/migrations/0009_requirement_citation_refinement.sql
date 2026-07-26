-- =========================================================================================
-- 0009 — Per-requirement §314.4 citation refinement (PRD #5 / #19 explainability).
--
-- Task #4 seeded the GLOBAL requirement catalog (0005) with SECTION-LEVEL citations (coarse:
-- every requirement in a section shared its element). Task #5 refines each requirement to the
-- most specific subsection of 16 CFR §314.4 it satisfies, so every derived gap can cite the
-- exact Rule text it fails. This migration rewrites the seeded `citation` (and bumps `version`
-- to 2) to match shared/requirements.ts CITATION_BY_CODE EXACTLY — the drift-guard in
-- server/requirements-seed.test.ts pins these values to the catalog.
--
-- Additive & non-structural: no DDL, no new columns, no RLS change (the "why it matters / fix"
-- guidance is catalog-only in shared/requirements.ts, not a DB column — no consumer reads it
-- from the DB in this wave). Idempotent: a plain UPDATE ... FROM (VALUES ...) sets the same
-- values on every re-run. Supersedes 0005's citation seed; 0005 is already applied and is left
-- untouched (do NOT edit an applied migration). Apply AFTER 0005 (numeric ordering guarantees
-- it); the to_regclass guard makes an out-of-order apply a no-op instead of a hard error.
--
-- Every citation below is a real subsection of 16 CFR §314.4 and is human-verifiable against
-- the Rule. A value equal to the section element means the Rule is no more specific there.
-- =========================================================================================

do $$
begin
  if to_regclass('public.requirements') is null then
    raise notice '0009: public.requirements missing — apply 0005 first; skipping citation refinement.';
    return;
  end if;

  update public.requirements as r
  set citation = v.citation,
      version  = v.version
  from (values
    -- §314.4(a) Qualified Individual; (i) the QI's board reporting line (annual written report).
    ('q1_1', '§314.4(a)', 2),
    ('q1_2', '§314.4(a)', 2),
    ('q1_3', '§314.4(i)', 2),
    ('q1_4', '§314.4(a)', 2),
    ('q1_5', '§314.4(a)', 2),
    -- §314.4(b)(1) written risk assessment + contents; (b)(2) periodic reassessment.
    ('q2_1', '§314.4(b)(1)', 2),
    ('q2_2', '§314.4(b)(1)', 2),
    ('q2_3', '§314.4(b)(1)', 2),
    ('q2_4', '§314.4(b)(2)', 2),
    ('q2_5', '§314.4(b)(2)', 2),
    -- §314.4(c)(2) data inventory/classification; (c)(6) retention review + secure disposal.
    ('q3_1', '§314.4(c)(2)', 2),
    ('q3_2', '§314.4(c)(6)', 2),
    ('q3_3', '§314.4(c)(2)', 2),
    ('q3_4', '§314.4(c)(6)', 2),
    ('q3_5', '§314.4(c)(2)', 2),
    -- §314.4(c)(1) access controls + least privilege; (c)(5) MFA; (c)(8) monitor/log activity.
    ('q4_1', '§314.4(c)(5)', 2),
    ('q4_2', '§314.4(c)(1)', 2),
    ('q4_3', '§314.4(c)(1)', 2),
    ('q4_4', '§314.4(c)(8)', 2),
    ('q4_5', '§314.4(c)(1)', 2),
    -- §314.4(c)(3) encryption at rest + in transit (keys/email/mobile are all encryption).
    ('q5_1', '§314.4(c)(3)', 2),
    ('q5_2', '§314.4(c)(3)', 2),
    ('q5_3', '§314.4(c)(3)', 2),
    ('q5_4', '§314.4(c)(3)', 2),
    ('q5_5', '§314.4(c)(3)', 2),
    -- §314.4(f)(1) select/retain capable; (f)(2) contractual safeguards; (f)(3) periodic assessment.
    ('q6_1', '§314.4(f)(2)', 2),
    ('q6_2', '§314.4(f)(3)', 2),
    ('q6_3', '§314.4(f)(2)', 2),
    ('q6_4', '§314.4(f)(1)', 2),
    ('q6_5', '§314.4(f)(3)', 2),
    -- §314.4(h) written IRP + testing; (h)(4) communications; (h)(3) roles; (h)(6) documentation.
    ('q7_1', '§314.4(h)', 2),
    ('q7_2', '§314.4(h)', 2),
    ('q7_3', '§314.4(h)(4)', 2),
    ('q7_4', '§314.4(h)(3)', 2),
    ('q7_5', '§314.4(h)(6)', 2),
    -- §314.4(e)(1) security awareness training for personnel (all of section 8 is training).
    ('q8_1', '§314.4(e)(1)', 2),
    ('q8_2', '§314.4(e)(1)', 2),
    ('q8_3', '§314.4(e)(1)', 2),
    ('q8_4', '§314.4(e)(1)', 2),
    ('q8_5', '§314.4(e)(1)', 2),
    -- §314.4(d)(2) continuous monitoring OR annual pentest + semiannual vuln assessment;
    -- tracking/QI review stay at the section element (d).
    ('q9_1', '§314.4(d)(2)', 2),
    ('q9_2', '§314.4(d)(2)', 2),
    ('q9_3', '§314.4(d)(2)', 2),
    ('q9_4', '§314.4(d)', 2),
    ('q9_5', '§314.4(d)', 2)
  ) as v(code, citation, version)
  where r.code = v.code;
end $$;
