import type { IncomingMessage, ServerResponse } from "node:http";
import express from "express";
import type { Response } from "express";
import { handleStripeWebhook, verifyStripeSignature } from "../../server/stripe-webhook";

export const config = { api: { bodyParser: false } };

async function stripeWebhookHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");

  const expressRes = res as unknown as Response;

  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    expressRes.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    expressRes.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  const event = verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!event) {
    expressRes.status(400).json({ error: "Invalid signature" });
    return;
  }

  await handleStripeWebhook(event);
  expressRes.json({ received: true });
}

const app = express();
// No body parser — raw body is read manually in the handler
app.post("*", (req, res) => stripeWebhookHandler(req, res));
app.use((_err: unknown, _req: unknown, res: Response, _next: unknown) => {
  const msg = _err instanceof Error ? _err.message : String(_err);
  res.status(500).json({ error: msg });
});
export default app;
