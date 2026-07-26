import { describe, it, expect } from 'vitest';
import {
  buildSecurityArchitectureAssessment,
  DOMAIN_DEFINITIONS,
  ASSESSMENT_DISCLAIMER,
  type AssetLike,
  type DataFlowLike,
  type RiskLike,
} from '@shared/security-architecture';
import { SAFEGUARDS_SECTIONS } from '@shared/safeguards-questions';
import type { AnswerValue } from '@shared/controls';

function allAnswers(value: AnswerValue): Record<string, AnswerValue> {
  const map: Record<string, AnswerValue> = {};
  for (const section of SAFEGUARDS_SECTIONS) {
    for (const q of section.questions) map[q.id] = value;
  }
  return map;
}

const SAMPLE_ASSETS: AssetLike[] = [
  { assetType: 'database', storesNpi: true, criticality: 'critical' },
  { assetType: 'system', storesNpi: true, criticality: 'high' },
  { assetType: 'device', storesNpi: false, criticality: 'low' },
];
const SAMPLE_FLOWS: DataFlowLike[] = [
  { externalParty: 'CDK Global', transportEncryption: 'tls', direction: 'outbound' },
  { externalParty: '', transportEncryption: 'none', direction: 'internal' },
];
const SAMPLE_RISKS: RiskLike[] = [
  { severity: 'high', status: 'open' },
  { severity: 'low', status: 'closed' },
];

describe('buildSecurityArchitectureAssessment — domain mapping', () => {
  it('partitions all nine Safeguards sections across the scored domains with no loss or overlap', () => {
    const scored = DOMAIN_DEFINITIONS.filter((d) => !d.advisory);
    const sections = scored.flatMap((d) => d.sections).sort((a, b) => a - b);
    // Every section 1-9 present exactly once.
    expect(sections).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // The advisory domain owns no section (so it can carry no score/citation).
    const advisory = DOMAIN_DEFINITIONS.filter((d) => d.advisory);
    expect(advisory).toHaveLength(1);
    expect(advisory[0].sections).toEqual([]);
  });

  it('produces one domain per definition, in definition order', () => {
    const a = buildSecurityArchitectureAssessment({ answers: {} });
    expect(a.domains.map((d) => d.key)).toEqual(DOMAIN_DEFINITIONS.map((d) => d.key));
  });

  it('embeds the mandatory disclaimer', () => {
    const a = buildSecurityArchitectureAssessment({ answers: {} });
    expect(a.disclaimer).toBe(ASSESSMENT_DISCLAIMER);
    expect(a.disclaimer).toMatch(/not legal or professional security advice/i);
  });
});

