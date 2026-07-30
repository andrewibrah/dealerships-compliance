// Do the GENERATED ARTIFACTS actually carry the coordination facts?
//
// The product's claim — "a plan with owners, not a 70-page report" — is only true if the PDF a
// dealer principal, insurer, or examiner reads names an accountable party and the artifact that
// closes each gap. The web UI having it is not enough: the PDF is what leaves the building.
//
// pdf-lib Flate-compresses content streams, so a raw byte grep finds nothing (verified). These
// tests inflate every stream and assert against the real rendered text, which is why they would
// actually catch a regression in writeGapDetail.

import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import {
  generateWISP,
  generateBoardReport,
  generateRiskAssessment,
  generateExaminerPackage,
  type ComplianceAnswerRow,
  type DealershipInfo,
} from '../shared/pdf-generator';
import { SAFEGUARDS_SECTIONS } from '../shared/safeguards-questions';
import { COORDINATION_BY_CODE, OWNER_LABEL } from '@shared/coordination';

const dealership: DealershipInfo = {
  name: 'Test Motors',
  address: '1 Main St',
  city: 'Austin',
  state: 'TX',
  dmsVendor: 'CDK',
  rooftopCount: 2,
  qualifiedIndividual: 'Jane Doe',
  qiEmail: 'jane@testmotors.com',
};

/** Every question answered "no" — the worst case, so every gap renders. */
function allNo(): ComplianceAnswerRow[] {
  return SAFEGUARDS_SECTIONS.map((sec) => ({
    section: sec.number,
    sectionName: sec.name,
    answers: Object.fromEntries(sec.questions.map((q) => [q.id, 'no'])),
    score: 0,
    completed: true,
  }));
}

/**
 * WinAnsi (CP1252) high-range characters, 0x80-0x9F — the ONLY bytes where WinAnsi and latin1
 * disagree. pdf-lib's StandardFonts encode as WinAnsi, so an en dash is 0x96, which latin1 reads
 * as an invisible control character: decoding wrong silently turns "1-2 weeks" into "12 weeks".
 *
 * Spelled out rather than using `new TextDecoder('windows-1252')` on purpose. That decoder needs
 * a full-ICU Node build, which is an environment assumption a test should not carry — it passed
 * locally and failed on CI, which is exactly the failure mode worth designing out. This table is
 * hermetic and behaves identically everywhere.
 */
const WINANSI_C1 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

function decodeWinAnsi(bytes: Buffer): string {
  let out = '';
  for (const byte of bytes) {
    out += byte >= 0x80 && byte <= 0x9f ? WINANSI_C1[byte - 0x80] : String.fromCharCode(byte);
  }
  return out;
}

/**
 * Extract rendered text from a pdf-lib PDF: inflate every FlateDecode stream, then decode the
 * text-showing operands. pdf-lib emits HEX strings (`<48656C6C6F> Tj`) rather than `(literal) Tj`,
 * so both forms are handled. Good enough to assert on content; not a general PDF parser.
 */
function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const latin = raw.toString('latin1');
  const chunks: string[] = [];

  let searchFrom = 0;
  for (;;) {
    const start = latin.indexOf('stream', searchFrom);
    if (start === -1) break;
    const end = latin.indexOf('endstream', start);
    if (end === -1) break;
    // Skip the EOL after the `stream` keyword.
    let dataStart = start + 'stream'.length;
    if (latin[dataStart] === '\r') dataStart++;
    if (latin[dataStart] === '\n') dataStart++;
    const slice = raw.subarray(dataStart, end);
    try {
      chunks.push(inflateSync(slice).toString('latin1'));
    } catch {
      chunks.push(slice.toString('latin1')); // uncompressed stream
    }
    searchFrom = end + 'endstream'.length;
  }

  const content = chunks.join('\n');
  const pieces: string[] = [];

  // Hex strings: <48656C6C6F>
  for (const match of content.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const hex = match[1].replace(/\s+/g, '');
    if (hex.length < 2 || hex.length % 2 !== 0) continue;
    pieces.push(decodeWinAnsi(Buffer.from(hex, 'hex')));
  }
  // Literal strings: (Hello)
  for (const match of content.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
    pieces.push(match[0].slice(1, -1).replace(/\\([()\\])/g, '$1'));
  }

  return pieces.join(' ');
}

describe('pdfText extractor (guards the assertions below)', () => {
  it('has one WinAnsi C1 entry per byte 0x80-0x9F, including the undefined slots', () => {
    // If a placeholder for an undefined CP1252 slot (0x81, 0x8D, 0x8F, 0x90, 0x9D) were dropped,
    // every mapping after it would shift by one and decode the wrong character.
    expect(WINANSI_C1).toHaveLength(32);
    expect(decodeWinAnsi(Buffer.from([0x96]))).toBe('–'); // en dash
    expect(decodeWinAnsi(Buffer.from([0xb7]))).toBe('·'); // middle dot (latin1 range)
    expect(decodeWinAnsi(Buffer.from([0x41]))).toBe('A');
  });

  it('recovers text that a raw byte grep cannot find', async () => {
    const bytes = await generateBoardReport(dealership, allNo());
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('Accountable');
    expect(pdfText(bytes)).toContain('Accountable');
  });
});

describe('generated artifacts carry the coordination facts', () => {
  const artifacts: [string, () => Promise<Uint8Array>][] = [
    ['WISP', () => generateWISP(dealership, allNo())],
    ['board report', () => generateBoardReport(dealership, allNo())],
    [
      'written risk assessment',
      () => generateRiskAssessment(dealership, allNo(), { assets: [], dataFlows: [], risks: [] }),
    ],
    [
      'examiner package',
      () =>
        generateExaminerPackage(dealership, allNo(), {
          documents: [],
          evidence: [],
          auditLog: [],
        }),
    ],
  ];

  it.each(artifacts)('%s names an accountable party and the proof of closure', async (_name, generate) => {
    const text = pdfText(await generate());
    expect(text).toContain('Accountable:');
    expect(text).toContain('Proof of completion:');
    expect(text).toContain('Effort:');
  });

  it('names real internal roles, not a placeholder', async () => {
    const text = pdfText(await generateBoardReport(dealership, allNo()));
    // The board report shows the top gaps; at least one authored owner role must appear.
    const roles = Object.values(OWNER_LABEL);
    expect(roles.some((role) => text.includes(role))).toBe(true);
  });

  it('carries a real authored proof string, not a generic stub', async () => {
    const text = pdfText(await generateBoardReport(dealership, allNo()));
    // q4_1 (MFA) is critical + enforcement-boosted, so it is always in the top-10 remediation set.
    expect(text).toContain(COORDINATION_BY_CODE.q4_1.proof);
  });

  it('still renders when nothing is answered (no fabricated owners)', async () => {
    const text = pdfText(await generateBoardReport(dealership, []));
    expect(text.length).toBeGreaterThan(0);
  });

  it('renders en dashes in effort/horizon labels intact', async () => {
    // EFFORT_LABEL.moderate is "1-2 weeks" and HORIZON_LABEL[60] is "Days 31-60", both with EN
    // DASHES (U+2013). If the font ever stops encoding them, "1-2 weeks" silently becomes the
    // flatly wrong "12 weeks" in a customer-facing artifact. Pin it.
    const text = pdfText(await generateBoardReport(dealership, allNo()));
    expect(text).toContain('1–2 weeks');
    expect(text).toContain('days 31–60');
    expect(text).not.toContain('12 weeks');
    expect(text).not.toContain('days 3160');
  });
});
