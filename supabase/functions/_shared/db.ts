import { drizzle } from 'npm:drizzle-orm/postgres-js';
import postgres from 'npm:postgres';
import { eq, and } from 'npm:drizzle-orm';
import { ENV } from './env.ts';
import {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments,
  type User, type Dealership, type ComplianceAnswer, type Subscription, type GeneratedDocument,
} from '../../../drizzle/schema.ts';

function getDb() {
  const client = postgres(ENV.supabaseDbUrl, { prepare: false });
  return drizzle(client, { schema: { users, dealerships, complianceAnswers, subscriptions, generatedDocuments } });
}

// Users
export async function getUserById(id: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
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

export async function updateDealership(id: number, data: Partial<Omit<typeof dealerships.$inferInsert, 'id'>>) {
  const db = getDb();
  const [d] = await db.update(dealerships).set({ ...data, updatedAt: new Date() }).where(eq(dealerships.id, id)).returning();
  return d;
}

// Compliance
export async function saveComplianceAnswer(data: Omit<typeof complianceAnswers.$inferInsert, 'id'>) {
  const db = getDb();
  const [row] = await db
    .insert(complianceAnswers)
    .values(data)
    .onConflictDoUpdate({
      target: [complianceAnswers.dealershipId, complianceAnswers.section],
      set: { answers: data.answers, score: data.score, completed: data.completed, completedAt: data.completedAt, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function getComplianceAnswers(dealershipId: number) {
  const db = getDb();
  return db.select().from(complianceAnswers).where(eq(complianceAnswers.dealershipId, dealershipId));
}

export async function getAllComplianceAnswers(dealershipId: number) {
  return getComplianceAnswers(dealershipId);
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

// Documents
export async function saveGeneratedDocument(data: Omit<typeof generatedDocuments.$inferInsert, 'id' | 'generatedAt'>) {
  const db = getDb();
  const [doc] = await db.insert(generatedDocuments).values(data).returning();
  return doc;
}

export async function getGeneratedDocuments(dealershipId: number) {
  const db = getDb();
  return db.select().from(generatedDocuments).where(eq(generatedDocuments.dealershipId, dealershipId));
}

export type { User, Dealership, ComplianceAnswer, Subscription, GeneratedDocument };
