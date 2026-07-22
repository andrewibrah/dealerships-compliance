import { describe, it, expect, vi } from 'vitest';
import {
  AUDIT_ACTIONS,
  buildAuditRecord,
  writeAuditSafely,
  isNewLoginSession,
  LOGIN_SESSION_GAP_MS,
  type AuditRecord,
  type AuditEventInput,
} from '@shared/audit';

describe('buildAuditRecord', () => {
  it('normalizes a full event into the insert payload', () => {
    const rec = buildAuditRecord({
      action: AUDIT_ACTIONS.complianceSaveSection,
      actor: { userId: 'u-1', email: '  QI@Dealer.COM ' },
      entityType: 'compliance_answer',
      entityId: 3,
      dealershipId: 42,
      metadata: { section: 3 },
    });
    expect(rec).toEqual<AuditRecord>({
      actorUserId: 'u-1',
      actorEmail: 'qi@dealer.com', // trimmed + lowercased to match users.email
      action: 'compliance.save_section',
      entityType: 'compliance_answer',
      entityId: '3', // coerced to text
      dealershipId: 42,
      metadata: { section: 3 },
    });
  });

  it('defaults missing optionals and tolerates null actor/entity', () => {
    const rec = buildAuditRecord({
      action: AUDIT_ACTIONS.authLogout,
      actor: { userId: null, email: null },
    });
    expect(rec).toEqual<AuditRecord>({
      actorUserId: null,
      actorEmail: '',
      action: 'auth.logout',
      entityType: '',
      entityId: '',
      dealershipId: null,
      metadata: {},
    });
  });

  it('coerces a null entityId to empty string, not the literal "null"', () => {
    const rec = buildAuditRecord({
      action: AUDIT_ACTIONS.authLogin,
      actor: { userId: 'u-9', email: 'a@b.com' },
      entityId: null,
    });
    expect(rec.entityId).toBe('');
  });
});

describe('writeAuditSafely', () => {
  it('builds the record and passes it to the insert fn', async () => {
    const insert = vi.fn(async (_r: AuditRecord) => {});
    const event: AuditEventInput = {
      action: AUDIT_ACTIONS.dealershipCreate,
      actor: { userId: 'u-1', email: 'a@b.com' },
      entityId: 7,
      dealershipId: 7,
    };
    await writeAuditSafely(insert, event);
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0][0]).toMatchObject({ action: 'dealership.create', entityId: '7', dealershipId: 7 });
  });

  it('is fail-open: swallows insert errors and logs them without throwing', async () => {
    const insert = vi.fn(async (_r: AuditRecord) => {
      throw new Error('db down');
    });
    const logError = vi.fn();
    await expect(
      writeAuditSafely(insert, { action: AUDIT_ACTIONS.authLogin, actor: { userId: 'u', email: 'a@b.com' } }, logError),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledOnce();
    expect(logError.mock.calls[0][1]).toMatchObject({ action: 'auth.login', error: 'db down' });
  });
});

describe('isNewLoginSession', () => {
  const now = new Date('2026-07-21T12:00:00.000Z');

  it('treats a null/undefined prior sign-in as a new session (first login)', () => {
    expect(isNewLoginSession(null, now)).toBe(true);
    expect(isNewLoginSession(undefined, now)).toBe(true);
  });

  it('treats an unparseable timestamp as a new session (fail toward recording)', () => {
    expect(isNewLoginSession('not-a-date', now)).toBe(true);
  });

  it('is false within the inactivity gap and true beyond it', () => {
    const justInside = new Date(now.getTime() - (LOGIN_SESSION_GAP_MS - 1000));
    const justOutside = new Date(now.getTime() - LOGIN_SESSION_GAP_MS);
    expect(isNewLoginSession(justInside, now)).toBe(false);
    expect(isNewLoginSession(justOutside, now)).toBe(true);
  });

  it('accepts ISO strings as well as Date objects', () => {
    const recent = new Date(now.getTime() - 60_000).toISOString();
    expect(isNewLoginSession(recent, now)).toBe(false);
  });
});

describe('AUDIT_ACTIONS vocabulary', () => {
  it('has unique, dotted, stable action strings', () => {
    const values = Object.values(AUDIT_ACTIONS);
    expect(new Set(values).size).toBe(values.length);
    // entity.action, both segments snake_case (the entity may be multi-word, e.g. data_flow).
    for (const v of values) expect(v).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  // Object-model batch 2 (evidence/task/policy). Pins the exact strings so a rename/removal
  // of one of these persisted values is caught (they are append-mostly by contract).
  it('includes the batch-2 object-model actions with stable values', () => {
    expect(AUDIT_ACTIONS.evidenceCreate).toBe('evidence.create');
    expect(AUDIT_ACTIONS.evidenceLinkControl).toBe('evidence.link_control');
    expect(AUDIT_ACTIONS.taskCreate).toBe('task.create');
    expect(AUDIT_ACTIONS.taskUpdate).toBe('task.update');
    expect(AUDIT_ACTIONS.policyCreate).toBe('policy.create');
    expect(AUDIT_ACTIONS.policyUpdate).toBe('policy.update');
  });

  // Object-model batch 3 (asset/data_flow/attestation) — completes the 9 PRD #3 entities.
  it('includes the batch-3 object-model actions with stable values', () => {
    expect(AUDIT_ACTIONS.assetCreate).toBe('asset.create');
    expect(AUDIT_ACTIONS.assetUpdate).toBe('asset.update');
    expect(AUDIT_ACTIONS.dataFlowCreate).toBe('data_flow.create');
    expect(AUDIT_ACTIONS.dataFlowUpdate).toBe('data_flow.update');
    expect(AUDIT_ACTIONS.attestationCreate).toBe('attestation.create');
    expect(AUDIT_ACTIONS.attestationUpdate).toBe('attestation.update');
  });
});
