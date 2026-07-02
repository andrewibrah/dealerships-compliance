import { z } from 'npm:zod';
import * as db from './db.ts';
import { storagePut, storageGetSignedUrl } from './storage.ts';
import { generateWISP, generateBoardReport } from '../../../shared/pdf-generator.ts';
import { router, protectedProcedure } from './trpc.ts';

async function requirePaidDealership(userId: string) {
  const dealership = await db.getDealershipByUserId(userId);
  if (!dealership) throw new Error('No dealership found. Complete your profile first.');

  const subscription = await db.getSubscription(dealership.id);
  if (!subscription || subscription.plan === 'free' || subscription.status !== 'active') {
    throw new Error('An active Core plan is required to generate documents.');
  }
  return dealership;
}

export const pdfRouter = router({
  generateWISP: protectedProcedure.mutation(async ({ ctx }) => {
    const dealership = await requirePaidDealership(ctx.user.id);
    const answers = await db.getAllComplianceAnswers(dealership.id);

    const pdfBytes = await generateWISP(dealership, answers);

    const fileName = `wisp-${dealership.id}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileName, pdfBytes, 'application/pdf');

    await db.saveGeneratedDocument({
      dealershipId: dealership.id,
      docType: 'wisp',
      storagePath: fileName,
    });

    return { url, success: true };
  }),

  generateBoardReport: protectedProcedure.mutation(async ({ ctx }) => {
    const dealership = await requirePaidDealership(ctx.user.id);
    const answers = await db.getAllComplianceAnswers(dealership.id);

    const pdfBytes = await generateBoardReport(dealership, answers);

    const fileName = `board-report-${dealership.id}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileName, pdfBytes, 'application/pdf');

    await db.saveGeneratedDocument({
      dealershipId: dealership.id,
      docType: 'board_report',
      storagePath: fileName,
    });

    return { url, success: true };
  }),

  getDocumentUrl: protectedProcedure
    .input(z.object({ docType: z.string() }))
    .query(async ({ ctx, input }) => {
      const dealership = await db.getDealershipByUserId(ctx.user.id);
      if (!dealership) throw new Error('No dealership found');

      const docs = (await db.getGeneratedDocuments(dealership.id)).filter(
        (d) => d.docType === input.docType
      );
      if (docs.length === 0) return null;

      const doc = docs[docs.length - 1];
      const url = doc.storagePath ? await storageGetSignedUrl(doc.storagePath) : null;
      return { ...doc, url };
    }),
});
