import { describe, it, expect } from 'vitest';
import {
  deriveEvidenceStorageKey,
  isEvidenceKeyInDealershipScope,
  sanitizeEvidenceFileName,
} from '@shared/evidence-storage';

describe('sanitizeEvidenceFileName', () => {
  it('keeps a plain filename intact', () => {
    expect(sanitizeEvidenceFileName('mfa-screenshot.png')).toBe('mfa-screenshot.png');
  });

  it('strips any directory portion, keeping only the basename', () => {
    expect(sanitizeEvidenceFileName('/etc/passwd')).toBe('passwd');
    expect(sanitizeEvidenceFileName('a/b/c/report.pdf')).toBe('report.pdf');
    expect(sanitizeEvidenceFileName('C:\\Users\\evil\\x.docx')).toBe('x.docx');
  });

  it('defuses path-traversal tokens (leading dots never survive)', () => {
    // basename of `../../secret` is `secret`; a bare `..` sanitizes to a non-traversal token.
    expect(sanitizeEvidenceFileName('../../secret')).toBe('secret');
    expect(sanitizeEvidenceFileName('..')).toBe('file');
    expect(sanitizeEvidenceFileName('...')).toBe('file');
    expect(sanitizeEvidenceFileName('.hidden')).toBe('hidden');
  });

  it('collapses unsafe characters to underscores and never emits a slash', () => {
    const out = sanitizeEvidenceFileName('my file (v2)!.png');
    expect(out).toBe('my_file__v2__.png');
    expect(out).not.toMatch(/[/\\]/);
  });

  it('falls back to "file" when nothing safe remains', () => {
    expect(sanitizeEvidenceFileName('')).toBe('file');
    expect(sanitizeEvidenceFileName('///')).toBe('file');
  });

  it('caps very long names', () => {
    const long = 'a'.repeat(500) + '.png';
    expect(sanitizeEvidenceFileName(long).length).toBeLessThanOrEqual(128);
  });
});

describe('deriveEvidenceStorageKey', () => {
  it('scopes the key to the dealership folder with an injected random id', () => {
    expect(deriveEvidenceStorageKey(42, 'proof.pdf', 'rand123')).toBe(
      'evidence/42/rand123-proof.pdf',
    );
  });

  it('confines a malicious filename to the tenant folder (no traversal, no cross-tenant write)', () => {
    const key = deriveEvidenceStorageKey(7, '../../9/evil.sh', 'r');
    expect(key).toBe('evidence/7/r-evil.sh');
    // The dealership segment is fixed and the filename segment holds no slashes.
    expect(key.startsWith('evidence/7/')).toBe(true);
    expect(key.split('/')).toHaveLength(3);
  });

  it('produces a unique key per call in production (uuid default)', () => {
    const a = deriveEvidenceStorageKey(1, 'x.png');
    const b = deriveEvidenceStorageKey(1, 'x.png');
    expect(a).not.toBe(b);
    expect(a.startsWith('evidence/1/')).toBe(true);
  });
});

describe('isEvidenceKeyInDealershipScope (evidence.create storagePath guard)', () => {
  it('accepts a path inside the caller dealership folder', () => {
    expect(isEvidenceKeyInDealershipScope(42, 'evidence/42/abc-proof.pdf')).toBe(true);
    // A server-derived key is always accepted by construction.
    expect(isEvidenceKeyInDealershipScope(42, deriveEvidenceStorageKey(42, 'proof.pdf'))).toBe(true);
  });

  it("rejects a path pointing at another dealership's folder", () => {
    expect(isEvidenceKeyInDealershipScope(42, 'evidence/9/steal.pdf')).toBe(false);
    expect(isEvidenceKeyInDealershipScope(1, 'evidence/12/x.pdf')).toBe(false); // prefix-collision guard
  });

  it('rejects paths outside the evidence bucket or with no dealership segment', () => {
    expect(isEvidenceKeyInDealershipScope(42, 'documents/42/wisp.pdf')).toBe(false);
    expect(isEvidenceKeyInDealershipScope(42, '../evidence/42/x.pdf')).toBe(false);
    expect(isEvidenceKeyInDealershipScope(42, 'evidence/42x/x.pdf')).toBe(false);
    expect(isEvidenceKeyInDealershipScope(42, '')).toBe(false);
  });
});
