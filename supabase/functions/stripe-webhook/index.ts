import Stripe from 'npm:stripe';
import { handleCors } from '../_shared/cors.ts';
import { ENV } from '../_shared/env.ts';
import * as db from '../_shared/db.ts';

let _stripe: Stripe | null = null;
function getStripe() {
  if (!_stripe) _stripe = new Stripe(ENV.stripeSecretKey, { apiVersion: '2024-06-20' });
  return _stripe;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, ENV.stripeWebhookSecret);
  } catch (err) {
    return new Response(`Webhook error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const dealershipId = Number(sub.metadata.dealershipId);
        const plan = sub.metadata.plan ?? 'free';
        const existing = await db.getSubscription(dealershipId);
        const periodEnd = new Date((sub as any).current_period_end * 1000);
        const status = sub.status === 'active' ? 'active' : 'inactive';
        if (existing) {
          await db.updateSubscription(existing.id, {
            stripeSubscriptionId: sub.id,
            plan,
            status,
            currentPeriodEnd: periodEnd,
          });
        } else {
          await db.createSubscription({
            dealershipId,
            stripeCustomerId: sub.customer as string,
            stripeSubscriptionId: sub.id,
            plan,
            status,
            currentPeriodEnd: periodEnd,
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const dealershipId = Number(sub.metadata.dealershipId);
        const existing = await db.getSubscription(dealershipId);
        if (existing) await db.updateSubscription(existing.id, { status: 'canceled' });
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string;
        if (subId) {
          const sub = await db.getSubscriptionByStripeId(subId);
          if (sub) await db.updateSubscription(sub.id, { status: 'active' });
        }
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
