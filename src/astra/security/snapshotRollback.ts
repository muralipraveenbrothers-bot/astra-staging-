const snapshots = new Map<string, { snapshotId: string; files: string[]; fileHashes: Record<string, string> }>();
export function createSnapshot(input: { sandboxId: string; createdBy: string; description: string; files: string[]; fileHashes: Record<string, string> }) {
  if (!input.files.length) return { ok: false, errors: ["snapshot needs at least one file"] };
  const snapshot = { snapshotId: `SNP-${Math.random().toString(36).slice(2)}`, files: [...input.files], fileHashes: { ...input.fileHashes } };
  snapshots.set(snapshot.snapshotId, snapshot);
  return { ok: true, snapshot };
}
export function verifySnapshotIntegrity(snapshot: { files: string[]; fileHashes: Record<string, string> }, current: Record<string, string>) {
  const mismatches = snapshot.files.filter((f) => snapshot.fileHashes[f] !== current[f]);
  return { ok: mismatches.length === 0, mismatches };
}
export function rollbackToSnapshot(snapshotId: string) {
  const snapshot = snapshots.get(snapshotId);
  return snapshot ? { ok: true, restoredFiles: snapshot.files } : { ok: false, errors: ["unknown snapshot"] };
}
