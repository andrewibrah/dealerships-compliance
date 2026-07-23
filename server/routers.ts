import { systemRouter } from './_core/systemRouter';
import { publicProcedure, router, protectedProcedure } from './_core/trpc';
import { z } from 'zod';
import * as db from './db';
import { resolveTenantScope, type TenantScope } from '@shared/tenant-guard';
import { AUDIT_ACTIONS } from '@shared/audit';
import { deriveControlStatus, type AnswerValue } from '@shared/controls';
import { deriveTasksFromControls } from '@shared/task-derivation';
import { getAllQuestions } from '@shared/safeguards-questions';
import { rephraseQuestion } from '@shared/interview-phrasing';
import { ENV } from './_core/env';
import { storageGetSignedUrl, evidenceGetSignedUrl } from './storage';
import { pdfRouter } from './pdf-router';
import { stripeRouter } from './stripe-router';

const complianceAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

// JSONB -> Control cutover (PRD #5). Additively project a saved section's answers onto derived
// Control rows — one per answered requirement present in the GLOBAL catalog. Runs AFTER the
// authoritative compliance_answers JSONB write, never replacing it. Deterministic: the status
// comes straight from deriveControlStatus (no LLM). Always writes source: 'questionnaire'. Codes
// with no catalog match are skipped. Returns the number upserted (surfaced in the save audit
// metadata). Mirrored EXACTLY in supabase/functions/_shared/routers.ts.
async function upsertDerivedControls(
  scope: TenantScope,
  answers: Record<string, AnswerValue>,
): Promise<number> {
  const catalog = await db.listRequirements();
  const requirementIdByCode = new Map(catalog.map((r) => [r.code, r.id]));
  let controlsUpserted = 0;
  for (const [code, value] of Object.entries(answers)) {
    const requirementId = requirementIdByCode.get(code);
    if (requirementId === undefined) continue;
    await db.upsertControl(scope, {
      requirementId,
      status: deriveControlStatus(value),
      notes: '',
      source: 'questionnaire',
    });
    controlsUpserted += 1;
  }
  return controlsUpserted;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await db.appendAuditLog({
        action: AUDIT_ACTIONS.authLogout,
        actor: { userId: ctx.user?.id ?? null, email: ctx.user?.email ?? null },
        entityType: 'user',
        entityId: ctx.user?.id ?? null,
      });
      // Session is managed by Supabase client on the frontend
      return { success: true } as const;
    }),
  }),

  // Dealership management
  dealership: router({
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      return db.getDealershipByUserId(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          dmsVendor: z.string().optional(),
          rooftopCount: z.number().int().min(1).optional(),
          qualifiedIndividual: z.string().optional(),
          qiEmail: z.string().email().or(z.literal('')).optional(),
          consumerCount: z.number().int().nonnegative().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.createDealership({
          userId: ctx.user.id,
          name: input.name,
          address: input.address ?? '',
          city: input.city ?? '',
          state: input.state ?? '',
          dmsVendor: input.dmsVendor ?? '',
          rooftopCount: input.rooftopCount ?? 1,
          qualifiedIndividual: input.qualifiedIndividual ?? '',
          qiEmail: input.qiEmail ?? '',
          consumerCount: input.consumerCount ?? null,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.dealershipCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'dealership',
          entityId: dealership.id,
          dealershipId: dealership.id,
          metadata: { name: dealership.name },
        });
        return dealership;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          dmsVendor: z.string().optional(),
          rooftopCount: z.number().int().min(1).optional(),
          qualifiedIndividual: z.string().optional(),
          qiEmail: z.string().email().or(z.literal('')).optional(),
          consumerCount: z.number().int().nonnegative().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership || dealership.id !== input.id) {
          throw new Error('Unauthorized');
        }
        const { id, ...updateData } = input;
        await db.updateDealership(id, updateData);
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.dealershipUpdate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'dealership',
          entityId: id,
          dealershipId: id,
          metadata: { fields: Object.keys(updateData) },
        });
        return { success: true };
      }),
  }),

  // Compliance answers
  compliance: router({
    getAnswers: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.getAllComplianceAnswers(scope);
    }),

    getAll: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.getAllComplianceAnswers(scope);
    }),

    getSection: protectedProcedure
      .input(z.object({ section: z.number() }))
      .query(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) return null;
        const answers = await db.getAllComplianceAnswers(scope);
        return answers.find((a) => a.section === input.section) ?? null;
      }),

    saveAnswer: protectedProcedure
      .input(
        z.object({
          section: z.number(),
          sectionName: z.string(),
          answers: z.record(z.string(), complianceAnswerValueSchema),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        await db.saveComplianceAnswer(scope, {
          section: input.section,
          sectionName: input.sectionName,
          answers: input.answers,
        });
        const controlsUpserted = await upsertDerivedControls(scope, input.answers);
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.complianceSaveSection,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'compliance_answer',
          entityId: input.section,
          dealershipId: scope.dealershipId,
          metadata: { section: input.section, sectionName: input.sectionName, controlsUpserted },
        });
        return { success: true };
      }),

    saveSection: protectedProcedure
      .input(
        z.object({
          section: z.number(),
          sectionName: z.string(),
          answers: z.record(z.string(), complianceAnswerValueSchema),
          score: z.number().optional(),
          completed: z.union([z.boolean(), z.number()]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        await db.saveComplianceAnswer(scope, {
          section: input.section,
          sectionName: input.sectionName,
          answers: input.answers,
          score: input.score,
          completed: input.completed !== undefined ? Boolean(input.completed) : undefined,
          completedAt: input.completed ? new Date() : null,
        });
        const controlsUpserted = await upsertDerivedControls(scope, input.answers);
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.complianceSaveSection,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'compliance_answer',
          entityId: input.section,
          dealershipId: scope.dealershipId,
          metadata: {
            section: input.section,
            sectionName: input.sectionName,
            completed: input.completed !== undefined ? Boolean(input.completed) : undefined,
            controlsUpserted,
          },
        });
        return { success: true };
      }),
  }),

  // Optional conversational phrasing (PRD #11/#39) — DISPLAY ONLY. A QUERY: it writes
  // nothing (no audit). It rephrases ONE server-owned question's text; the model NEVER
  // decides an answer, status, score, or citation. Returns { text } only. Passthrough
  // (original text) when ANTHROPIC_API_KEY is absent. Mirrored in the Deno router.
  interview: router({
    rephrase: protectedProcedure
      .input(z.object({ questionId: z.string() }))
      .query(async ({ input }) => {
        const question = getAllQuestions().find((q) => q.id === input.questionId);
        if (!question) return { text: '' };
        return rephraseQuestion(
          { questionText: question.text, hint: question.hint },
          { apiKey: ENV.anthropicApiKey },
        );
      }),
  }),

  // Requirement catalog — GLOBAL, read-only (PRD #3). The FTC Safeguards Rule as data.
  requirements: router({
    list: protectedProcedure.query(async () => {
      return db.listRequirements();
    }),
  }),

  // Controls — the dealer's implemented state per requirement (tenant-scoped).
  controls: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.listControls(scope);
    }),

    upsert: protectedProcedure
      .input(
        z.object({
          requirementId: z.number().int(),
          status: z
            .enum(['implemented', 'partial', 'not_implemented', 'not_applicable', 'unknown'])
            .default('unknown'),
          notes: z.string().default(''),
          source: z.enum(['questionnaire', 'manual']).default('manual'),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        const control = await db.upsertControl(scope, {
          requirementId: input.requirementId,
          status: input.status,
          notes: input.notes,
          source: input.source,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.controlUpsert,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'control',
          entityId: control.id,
          dealershipId: scope.dealershipId,
          metadata: { requirementId: input.requirementId, status: input.status, source: input.source },
        });
        return control;
      }),
  }),

  // Risks — a dealer's risk findings (tenant-scoped), feeding the future Risk Assessment.
  risks: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.listRisks(scope);
    }),

    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1),
          description: z.string().default(''),
          likelihood: z.enum(['low', 'medium', 'high']).optional(),
          impact: z.enum(['low', 'medium', 'high']).optional(),
          severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
          status: z.enum(['open', 'mitigating', 'accepted', 'closed']).default('open'),
          requirementId: z.number().int().nullable().optional(),
          controlId: z.number().int().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        const risk = await db.createRisk(scope, {
          title: input.title,
          description: input.description,
          likelihood: input.likelihood,
          impact: input.impact,
          severity: input.severity,
          status: input.status,
          requirementId: input.requirementId ?? null,
          controlId: input.controlId ?? null,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.riskCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'risk',
          entityId: risk.id,
          dealershipId: scope.dealershipId,
          metadata: { title: risk.title, severity: input.severity, status: input.status },
        });
        return risk;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          title: z.string().min(1).optional(),
          description: z.string().optional(),
          likelihood: z.enum(['low', 'medium', 'high']).nullable().optional(),
          impact: z.enum(['low', 'medium', 'high']).nullable().optional(),
          severity: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional(),
          status: z.enum(['open', 'mitigating', 'accepted', 'closed']).optional(),
          requirementId: z.number().int().nullable().optional(),
          controlId: z.number().int().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) throw new Error('No dealership found');
        const { id, ...changes } = input;
        const risk = await db.updateRisk(scope, id, changes);
        if (!risk) throw new Error('Risk not found');
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.riskUpdate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'risk',
          entityId: id,
          dealershipId: scope.dealershipId,
          metadata: { fields: Object.keys(changes) },
        });
        return risk;
      }),
  }),

  // Evidence — uploaded artifacts substantiating controls (tenant-scoped, PRD #31/#32).
  // Files live in the private `evidence` Storage bucket; create records metadata + the
  // storage path (signed-upload-URL wiring is a deliberate follow-up). getUrl signs a
  // scoped row's path — it never trusts a client-supplied path.
  evidence: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.listEvidence(scope);
    }),

    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1),
          description: z.string().default(''),
          storagePath: z.string().min(1),
          fileName: z.string().default(''),
          contentType: z.string().default(''),
          sizeBytes: z.number().int().nonnegative().default(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        const item = await db.createEvidence(scope, {
          title: input.title,
          description: input.description,
          storagePath: input.storagePath,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          uploadedBy: ctx.user.id,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.evidenceCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'evidence',
          entityId: item.id,
          dealershipId: scope.dealershipId,
          metadata: { title: item.title, fileName: input.fileName },
        });
        return item;
      }),

    linkControl: protectedProcedure
      .input(z.object({ evidenceId: z.number().int(), controlId: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        const link = await db.linkEvidenceToControl(scope, {
          evidenceId: input.evidenceId,
          controlId: input.controlId,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.evidenceLinkControl,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'evidence_control',
          entityId: link?.id ?? null,
          dealershipId: scope.dealershipId,
          metadata: { evidenceId: input.evidenceId, controlId: input.controlId },
        });
        return link;
      }),

    listForControl: protectedProcedure
      .input(z.object({ controlId: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) return [];
        return db.listEvidenceForControl(scope, input.controlId);
      }),

    getUrl: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) return null;
        const items = await db.listEvidence(scope);
        const item = items.find((e) => e.id === input.id);
        if (!item) throw new Error('Evidence not found');
        return { url: await evidenceGetSignedUrl(item.storagePath) };
      }),
  }),

  // Tasks — remediation tasks that close a gap (tenant-scoped, PRD #24).
  tasks: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.listTasks(scope);
    }),

    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1),
          description: z.string().default(''),
          status: z.enum(['open', 'in_progress', 'blocked', 'done', 'cancelled']).default('open'),
          priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
          owner: z.string().default(''),
          dueDate: z.coerce.date().nullable().optional(),
          requirementId: z.number().int().nullable().optional(),
          controlId: z.number().int().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        const task = await db.createTask(scope, {
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          owner: input.owner,
          dueDate: input.dueDate ?? null,
          requirementId: input.requirementId ?? null,
          controlId: input.controlId ?? null,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.taskCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'task',
          entityId: task.id,
          dealershipId: scope.dealershipId,
          metadata: { title: task.title, status: input.status, priority: input.priority },
        });
        return task;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          title: z.string().min(1).optional(),
          description: z.string().optional(),
          status: z.enum(['open', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
          priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
          owner: z.string().optional(),
          dueDate: z.coerce.date().nullable().optional(),
          requirementId: z.number().int().nullable().optional(),
          controlId: z.number().int().nullable().optional(),
          completedAt: z.coerce.date().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) throw new Error('No dealership found');
        const { id, ...changes } = input;
        const task = await db.updateTask(scope, id, changes);
        if (!task) throw new Error('Task not found');
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.taskUpdate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'task',
          entityId: id,
          dealershipId: scope.dealershipId,
          metadata: { fields: Object.keys(changes) },
        });
        return task;
      }),

    // Remediation roadmap (PRD #24/#40): project OPEN controls onto suggested tasks. Pure,
    // deterministic (deriveTasksFromControls — no LLM) and idempotent (skips controls that
    // already have a task), so this is safe to re-run. Every created task is audited.
    deriveFromControls: protectedProcedure.mutation(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
      if (!scope) throw new Error('Unable to resolve dealership');
      const [controls, requirements, existingTasks] = await Promise.all([
        db.listControls(scope),
        db.listRequirements(),
        db.listTasks(scope),
      ]);
      const derived = deriveTasksFromControls({ controls, requirements, existingTasks });
      const created = [];
      for (const input of derived) {
        const task = await db.createTask(scope, input);
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.taskCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'task',
          entityId: task.id,
          dealershipId: scope.dealershipId,
          metadata: { title: task.title, priority: task.priority, source: 'derive', controlId: input.controlId },
        });
        created.push(task);
      }
      return created;
    }),
  }),

  // Policies — written policies/procedures (tenant-scoped, PRD #22/#26).
  policies: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.listPolicies(scope);
    }),

    create: protectedProcedure
      .input(
        z.object({
          policyType: z.string().min(1),
          title: z.string().min(1),
          status: z.enum(['draft', 'in_review', 'approved', 'adopted', 'archived']).default('draft'),
          version: z.number().int().min(1).default(1),
          content: z.string().default(''),
          storagePath: z.string().nullable().optional(),
          requirementId: z.number().int().nullable().optional(),
          approvedBy: z.string().default(''),
          adoptedAt: z.coerce.date().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        const policy = await db.createPolicy(scope, {
          policyType: input.policyType,
          title: input.title,
          status: input.status,
          version: input.version,
          content: input.content,
          storagePath: input.storagePath ?? null,
          requirementId: input.requirementId ?? null,
          approvedBy: input.approvedBy,
          adoptedAt: input.adoptedAt ?? null,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.policyCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'policy',
          entityId: policy.id,
          dealershipId: scope.dealershipId,
          metadata: { policyType: input.policyType, title: policy.title, status: input.status },
        });
        return policy;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          policyType: z.string().min(1).optional(),
          title: z.string().min(1).optional(),
          status: z.enum(['draft', 'in_review', 'approved', 'adopted', 'archived']).optional(),
          version: z.number().int().min(1).optional(),
          content: z.string().optional(),
          storagePath: z.string().nullable().optional(),
          requirementId: z.number().int().nullable().optional(),
          approvedBy: z.string().optional(),
          adoptedAt: z.coerce.date().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) throw new Error('No dealership found');
        const { id, ...changes } = input;
        const policy = await db.updatePolicy(scope, id, changes);
        if (!policy) throw new Error('Policy not found');
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.policyUpdate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'policy',
          entityId: id,
          dealershipId: scope.dealershipId,
          metadata: { fields: Object.keys(changes) },
        });
        return policy;
      }),
  }),

  // Assets — the inventoried asset register (tenant-scoped, PRD #13; feeds risk assessment).
  assets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.listAssets(scope);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          assetType: z.enum([
            'system', 'application', 'database', 'device', 'network', 'storage', 'vendor_service', 'other',
          ]),
          description: z.string().default(''),
          owner: z.string().default(''),
          location: z.string().default(''),
          storesNpi: z.boolean().default(false),
          criticality: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
          vendor: z.string().default(''),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        const asset = await db.createAsset(scope, {
          name: input.name,
          assetType: input.assetType,
          description: input.description,
          owner: input.owner,
          location: input.location,
          storesNpi: input.storesNpi,
          criticality: input.criticality,
          vendor: input.vendor,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.assetCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'asset',
          entityId: asset.id,
          dealershipId: scope.dealershipId,
          metadata: { name: asset.name, assetType: input.assetType, criticality: input.criticality },
        });
        return asset;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          name: z.string().min(1).optional(),
          assetType: z.enum([
            'system', 'application', 'database', 'device', 'network', 'storage', 'vendor_service', 'other',
          ]).optional(),
          description: z.string().optional(),
          owner: z.string().optional(),
          location: z.string().optional(),
          storesNpi: z.boolean().optional(),
          criticality: z.enum(['low', 'medium', 'high', 'critical']).optional(),
          vendor: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) throw new Error('No dealership found');
        const { id, ...changes } = input;
        const asset = await db.updateAsset(scope, id, changes);
        if (!asset) throw new Error('Asset not found');
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.assetUpdate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'asset',
          entityId: id,
          dealershipId: scope.dealershipId,
          metadata: { fields: Object.keys(changes) },
        });
        return asset;
      }),
  }),

  // Data flows — how NPI moves between assets / external parties (tenant-scoped, PRD #13).
  dataFlows: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.listDataFlows(scope);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          description: z.string().default(''),
          sourceAssetId: z.number().int().nullable().optional(),
          destinationAssetId: z.number().int().nullable().optional(),
          externalParty: z.string().default(''),
          dataTypes: z.string().default(''),
          direction: z.enum(['inbound', 'outbound', 'internal', 'bidirectional']),
          transportEncryption: z.enum(['none', 'tls', 'other', 'unknown']).default('unknown'),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        const flow = await db.createDataFlow(scope, {
          name: input.name,
          description: input.description,
          sourceAssetId: input.sourceAssetId ?? null,
          destinationAssetId: input.destinationAssetId ?? null,
          externalParty: input.externalParty,
          dataTypes: input.dataTypes,
          direction: input.direction,
          transportEncryption: input.transportEncryption,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.dataFlowCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'data_flow',
          entityId: flow.id,
          dealershipId: scope.dealershipId,
          metadata: { name: flow.name, direction: input.direction },
        });
        return flow;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          sourceAssetId: z.number().int().nullable().optional(),
          destinationAssetId: z.number().int().nullable().optional(),
          externalParty: z.string().optional(),
          dataTypes: z.string().optional(),
          direction: z.enum(['inbound', 'outbound', 'internal', 'bidirectional']).optional(),
          transportEncryption: z.enum(['none', 'tls', 'other', 'unknown']).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) throw new Error('No dealership found');
        const { id, ...changes } = input;
        const flow = await db.updateDataFlow(scope, id, changes);
        if (!flow) throw new Error('Data flow not found');
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.dataFlowUpdate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'data_flow',
          entityId: id,
          dealershipId: scope.dealershipId,
          metadata: { fields: Object.keys(changes) },
        });
        return flow;
      }),
  }),

  // Attestations — staff attestations of policy/training/access review (tenant-scoped, PRD #29).
  attestations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      return db.listAttestations(scope);
    }),

    create: protectedProcedure
      .input(
        z.object({
          attestationType: z.enum(['policy_acknowledgment', 'training_completion', 'access_review', 'other']),
          subject: z.string().min(1),
          attestorName: z.string().min(1),
          attestorEmail: z.string().email().or(z.literal('')).default(''),
          status: z.enum(['pending', 'acknowledged', 'declined', 'expired']).default('pending'),
          policyId: z.number().int().nullable().optional(),
          requirementId: z.number().int().nullable().optional(),
          attestedAt: z.coerce.date().nullable().optional(),
          notes: z.string().default(''),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
        if (!scope) throw new Error('Unable to resolve dealership');
        const attestation = await db.createAttestation(scope, {
          attestationType: input.attestationType,
          subject: input.subject,
          attestorName: input.attestorName,
          attestorEmail: input.attestorEmail,
          status: input.status,
          policyId: input.policyId ?? null,
          requirementId: input.requirementId ?? null,
          attestedAt: input.attestedAt ?? null,
          notes: input.notes,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.attestationCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'attestation',
          entityId: attestation.id,
          dealershipId: scope.dealershipId,
          metadata: { attestationType: input.attestationType, subject: attestation.subject, status: input.status },
        });
        return attestation;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          attestationType: z.enum(['policy_acknowledgment', 'training_completion', 'access_review', 'other']).optional(),
          subject: z.string().min(1).optional(),
          attestorName: z.string().min(1).optional(),
          attestorEmail: z.string().email().or(z.literal('')).optional(),
          status: z.enum(['pending', 'acknowledged', 'declined', 'expired']).optional(),
          policyId: z.number().int().nullable().optional(),
          requirementId: z.number().int().nullable().optional(),
          attestedAt: z.coerce.date().nullable().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) throw new Error('No dealership found');
        const { id, ...changes } = input;
        const attestation = await db.updateAttestation(scope, id, changes);
        if (!attestation) throw new Error('Attestation not found');
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.attestationUpdate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'attestation',
          entityId: id,
          dealershipId: scope.dealershipId,
          metadata: { fields: Object.keys(changes) },
        });
        return attestation;
      }),
  }),

  // Subscription management
  subscription: router({
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return null;
      return db.getSubscription(dealership.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          stripeCustomerId: z.string(),
          stripeSubscriptionId: z.string(),
          plan: z.enum(['free', 'core', 'managed']),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error('No dealership found');
        const subscription = await db.createSubscription({
          dealershipId: dealership.id,
          ...input,
          status: 'active',
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.subscriptionCreate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'subscription',
          entityId: subscription.id,
          dealershipId: dealership.id,
          metadata: { plan: input.plan },
        });
        return subscription;
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          stripeSubscriptionId: z.string(),
          status: z.enum(['active', 'inactive', 'canceled']),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error('No dealership found');
        const subscription = await db.getSubscription(dealership.id);
        if (!subscription) throw new Error('No subscription found');
        await db.updateSubscription(subscription.id, { status: input.status });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.subscriptionUpdateStatus,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'subscription',
          entityId: subscription.id,
          dealershipId: dealership.id,
          metadata: { status: input.status, stripeSubscriptionId: input.stripeSubscriptionId },
        });
        return { success: true };
      }),
  }),

  // PDF generation
  pdf: pdfRouter,

  // Stripe subscription management
  stripe: stripeRouter,

  // Generated documents
  documents: router({
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return [];
      const docs = await db.getGeneratedDocuments(scope);
      return Promise.all(
        docs.map(async (doc) => ({
          ...doc,
          url: doc.storagePath
            ? await storageGetSignedUrl(doc.storagePath).catch(() => null)
            : null,
        }))
      );
    }),

    getByType: protectedProcedure
      .input(z.object({ docType: z.string() }))
      .query(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) return [];
        return db.getGeneratedDocuments(scope, input.docType);
      }),

    save: protectedProcedure
      .input(
        z.object({
          docType: z.string(),
          storagePath: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const scope = await resolveTenantScope(db, ctx.user.id);
        if (!scope) throw new Error('No dealership found');
        const doc = await db.saveGeneratedDocument(scope, {
          docType: input.docType,
          storagePath: input.storagePath,
        });
        await db.appendAuditLog({
          action: AUDIT_ACTIONS.documentGenerate,
          actor: { userId: ctx.user.id, email: ctx.user.email },
          entityType: 'generated_document',
          entityId: doc.id,
          dealershipId: scope.dealershipId,
          metadata: { docType: input.docType },
        });
        return doc;
      }),
  }),
});

export type AppRouter = typeof appRouter;
