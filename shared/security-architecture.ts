// Security Architecture Assessment — the deterministic model (PRD #20 / Phase 2 #20).
//
// Pure and dependency-light (mirrors shared/derivation.ts / shared/applicability.ts): no LLM,
// no DB, no network, no dates. Imported by both runtimes AND the client, so imports are bare,
// runtime-neutral, and explicitly `.ts`.
//
// WHAT IT DOES: re-frames the dealer's saved answers + first-class entity rows (assets, data
// flows, risks) into SIX cybersecurity-architecture domains — a defensible expert lens over the
// FTC Safeguards Rule. FIVE domains carry a derived posture; the sixth (AI & Emerging Tech) is
// clearly-labelled ADVISORY and carries NO §314.4 citation and NO score by design.
//
// DETERMINISM / GROUNDING (the compliance non-negotiable): every domain posture, score, status,
// gap, and §314.4 citation is data-derived. The per-domain posture is the SAME Phase-1 derivation
// (shared/derivation.ts) re-aggregated over that domain's sections, so it can never disagree with
// the Dashboard/Summary/PDF numbers. Entity "signals" are grounded observations that reference
// real rows; they NEVER invent a score or a citation. The AI domain's advisory findings are
// grounded in the vendor/data-flow signals and are explicitly non-authoritative.
//
// The 6 domains PARTITION the 9 Safeguards sections (each section maps to exactly one scored
// domain), so nothing is lost or double-counted:
//   cloud_infrastructure -> 5 (Encryption), 9 (Monitoring/Pen Testing), 7 (Incident Response)
//   access_identity      -> 4 (Access Controls), 8 (Security Awareness / Personnel)
//   data_protection      -> 3 (Data Inventory & Classification)
//   risk_assessment      -> 2 (Risk Assessment), 1 (Qualified Individual / Governance)
//   vendor               -> 6 (Service Provider Oversight)
//   ai_emerging          -> advisory (no section, no citation, no score)

import { REQUIREMENT_CATALOG, type Requirement } from './requirements.ts';
import { SAFEGUARDS_SECTIONS } from './safeguards-questions.ts';
import {
  getApplicability,
  applicableRequirements,
  type Applicability,
} from './applicability.ts';
import {
  deriveAssessmentFromAnswers,
  type DerivedGap,
  type DerivedSectionScore,
} from './derivation.ts';
import type { AnswerValue } from './controls.ts';

/** Mandatory disclaimer — embedded in the in-app view AND both generated PDFs (satisfies part
 *  of PRD #4). Single source of truth so the wording can never drift between surfaces. */
export const ASSESSMENT_DISCLAIMER =
  'This assessment is generated software output, not legal or professional security advice. ' +
  'The dealership and its Qualified Individual remain responsible for their information security program.';

/** App-chrome variant of the disclaimer (PRD #4) — second person, shown in the persistent footer
 *  on every page. Same substance as ASSESSMENT_DISCLAIMER, phrased for the reader looking at the
 *  UI rather than at a generated document. Centralized here so all disclaimer wording lives in one
 *  place and can never silently drift. */
export const APP_DISCLAIMER =
  'This is generated software output, not legal or professional security advice. ' +
  'Your dealership and its Qualified Individual remain responsible for your information security program.';

export type DomainKey =
  | 'cloud_infrastructure'
  | 'access_identity'
  | 'data_protection'
  | 'risk_assessment'
  | 'vendor'
  | 'ai_emerging';

/** Posture buckets. `not_assessed` means the domain has no in-scope requirements (e.g. every one
 *  of its sections is exempt under §314.6) — never a fabricated zero. */
export type DomainStatus = 'strong' | 'moderate' | 'weak' | 'critical' | 'not_assessed';

/** Minimal structural shapes for the entity rows we consume — mirrors the applicability.ts /
 *  tenant-guard.ts pattern so the module stays trivially unit-testable and never imports a DB
 *  row type. Real Drizzle rows satisfy these by construction. */
