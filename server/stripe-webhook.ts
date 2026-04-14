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

export async function handleStripeWebhook(event: Stripe.Event) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      // Find dealership by Stripe customer ID
      // Note: This requires storing stripe_customer_id in dealerships table
      // For now, we'll use the subscription metadata to find the dealership
      const dealershipId = subscription.metadata?.dealershipId;

      if (dealershipId) {
        const plan = subscription.items.data[0]?.price?.metadata?.plan || "core";
        const status = subscription.status === "active" ? "active" : "inactive";

        await db.updateSubscription(parseInt(dealershipId), {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          plan: plan as "free" | "core" | "managed",
          status: status as "active" | "inactive" | "canceled",
          currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const dealershipId = subscription.metadata?.dealershipId;

      if (dealershipId) {
        await db.updateSubscription(parseInt(dealershipId), {
          status: "canceled",
        });
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as any).subscription as string;

      if (subscriptionId) {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        const dealershipId = subscription.metadata?.dealershipId;

        if (dealershipId) {
          await db.updateSubscription(parseInt(dealershipId), {
            status: "active",
          });
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as any).subscription as string;

      if (subscriptionId) {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        const dealershipId = subscription.metadata?.dealershipId;

        if (dealershipId) {
          await db.updateSubscription(parseInt(dealershipId), {
            status: "inactive",
          });
        }
      }
      break;
    }
  }
}

export function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string
): Stripe.Event | null {
  try {
    return getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return null;
  }
}
