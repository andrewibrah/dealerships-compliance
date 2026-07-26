-- =========================================================================================
-- 0012 — Dealership logo URL (PRD #45 white-label branding).
--
-- Adds a nullable `logo_url` to `dealerships` so a tenant can show its own logo in the app
-- header alongside the dealership name. PURELY additive:
--   * Nullable, no default -> existing rows get NULL = "no logo" -> the header renders the
--     dealership name only, byte-identical to today. A logo appears only when a dealer sets a URL.
--   * A new column on an already-policied table needs NO new RLS policy: `dealerships` already
--     has row-level policies (0003 tenant isolation); column privileges follow the table grant,
--     and RLS filters rows, not columns. No RLS/DDL beyond the ADD COLUMN.
--   * The URL is rendered client-side only; it is never fetched or embedded into generated PDFs.
--
-- Idempotent: `add column if not exists` sets the same shape on every re-run. Applied to the
-- linked project on 2026-07-25 and recorded in supabase_migrations.schema_migrations.
-- =========================================================================================

do $$
begin
  if to_regclass('public.dealerships') is null then
    raise notice '0012: public.dealerships missing — apply 0001 first; skipping logo_url add.';
    return;
  end if;

  alter table public.dealerships
    add column if not exists logo_url text;
end $$;
