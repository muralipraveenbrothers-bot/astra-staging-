// In-memory login lockout for vault-login, keyed by account+IP.
// 5 failures -> 5-minute lockout. Never sees or stores the PIN itself.

const MAX_FAILURES = 5;
const LOCKOUT_MS = 5 * 60_000;

interface Entry { failures: number; lockedUntil: number }

const attempts = new Map<string, Entry>();

function key(accountId: string, ip: string): string {
  return `${accountId}::${ip}`;
}

export const loginRateLimiter = {
  MAX_FAILURES,
  LOCKOUT_MS,
  /** Remaining lockout seconds, or 0 when the key is not locked. */
  lockedSeconds(accountId: string, ip: string): number {
    const entry = attempts.get(key(accountId, ip));
    if (!entry) return 0;
    const remaining = entry.lockedUntil - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / 1000);
  },
  recordFailure(accountId: string, ip: string): { locked: boolean; failures: number } {
    const k = key(accountId, ip);
    const entry = attempts.get(k) ?? { failures: 0, lockedUntil: 0 };
    if (entry.lockedUntil > Date.now()) return { locked: true, failures: entry.failures };
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      entry.lockedUntil = Date.now() + LOCKOUT_MS;
      entry.failures = 0;
      attempts.set(k, entry);
      return { locked: true, failures: MAX_FAILURES };
    }
    attempts.set(k, entry);
    return { locked: false, failures: entry.failures };
  },
  recordSuccess(accountId: string, ip: string): void {
    attempts.delete(key(accountId, ip));
  },
  reset(): void {
    attempts.clear();
  },
};
