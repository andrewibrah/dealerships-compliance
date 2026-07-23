-- =========================================================================================
-- 0010 — Dealership consumer count (PRD #7 applicability / §314.6(a) exemption).
--
-- Adds a nullable `consumer_count` to `dealerships` so the app can decide whether the dealer
-- qualifies for the 16 CFR §314.6(a) small-institution exemption ("fewer than five thousand
-- consumers"). PURELY additive:
--   * Nullable, no default -> existing rows get NULL = "not declared" -> nothing is exempt ->
--     scores stay byte-identical to today. The exemption only ever triggers when a dealer
--     explicitly sets a value below the threshold (see shared/applicability.ts).
--   * A new column on an already-policied table needs NO new RLS policy: `dealerships` already
--     has row-level policies (0003 tenant isolation); column privileges follow the table grant,
--     and RLS filters rows, not columns. No RLS/DDL beyond the ADD COLUMN.
--
-- Idempotent: `add column if not exists` sets the same shape on every re-run. HUMAN-applied via
-- the Supabase SQL editor (numeric↔timestamped history caveat — do NOT `supabase db push`).
-- =========================================================================================

do $$
begin
  if to_regclass('public.dealerships') is null then
    raise notice '0010: public.dealerships missing — apply 0001 first; skipping consumer_count add.';
    return;
  end if;

  alter table public.dealerships
    add column if not exists consumer_count integer;
end $$;
