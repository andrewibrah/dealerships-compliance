import { z } from 'npm:zod';
import * as db from './db.ts';
import { storagePut, storageGetSignedUrl } from './storage.ts';
import { generateWISP, generateBoardReport } from '../../../shared/pdf-generator.ts';
import { router, protectedProcedure } from './trpc.ts';
import { resolveTenantScope } from '../../../shared/tenant-guard.ts';

async function requirePaidScope(userId: string) {
  const scope = await resolveTenantScope(db, userId);
  if (!scope) throw new Error('No dealership found. Complete your profile first.');

  const subscription = await db.getSubscription(scope.dealershipId);
  if (!subscription || subscription.plan === 'free' || subscription.status !== 'active') {
    throw new Error('An active Core plan is required to generate documents.');
  }
  return scope;
}

export const pdfRouter = router({
  generateWISP: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = await requirePaidScope(ctx.user.id);
    const answers = await db.getAllComplianceAnswers(scope);

    const pdfBytes = await generateWISP(scope.dealership, answers);

    const fileName = `wisp-${scope.dealershipId}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileName, pdfBytes, 'application/pdf');

    await db.saveGeneratedDocument(scope, {
      docType: 'wisp',
      storagePath: fileName,
    });

    return { url, success: true };
  }),

  generateBoardReport: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = await requirePaidScope(ctx.user.id);
    const answers = await db.getAllComplianceAnswers(scope);

    const pdfBytes = await generateBoardReport(scope.dealership, answers);

    const fileName = `board-report-${scope.dealershipId}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileName, pdfBytes, 'application/pdf');

    await db.saveGeneratedDocument(scope, {
      docType: 'board_report',
      storagePath: fileName,
    });

    return { url, success: true };
  }),

  getDocumentUrl: protectedProcedure
    .input(z.object({ docType: z.string() }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) throw new Error('No dealership found');

      const docs = (await db.getGeneratedDocuments(scope)).filter(
        (d) => d.docType === input.docType
      );
      if (docs.length === 0) return null;

      const doc = docs[docs.length - 1];
      const url = doc.storagePath ? await storageGetSignedUrl(doc.storagePath) : null;
      return { ...doc, url };
    }),
});
