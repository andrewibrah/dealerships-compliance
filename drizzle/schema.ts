import { boolean, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const dealerships = pgTable("dealerships", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: varchar("state", { length: 2 }),
  dmsVendor: varchar("dms_vendor", { length: 64 }),
  rooftopCount: integer("rooftop_count").default(1),
  qualifiedIndividual: text("qualified_individual"),
  qiEmail: varchar("qi_email", { length: 320 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type Dealership = typeof dealerships.$inferSelect;
export type InsertDealership = typeof dealerships.$inferInsert;

export const complianceAnswers = pgTable(
  "compliance_answers",
  {
    id: serial("id").primaryKey(),
    dealershipId: integer("dealership_id").notNull().references(() => dealerships.id),
    section: integer("section").notNull(),
    sectionName: text("section_name").notNull(),
    answers: jsonb("answers").notNull(),
    score: integer("score"),
    completed: boolean("completed").default(false),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  },
  (table) => ({
    dealershipSectionUnique: unique().on(table.dealershipId, table.section),
  })
);

export type ComplianceAnswer = typeof complianceAnswers.$inferSelect;
export type InsertComplianceAnswer = typeof complianceAnswers.$inferInsert;

export const generatedDocuments = pgTable("generated_documents", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id),
  docType: varchar("doc_type", { length: 64 }).notNull(),
  version: integer("version").default(1),
  storagePath: text("storage_path"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
export type InsertGeneratedDocument = typeof generatedDocuments.$inferInsert;

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: varchar("plan", { length: 64 }).default("free"),
  status: varchar("status", { length: 64 }).default("active"),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
