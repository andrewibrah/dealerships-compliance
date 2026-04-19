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
  createCheckoutSession: protectedProcedure
    .input(z.object({ plan: z.enum(['core', 'managed']), dealershipId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const stripe = getStripe();
      const sub = await db.getSubscription(input.dealershipId);
      let customerId = sub?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: ctx.user.email,
          metadata: { dealershipId: String(input.dealershipId) },
        });
        customerId = customer.id;
      }

      const priceId = input.plan === 'core' ? ENV.stripeCorePrice : ENV.stripeManagedPrice;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${ENV.appUrl}/dashboard?checkout=success`,
        cancel_url: `${ENV.appUrl}/documents`,
        metadata: { dealershipId: String(input.dealershipId), plan: input.plan },
      });

      return { url: session.url };
    }),

  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const dealership = await db.getDealershipByUserId(ctx.user.id);
    if (!dealership) return { plan: 'free', status: 'active', currentPeriodEnd: null };
    const sub = await db.getSubscription(dealership.id);
    return sub ?? { plan: 'free', status: 'active', currentPeriodEnd: null };
  }),

  cancelSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input }) => {
      const sub = await db.getSubscription(input.subscriptionId);
      if (!sub?.stripeSubscriptionId) throw new TRPCError({ code: 'NOT_FOUND' });
      await getStripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
      return db.updateSubscription(sub.id, { status: 'canceled' });
    }),

  getBillingPortalUrl: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .mutation(async ({ input }) => {
      const session = await getStripe().billingPortal.sessions.create({
        customer: input.customerId,
        return_url: `${ENV.appUrl}/dashboard`,
      });
      return { url: session.url };
    }),
});
