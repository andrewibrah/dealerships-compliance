import type { Request, Response } from "express";
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
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

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
}

export default loginHandler;
