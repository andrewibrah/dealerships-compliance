import {
  pgTable, pgEnum, uuid, varchar, text, integer, bigint, boolean,
  timestamp, jsonb, unique, index, foreignKey,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['user', 'admin']);

// Core compliance object model (PRD #3). control_status is the dealer's implemented
// state for a requirement; the risk_* enums describe a tenant risk finding.
export const controlStatusEnum = pgEnum('control_status', [
  'implemented', 'partial', 'not_implemented', 'not_applicable', 'unknown',
]);
export const riskLevelEnum = pgEnum('risk_level', ['low', 'medium', 'high']);
export const riskSeverityEnum = pgEnum('risk_severity', ['low', 'medium', 'high', 'critical']);
export const riskStatusEnum = pgEnum('risk_status', ['open', 'mitigating', 'accepted', 'closed']);

// Core compliance object model, batch 2 (PRD #22/#24/#26). task_* describe a remediation
// task; policy_status is the lifecycle of a written policy/procedure.
export const taskStatusEnum = pgEnum('task_status', ['open', 'in_progress', 'blocked', 'done', 'cancelled']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'critical']);
export const policyStatusEnum = pgEnum('policy_status', ['draft', 'in_review', 'approved', 'adopted', 'archived']);

// Core compliance object model, batch 3 (PRD #13/#29). asset_* describe an inventoried
// asset; data_flow_direction + transport_encryption describe an NPI data flow;
// attestation_* describe a staff attestation (§314.4(e)).
export const assetTypeEnum = pgEnum('asset_type', [
  'system', 'application', 'database', 'device', 'network', 'storage', 'vendor_service', 'other',
]);
export const assetCriticalityEnum = pgEnum('asset_criticality', ['low', 'medium', 'high', 'critical']);
export const dataFlowDirectionEnum = pgEnum('data_flow_direction', [
  'inbound', 'outbound', 'internal', 'bidirectional',
]);
export const transportEncryptionEnum = pgEnum('transport_encryption', ['none', 'tls', 'other', 'unknown']);
export const attestationTypeEnum = pgEnum('attestation_type', [
  'policy_acknowledgment', 'training_completion', 'access_review', 'other',
]);
export const attestationStatusEnum = pgEnum('attestation_status', [
  'pending', 'acknowledged', 'declined', 'expired',
]);

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
  // Consumer count drives the §314.6(a) small-institution exemption (PRD #7). Nullable:
  // unset means "not declared" -> nothing is exempt (safe default, identical to today).
  consumerCount: integer('consumer_count'),
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

// Core compliance object model (PRD #3). Additive to the questionnaire: requirements is a
// GLOBAL, versioned catalog (the FTC Safeguards Rule as data, identical for every dealer,
// keyed by the questionnaire question id); controls + risks are TENANT-SCOPED crown-jewel
// data (a dealer's implemented state and risk findings), reached only through a resolved
// TenantScope in db.ts. RLS lives in the 0005 migration (requirements: read-all; controls
// & risks: dealership-scoped, all verbs).
export const requirements = pgTable('requirements', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  section: integer('section').notNull(),
  sectionName: text('section_name').notNull().default(''),
  title: text('title').notNull().default(''),
  citation: varchar('citation', { length: 32 }).notNull().default(''),
  weight: varchar('weight', { length: 16 }).notNull().default('standard'),
  applicability: jsonb('applicability').notNull().default({}),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const controls = pgTable('controls', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  requirementId: integer('requirement_id').notNull().references(() => requirements.id),
  status: controlStatusEnum('status').notNull().default('unknown'),
  notes: text('notes').notNull().default(''),
  source: varchar('source', { length: 32 }).notNull().default('manual'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  unique().on(t.dealershipId, t.requirementId),
  // Referenceable target for the composite tenant FKs on risks/tasks/evidence_controls (0008).
  unique('controls_dealership_id_id_key').on(t.dealershipId, t.id),
  index('controls_dealership_id_idx').on(t.dealershipId),
  index('controls_requirement_id_idx').on(t.requirementId),
]);

export const risks = pgTable('risks', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  likelihood: riskLevelEnum('likelihood'),
  impact: riskLevelEnum('impact'),
  severity: riskSeverityEnum('severity'),
  status: riskStatusEnum('status').notNull().default('open'),
  requirementId: integer('requirement_id').references(() => requirements.id),
  controlId: integer('control_id').references(() => controls.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('risks_dealership_id_idx').on(t.dealershipId),
  index('risks_requirement_id_idx').on(t.requirementId),
  index('risks_control_id_idx').on(t.controlId),
  // Composite tenant FK (0008): a risk's control must belong to the same dealership.
  foreignKey({
    name: 'risks_dealership_id_control_id_fkey',
    columns: [t.dealershipId, t.controlId],
    foreignColumns: [controls.dealershipId, controls.id],
  }),
]);

// Core compliance object model, batch 2 (PRD #22/#24/#26/#31/#32). All TENANT-SCOPED
// crown-jewel data, reached only through a resolved TenantScope in db.ts; RLS lives in the
// 0006 migration (dealership-scoped, all verbs — mirroring controls/risks in 0005).

// Evidence — uploaded artifacts substantiating a control (PRD #31/#32). The file itself
// lives in a private `evidence` Supabase Storage bucket (Supabase-managed encryption at
// rest, same posture as the documents bucket); the row holds metadata + the storage path.
export const evidence = pgTable('evidence', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  storagePath: text('storage_path').notNull(),
  fileName: text('file_name').notNull().default(''),
  contentType: varchar('content_type', { length: 128 }).notNull().default(''),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('evidence_dealership_id_idx').on(t.dealershipId),
  // Referenceable target for the composite tenant FK on evidence_controls.evidence_id (0008).
  unique('evidence_dealership_id_id_key').on(t.dealershipId, t.id),
]);

