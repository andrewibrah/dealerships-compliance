import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, sql } from 'drizzle-orm';
import {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments, auditLog,
  type User, type Dealership, type ComplianceAnswer, type Subscription, type GeneratedDocument,
  type InsertDealership, type InsertComplianceAnswer, type InsertSubscription, type InsertGeneratedDocument,
} from '../drizzle/schema';
import type { TenantScope } from '@shared/tenant-guard';
import { AUTHENTICATED_ROLE, JWT_CLAIMS_SETTING, buildJwtClaims, isRlsEnforced } from '@shared/rls';
import { writeAuditSafely, type AuditEventInput } from '@shared/audit';

const SCHEMA = { users, dealerships, complianceAnswers, subscriptions, generatedDocuments, auditLog };

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

// Audit trail — append-only, tamper-evident (PRD #34 / #51). Written as service_role;
// immutability + the SHA-256 hash chain are DB-enforced (0004 migration). Fail-open via
// writeAuditSafely: an audit-write failure is logged but never breaks the audited
// operation (see @shared/audit for the rationale + the fail-closed follow-up note).
export function appendAuditLog(event: AuditEventInput): Promise<void> {
  return writeAuditSafely(async (record) => {
    await getDb().insert(auditLog).values(record);
  }, event);
}

export type { User, Dealership, ComplianceAnswer, Subscription, GeneratedDocument };
