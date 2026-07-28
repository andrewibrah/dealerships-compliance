// Postgres connection options shared by both runtimes (Node/Express and Deno/Edge), so
// the two hand-synced `db.ts` copies cannot drift on connection behaviour.
//
// POOLER MODE: production connects through Supavisor in TRANSACTION mode (port 6543 on
// the `*.pooler.supabase.com` host), via the APP_DB_URL secret.
//
// Both modes were measured, because both have a failure mode:
//
// 1. Transaction mode (6543) — postgres.js STALLS whenever concurrent queries on one
//    client exceed `max`, i.e. the moment a query must wait for a pooled connection.
//    Reproduced with raw postgres.js and `select 1` (no drizzle, no app code):
//      max=5,  N=20 concurrent -> STALLED (>50s, never completes)
//      max=25, N=20 concurrent -> 20/20 ok in 364ms   <- nothing ever waits
//    So `max` must stay comfortably ABOVE the peak number of concurrent queries a single
//    process/isolate issues. One batched dashboard request issues ~7.
//
// 2. Session mode (5432) — works perfectly for a single process (max=5, N=60 concurrent
//    -> 60/60 ok in 389ms) but Supavisor caps SESSION-mode clients project-wide at
//    `pool_size: 15`. Many concurrent Edge isolates blow straight through that ceiling:
//    measured against the deployed function, 60 concurrent authenticated calls returned
//    56×500 with `FATAL: (EMAXCONNSESSION) max clients reached in session mode`.
//
// Transaction mode multiplexes many client connections onto a small server pool, which is
// what a many-isolate serverless runtime needs — so it wins, provided `max` is sized so
// queries never queue.
export const POSTGRES_OPTIONS = {
  // REQUIRED in transaction mode: statements are multiplexed across backends, so
  // session-level prepared statements cannot be used.
  prepare: false,
  // Sized ABOVE the ~7 concurrent queries one batched request issues, so a query never
  // waits on the pool (see the stall analysis above) — but no higher, because this is a
  // PER-ISOLATE ceiling and Supavisor caps transaction-mode clients at 200 project-wide.
  // Measured: max=20 exhausted that ceiling under sustained 60-concurrent bursts
  // (`FATAL: (EMAXCONN) max client connections reached, limit: 200`) once ~10 isolates
  // were live. 10 leaves headroom for ~20 concurrent isolates.
  max: 10,
  // Seconds. Deliberately short: an idle Edge isolate otherwise pins its client
  // connections against the 200-client ceiling long after it stops serving traffic.
  idle_timeout: 5,
  connect_timeout: 10,
};
