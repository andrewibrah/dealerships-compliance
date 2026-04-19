import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import {
  users, dealerships, complianceAnswers, subscriptions, generatedDocuments,
  type User, type Dealership, type ComplianceAnswer, type Subscription, type GeneratedDocument,
  type InsertDealership, type InsertComplianceAnswer, type InsertSubscription, type InsertGeneratedDocument,
} from '../drizzle/schema';

function getDb() {
  const url = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? '';
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema: { users, dealerships, complianceAnswers, subscriptions, generatedDocuments } });
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
  const [user] = await getDb().insert(users).values(data).returning();
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

export async function updateDealership(id: number, data: Partial<InsertDealership>) {
  const [d] = await getDb().update(dealerships).set({ ...data, updatedAt: new Date() }).where(eq(dealerships.id, id)).returning();
  return d;
}

// Compliance
export async function saveComplianceAnswer(answer: InsertComplianceAnswer) {
  const [row] = await getDb()
    .insert(complianceAnswers)
    .values(answer)
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
}

export async function getComplianceAnswers(dealershipId: number) {
  return getDb().select().from(complianceAnswers).where(eq(complianceAnswers.dealershipId, dealershipId));
}

export async function getAllComplianceAnswers(dealershipId: number) {
  return getComplianceAnswers(dealershipId);
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

// Documents
export async function saveGeneratedDocument(doc: InsertGeneratedDocument) {
  const [d] = await getDb().insert(generatedDocuments).values(doc).returning();
  return d;
}

export async function getGeneratedDocuments(dealershipId: number, docType?: string) {
  if (docType) {
    return getDb().select().from(generatedDocuments).where(
      and(eq(generatedDocuments.dealershipId, dealershipId), eq(generatedDocuments.docType, docType))
    );
  }
  return getDb().select().from(generatedDocuments).where(eq(generatedDocuments.dealershipId, dealershipId));
}

export type { User, Dealership, ComplianceAnswer, Subscription, GeneratedDocument };
