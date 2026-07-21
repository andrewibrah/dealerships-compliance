import {
  pgTable, pgEnum, uuid, varchar, text, integer, bigint, boolean,
  timestamp, jsonb, unique, index,
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
}, (t) => [index('dealerships_user_id_idx').on(t.userId)]);

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
}, (t) => [index('subscriptions_dealership_id_idx').on(t.dealershipId)]);

export const generatedDocuments = pgTable('generated_documents', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  docType: varchar('doc_type', { length: 64 }).notNull(),
  version: integer('version').notNull().default(1),
  storagePath: text('storage_path'),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
}, (t) => [index('generated_documents_dealership_id_idx').on(t.dealershipId)]);

// Append-only, tamper-evident audit trail (PRD #34 / #51). An immutable who/what/when
// record of auth events and every state-changing mutation. Immutability + the SHA-256
// hash chain (prev_hash -> row_hash) are enforced by the DB (see 0004 migration), not
// here: the app connects as service_role (BYPASSRLS), so append-only is guaranteed by
// triggers that raise on UPDATE/DELETE/TRUNCATE, and the hash columns are filled by a
// BEFORE INSERT trigger — writers only ever supply the semantic columns below.
export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  actorEmail: varchar('actor_email', { length: 320 }).notNull().default(''),
  action: varchar('action', { length: 96 }).notNull(),
  entityType: varchar('entity_type', { length: 64 }).notNull().default(''),
  entityId: text('entity_id').notNull().default(''),
  dealershipId: integer('dealership_id').references(() => dealerships.id),
  metadata: jsonb('metadata').notNull().default({}),
  prevHash: text('prev_hash').notNull().default(''),
  rowHash: text('row_hash').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_log_dealership_id_idx').on(t.dealershipId),
  index('audit_log_actor_user_id_idx').on(t.actorUserId),
  index('audit_log_action_idx').on(t.action),
  index('audit_log_created_at_idx').on(t.createdAt),
]);

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
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;
