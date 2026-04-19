import { systemRouter } from './_core/systemRouter';
import { publicProcedure, router, protectedProcedure } from './_core/trpc';
import { z } from 'zod';
import * as db from './db';
import { pdfRouter } from './pdf-router';
import { stripeRouter } from './stripe-router';

const complianceAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(() => {
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
          rooftopCount: z.number().optional(),
          qualifiedIndividual: z.string().optional(),
          qiEmail: z.string().email().optional(),
        })
      )
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
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          dmsVendor: z.string().optional(),
          rooftopCount: z.number().optional(),
          qualifiedIndividual: z.string().optional(),
          qiEmail: z.string().email().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership || dealership.id !== input.id) {
          throw new Error('Unauthorized');
        }
        const { id, ...updateData } = input;
        await db.updateDealership(id, updateData);
        return { success: true };
      }),
  }),

  // Compliance answers
  compliance: router({
    getAnswers: protectedProcedure.query(async ({ ctx }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return [];
      return db.getAllComplianceAnswers(dealership.id);
    }),

    getAll: protectedProcedure.query(async ({ ctx }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return [];
      return db.getAllComplianceAnswers(dealership.id);
    }),

    getSection: protectedProcedure
      .input(z.object({ section: z.number() }))
      .query(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) return null;
        const answers = await db.getAllComplianceAnswers(dealership.id);
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
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error('No dealership found');
        await db.saveComplianceAnswer({
          dealershipId: dealership.id,
          section: input.section,
          sectionName: input.sectionName,
          answers: input.answers,
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
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error('No dealership found');
        await db.saveComplianceAnswer({
          dealershipId: dealership.id,
          section: input.section,
          sectionName: input.sectionName,
          answers: input.answers,
          score: input.score,
          completed: input.completed !== undefined ? Boolean(input.completed) : undefined,
          completedAt: input.completed ? new Date() : null,
        });
        return { success: true };
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
        return db.createSubscription({
          dealershipId: dealership.id,
          ...input,
          status: 'active',
        });
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
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return [];
      return db.getGeneratedDocuments(dealership.id);
    }),

    getByType: protectedProcedure
      .input(z.object({ docType: z.string() }))
      .query(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) return [];
        return db.getGeneratedDocuments(dealership.id, input.docType);
      }),

    save: protectedProcedure
      .input(
        z.object({
          docType: z.string(),
          storagePath: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error('No dealership found');
        return db.saveGeneratedDocument({
          dealershipId: dealership.id,
          docType: input.docType,
          storagePath: input.storagePath,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
