export function verifyEffect(intended: Record<string, unknown>, actual: Record<string, unknown>): { ok: boolean; failed: boolean; reason?: string } {
  for (const [key, value] of Object.entries(intended)) {
    if (actual[key] !== value) return { ok: false, failed: true, reason: key + " mismatch" };
  }
  return { ok: true, failed: false };
}
