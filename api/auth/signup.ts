import type { Request, Response } from "express";
import { z } from "zod";
import * as db from "../../server/db";
import { hashPassword, createSessionToken } from "../../server/auth";
import { getSessionCookieOptions } from "../../server/_core/cookies";
import { ENV } from "../../server/_core/env";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

export async function signupHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { email, password, name } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await db.getUserByEmail(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const role = normalizedEmail === ENV.adminEmail ? "admin" : "user";

  const user = await db.createUser({ email: normalizedEmail, passwordHash, name: name ?? null, role });

  const token = await createSessionToken(user.id);
  const cookieOptions = getSessionCookieOptions(req);

  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
  res.status(201).json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}

export default signupHandler;
