import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import Stripe from "stripe";
import * as db from "./db";

// Lazy initialize Stripe to avoid errors when API key is not set
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    stripeInstance = new Stripe(apiKey);
  }
  return stripeInstance;
}

// Stripe price IDs from environment
const CORE_PRICE_ID = process.env.STRIPE_CORE_PRICE_ID || "";
const MANAGED_PRICE_ID = process.env.STRIPE_MANAGED_PRICE_ID || "";

export const stripeRouter = router({
  // Create checkout session for Core plan ($199/month)
  createCheckoutSession: protectedProcedure
    .input(z.object({ plan: z.enum(["core", "managed"]) }))
    .mutation(async ({ ctx, input }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) throw new Error("No dealership found");

      const priceId = input.plan === "core" ? CORE_PRICE_ID : MANAGED_PRICE_ID;
      if (!priceId) throw new Error("Price not configured");

      // Get or create Stripe customer
      let subscription = await db.getSubscription(dealership.id);
      let customerId = subscription?.stripeCustomerId;

      if (!customerId) {
        const customer = await getStripe().customers.create({
          email: ctx.user.email || undefined,
          name: dealership.name,
          metadata: {
            dealershipId: dealership.id.toString(),
            userId: ctx.user.id.toString(),
          },
        });
        customerId = customer.id;
      }

      // Create checkout session
      const session = await getStripe().checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${process.env.VITE_APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.VITE_APP_URL}/documents`,
        metadata: {
          dealershipId: dealership.id.toString(),
          plan: input.plan,
        },
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    }),

  // Get current subscription status
  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) return null;

    const subscription = await db.getSubscription(dealership.id);
    if (!subscription) {
      return {
        plan: "free",
        status: "active",
        currentPeriodEnd: null,
      };
    }

    return {
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    };
  }),

  // Cancel subscription
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) throw new Error("No dealership found");

    const subscription = await db.getSubscription(dealership.id);
    if (!subscription || !subscription.stripeSubscriptionId) {
      throw new Error("No active subscription");
    }

    // Cancel at Stripe
    await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update database
    await db.updateSubscription(subscription.id, {
      status: "canceled",
    });

    return { success: true };
  }),

  // Update payment method
  updatePaymentMethod: protectedProcedure
    .input(z.object({ paymentMethodId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) throw new Error("No dealership found");

      const subscription = await db.getSubscription(dealership.id);
      if (!subscription || !subscription.stripeSubscriptionId) {
        throw new Error("No active subscription");
      }

      // Update payment method at Stripe
      await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
        default_payment_method: input.paymentMethodId,
      });

      return { success: true };
    }),

  // Get billing portal URL
  getBillingPortalUrl: protectedProcedure.mutation(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) throw new Error("No dealership found");

    const subscription = await db.getSubscription(dealership.id);
    if (!subscription || !subscription.stripeCustomerId) {
      throw new Error("No Stripe customer found");
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${process.env.VITE_APP_URL}/dashboard`,
    });

    return { url: session.url };
  }),
});
