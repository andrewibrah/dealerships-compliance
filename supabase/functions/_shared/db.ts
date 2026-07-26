import { drizzle } from 'npm:drizzle-orm/postgres-js';
import postgres from 'npm:postgres';
import { eq, and, asc, desc, inArray, sql } from 'npm:drizzle-orm';
import { ENV } from './env.ts';
import {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments, auditLog,
  requirements, controls, risks, evidence, evidenceControls, tasks, policies, assets, dataFlows, attestations,
  postureSnapshots,
  type User, type Dealership, type ComplianceAnswer, type Subscription, type GeneratedDocument,
  type Requirement, type Control, type Risk, type Evidence, type Task, type Policy,
  type Asset, type DataFlow, type Attestation,
} from '../../../drizzle/schema.ts';
import type { TenantScope } from '../../../shared/tenant-guard.ts';
import type { ControlStatus } from '../../../shared/controls.ts';
import { AUTHENTICATED_ROLE, JWT_CLAIMS_SETTING, buildJwtClaims, isRlsEnforced } from '../../../shared/rls.ts';
import { writeAuditSafely, type AuditEventInput } from '../../../shared/audit.ts';

const SCHEMA = {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments, auditLog,
  requirements, controls, risks, evidence, evidenceControls, tasks, policies, assets, dataFlows, attestations,
  postureSnapshots,
};

function getDb() {
  const client = postgres(ENV.supabaseDbUrl, { prepare: false });
  return drizzle(client, { schema: SCHEMA });
}

function rlsEnforced() {
  return isRlsEnforced(Deno.env.get('RLS_ENFORCED'));
}

type ScopedTx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

// Mirror of server/db.ts `scoped`: tenant-scoped unit of work. When RLS_ENFORCED=true
// and a userId is present, impersonate the `authenticated` role + inject JWT claims so
// Postgres RLS (0003 migration) applies; otherwise a plain service-role transaction.
async function scoped<T>(userId: string | null, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  const client = postgres(ENV.supabaseDbUrl, { prepare: false });
  try {
    const database = drizzle(client, { schema: SCHEMA });
    return await database.transaction(async (tx) => {
      if (userId && rlsEnforced()) {
        await tx.execute(sql`select set_config(${JWT_CLAIMS_SETTING}, ${buildJwtClaims(userId)}, true)`);
        await tx.execute(sql.raw(`set local role ${AUTHENTICATED_ROLE}`));
      }
      return fn(tx);
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Users
export async function getUserById(id: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function createUser(data: Omit<typeof users.$inferInsert, 'createdAt' | 'updatedAt' | 'lastSignedIn'>) {
  const db = getDb();
  const [user] = await db.insert(users).values(data).onConflictDoUpdate({
    target: users.id,
    set: {
      name: data.name,
      email: data.email,
      role: data.role,
      updatedAt: new Date(),
    },
  }).returning();
  return user;
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user ?? null;
}

export async function updateUserLastSignedIn(id: string) {
  const db = getDb();
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// Dealerships
export async function getDealershipByUserId(userId: string) {
  const db = getDb();
  const [d] = await db.select().from(dealerships).where(eq(dealerships.userId, userId));
  return d ?? null;
}

export async function createDealership(data: Omit<typeof dealerships.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getDb();
  const [d] = await db.insert(dealerships).values(data).returning();
  return d;
}

// Single source of the auto-provisioned default dealership (mirrors server/db.ts).
export async function createDefaultDealership(userId: string) {
  return createDealership({
    userId,
    name: 'My Dealership',
    address: '',
    city: '',
    state: '',
    dmsVendor: '',
    rooftopCount: 1,
    qualifiedIndividual: '',
    qiEmail: '',
  });
}

export async function updateDealership(id: number, data: Partial<Omit<typeof dealerships.$inferInsert, 'id'>>) {
  const db = getDb();
  const [d] = await db.update(dealerships).set({ ...data, updatedAt: new Date() }).where(eq(dealerships.id, id)).returning();
  return d;
}

// Compliance — crown-jewel tenant data: TenantScope-only (mirrors server/db.ts).
export function saveComplianceAnswer(scope: TenantScope, data: Omit<typeof complianceAnswers.$inferInsert, 'id' | 'dealershipId'>) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .insert(complianceAnswers)
      .values({ ...data, dealershipId: scope.dealershipId })
      .onConflictDoUpdate({
        target: [complianceAnswers.dealershipId, complianceAnswers.section],
        set: { sectionName: data.sectionName, answers: data.answers, score: data.score, completed: data.completed, completedAt: data.completedAt, updatedAt: new Date() },
      })
      .returning();
    return row;
  });
}

export function getComplianceAnswers(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(complianceAnswers).where(eq(complianceAnswers.dealershipId, scope.dealershipId)),
  );
}

export function getAllComplianceAnswers(scope: TenantScope) {
  return getComplianceAnswers(scope);
}

// Subscriptions
export async function getSubscription(dealershipId: number) {
  const db = getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.dealershipId, dealershipId));
  return sub ?? null;
}

