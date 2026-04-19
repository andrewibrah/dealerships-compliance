import { initTRPC, TRPCError } from 'npm:@trpc/server';
import superjson from 'npm:superjson';
import type { User } from '../../../drizzle/schema.ts';

export type Context = { user: User | null };

export const t = initTRPC.context<Context>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Please login (10001)' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have required permission (10002)' });
  return next({ ctx });
});