// Evidence <-> Control join (PRD #31/#32). dealership_id is carried so RLS can scope the
// join row directly; unique on (evidence_id, control_id) makes re-linking idempotent.
export const evidenceControls = pgTable('evidence_controls', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  evidenceId: integer('evidence_id').notNull().references(() => evidence.id),
  controlId: integer('control_id').notNull().references(() => controls.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  unique().on(t.evidenceId, t.controlId),
  index('evidence_controls_dealership_id_idx').on(t.dealershipId),
  index('evidence_controls_evidence_id_idx').on(t.evidenceId),
  index('evidence_controls_control_id_idx').on(t.controlId),
  // Composite tenant FKs (0008): both the evidence and the control must be same-dealership.
  foreignKey({
    name: 'evidence_controls_dealership_id_control_id_fkey',
    columns: [t.dealershipId, t.controlId],
    foreignColumns: [controls.dealershipId, controls.id],
  }),
  foreignKey({
    name: 'evidence_controls_dealership_id_evidence_id_fkey',
    columns: [t.dealershipId, t.evidenceId],
    foreignColumns: [evidence.dealershipId, evidence.id],
  }),
]);

// Tasks — remediation tasks that close a gap (PRD #24). owner is free-text for now (RBAC
// assignees are a later task); optionally linked to the requirement gap it closes and/or
// the control it advances.
export const tasks = pgTable('tasks', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: taskStatusEnum('status').notNull().default('open'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  owner: text('owner').notNull().default(''),
  dueDate: timestamp('due_date'),
  requirementId: integer('requirement_id').references(() => requirements.id),
  controlId: integer('control_id').references(() => controls.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
}, (t) => [
  index('tasks_dealership_id_idx').on(t.dealershipId),
  index('tasks_requirement_id_idx').on(t.requirementId),
  index('tasks_control_id_idx').on(t.controlId),
  // Composite tenant FK (0008): a task's control must belong to the same dealership.
  foreignKey({
    name: 'tasks_dealership_id_control_id_fkey',
    columns: [t.dealershipId, t.controlId],
    foreignColumns: [controls.dealershipId, controls.id],
  }),
]);

// Policies — written policies/procedures (PRD #22/#26). Version-bump-on-edit and workflow
// transitions are #26 follow-ups; the fields are modeled now.
export const policies = pgTable('policies', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  policyType: varchar('policy_type', { length: 64 }).notNull(),
  title: text('title').notNull(),
  status: policyStatusEnum('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  content: text('content').notNull().default(''),
  storagePath: text('storage_path'),
  requirementId: integer('requirement_id').references(() => requirements.id),
  approvedBy: text('approved_by').notNull().default(''),
  adoptedAt: timestamp('adopted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('policies_dealership_id_idx').on(t.dealershipId),
  index('policies_requirement_id_idx').on(t.requirementId),
  // Referenceable target for the composite tenant FK on attestations.policy_id (0008).
  unique('policies_dealership_id_id_key').on(t.dealershipId, t.id),
]);

// Core compliance object model, batch 3 (PRD #13/#29) — completes the 9 PRD #3 entities.
// All TENANT-SCOPED crown-jewel data, reached only through a resolved TenantScope in db.ts;
// RLS lives in the 0007 migration (dealership-scoped, all verbs — mirroring 0005/0006).

// Assets — the inventoried asset register (PRD #13); feeds the risk assessment (#20).
export const assets = pgTable('assets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  name: text('name').notNull(),
  assetType: assetTypeEnum('asset_type').notNull(),
  description: text('description').notNull().default(''),
  owner: text('owner').notNull().default(''),
  location: text('location').notNull().default(''),
  storesNpi: boolean('stores_npi').notNull().default(false),
  criticality: assetCriticalityEnum('criticality').notNull().default('medium'),
  vendor: text('vendor').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('assets_dealership_id_idx').on(t.dealershipId),
  // Referenceable target for the composite tenant FKs on data_flows.*_asset_id (0008).
  unique('assets_dealership_id_id_key').on(t.dealershipId, t.id),
]);

// Data flows — how NPI moves between assets / external parties (PRD #13). source/destination
// asset ids follow the same raw-id + dealership_id-forced-from-scope pattern as risks.control_id
// (composite-FK hardening across all such refs is a tracked follow-up).
export const dataFlows = pgTable('data_flows', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  sourceAssetId: integer('source_asset_id').references(() => assets.id),
  destinationAssetId: integer('destination_asset_id').references(() => assets.id),
  externalParty: text('external_party').notNull().default(''),
  dataTypes: text('data_types').notNull().default(''),
  direction: dataFlowDirectionEnum('direction').notNull(),
  transportEncryption: transportEncryptionEnum('transport_encryption').notNull().default('unknown'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('data_flows_dealership_id_idx').on(t.dealershipId),
  index('data_flows_source_asset_id_idx').on(t.sourceAssetId),
  index('data_flows_destination_asset_id_idx').on(t.destinationAssetId),
  // Composite tenant FKs (0008): both endpoints must be same-dealership assets.
  foreignKey({
    name: 'data_flows_dealership_id_source_asset_id_fkey',
    columns: [t.dealershipId, t.sourceAssetId],
    foreignColumns: [assets.dealershipId, assets.id],
  }),
  foreignKey({
    name: 'data_flows_dealership_id_destination_asset_id_fkey',
    columns: [t.dealershipId, t.destinationAssetId],
    foreignColumns: [assets.dealershipId, assets.id],
  }),
]);

// Attestations — staff attestations of policy/training/access review (PRD #29, §314.4(e)).
export const attestations = pgTable('attestations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  dealershipId: integer('dealership_id').notNull().references(() => dealerships.id),
  attestationType: attestationTypeEnum('attestation_type').notNull(),
  subject: text('subject').notNull(),
  attestorName: text('attestor_name').notNull(),
  attestorEmail: varchar('attestor_email', { length: 320 }).notNull().default(''),
  status: attestationStatusEnum('status').notNull().default('pending'),
  policyId: integer('policy_id').references(() => policies.id),
  requirementId: integer('requirement_id').references(() => requirements.id),
  attestedAt: timestamp('attested_at'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('attestations_dealership_id_idx').on(t.dealershipId),
  index('attestations_policy_id_idx').on(t.policyId),
  // Composite tenant FK (0008): an attestation's policy must belong to the same dealership.
  foreignKey({
    name: 'attestations_dealership_id_policy_id_fkey',
    columns: [t.dealershipId, t.policyId],
    foreignColumns: [policies.dealershipId, policies.id],
  }),
]);

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
export type Requirement = typeof requirements.$inferSelect;
export type InsertRequirement = typeof requirements.$inferInsert;
export type Control = typeof controls.$inferSelect;
export type InsertControl = typeof controls.$inferInsert;
export type Risk = typeof risks.$inferSelect;
export type InsertRisk = typeof risks.$inferInsert;
export type Evidence = typeof evidence.$inferSelect;
export type InsertEvidence = typeof evidence.$inferInsert;
export type EvidenceControl = typeof evidenceControls.$inferSelect;
export type InsertEvidenceControl = typeof evidenceControls.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = typeof policies.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;
export type DataFlow = typeof dataFlows.$inferSelect;
export type InsertDataFlow = typeof dataFlows.$inferInsert;
export type Attestation = typeof attestations.$inferSelect;
export type InsertAttestation = typeof attestations.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;