export async function getSubscriptionByStripeId(stripeSubId: string) {
  const db = getDb();
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
  return sub ?? null;
}

export async function createSubscription(data: Omit<typeof subscriptions.$inferInsert, 'id' | 'createdAt'>) {
  const db = getDb();
  const [sub] = await db.insert(subscriptions).values(data).returning();
  return sub;
}

export async function updateSubscription(id: number, data: Partial<Omit<typeof subscriptions.$inferInsert, 'id'>>) {
  const db = getDb();
  const [sub] = await db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning();
  return sub;
}

// Documents — crown-jewel tenant data: TenantScope-only (mirrors server/db.ts).
export function saveGeneratedDocument(scope: TenantScope, data: Omit<typeof generatedDocuments.$inferInsert, 'id' | 'generatedAt' | 'dealershipId'>) {
  return scoped(scope.userId, async (tx) => {
    const [doc] = await tx.insert(generatedDocuments).values({ ...data, dealershipId: scope.dealershipId }).returning();
    return doc;
  });
}

export function getGeneratedDocuments(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(generatedDocuments).where(eq(generatedDocuments.dealershipId, scope.dealershipId)),
  );
}

// Requirements — GLOBAL FTC Safeguards catalog (PRD #3). Mirrors server/db.ts: not
// tenant-scoped, unscoped service-role read (RLS grants read-all to authenticated).
export async function listRequirements() {
  const db = getDb();
  return db.select().from(requirements).orderBy(asc(requirements.section), asc(requirements.id));
}

// Controls — crown-jewel tenant data: TenantScope-only (mirrors server/db.ts).
export function listControls(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(controls).where(eq(controls.dealershipId, scope.dealershipId)),
  );
}

export function upsertControl(
  scope: TenantScope,
  input: { requirementId: number; status: ControlStatus; notes: string; source: string },
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .insert(controls)
      .values({
        dealershipId: scope.dealershipId,
        requirementId: input.requirementId,
        status: input.status,
        notes: input.notes,
        source: input.source,
      })
      .onConflictDoUpdate({
        target: [controls.dealershipId, controls.requirementId],
        set: { status: input.status, notes: input.notes, source: input.source, updatedAt: new Date() },
      })
      .returning();
    return row;
  });
}

// Risks — crown-jewel tenant data: TenantScope-only (mirrors server/db.ts). updateRisk
// re-filters by dealership so a client-supplied id can never reach another tenant's row.
export function listRisks(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(risks).where(eq(risks.dealershipId, scope.dealershipId)),
  );
}

export function createRisk(
  scope: TenantScope,
  input: Omit<typeof risks.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(risks).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updateRisk(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<typeof risks.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .update(risks)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(risks.id, id), eq(risks.dealershipId, scope.dealershipId)))
      .returning();
    return row ?? null;
  });
}

// Evidence — crown-jewel tenant data: uploaded artifacts substantiating controls (PRD
// #31/#32). TenantScope-only (mirrors server/db.ts). The file lives in the private
// `evidence` Storage bucket, signed via evidenceGetSignedUrl in storage.ts.
export function listEvidence(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(evidence).where(eq(evidence.dealershipId, scope.dealershipId)),
  );
}

export function createEvidence(
  scope: TenantScope,
  input: Omit<typeof evidence.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(evidence).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

// Evidence <-> Control link. dealership_id forced from scope; onConflict on the
// (evidence_id, control_id) unique makes re-linking idempotent (null on a no-op).
export function linkEvidenceToControl(
  scope: TenantScope,
  input: { evidenceId: number; controlId: number },
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .insert(evidenceControls)
      .values({ dealershipId: scope.dealershipId, evidenceId: input.evidenceId, controlId: input.controlId })
      .onConflictDoNothing({ target: [evidenceControls.evidenceId, evidenceControls.controlId] })
      .returning();
    return row ?? null;
  });
}

// Evidence linked to a control, as Evidence rows. Both queries are dealership-scoped so a
// client-supplied controlId can only ever surface the caller's own evidence.
export function listEvidenceForControl(scope: TenantScope, controlId: number) {
  return scoped(scope.userId, async (tx) => {
    const links = await tx
      .select({ evidenceId: evidenceControls.evidenceId })
      .from(evidenceControls)
      .where(and(
        eq(evidenceControls.dealershipId, scope.dealershipId),
        eq(evidenceControls.controlId, controlId),
      ));
    if (links.length === 0) return [];
    const ids = links.map((l) => l.evidenceId);
    return tx
      .select()
      .from(evidence)
      .where(and(eq(evidence.dealershipId, scope.dealershipId), inArray(evidence.id, ids)));
  });
}

