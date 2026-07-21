import { fetchRequestHandler } from 'npm:@trpc/server/adapters/fetch';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { getUserFromToken } from '../_shared/supabase.ts';
import * as db from '../_shared/db.ts';
import { ENV } from '../_shared/env.ts';
import { appRouter } from '../_shared/routers.ts';
import { decodeAalFromJwt, hasVerifiedFactor } from '../../../shared/mfa.ts';
import { AUDIT_ACTIONS, isNewLoginSession } from '../../../shared/audit.ts';

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
      let user = null;
      let aal = null;
      let verifiedFactor = false;

      if (authUser?.email) {
        const normalizedEmail = authUser.email.trim().toLowerCase();
        const displayName =
          typeof authUser.user_metadata?.name === 'string'
            ? authUser.user_metadata.name.trim()
            : '';
        const role = normalizedEmail === ENV.adminEmail.trim().toLowerCase() ? 'admin' : 'user';

        user = await db.createUser({
          id: authUser.id,
          email: normalizedEmail,
          name: displayName,
          role,
        });
        aal = decodeAalFromJwt(token);
        verifiedFactor = hasVerifiedFactor(authUser.factors);

        // Mirror server/_core/context.ts: advance last-signed-in (previously only the
        // Node runtime did this) and audit auth events on a genuine new session.
        const prevLastSignedIn = user.lastSignedIn;
        await db.updateUserLastSignedIn(user.id);
        if (isNewLoginSession(prevLastSignedIn, new Date())) {
          await db.appendAuditLog({
            action: AUDIT_ACTIONS.authLogin,
            actor: { userId: user.id, email: user.email },
            entityType: 'user',
            entityId: user.id,
            metadata: { aal },
          });
          if (aal === 'aal2' && verifiedFactor) {
            await db.appendAuditLog({
              action: AUDIT_ACTIONS.authMfaStepUp,
              actor: { userId: user.id, email: user.email },
              entityType: 'user',
              entityId: user.id,
            });
          }
        }
      }

      return { user, aal, hasVerifiedFactor: verifiedFactor };
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
