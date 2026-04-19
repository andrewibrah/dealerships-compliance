import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean,
  timestamp, jsonb, unique,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['user', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull().default(''),
  email: varchar('email', { length: 320 }).notNull().unique(),
  role: roleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastSignedIn: timestamp('last_signed_in'),
});

export const dealerships = pgTable('dealerships', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull().default(''),
  address: text('address').notNull().default(''),
  city: text('city').notNull().default(''),
  state: varchar('state', { length: 2 }).notNull().default(''),
  dmsVendor: varchar('dms_vendor', { length: 64 }).notNull().default(''),
  rooftopCount: integer('rooftop_count').notNull().default(1),
  qualifiedIndividual: text('qualified_individual').notNull().default(''),
  qiEmail: varchar('qi_email', { length: 320 }).notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const complianceAnswers = pgTable(
  'compliance_answers',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
    section: integer('section').notNull(),
    sectionName: text('section_name').notNull().default(''),
    answers: jsonb('answers').notNull().default({}),
    score: integer('score').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.dealershipId, t.section)]
);

export const subscriptions = pgTable('subscriptions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: varchar('plan', { length: 64 }).notNull().default('free'),
  status: varchar('status', { length: 64 }).notNull().default('active'),
  currentPeriodEnd: timestamp('current_period_end'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const generatedDocuments = pgTable('generated_documents', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  docType: varchar('doc_type', { length: 64 }).notNull(),
  version: integer('version').notNull().default(1),
  storagePath: text('storage_path'),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Dealership = typeof dealerships.$inferSelect;
export type InsertDealership = typeof dealerships.$inferInsert;
export type ComplianceAnswer = typeof complianceAnswers.$inferSelect;
export type InsertComplianceAnswer = typeof complianceAnswers.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
export type InsertGeneratedDocument = typeof generatedDocuments.$inferInsert;
