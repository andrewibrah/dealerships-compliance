// Append-only audit trail — runtime-neutral core (PRD #34 / #51).
//
// Pure and dependency-free: imported by both the Node (Express) and Deno (Edge)
// runtimes so an audit record is shaped identically by construction. The actual
// INSERT — and the DB-enforced append-only guarantee + SHA-256 hash chain — live in
// each runtime's `db.ts` and the `0004_audit_log.sql` migration. What lives here: the
// canonical action vocabulary, the record shape, the fail-open write wrapper, and the
// login-session decision. All of it is unit-tested (server/audit.test.ts).

/** The canonical audit action vocabulary. Stable strings persisted to `audit_log.action`;
 *  changing a value is a data-migration concern, so treat these as append-mostly. */
export const AUDIT_ACTIONS = {
  authLogin: 'auth.login',
  authMfaStepUp: 'auth.mfa_step_up',
  authLogout: 'auth.logout',
  complianceSaveSection: 'compliance.save_section',
  dealershipCreate: 'dealership.create',
  dealershipUpdate: 'dealership.update',
  subscriptionCreate: 'subscription.create',
  subscriptionUpdateStatus: 'subscription.update_status',
  documentGenerate: 'document.generate',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditActor {
  userId: string | null;
  email: string | null;
}

export interface AuditEventInput {
  action: AuditAction;
  actor: AuditActor;
  entityType?: string;
  /** Any id shape; coerced to text so the audit row is store-agnostic. */
  entityId?: string | number | null;
  dealershipId?: number | null;
  metadata?: Record<string, unknown>;
}

/** The exact column payload a db writer inserts. The hash columns (`prev_hash`,
 *  `row_hash`) and `id`/`created_at` are intentionally absent — they are filled by the
 *  DB (defaults + the BEFORE INSERT hash-chain trigger), never by the application. */
export interface AuditRecord {
  actorUserId: string | null;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  dealershipId: number | null;
  metadata: Record<string, unknown>;
}

/** Normalize an audit event into the insert payload. Pure and total — never throws, so
 *  the audit path can't fail before it even reaches the DB. Email is normalized to match
 *  how `users.email` is stored (trimmed + lowercased). */
export function buildAuditRecord(event: AuditEventInput): AuditRecord {
  return {
    actorUserId: event.actor.userId ?? null,
    actorEmail: (event.actor.email ?? '').trim().toLowerCase(),
    action: event.action,
    entityType: event.entityType ?? '',
    entityId: event.entityId == null ? '' : String(event.entityId),
    dealershipId: event.dealershipId ?? null,
    metadata: event.metadata ?? {},
  };
}

type AuditErrorLogger = (message: string, meta: Record<string, unknown>) => void;

const defaultLogError: AuditErrorLogger = (message, meta) => {
  // console exists in both Node and Deno; keeping the default here keeps callers terse.
  console.error(message, meta);
};

/**
 * Fail-open audit write. Builds the record and hands it to a runtime-provided insert
 * function, swallowing and logging any error so an audit-write failure never breaks the
 * operation being audited.
 *
 * Deliberate tradeoff (logged in the 0003→#3 session log): for an initial slice we favor
 * never taking down auth/mutations because logging hiccuped; failures are surfaced via
 * the logger for monitoring. Revisit per-mutation fail-closed if the compliance posture
 * requires that a mutation must not "succeed silently un-audited".
 */
export async function writeAuditSafely(
  insert: (record: AuditRecord) => Promise<unknown>,
  event: AuditEventInput,
  logError: AuditErrorLogger = defaultLogError,
): Promise<void> {
  try {
    await insert(buildAuditRecord(event));
  } catch (err) {
    logError('[audit] failed to write audit_log entry', {
      action: event.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Inactivity gap after which a fresh authenticated request counts as a new login
 *  session (30 min — a common session-analytics convention). */
export const LOGIN_SESSION_GAP_MS = 30 * 60 * 1000;

/**
 * Decide whether an authenticated request represents a *new* login session, given the
 * user's previously recorded `lastSignedIn`. Used by both context builders to emit a
 * de-duplicated `auth.login` event without a dedicated login endpoint. A null/invalid
 * prior timestamp (first-ever sign-in) counts as a new session.
 */
export function isNewLoginSession(
  prevLastSignedIn: Date | string | null | undefined,
  now: Date,
  gapMs: number = LOGIN_SESSION_GAP_MS,
): boolean {
  if (!prevLastSignedIn) return true;
  const prev = prevLastSignedIn instanceof Date ? prevLastSignedIn : new Date(prevLastSignedIn);
  if (Number.isNaN(prev.getTime())) return true;
  return now.getTime() - prev.getTime() >= gapMs;
}