export interface AssetLike {
  assetType: string;
  storesNpi: boolean;
  criticality: string;
}
export interface DataFlowLike {
  externalParty: string;
  transportEncryption: string;
  direction: string;
}
export interface RiskLike {
  severity?: string | null;
  status: string;
}

/** A grounded observation drawn from entity rows. `grounding` names the data source so the UI/PDF
 *  can show traceability; it is NEVER a compliance score or citation. */
export interface DomainSignal {
  text: string;
  grounding: 'assets' | 'data_flows' | 'risks' | 'vendor_profile';
}

export interface DomainPosture {
  score: number; // 0-100
  status: DomainStatus;
  maxPoints: number;
  earnedPoints: number;
  /** In-scope requirements in this domain's sections. */
  totalControls: number;
  /** Requirements confirmed fully in place (status implemented). */
  confirmedControls: number;
}

export interface ArchitectureDomain {
  key: DomainKey;
  title: string;
  /** Static description of what the domain governs. */
  summary: string;
  /** True only for AI & Emerging Tech: advisory, no §314.4 determination. */
  advisory: boolean;
  /** Safeguards section numbers this domain owns (empty for the advisory domain). */
  sections: number[];
  /** Distinct in-scope §314.4 citations for this domain, in catalog order (empty when advisory
   *  or when every requirement is exempt). NEVER populated for the advisory domain. */
  citations: string[];
  /** Derived posture — null for the advisory domain (no fabricated score) and for a fully-exempt
   *  scored domain. */
  posture: DomainPosture | null;
  /** Grounded, explainable gaps (each carries citation + triggering answer + weight + section). */
  gaps: DerivedGap[];
  criticalGaps: DerivedGap[];
  /** Entity-grounded observations (assets / data flows / risks / vendor profile). */
  signals: DomainSignal[];
  /** Advisory, clearly non-authoritative findings — ONLY the AI & Emerging Tech domain. */
  advisoryFindings: string[];
  /** Deterministic expert-narrative template — the fallback the optional LLM prose layer
   *  rephrases (and the exact text shown when ANTHROPIC_API_KEY is absent). */
  narrative: string;
}

export interface SecurityArchitectureAssessment {
  /** The true overall score (same value the Dashboard/Summary show), for consistency. */
  overall: number;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  domains: ArchitectureDomain[];
  disclaimer: string;
  /** True when the §314.6(a) small-institution exemption applies to this profile. */
  isExempt: boolean;
}

export interface ArchitectureInput {
  answers: Record<string, AnswerValue> | null | undefined;
  assets?: AssetLike[];
  dataFlows?: DataFlowLike[];
  risks?: RiskLike[];
  dmsVendor?: string | null;
  consumerCount?: number | null;
}

interface DomainDefinition {
  key: DomainKey;
  title: string;
  summary: string;
  sections: number[];
  advisory: boolean;
}

/** The 6-domain lens. Ordered for display. The five scored domains partition sections 1-9; the
 *  advisory domain owns no section (so it can carry no score/citation). */
export const DOMAIN_DEFINITIONS: DomainDefinition[] = [
  {
    key: 'cloud_infrastructure',
    title: 'Cloud & Infrastructure Security',
    summary:
      'Encryption of customer data, continuous monitoring and penetration testing, and incident ' +
      'response across the technology stack — the protect, detect, and respond layers of the ' +
      'dealership’s systems.',
    sections: [5, 9, 7],
    advisory: false,
  },
  {
    key: 'access_identity',
    title: 'Access & Identity Management',
    summary:
      'Who can reach customer NPI and how that access is controlled: multi-factor authentication, ' +
      'least-privilege access, privileged-activity monitoring, and the security awareness of the ' +
      'people who hold credentials.',
    sections: [4, 8],
    advisory: false,
  },
  {
    key: 'data_protection',
    title: 'Data Protection & Lifecycle',
    summary:
      'Knowing where customer NPI lives and governing it end to end: data inventory and ' +
      'classification, retention limits, and secure disposal.',
    sections: [3],
    advisory: false,
  },
  {
    key: 'risk_assessment',
    title: 'Risk Assessment & Governance',
    summary:
      'The written risk assessment that anchors the program, plus the Qualified Individual and ' +
      'governance accountable for it.',
    sections: [2, 1],
    advisory: false,
  },
  {
    key: 'vendor',
    title: 'Third-Party & Vendor Management',
    summary:
      'Oversight of service providers that touch customer NPI — contractual safeguards, ' +
      'assessment, and ongoing monitoring — including the DMS that concentrates the most NPI.',
    sections: [6],
    advisory: false,
  },
  {
    key: 'ai_emerging',
    title: 'AI & Emerging Technology',
    summary:
      'Expert advisory guidance on AI/ML and emerging technology exposure. No FTC Safeguards Rule ' +
      'element specifically governs AI today, so this domain is advisory — it carries no ' +
      'compliance score and no §314.4 determination.',
    sections: [],
    advisory: true,
  },
];

