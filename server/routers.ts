import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { pdfRouter } from "./pdf-router";
import { stripeRouter } from "./stripe-router";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Dealership management
  dealership: router({
    // Get or create dealership for current user
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      return dealership;
    }),

    // Create dealership profile
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
        const dealership = await db.createDealership({
          userId: ctx.user.id,
          ...input,
        });
        return dealership;
      }),

    // Update dealership profile
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
        // Verify user owns this dealership
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership || dealership.id !== input.id) {
          throw new Error("Unauthorized");
        }

        const { id, ...updateData } = input;
        await db.updateDealership(id, updateData);
        return { success: true };
      }),
  }),

  // Compliance answers
  compliance: router({
    // Get all answers for a dealership (alias for Wizard)
    getAnswers: protectedProcedure.query(async ({ ctx }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return [];

      return await db.getAllComplianceAnswers(dealership.id);
    }),

    // Get all answers for a dealership
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return [];

      return await db.getAllComplianceAnswers(dealership.id);
    }),

    // Get answers for a specific section
    getSection: protectedProcedure
      .input(z.object({ section: z.number() }))
      .query(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) return null;

        return await db.getComplianceAnswers(dealership.id, input.section);
      }),

    // Save a single answer (called from Wizard)
    saveAnswer: protectedProcedure
      .input(
        z.object({
          section: z.number(),
          sectionName: z.string(),
          answers: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error("No dealership found");

        await db.saveComplianceAnswer({
          dealershipId: dealership.id,
          section: input.section,
          sectionName: input.sectionName,
          answers: input.answers,
        });

        return { success: true };
      }),

    // Save answers for a section
    saveSection: protectedProcedure
      .input(
        z.object({
          section: z.number(),
          sectionName: z.string(),
          answers: z.record(z.string(), z.any()),
          score: z.number().optional(),
          completed: z.union([z.boolean(), z.number()]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error("No dealership found");

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
    // Get current subscription
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return null;

      return await db.getSubscription(dealership.id);
    }),

    // Create subscription (called after Stripe payment)
    create: protectedProcedure
      .input(
        z.object({
          stripeCustomerId: z.string(),
          stripeSubscriptionId: z.string(),
          plan: z.enum(["free", "core", "managed"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error("No dealership found");

        return await db.createSubscription({
          dealershipId: dealership.id,
          ...input,
          status: "active",
        });
      }),

    // Update subscription status
    updateStatus: protectedProcedure
      .input(
        z.object({
          stripeSubscriptionId: z.string(),
          status: z.enum(["active", "inactive", "canceled"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error("No dealership found");

        const subscription = await db.getSubscription(dealership.id);
        if (!subscription) throw new Error("No subscription found");

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
    // Get all generated documents
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) return [];

      return await db.getGeneratedDocuments(dealership.id);
    }),

    // Get specific document type
    getByType: protectedProcedure
      .input(z.object({ docType: z.string() }))
      .query(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) return [];

        return await db.getGeneratedDocuments(dealership.id, input.docType);
      }),

    // Save generated document
    save: protectedProcedure
      .input(
        z.object({
          docType: z.string(),
          storagePath: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUserId(ctx.user.id);
        if (!dealership) throw new Error("No dealership found");

        return await db.saveGeneratedDocument({
          dealershipId: dealership.id,
          docType: input.docType,
          storagePath: input.storagePath,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
