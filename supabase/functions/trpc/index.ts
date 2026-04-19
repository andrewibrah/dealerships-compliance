import { fetchRequestHandler } from 'npm:@trpc/server/adapters/fetch';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { getUserFromToken } from '../_shared/supabase.ts';
import * as db from '../_shared/db.ts';
import { appRouter } from '../_shared/routers.ts';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const response = await fetchRequestHandler({
    endpoint: '/trpc',
    req,
    router: appRouter,
    createContext: async () => {
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.split(' ')[1];
      const authUser = token ? await getUserFromToken(token) : null;
      const user = authUser ? await db.getUserById(authUser.id) : null;
      return { user };
    },
    onError: ({ error }) => {
      console.error('tRPC error:', error);
    },
  });

  const corsHeaders = getCorsHeaders(req);
  const newResponse = new Response(response.body, response);
  Object.entries(corsHeaders).forEach(([k, v]) => newResponse.headers.set(k, v as string));
  return newResponse;
});
