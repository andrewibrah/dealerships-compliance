import { createClient } from 'npm:@supabase/supabase-js@2';
import { ENV } from '../_shared/env.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await req.json();

  const userId: string = payload.user_id ?? payload.user?.id;
  const email: string = payload.user?.email ?? payload.claims?.email;

  if (!userId || !email) {
    return new Response(JSON.stringify({ error: 'Missing user data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const role = email === ENV.adminEmail ? 'admin' : 'user';

  const supabaseAdmin = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { role },
  });

  return new Response(
    JSON.stringify({
      ...payload,
      claims: {
        ...payload.claims,
        user_role: role,
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
