import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments, auditLog,
  requirements, controls, risks, evidence, evidenceControls, tasks, policies, assets, dataFlows, attestations,
  type User, type Dealership, type ComplianceAnswer, type Subscription, type GeneratedDocument,
  type Requirement, type Control, type Risk, type Evidence, type Task, type Policy,
  type Asset, type DataFlow, type Attestation,
  type InsertDealership, type InsertComplianceAnswer, type InsertSubscription, type InsertGeneratedDocument,
  type InsertRisk, type InsertEvidence, type InsertTask, type InsertPolicy,
  type InsertAsset, type InsertDataFlow, type InsertAttestation,
} from '../drizzle/schema';
import type { TenantScope } from '@shared/tenant-guard';
import type { ControlStatus } from '@shared/controls';
import { AUTHENTICATED_ROLE, JWT_CLAIMS_SETTING, buildJwtClaims, isRlsEnforced } from '@shared/rls';
import { writeAuditSafely, type AuditEventInput } from '@shared/audit';

const SCHEMA = {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments, auditLog,
  requirements, controls, risks, evidence, evidenceControls, tasks, policies, assets, dataFlows, attestations,
};

function dbUrl() {
  return process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '';
}

function getDb() {
  const client = postgres(dbUrl(), { prepare: false });
  return drizzle(client, { schema: SCHEMA });
}

function rlsEnforced() {
  return isRlsEnforced(process.env.RLS_ENFORCED);
}

type ScopedTx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

// Run a tenant-scoped unit of work. When RLS_ENFORCED=true and a userId is present,
// the transaction impersonates the `authenticated` role and injects the JWT claims
// so Postgres RLS (see 0003 migration) applies; otherwise it is a plain transaction
// under the service-role connection (current behavior). Claims are set BEFORE the
// role drop so the still-privileged connection can write the GUC.
async function scoped<T>(userId: string | null, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  const client = postgres(dbUrl(), { prepare: false });
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
  const [user] = await getDb().select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function getUserByEmail(email: string) {
  const [user] = await getDb().select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  return user ?? null;
}

export async function createUser(data: Omit<typeof users.$inferInsert, 'createdAt' | 'updatedAt'>) {
  const [user] = await getDb()
    .insert(users)
    .values(data)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: data.name,
        email: data.email,
        role: data.role,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

export async function updateUserLastSignedIn(id: string) {
  await getDb().update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// Dealerships
export async function getDealershipByUserId(userId: string) {
  const [d] = await getDb().select().from(dealerships).where(eq(dealerships.userId, userId));
  return d ?? null;
}

export async function createDealership(data: InsertDealership) {
  const [d] = await getDb().insert(dealerships).values(data).returning();
  return d;
}

// The single source of the auto-provisioned default dealership (was duplicated
// inline across routers). Used by the tenant-guard funnel's createIfMissing path.
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

export async function updateDealership(id: number, data: Partial<InsertDealership>) {
  const [d] = await getDb().update(dealerships).set({ ...data, updatedAt: new Date() }).where(eq(dealerships.id, id)).returning();
  return d;
}

// Compliance — crown-jewel tenant data: accessed ONLY through a resolved TenantScope
// (see @shared/tenant-guard), which makes it a compile error to read/write another
// tenant's answers with an id that did not come from the caller's session.
export function saveComplianceAnswer(scope: TenantScope, answer: Omit<InsertComplianceAnswer, 'dealershipId'>) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .insert(complianceAnswers)
      .values({ ...answer, dealershipId: scope.dealershipId })
      .onConflictDoUpdate({
        target: [complianceAnswers.dealershipId, complianceAnswers.section],
        set: {
          sectionName: answer.sectionName,
          answers: answer.answers,
          score: answer.score,
          completed: answer.completed,
          completedAt: answer.completedAt,
          updatedAt: new Date(),
        },
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
  const [sub] = await getDb().select().from(subscriptions).where(eq(subscriptions.dealershipId, dealershipId));
  return sub ?? null;
}

export async function createSubscription(data: InsertSubscription) {
  const [sub] = await getDb().insert(subscriptions).values(data).returning();
  return sub;
}

export async function updateSubscription(id: number, data: Partial<InsertSubscription>) {
  const [sub] = await getDb().update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning();
  return sub;
}

export async function getSubscriptionByStripeId(stripeSubId: string) {
  const [sub] = await getDb().select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
  return sub ?? null;
}

// Documents — crown-jewel tenant data: TenantScope-only, same rationale as above.
export function saveGeneratedDocument(scope: TenantScope, doc: Omit<InsertGeneratedDocument, 'dealershipId'>) {
  return scoped(scope.userId, async (tx) => {
    const [d] = await tx.insert(generatedDocuments).values({ ...doc, dealershipId: scope.dealershipId }).returning();
    return d;
  });
}

export function getGeneratedDocuments(scope: TenantScope, docType?: string) {
  return scoped(scope.userId, async (tx) => {
    const where = docType
      ? and(eq(generatedDocuments.dealershipId, scope.dealershipId), eq(generatedDocuments.docType, docType))
      : eq(generatedDocuments.dealershipId, scope.dealershipId);
    return tx.select().from(generatedDocuments).where(where);
  });
}

// Requirements — the GLOBAL FTC Safeguards catalog (PRD #3). Not tenant-scoped: the same
// versioned rows for every dealer, so this is an unscoped service-role read (RLS grants
// read-all to authenticated; see the 0005 migration).
export async function listRequirements() {
  return getDb().select().from(requirements).orderBy(asc(requirements.section), asc(requirements.id));
}

// Controls — crown-jewel tenant data: a dealer's implemented state per requirement.
// TenantScope-only, same funnel/pattern as the compliance answers above.
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
        set: {
          status: input.status,
          notes: input.notes,
          source: input.source,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  });
}

// Risks — crown-jewel tenant data: a dealer's risk findings. TenantScope-only; every
// query is filtered by scope.dealershipId, and updateRisk re-filters by dealership so a
// client-supplied risk id can never reach another tenant's row.
export function listRisks(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(risks).where(eq(risks.dealershipId, scope.dealershipId)),
  );
}

export function createRisk(
  scope: TenantScope,
  input: Omit<InsertRisk, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .insert(risks)
      .values({ ...input, dealershipId: scope.dealershipId })
      .returning();
    return row;
  });
}

