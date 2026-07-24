// Evidence storage-key derivation (PRD #31 upload path).
//
// Pure and dependency-free (mirrors shared/task-derivation.ts): the ONE place the object key
// for an evidence upload is built. The key is ALWAYS server-derived from the resolved tenant
// scope — the caller (evidence.getUploadUrl, both runtimes) passes the dealershipId from the
// session, never a client value. A client only ever supplies the display `fileName`, which is
// reduced here to a single safe path segment so it can neither traverse out of the dealer's
// folder (`../`, absolute paths, backslashes) nor collide across tenants. The random component
// keeps two uploads of the same filename distinct.

/** The single object-path segment a client-supplied file name is reduced to. Strips any
 *  directory portion (only the basename survives), then keeps ASCII word chars / dot / dash and
 *  collapses everything else to `_`. Leading dots are stripped so a name can never become `..`
 *  or a hidden traversal token; the result is capped and falls back to `file` when empty. The
 *  output NEVER contains `/` or `\`, so it cannot widen the derived key's path. */
export function sanitizeEvidenceFileName(fileName: string): string {
  const basename = String(fileName ?? '').split(/[/\\]/).pop() ?? '';
  const cleaned = basename
    .replace(/[^A-Za-z0-9._-]/g, '_') // only safe path chars survive
    .replace(/^\.+/, '') // no leading dots -> can never be `.`/`..`/hidden traversal
    .slice(0, 128);
  return cleaned.length > 0 ? cleaned : 'file';
}

/**
 * Build the tenant-scoped storage key for an evidence upload inside the private `evidence`
 * bucket: `evidence/<dealershipId>/<random>-<sanitized filename>`. `dealershipId` comes from the
 * server-resolved tenant scope and the filename is sanitized to a bare segment, so the key is
 * always confined to the caller's own folder. `randomId` is injected (defaulting to a UUID) so
 * the function stays deterministic under test while producing unique keys in production.
 */
export function deriveEvidenceStorageKey(
  dealershipId: number,
  fileName: string,
  randomId: string = crypto.randomUUID(),
): string {
  return `evidence/${dealershipId}/${randomId}-${sanitizeEvidenceFileName(fileName)}`;
}