const INFRA_ASSET_TYPES = ['system', 'application', 'database', 'network', 'storage'];
const HIGH_CRITICALITY = ['high', 'critical'];
const HIGH_SEVERITY = ['high', 'critical'];
const OPEN_RISK_STATUSES = ['open', 'mitigating'];
const WEAK_TRANSPORT = ['none', 'unknown'];

function statusFromScore(score: number): DomainStatus {
  if (score < 40) return 'critical';
  if (score < 60) return 'weak';
  if (score < 80) return 'moderate';
  return 'strong';
}

export function domainStatusLabel(status: DomainStatus): string {
  switch (status) {
    case 'strong':
      return 'Strong';
    case 'moderate':
      return 'Moderate';
    case 'weak':
      return 'Weak';
    case 'critical':
      return 'Critical';
    case 'not_assessed':
      return 'Not assessed';
  }
}

/** Distinct in-scope citations for a set of sections, in catalog order. Grounded in the
 *  applicability-filtered catalog, so exempt requirements drop their citations. */
function citationsForSections(inScope: Requirement[], sections: number[]): string[] {
  const seen: string[] = [];
  for (const requirement of inScope) {
    if (!sections.includes(requirement.section)) continue;
    if (requirement.citation && !seen.includes(requirement.citation)) {
      seen.push(requirement.citation);
    }
  }
  return seen;
}

/** Count in-scope requirements whose section is in `sections`. */
function inScopeCount(inScope: Requirement[], sections: number[]): number {
  return inScope.filter((r) => sections.includes(r.section)).length;
}

