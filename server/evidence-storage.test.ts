import { describe, it, expect } from 'vitest';
import {
  deriveEvidenceStorageKey,
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