describe('buildSecurityArchitectureAssessment — grounded posture', () => {
  it('scores every scored domain 100% when all answers are yes', () => {
    const a = buildSecurityArchitectureAssessment({ answers: allAnswers('yes') });
    expect(a.overall).toBe(100);
    for (const domain of a.domains) {
      if (domain.advisory) continue;
      expect(domain.posture).not.toBeNull();
      expect(domain.posture!.score).toBe(100);
      expect(domain.posture!.status).toBe('strong');
      expect(domain.gaps).toHaveLength(0);
    }
  });

  it('surfaces grounded gaps (citation + triggering answer) when all answers are no', () => {
    const a = buildSecurityArchitectureAssessment({ answers: allAnswers('no') });
    expect(a.overall).toBe(0);
    const scored = a.domains.filter((d) => !d.advisory);
    // Every scored domain has open gaps, each carrying a §314.4 citation + the triggering answer.
    for (const domain of scored) {
      expect(domain.gaps.length).toBeGreaterThan(0);
      for (const gap of domain.gaps) {
        expect(gap.citation).toMatch(/^§314\.4/);
        expect(gap.status).toBe('not_implemented');
      }
    }
    // At least one domain carries a critical gap.
    expect(scored.some((d) => d.criticalGaps.length > 0)).toBe(true);
  });

  it('is deterministic — identical inputs yield byte-identical output', () => {
    const input = {
      answers: allAnswers('partial'),
      assets: SAMPLE_ASSETS,
      dataFlows: SAMPLE_FLOWS,
      risks: SAMPLE_RISKS,
      dmsVendor: 'CDK',
      consumerCount: 20000,
    };
    const a = buildSecurityArchitectureAssessment(input);
    const b = buildSecurityArchitectureAssessment(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('buildSecurityArchitectureAssessment — AI & Emerging Tech is advisory only', () => {
  it('carries no fabricated §314.4 citation and no score', () => {
    const a = buildSecurityArchitectureAssessment({
      answers: allAnswers('no'),
      dmsVendor: 'CDK Global',
      dataFlows: SAMPLE_FLOWS,
    });
    const ai = a.domains.find((d) => d.key === 'ai_emerging')!;
    expect(ai.advisory).toBe(true);
    expect(ai.citations).toEqual([]); // never a fabricated citation
    expect(ai.posture).toBeNull(); // never a fabricated score
    expect(ai.sections).toEqual([]);
    expect(ai.gaps).toEqual([]);
    // Advisory findings exist, are grounded in the vendor/data signals, and never assert a citation.
    expect(ai.advisoryFindings.length).toBeGreaterThan(0);
    for (const finding of ai.advisoryFindings) {
      expect(finding).not.toMatch(/§314\.4/);
    }
    expect(ai.advisoryFindings.join(' ')).toContain('CDK Global');
  });
});

describe('buildSecurityArchitectureAssessment — applicability-aware (§314.6 exemption)', () => {
  it('drops exempt requirements from posture, gaps, and citations for a small institution', () => {
    const exempt = buildSecurityArchitectureAssessment({
      answers: allAnswers('yes'),
      consumerCount: 100, // below the 5,000 threshold
    });
    const notExempt = buildSecurityArchitectureAssessment({
      answers: allAnswers('yes'),
      consumerCount: 20000,
    });
    expect(exempt.isExempt).toBe(true);
    expect(notExempt.isExempt).toBe(false);

    // Risk Assessment domain: (b)(1) is exempt, (b)(2) is not.
    const riskExempt = exempt.domains.find((d) => d.key === 'risk_assessment')!;
    expect(riskExempt.citations).not.toContain('§314.4(b)(1)');
    expect(riskExempt.citations).toContain('§314.4(b)(2)');

    // Cloud & Infrastructure: (d)(2) and the whole (h) incident-response element are exempt.
    const cloudExempt = exempt.domains.find((d) => d.key === 'cloud_infrastructure')!;
    expect(cloudExempt.citations).not.toContain('§314.4(d)(2)');
    expect(cloudExempt.citations.some((c) => c.startsWith('§314.4(h)'))).toBe(false);
    expect(cloudExempt.citations).toContain('§314.4(c)(3)'); // encryption stays in scope

    // The exemption strictly shrinks the in-scope requirement count.
    const cloudFull = notExempt.domains.find((d) => d.key === 'cloud_infrastructure')!;
    expect(cloudExempt.posture!.totalControls).toBeLessThan(cloudFull.posture!.totalControls);
  });
});

describe('buildSecurityArchitectureAssessment — entity grounding', () => {
  it('grounds domain signals in the provided assets, data flows, risks, and vendor profile', () => {
    const a = buildSecurityArchitectureAssessment({
      answers: allAnswers('yes'),
      assets: SAMPLE_ASSETS,
      dataFlows: SAMPLE_FLOWS,
      risks: SAMPLE_RISKS,
      dmsVendor: 'Reynolds & Reynolds',
    });

    const data = a.domains.find((d) => d.key === 'data_protection')!;
    // 2 of 3 sample assets store NPI.
    expect(data.signals.some((s) => s.text.includes('2') && s.grounding === 'assets')).toBe(true);
    // 1 of 2 flows uses no/unknown transport encryption.
    expect(data.signals.some((s) => s.text.includes('no or unknown transport') && s.grounding === 'data_flows')).toBe(true);

    const vendor = a.domains.find((d) => d.key === 'vendor')!;
    expect(vendor.signals.some((s) => s.text.includes('Reynolds & Reynolds') && s.grounding === 'vendor_profile')).toBe(true);

    const risk = a.domains.find((d) => d.key === 'risk_assessment')!;
    expect(risk.signals.some((s) => s.grounding === 'risks')).toBe(true);
  });

  it('handles an empty inventory without inventing findings', () => {
    const a = buildSecurityArchitectureAssessment({ answers: allAnswers('yes') });
    const data = a.domains.find((d) => d.key === 'data_protection')!;
    // Signals note the absence rather than fabricate counts.
    expect(data.signals.some((s) => /No data flows are mapped/i.test(s.text))).toBe(true);
  });
});
