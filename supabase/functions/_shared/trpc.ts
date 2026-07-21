import { initTRPC, TRPCError } from 'npm:@trpc/server';
import superjson from 'npm:superjson';
import type { User } from '../../../drizzle/schema.ts';
import { requiresMfaStepUp, type AuthAssuranceLevel } from '../../../shared/mfa.ts';

export type Context = { user: User | null; aal: AuthAssuranceLevel; hasVerifiedFactor: boolean };

export const t = initTRPC.context<Context>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please login (10001)' });
  if (requiresMfaStepUp({ aal: ctx.aal, hasVerifiedFactor: ctx.hasVerifiedFactor }))
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Multi-factor authentication required (10003)' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have required permission (10002)' });
  return next({ ctx });
});
