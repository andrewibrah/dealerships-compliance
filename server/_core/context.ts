import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import * as db from '../db';
import { ENV } from './env';
import type { User } from '../../drizzle/schema';

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
};

async function getUserFromRequest(req: Request): Promise<User | null> {
  try {
    const authHeader = (req.headers['authorization'] ?? req.headers['Authorization']) as string | undefined;
    const token = authHeader?.split(' ')[1];
    if (!token) return null;

    const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
    if (error || !authUser) return null;

    const user = await db.getUserById(authUser.id);
    if (user) {
      await db.updateUserLastSignedIn(user.id);
    }
    return user;
  } catch {
    return null;
  }
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<TrpcContext> {
  const user = await getUserFromRequest(req);
  return { req, res, user };
}