function buildSignals(
  key: DomainKey,
  input: ArchitectureInput,
): DomainSignal[] {
  const assets = input.assets ?? [];
  const dataFlows = input.dataFlows ?? [];
  const risks = input.risks ?? [];
  const signals: DomainSignal[] = [];

  if (key === 'cloud_infrastructure') {
    const infra = assets.filter((a) => INFRA_ASSET_TYPES.includes(a.assetType));
    if (assets.length === 0) {
      signals.push({
        text: 'No assets are inventoried yet, so infrastructure exposure cannot be evaluated from the asset register.',
        grounding: 'assets',
      });
    } else {
      signals.push({
        text: `${infra.length} of ${assets.length} inventoried asset(s) are infrastructure (systems, applications, databases, networks, or storage).`,
        grounding: 'assets',
      });
      const npiInfra = infra.filter((a) => a.storesNpi).length;
      if (npiInfra > 0) {
        signals.push({
          text: `${npiInfra} infrastructure asset(s) are recorded as storing customer NPI.`,
          grounding: 'assets',
        });
      }
      const highCrit = infra.filter((a) => HIGH_CRITICALITY.includes(a.criticality)).length;
      if (highCrit > 0) {
        signals.push({
          text: `${highCrit} infrastructure asset(s) are rated high or critical criticality.`,
          grounding: 'assets',
        });
      }
    }
  }

  if (key === 'data_protection') {
    const npiAssets = assets.filter((a) => a.storesNpi).length;
    signals.push({
      text:
        npiAssets > 0
          ? `${npiAssets} inventoried asset(s) are recorded as storing customer NPI.`
          : 'No inventoried assets are marked as storing customer NPI — the data inventory may be incomplete.',
      grounding: 'assets',
    });
    if (dataFlows.length === 0) {
      signals.push({
        text: 'No data flows are mapped, so how customer NPI moves between systems is undocumented.',
        grounding: 'data_flows',
      });
    } else {
      signals.push({
        text: `${dataFlows.length} customer-NPI data flow(s) are mapped.`,
        grounding: 'data_flows',
      });
      const weak = dataFlows.filter((f) => WEAK_TRANSPORT.includes(f.transportEncryption)).length;
      if (weak > 0) {
        signals.push({
          text: `${weak} mapped data flow(s) use no or unknown transport encryption.`,
          grounding: 'data_flows',
        });
      }
    }
  }

  if (key === 'risk_assessment') {
    if (risks.length === 0) {
      signals.push({
        text: 'No risks are logged in the risk register yet.',
        grounding: 'risks',
      });
    } else {
      const open = risks.filter((r) => OPEN_RISK_STATUSES.includes(r.status)).length;
      const highSev = risks.filter((r) => r.severity != null && HIGH_SEVERITY.includes(r.severity)).length;
      signals.push({
        text: `${risks.length} risk(s) logged in the register — ${open} open/mitigating, ${highSev} high or critical severity.`,
        grounding: 'risks',
      });
    }
    signals.push({
      text: `${assets.length} asset(s) inventoried to scope the risk assessment.`,
      grounding: 'assets',
    });
  }

  if (key === 'vendor') {
    const dms = (input.dmsVendor ?? '').trim();
    signals.push({
      text: dms
        ? `Primary DMS vendor of record: ${dms}.`
        : 'No DMS vendor is recorded in the dealership profile.',
      grounding: 'vendor_profile',
    });
    const external = dataFlows.filter((f) => (f.externalParty ?? '').trim() !== '').length;
    if (external > 0) {
      signals.push({
        text: `${external} mapped data flow(s) send customer NPI to an external party.`,
        grounding: 'data_flows',
      });
    }
  }

  return signals;
}

/** Advisory, non-authoritative findings for the AI & Emerging Tech domain ONLY. Grounded in the
 *  vendor profile + data-flow signals. Deliberately contains NO §314.4 token so the domain is
 *  citation-free in both structure and prose. */
function buildAdvisoryFindings(input: ArchitectureInput): string[] {
  const dms = (input.dmsVendor ?? '').trim();
  const dataFlows = input.dataFlows ?? [];
  const external = dataFlows.filter((f) => (f.externalParty ?? '').trim() !== '').length;
  const findings: string[] = [];

  findings.push(
    dms
      ? `Your DMS platform (${dms}) may be adding AI/ML features such as automated credit decisioning, ` +
          'customer chat assistants, or marketing analytics. Confirm whether any of them process customer ' +
          'NPI, and fold that processing into your vendor risk assessment and contract review. Advisory ' +
          'guidance, not a compliance determination under the Safeguards Rule.'
      : 'If any tool that touches customer NPI adds AI/ML features (automated decisioning, chat assistants, ' +
          'analytics), confirm the processing and fold it into your vendor risk assessment. Advisory guidance, ' +
          'not a compliance determination under the Safeguards Rule.',
  );

  if (external > 0) {
    findings.push(
      `${external} mapped data flow(s) reach external parties; if any rely on AI-driven processing of ` +
        'customer NPI, ensure your third-party oversight and written risk assessment explicitly account for ' +
        'them. Advisory only.',
    );
  }

  findings.push(
    'No FTC Safeguards Rule element specifically governs AI/ML today. Treat these observations as expert ' +
      'advisory input to your risk assessment and vendor oversight — not a compliance score.',
  );

  return findings;
}

