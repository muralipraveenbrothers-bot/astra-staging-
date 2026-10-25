export function makeArtifact(input: { kind: string; requestId: string; producedBy: string; payload: Record<string, unknown>; recomputable?: boolean; sourceRefIds: string[] }) {
  const errors: string[] = [];
  if (Object.keys(input.payload).length === 0) errors.push("payload required");
  if (input.sourceRefIds.length === 0) errors.push("provenance required");
  if (errors.length) return { ok: false, errors };
  return { ok: true, artifact: { ...input, artifactId: `ART-${Date.now()}`, createdAt: new Date().toISOString() } };
}

export function verifyArtifact(artifact: { payload: Record<string, unknown> }, recompute: (payload: Record<string, unknown>) => unknown) {
  const expected = recompute(artifact.payload);
  return expected === artifact.payload.output ? { ok: true, mismatches: [] } : { ok: false, mismatches: ["RECOMPUTE_MISMATCH"] };
}
