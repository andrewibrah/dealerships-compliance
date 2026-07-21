import { drizzle } from 'npm:drizzle-orm/postgres-js';
import postgres from 'npm:postgres';
import { eq, and, sql } from 'npm:drizzle-orm';
import { ENV } from './env.ts';
import {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments, auditLog,
  type User, type Dealership, type ComplianceAnswer, type Subscription, type GeneratedDocument,
} from '../../../drizzle/schema.ts';
import type { TenantScope } from '../../../shared/tenant-guard.ts';
import { AUTHENTICATED_ROLE, JWT_CLAIMS_SETTING, buildJwtClaims, isRlsEnforced } from '../../../shared/rls.ts';
import { writeAuditSafely, type AuditEventInput } from '../../../shared/audit.ts';

const SCHEMA = { users, dealerships, complianceAnswers, subscriptions, generatedDocuments, auditLog };

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

// Audit trail — append-only, tamper-evident (PRD #34 / #51). Mirrors server/db.ts:
// written as service_role, immutability + hash chain DB-enforced (0004), fail-open.
export function appendAuditLog(event: AuditEventInput): Promise<void> {
  return writeAuditSafely(async (record) => {
    await getDb().insert(auditLog).values(record);
  }, event);
}

export type { User, Dealership, ComplianceAnswer, Subscription, GeneratedDocument };
