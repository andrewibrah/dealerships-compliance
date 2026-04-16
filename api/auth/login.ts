import type { Request, Response } from "express";
import express from "express";
import { z } from "zod";
import * as db from "../../server/db";
import { verifyPassword, createSessionToken } from "../../server/auth";
import { getSessionCookieOptions } from "../../server/_core/cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid email or password format" });
      return;
    }

    const { email, password } = parsed.data;

    const user = await db.getUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = await createSessionToken(user.id);
    const cookieOptions = getSessionCookieOptions(req);

    res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[login error]", err);
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
}

// Vercel entry point — Express wrapper ensures req.body is parsed
const app = express();
app.use(express.json({ limit: "10mb" }));
// Use wildcard so the route matches regardless of how Vercel passes the URL
app.post("*", loginHandler);
// Ensure all errors return JSON (prevents Express from sending HTML error pages)
app.use((_err: unknown, _req: unknown, res: Response, _next: unknown) => {
  const msg = _err instanceof Error ? _err.message : String(_err);
  res.status(500).json({ error: msg });
});
export default app;