export function updateRisk(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<InsertRisk, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
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
// #31/#32). TenantScope-only; dealership_id is forced from scope on every write. The file
// itself lives in the private `evidence` Storage bucket and is signed via
// evidenceGetSignedUrl in storage.ts (bucket = Supabase-managed encryption at rest).
export function listEvidence(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(evidence).where(eq(evidence.dealershipId, scope.dealershipId)),
  );
}

export function createEvidence(
  scope: TenantScope,
  input: Omit<InsertEvidence, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .insert(evidence)
      .values({ ...input, dealershipId: scope.dealershipId })
      .returning();
    return row;
  });
}

// Evidence <-> Control link. dealership_id is forced from scope; onConflict on the
// (evidence_id, control_id) unique makes re-linking idempotent (returns null on a no-op).
export function linkEvidenceToControl(
  scope: TenantScope,
  input: { evidenceId: number; controlId: number },
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx
      .insert(evidenceControls)
      .values({
        dealershipId: scope.dealershipId,
        evidenceId: input.evidenceId,
        controlId: input.controlId,
      })
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

// Tasks — crown-jewel tenant data: remediation tasks (PRD #24). TenantScope-only; updateTask
// re-filters by dealership so a client-supplied id can never reach another tenant's row.
export function listTasks(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(tasks).where(eq(tasks.dealershipId, scope.dealershipId)),
  );
}

export function createTask(
  scope: TenantScope,
  input: Omit<InsertTask, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(tasks).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updateTask(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<InsertTask, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
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

// Policies — crown-jewel tenant data: written policies/procedures (PRD #22/#26).
// TenantScope-only; updatePolicy re-filters by dealership like updateTask/updateRisk.
export function listPolicies(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(policies).where(eq(policies.dealershipId, scope.dealershipId)),
  );
}

export function createPolicy(
  scope: TenantScope,
  input: Omit<InsertPolicy, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(policies).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updatePolicy(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<InsertPolicy, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
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
// assessment #20). TenantScope-only; updateAsset re-filters by dealership like updateRisk.
export function listAssets(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(assets).where(eq(assets.dealershipId, scope.dealershipId)),
  );
}

export function createAsset(
  scope: TenantScope,
  input: Omit<InsertAsset, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(assets).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updateAsset(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<InsertAsset, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
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
// #13). TenantScope-only; updateDataFlow re-filters by dealership. source/destination asset
// ids are raw client ids with dealership_id forced from scope, same as risks.controlId.
export function listDataFlows(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(dataFlows).where(eq(dataFlows.dealershipId, scope.dealershipId)),
  );
}

export function createDataFlow(
  scope: TenantScope,
  input: Omit<InsertDataFlow, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(dataFlows).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updateDataFlow(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<InsertDataFlow, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
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
// TenantScope-only; updateAttestation re-filters by dealership like updateRisk.
export function listAttestations(scope: TenantScope) {
  return scoped(scope.userId, async (tx) =>
    tx.select().from(attestations).where(eq(attestations.dealershipId, scope.dealershipId)),
  );
}

export function createAttestation(
  scope: TenantScope,
  input: Omit<InsertAttestation, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>,
) {
  return scoped(scope.userId, async (tx) => {
    const [row] = await tx.insert(attestations).values({ ...input, dealershipId: scope.dealershipId }).returning();
    return row;
  });
}

export function updateAttestation(
  scope: TenantScope,
  id: number,
  input: Partial<Omit<InsertAttestation, 'id' | 'dealershipId' | 'createdAt' | 'updatedAt'>>,
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

// Audit trail — append-only, tamper-evident (PRD #34 / #51). Written as service_role;
// immutability + the SHA-256 hash chain are DB-enforced (0004 migration). Fail-open via
// writeAuditSafely: an audit-write failure is logged but never breaks the audited
// operation (see @shared/audit for the rationale + the fail-closed follow-up note).
export function appendAuditLog(event: AuditEventInput): Promise<void> {
  return writeAuditSafely(async (record) => {
    await getDb().insert(auditLog).values(record);
  }, event);
}

export type { User, Dealership, ComplianceAnswer, Subscription, GeneratedDocument, Requirement, Control, Risk, Evidence, Task, Policy, Asset, DataFlow, Attestation };