function buildNarrative(
  def: DomainDefinition,
  posture: DomainPosture | null,
  criticalGaps: DerivedGap[],
  gaps: DerivedGap[],
): string {
  if (def.advisory) {
    return (
      `${def.title} has no dedicated Safeguards Rule element. Treat the observations below as expert ` +
      'advisory input to your risk assessment and vendor oversight — not a compliance score.'
    );
  }
  if (!posture) {
    return `${def.title} has no in-scope requirements for this dealership (exempt under the §314.6 small-institution exemption).`;
  }
  const label = domainStatusLabel(posture.status).toLowerCase();
  const criticalPart =
    criticalGaps.length > 0
      ? `, with ${criticalGaps.length} critical gap${criticalGaps.length === 1 ? '' : 's'}`
      : '';
  const lead = criticalGaps[0] ?? gaps[0];
  const leadSentence = lead
    ? `Highest priority: ${lead.title} [${lead.citation}].`
    : 'Maintain the current controls and reassess after any material change.';
  return (
    `${def.title} is at ${posture.score}% — ${label}. ` +
    `${posture.confirmedControls} of ${posture.totalControls} in-scope safeguards are confirmed in place${criticalPart}. ` +
    leadSentence
  );
}

/**
 * Build the full, deterministic Security Architecture Assessment. Pure: same inputs -> byte-identical
 * output (no dates, no randomness, no I/O). Applicability-aware via getApplicability, so exempt
 * requirements drop out of every domain's posture, gaps, and citations consistently.
 */
export function buildSecurityArchitectureAssessment(
  input: ArchitectureInput,
): SecurityArchitectureAssessment {
  const applicability: Applicability = getApplicability({ consumerCount: input.consumerCount ?? null });
  const inScope = applicableRequirements(REQUIREMENT_CATALOG, applicability);
  const assessment = deriveAssessmentFromAnswers(inScope, input.answers);
  const sectionByNumber = new Map<number, DerivedSectionScore>(
    assessment.sections.map((s) => [s.section, s]),
  );

  const domains: ArchitectureDomain[] = DOMAIN_DEFINITIONS.map((def) => {
    if (def.advisory) {
      const advisoryFindings = buildAdvisoryFindings(input);
      return {
        key: def.key,
        title: def.title,
        summary: def.summary,
        advisory: true,
        sections: [],
        citations: [], // NEVER a fabricated citation for the AI domain
        posture: null, // NEVER a fabricated score for the AI domain
        gaps: [],
        criticalGaps: [],
        signals: buildSignals(def.key, input),
        advisoryFindings,
        narrative: buildNarrative(def, null, [], []),
      };
    }

    const gaps: DerivedGap[] = [];
    const criticalGaps: DerivedGap[] = [];
    let earnedPoints = 0;
    let maxPoints = 0;
    for (const sectionNumber of def.sections) {
      const section = sectionByNumber.get(sectionNumber);
      if (!section) continue; // fully exempt / no in-scope requirements
      earnedPoints += section.earnedPoints;
      maxPoints += section.maxPoints;
      for (const gap of section.gaps) gaps.push(gap);
      for (const gap of section.criticalGaps) criticalGaps.push(gap);
    }

    const totalControls = inScopeCount(inScope, def.sections);
    let posture: DomainPosture | null = null;
    if (totalControls > 0 && maxPoints > 0) {
      const score = Math.round((earnedPoints / maxPoints) * 100);
      posture = {
        score,
        status: statusFromScore(score),
        maxPoints,
        earnedPoints,
        totalControls,
        confirmedControls: totalControls - gaps.length,
      };
    }

    return {
      key: def.key,
      title: def.title,
      summary: def.summary,
      advisory: false,
      sections: def.sections,
      citations: citationsForSections(inScope, def.sections),
      posture,
      gaps,
      criticalGaps,
      signals: buildSignals(def.key, input),
      advisoryFindings: [],
      narrative: buildNarrative(def, posture, criticalGaps, gaps),
    };
  });

  return {
    overall: assessment.overall,
    riskLevel: assessment.riskLevel,
    domains,
    disclaimer: ASSESSMENT_DISCLAIMER,
    isExempt: applicability.isExemptUnder5000,
  };
}

/** Section number -> name/description, for the Written Risk Assessment layout. */
export function sectionMeta(sectionNumber: number): { name: string; description: string } {
  const section = SAFEGUARDS_SECTIONS.find((s) => s.number === sectionNumber);
  return { name: section?.name ?? `Section ${sectionNumber}`, description: section?.description ?? '' };
}
