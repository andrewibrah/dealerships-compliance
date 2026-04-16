import type { Request, Response } from "express";
import { handleStripeWebhook, verifyStripeSignature } from "../../server/stripe-webhook";

export const config = { api: { bodyParser: false } };

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");

  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  const event = verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!event) {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  await handleStripeWebhook(event);
  res.json({ received: true });
}

export default stripeWebhookHandler;
