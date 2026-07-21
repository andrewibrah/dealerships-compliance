import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import * as db from '../db';
import { ENV } from './env';
import type { User } from '../../drizzle/schema';
import { decodeAalFromJwt, hasVerifiedFactor, type AuthAssuranceLevel } from '@shared/mfa';

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
  aal: AuthAssuranceLevel;
  hasVerifiedFactor: boolean;
};

type AuthResult = { user: User | null; aal: AuthAssuranceLevel; hasVerifiedFactor: boolean };

const ANON_AUTH: AuthResult = { user: null, aal: null, hasVerifiedFactor: false };

async function getAuthFromRequest(req: Request): Promise<AuthResult> {
  try {
    const authHeader = (req.headers['authorization'] ?? req.headers['Authorization']) as string | undefined;
    const token = authHeader?.split(' ')[1];
    if (!token) return ANON_AUTH;

    const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
    if (error || !authUser) return ANON_AUTH;

    const normalizedEmail = authUser.email?.trim().toLowerCase();
    if (!normalizedEmail) return ANON_AUTH;

    const displayName =
      typeof authUser.user_metadata?.name === 'string'
        ? authUser.user_metadata.name.trim()
        : '';
    const role = normalizedEmail === ENV.adminEmail ? 'admin' : 'user';

    const user = await db.createUser({
      id: authUser.id,
      email: normalizedEmail,
      name: displayName,
      role,
    });

    await db.updateUserLastSignedIn(user.id);
    return {
      user,
      aal: decodeAalFromJwt(token),
      hasVerifiedFactor: hasVerifiedFactor(authUser.factors),
    };
  } catch {
    return ANON_AUTH;
  }
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<TrpcContext> {
  const auth = await getAuthFromRequest(req);
  return { req, res, user: auth.user, aal: auth.aal, hasVerifiedFactor: auth.hasVerifiedFactor };
}
