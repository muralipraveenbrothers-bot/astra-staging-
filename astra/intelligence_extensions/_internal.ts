/**
 * ASTRA AI — Intelligence Extensions: internal env helper
 * ============================================================================
 * Tiny replica of server/ai/loadEnv.firstEnv so the extension layer does not
 * depend on cross-boundary relative imports. Kept in sync intentionally.
 */
export function firstEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}