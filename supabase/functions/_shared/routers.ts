import { TRPCError } from 'npm:@trpc/server';
import { z } from 'npm:zod';
import * as db from './db.ts';
import { storageGetSignedUrl } from './storage.ts';
import { stripeRouter } from './stripe-router.ts';
import { pdfRouter } from './pdf-router.ts';
import { ENV } from './env.ts';
import { router, publicProcedure, protectedProcedure } from './trpc.ts';
import { resolveTenantScope } from '../../../shared/tenant-guard.ts';

const authRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  logout: publicProcedure.mutation(() => ({ success: true })),
});

const dealershipRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    return db.getDealershipByUserId(ctx.user.id);
  }),
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      dmsVendor: z.string().optional(),
      rooftopCount: z.number().int().min(1).optional(),
      qualifiedIndividual: z.string().optional(),
      qiEmail: z.string().email().or(z.literal('')).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.createDealership({
        userId: ctx.user.id,
        name: input.name,
        address: input.address ?? '',
        city: input.city ?? '',
        state: input.state ?? '',
        dmsVendor: input.dmsVendor ?? '',
        rooftopCount: input.rooftopCount ?? 1,
        qualifiedIndividual: input.qualifiedIndividual ?? '',
        qiEmail: input.qiEmail ?? '',
      });
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      dmsVendor: z.string().optional(),
      rooftopCount: z.number().int().min(1).optional(),
      qualifiedIndividual: z.string().optional(),
      qiEmail: z.string().email().or(z.literal('')).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getDealershipByUserId(ctx.user.id);
      if (!existing || existing.id !== input.id) throw new TRPCError({ code: 'FORBIDDEN' });
      const { id, ...data } = input;
      return db.updateDealership(id, data);
    }),
});

const complianceRouter = router({
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
    .input(z.object({ section: z.number().int().min(1).max(9) }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) return null;
      const answers = await db.getAllComplianceAnswers(scope);
      return answers.find((a) => a.section === input.section) ?? null;
    }),
  saveAnswer: protectedProcedure
    .input(z.object({
      section: z.number().int(),
      sectionName: z.string(),
      answers: z.record(z.unknown()),
      score: z.number().int().optional(),
      completed: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
      if (!scope) throw new Error('Unable to resolve dealership');
      return db.saveComplianceAnswer(scope, {
        section: input.section,
        sectionName: input.sectionName,
        answers: input.answers,
        score: input.score,
        completed: input.completed,
        completedAt: input.completed ? new Date() : undefined,
        updatedAt: new Date(),
      });
    }),
  saveSection: protectedProcedure
    .input(z.object({
      section: z.number().int(),
      sectionName: z.string(),
      answers: z.record(z.unknown()),
      score: z.number().int().optional(),
      completed: z.union([z.boolean(), z.number()]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTenantScope(db, ctx.user.id, { createIfMissing: true });
      if (!scope) throw new Error('Unable to resolve dealership');
      const completed = input.completed !== undefined ? Boolean(input.completed) : undefined;
      return db.saveComplianceAnswer(scope, {
        section: input.section,
        sectionName: input.sectionName,
        answers: input.answers,
        score: input.score,
        completed,
        completedAt: completed ? new Date() : undefined,
        updatedAt: new Date(),
      });
    }),
});

const subscriptionRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) return null;
    const sub = await db.getSubscription(dealership.id);
    return sub ?? { plan: 'free', status: 'active', currentPeriodEnd: null };
  }),
  create: protectedProcedure
    .input(z.object({
      stripeCustomerId: z.string(),
      stripeSubscriptionId: z.string(),
      plan: z.enum(['free', 'core', 'managed']),
    }))
    .mutation(async ({ ctx, input }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) throw new TRPCError({ code: 'NOT_FOUND' });
      return db.createSubscription({ dealershipId: dealership.id, ...input, status: 'active' });
    }),
  updateStatus: protectedProcedure
    .input(z.object({ stripeSubscriptionId: z.string(), status: z.enum(['active', 'inactive', 'canceled']) }))
    .mutation(async ({ ctx, input }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) throw new TRPCError({ code: 'NOT_FOUND' });
      const subscription = await db.getSubscription(dealership.id);
      if (!subscription) throw new TRPCError({ code: 'NOT_FOUND' });
      await db.updateSubscription(subscription.id, { status: input.status });
      return { success: true };
    }),
});

const documentsRouter = router({
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
      const docs = await db.getGeneratedDocuments(scope);
      return docs.filter((d) => d.docType === input.docType);
    }),
  save: protectedProcedure
    .input(z.object({ docType: z.string(), storagePath: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) throw new TRPCError({ code: 'NOT_FOUND' });
      return db.saveGeneratedDocument(scope, { docType: input.docType, storagePath: input.storagePath });
    }),
});

const systemRouter = router({
  health: publicProcedure.query(() => ({ status: 'ok', ts: new Date().toISOString() })),
});

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  dealership: dealershipRouter,
  compliance: complianceRouter,
  subscription: subscriptionRouter,
  documents: documentsRouter,
  stripe: stripeRouter,
  pdf: pdfRouter,
});

export type AppRouter = typeof appRouter;
