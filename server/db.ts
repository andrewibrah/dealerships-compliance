import { eq, and } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../drizzle/schema";
import {
  users,
  dealerships,
  complianceAnswers,
  subscriptions,
  generatedDocuments,
  type InsertDealership,
  type InsertComplianceAnswer,
  type InsertSubscription,
  type InsertGeneratedDocument,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("POSTGRES_URL is required");
    const sql = neon(url);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

// ─── User queries ──────────────────────────────────────────────────────────────

export async function getUserById(id: number) {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return result[0] ?? null;
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  name?: string | null;
  role?: "user" | "admin";
}) {
  const db = getDb();
  const result = await db
    .insert(users)
    .values({
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      name: data.name ?? null,
      role: data.role ?? "user",
      lastSignedIn: new Date(),
    })
    .returning();
  return result[0]!;
}

export async function updateUserLastSignedIn(id: number) {
  const db = getDb();
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

// ─── Dealership queries ────────────────────────────────────────────────────────

export async function createDealership(dealership: InsertDealership) {
  const db = getDb();
  return await db.insert(dealerships).values(dealership).returning();
}

export async function getDealershipByUserId(userId: number) {
  const db = getDb();
  const result = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function updateDealership(id: number, data: Partial<InsertDealership>) {
  const db = getDb();
  return await db.update(dealerships).set(data).where(eq(dealerships.id, id));
}

// ─── Compliance answer queries ─────────────────────────────────────────────────

export async function saveComplianceAnswer(answer: InsertComplianceAnswer) {
  const db = getDb();
  return await db
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
    });
}

export async function getComplianceAnswers(dealershipId: number, section: number) {
  const db = getDb();
  const result = await db
    .select()
    .from(complianceAnswers)
    .where(
      and(
        eq(complianceAnswers.dealershipId, dealershipId),
        eq(complianceAnswers.section, section)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function getAllComplianceAnswers(dealershipId: number) {
  const db = getDb();
  return await db
    .select()
    .from(complianceAnswers)
    .where(eq(complianceAnswers.dealershipId, dealershipId));
}

// ─── Subscription queries ──────────────────────────────────────────────────────

export async function getSubscription(dealershipId: number) {
  const db = getDb();
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.dealershipId, dealershipId))
    .limit(1);
  return result[0] ?? null;
}

export async function createSubscription(subscription: InsertSubscription) {
  const db = getDb();
  return await db.insert(subscriptions).values(subscription);
}

export async function updateSubscription(id: number, data: Partial<InsertSubscription>) {
  const db = getDb();
  return await db.update(subscriptions).set(data).where(eq(subscriptions.id, id));
}

// ─── Generated document queries ───────────────────────────────────────────────

export async function saveGeneratedDocument(doc: InsertGeneratedDocument) {
  const db = getDb();
  return await db.insert(generatedDocuments).values(doc);
}

export async function getGeneratedDocuments(dealershipId: number, docType?: string) {
  const db = getDb();
  if (docType) {
    return await db
      .select()
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.dealershipId, dealershipId),
          eq(generatedDocuments.docType, docType)
        )
      );
  }
  return await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.dealershipId, dealershipId));
}
