import { createClient } from 'npm:@supabase/supabase-js@2';
import { ENV } from './env.ts';

export function createServiceClient() {
  return createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function getUserFromToken(token: string) {
  const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}
