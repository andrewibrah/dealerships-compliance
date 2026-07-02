import { TRPCError } from 'npm:@trpc/server';
import { z } from 'npm:zod';
import Stripe from 'npm:stripe';
import * as db from './db.ts';
import { ENV } from './env.ts';
import { router, protectedProcedure } from './trpc.ts';

let _stripe: Stripe | null = null;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: '2024-06-20' });
  return _stripe;
}

export const stripeRouter = router({
  // Input/output shape must match server/stripe-router.ts — the client is typed
  // against the server AppRouter but talks to this router in production.
  createCheckoutSession: protectedProcedure
    .input(z.object({ plan: z.enum(['core', 'managed']) }))
    .mutation(async ({ input, ctx }) => {
      // A user can upgrade before saving any answers, so create the dealership if needed
      const dealership =
        (await db.getDealershipByUserId(ctx.user.id)) ??
        (await db.createDealership({
          userId: ctx.user.id,
          name: 'My Dealership',
          address: '',
          city: '',
          state: '',
          dmsVendor: '',
          rooftopCount: 1,
          qualifiedIndividual: '',
          qiEmail: '',
        }));

      const priceId = input.plan === 'core' ? ENV.stripeCorePrice : ENV.stripeManagedPrice;
      if (!priceId) throw new Error('Price not configured');

      const stripe = getStripe();
      const sub = await db.getSubscription(dealership.id);
      let customerId = sub?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: ctx.user.email,
          name: dealership.name,
          metadata: { dealershipId: String(dealership.id), userId: String(ctx.user.id) },
        });
        customerId = customer.id;
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${ENV.appUrl}/dashboard?checkout=success`,
        cancel_url: `${ENV.appUrl}/documents`,
        metadata: { dealershipId: String(dealership.id), plan: input.plan },
        // The webhook reads metadata off the subscription object, which does not
        // inherit session metadata unless set explicitly here.
        subscription_data: {
          metadata: { dealershipId: String(dealership.id), plan: input.plan },
        },
      });

      return { sessionId: session.id, url: session.url };
    }),

  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) return { plan: 'free', status: 'active', currentPeriodEnd: null };
    const sub = await db.getSubscription(dealership.id);
    return sub ?? { plan: 'free', status: 'active', currentPeriodEnd: null };
  }),

  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) throw new TRPCError({ code: 'NOT_FOUND', message: 'No dealership found' });
    const sub = await db.getSubscription(dealership.id);
    if (!sub?.stripeSubscriptionId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription' });
    await getStripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    await db.updateSubscription(sub.id, { status: 'canceled' });
    return { success: true };
  }),

  getBillingPortalUrl: protectedProcedure.mutation(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) throw new TRPCError({ code: 'NOT_FOUND', message: 'No dealership found' });
    const sub = await db.getSubscription(dealership.id);
    if (!sub?.stripeCustomerId) throw new TRPCError({ code: 'NOT_FOUND', message: 'No Stripe customer found' });
    const session = await getStripe().billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${ENV.appUrl}/dashboard`,
    });
    return { url: session.url };
  }),
});
