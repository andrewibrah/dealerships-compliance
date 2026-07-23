import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { resolveTenantScope } from "@shared/tenant-guard";
import {
  generateWISP,
  generateBoardReport,
  generateSecurityArchitectureAssessment,
  generateRiskAssessment,
} from "@shared/pdf-generator";
import { buildSecurityArchitectureAssessment, type DomainKey } from "@shared/security-architecture";
import { narrateDomain } from "@shared/architecture-narrative";
import { AUDIT_ACTIONS } from "@shared/audit";
import type { AnswerValue } from "@shared/controls";
import { ENV } from "./_core/env";
import { storagePut, storageGetSignedUrl } from "./storage";

async function requirePaidScope(userId: string) {
  const scope = await resolveTenantScope(db, userId);
  if (!scope) throw new Error("No dealership found. Complete your profile first.");

  const subscription = await db.getSubscription(scope.dealershipId);
  if (!subscription || subscription.plan === "free" || subscription.status !== "active") {
    throw new Error("An active Core plan is required to generate documents.");
  }
  return scope;
}

/** Flatten per-section answer rows into one code -> value map for the architecture model. */
function flattenAnswers(rows: { answers: unknown }[]): Record<string, AnswerValue> {
  const flat: Record<string, AnswerValue> = {};
  for (const row of rows) Object.assign(flat, (row.answers as Record<string, AnswerValue>) ?? {});
  return flat;
}

/**
 * Optional expert prose per domain (Phase 2 #20, P1). Passthrough — the deterministic per-domain
 * narrative — when ANTHROPIC_API_KEY is absent (the default in this deployment), so output is
 * identical with or without the key. The prose NEVER changes a score/status/citation/finding; the
 * PDF always renders the structured findings and this text is only a narrative paragraph. The DMS
 * vendor (dealer-supplied) is passed as UNTRUSTED context for the vendor/AI domains.
 */
async function domainNarratives(
  model: ReturnType<typeof buildSecurityArchitectureAssessment>,
  dmsVendor: string,
): Promise<Partial<Record<DomainKey, string>>> {
  const out: Partial<Record<DomainKey, string>> = {};
  for (const domain of model.domains) {
    const findings = domain.gaps.map((g) => `${g.title} [${g.citation}]`);
    const res = await narrateDomain(
      {
        domainTitle: domain.title,
        deterministicNarrative: domain.narrative,
        findings,
        untrustedContext:
          domain.key === "vendor" || domain.key === "ai_emerging" ? dmsVendor || undefined : undefined,
      },
      { apiKey: ENV.anthropicApiKey },
    );
    out[domain.key] = res.text;
  }
  return out;
}

export const pdfRouter = router({
  // Generate WISP PDF
  generateWISP: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = await requirePaidScope(ctx.user.id);
    const answers = await db.getAllComplianceAnswers(scope);

    const pdfBytes = await generateWISP(scope.dealership, answers);

    const fileName = `wisp-${scope.dealershipId}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileName, pdfBytes, "application/pdf");

    await db.saveGeneratedDocument(scope, {
      docType: "wisp",
      storagePath: fileName,
    });

    return { url, success: true };
  }),

  // Generate Board Report PDF (score is computed server-side from saved answers)
  generateBoardReport: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = await requirePaidScope(ctx.user.id);
    const answers = await db.getAllComplianceAnswers(scope);

    const pdfBytes = await generateBoardReport(scope.dealership, answers);

    const fileName = `board-report-${scope.dealershipId}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileName, pdfBytes, "application/pdf");

    await db.saveGeneratedDocument(scope, {
      docType: "board_report",
      storagePath: fileName,
    });

    return { url, success: true };
  }),

  // Generate Security Architecture Assessment PDF (Phase 2 #20) — paid-gated + audited.
  generateSecurityArchitectureAssessment: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = await requirePaidScope(ctx.user.id);
    const answers = await db.getAllComplianceAnswers(scope);
    const [assets, dataFlows, risks] = await Promise.all([
      db.listAssets(scope),
      db.listDataFlows(scope),
      db.listRisks(scope),
    ]);

    // Build the deterministic model once to derive the per-domain prose base (passthrough
    // without the key). The generator rebuilds the same model internally — identical inputs.
    const model = buildSecurityArchitectureAssessment({
      answers: flattenAnswers(answers),
      assets,
      dataFlows,
      risks,
      dmsVendor: scope.dealership.dmsVendor,
      consumerCount: scope.dealership.consumerCount ?? null,
    });
    const narratives = await domainNarratives(model, scope.dealership.dmsVendor);

    const pdfBytes = await generateSecurityArchitectureAssessment(
      scope.dealership,
      answers,
      { assets, dataFlows, risks },
      narratives,
    );

    const fileName = `security-architecture-${scope.dealershipId}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileName, pdfBytes, "application/pdf");

    await db.saveGeneratedDocument(scope, {
      docType: "security_architecture",
      storagePath: fileName,
    });
    await db.appendAuditLog({
      action: AUDIT_ACTIONS.documentGenerate,
      actor: { userId: ctx.user.id, email: ctx.user.email },
      entityType: "generated_document",
      dealershipId: scope.dealershipId,
      metadata: { docType: "security_architecture" },
    });

    return { url, success: true };
  }),

  // Generate Written Risk Assessment PDF (§314.4(b) / PRD #20) — paid-gated + audited.
  generateRiskAssessment: protectedProcedure.mutation(async ({ ctx }) => {
    const scope = await requirePaidScope(ctx.user.id);
    const answers = await db.getAllComplianceAnswers(scope);
    const [assets, dataFlows, risks] = await Promise.all([
      db.listAssets(scope),
      db.listDataFlows(scope),
      db.listRisks(scope),
    ]);

    const pdfBytes = await generateRiskAssessment(scope.dealership, answers, {
      assets,
      dataFlows,
      risks,
    });

    const fileName = `risk-assessment-${scope.dealershipId}-${Date.now()}.pdf`;
    const { url } = await storagePut(fileName, pdfBytes, "application/pdf");

    await db.saveGeneratedDocument(scope, {
      docType: "risk_assessment",
      storagePath: fileName,
    });
    await db.appendAuditLog({
      action: AUDIT_ACTIONS.documentGenerate,
      actor: { userId: ctx.user.id, email: ctx.user.email },
      entityType: "generated_document",
      dealershipId: scope.dealershipId,
      metadata: { docType: "risk_assessment" },
    });

    return { url, success: true };
  }),

  // Get a fresh download URL for the most recent document of a type
  getDocumentUrl: protectedProcedure
    .input(z.object({ docType: z.string() }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveTenantScope(db, ctx.user.id);
      if (!scope) throw new Error("No dealership found");

      const docs = await db.getGeneratedDocuments(scope, input.docType);
      if (docs.length === 0) return null;

      const doc = docs[docs.length - 1];
      const url = doc.storagePath ? await storageGetSignedUrl(doc.storagePath) : null;
      return { ...doc, url };
    }),
});
