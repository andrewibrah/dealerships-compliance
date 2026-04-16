import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookies } from "cookie";
import type { Request } from "express";
import * as db from "./db";
import { ENV } from "./_core/env";
import { COOKIE_NAME } from "../shared/const";

const SALT_ROUNDS = 10;
const SESSION_DAYS = 30;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function getSecret(): Uint8Array {
  const secret = ENV.cookieSecret;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: number): Promise<string> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  return new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = parseInt(payload.sub as string, 10);
    if (isNaN(userId)) return null;
    return { userId };
  } catch {
    return null;
  }
}

export async function getUserFromCookie(req: Request) {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;

    const payload = await verifySessionToken(token);
    if (!payload) return null;

    const user = await db.getUserById(payload.userId);
    if (!user) return null;

    db.updateUserLastSignedIn(user.id).catch(() => {});

    return user;
  } catch {
    return null;
  }
}