// Tasks — crown-jewel tenant data: remediation tasks (PRD #24). TenantScope-only (mirrors
// server/db.ts). updateTask re-filters by dealership so a client-supplied id can never
// reach another tenant's row.
export function listTasks(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(tasks).where(eq(tasks.dealershipId, scope.dealershipId)),
  );
}

export function createTask(
  scope: TenantScope,
  input: Omit<typeof tasks.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(tasks).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updateTask(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<typeof tasks.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .update(tasks)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.dealershipId, scope.dealershipId)))
      .returning();
    return row ?? null;
  });
}

// Posture snapshots — crown-jewel tenant data: point-in-time posture history (PRD #33).
// TenantScope-only, append-only. Mirror of server/db.ts; the save path records a row only when
// the overall score changes (dedup in shared/posture.ts).
export function listPostureSnapshots(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx
      .select()
      .from(postureSnapshots)
      .where(eq(postureSnapshots.dealershipId, scope.dealershipId))
      .orderBy(asc(postureSnapshots.createdAt)),
  );
}

export function getLatestPostureSnapshot(scope: TenantScope) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(postureSnapshots)
      .where(eq(postureSnapshots.dealershipId, scope.dealershipId))
      .orderBy(desc(postureSnapshots.createdAt))
      .limit(1);
    return row ?? null;
  });
}

export function createPostureSnapshot(
  scope: TenantScope,
  input: Omit<typeof postureSnapshots.$inferInsert, 'id' | 'dealershipId' | 'createdAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .insert(postureSnapshots)
      .values({ ...input, dealershipId: scope.dealershipId })
      .returning();
    return row;
  });
}

// Policies — crown-jewel tenant data: written policies/procedures (PRD #22/#26).
// TenantScope-only (mirrors server/db.ts); updatePolicy re-filters by dealership.
export function listPolicies(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(policies).where(eq(policies.dealershipId, scope.dealershipId)),
  );
}

export function createPolicy(
  scope: TenantScope,
  input: Omit<typeof policies.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(policies).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updatePolicy(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<typeof policies.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .update(policies)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(policies.id, id), eq(policies.dealershipId, scope.dealershipId)))
      .returning();
    return row ?? null;
  });
}

// Assets — crown-jewel tenant data: the inventoried asset register (PRD #13; feeds risk
// assessment #20). TenantScope-only (mirrors server/db.ts); updateAsset re-filters by dealership.
export function listAssets(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(assets).where(eq(assets.dealershipId, scope.dealershipId)),
  );
}

export function createAsset(
  scope: TenantScope,
  input: Omit<typeof assets.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(assets).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updateAsset(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<typeof assets.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .update(assets)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.dealershipId, scope.dealershipId)))
      .returning();
    return row ?? null;
  });
}

// Data flows — crown-jewel tenant data: how NPI moves between assets/external parties (PRD
// #13). TenantScope-only (mirrors server/db.ts); updateDataFlow re-filters by dealership.
export function listDataFlows(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(dataFlows).where(eq(dataFlows.dealershipId, scope.dealershipId)),
  );
}

export function createDataFlow(
  scope: TenantScope,
  input: Omit<typeof dataFlows.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(dataFlows).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updateDataFlow(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<typeof dataFlows.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .update(dataFlows)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(dataFlows.id, id), eq(dataFlows.dealershipId, scope.dealershipId)))
      .returning();
    return row ?? null;
  });
}

// Attestations — crown-jewel tenant data: staff attestations (PRD #29, §314.4(e)).
// TenantScope-only (mirrors server/db.ts); updateAttestation re-filters by dealership.
export function listAttestations(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(attestations).where(eq(attestations.dealershipId, scope.dealershipId)),
  );
}

export function createAttestation(
  scope: TenantScope,
  input: Omit<typeof attestations.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(attestations).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updateAttestation(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<typeof attestations.$inferInsert, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .update(attestations)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(attestations.id, id), eq(attestations.dealershipId, scope.dealershipId)))
      .returning();
    return row ?? null;
  });
}

// Audit trail — append-only, tamper-evident (PRD #34 / #51). Mirrors server/db.ts:
// written as service_role, immutability + hash chain DB-enforced (0004), fail-open.
export function appendAuditLog(event: AuditEventInput): Promise<void> {
  return writeAuditSafely(async (record) => {
    await getDb().insert(auditLog).values(record);
  }, event);
}

// Audit trail READ — tenant-scoped, read-only (PRD #34/#36). Mirrors server/db.ts: the
// audit_log table is append-only, so there is deliberately NO write/update/delete accessor.
// Returns the dealership's own audit rows newest-first, capped, for the Examiner Package
// extract. Filtered by dealership_id so a caller can only ever read their own tenant's rows.
export function listAuditLog(scope: TenantScope, limit = 200) {
  return scoped(scope.userId, async (tx) =>
    tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.dealershipId, scope.dealershipId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit),
  );
}

export type { User, Dealership, ComplianceAnswer, Subscription, GeneratedDocument, Requirement, Control, Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation };
