import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginRateLimiter } from "./loginRateLimiter";

beforeEach(() => {
  loginRateLimiter.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loginRateLimiter", () => {
  it("does not lock before the failure threshold", () => {
    for (let i = 0; i < loginRateLimiter.MAX_FAILURES - 1; i++) {
      const outcome = loginRateLimiter.recordFailure("reception", "10.0.0.9");
      expect(outcome.locked).toBe(false);
    }
    expect(loginRateLimiter.lockedSeconds("reception", "10.0.0.9")).toBe(0);
  });

  it("locks for 5 minutes on the 5th failure (6th attempt sees the lockout)", () => {
    for (let i = 0; i < loginRateLimiter.MAX_FAILURES; i++) {
      loginRateLimiter.recordFailure("reception", "10.0.0.9");
    }
    const seconds = loginRateLimiter.lockedSeconds("reception", "10.0.0.9");
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(loginRateLimiter.LOCKOUT_MS / 1000);
  });

  it("releases the lockout after 5 minutes so the correct PIN works again", () => {
    for (let i = 0; i < loginRateLimiter.MAX_FAILURES; i++) {
      loginRateLimiter.recordFailure("billing", "10.0.0.9");
    }
    expect(loginRateLimiter.lockedSeconds("billing", "10.0.0.9")).toBeGreaterThan(0);

    // Mocked clock: jump past the lockout window.
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z").getTime() + loginRateLimiter.LOCKOUT_MS + 1000);
    expect(loginRateLimiter.lockedSeconds("billing", "10.0.0.9")).toBe(0);

    // Correct credentials then succeed and clear the counter.
    loginRateLimiter.recordSuccess("billing", "10.0.0.9");
    expect(loginRateLimiter.recordFailure("billing", "10.0.0.9").failures).toBe(1);
  });

  it("tracks failures per account+IP", () => {
    loginRateLimiter.recordFailure("reception", "10.0.0.9");
    loginRateLimiter.recordFailure("reception", "10.0.0.9");
    loginRateLimiter.recordFailure("lab", "10.0.0.9");
    expect(loginRateLimiter.recordFailure("reception", "10.0.0.9").failures).toBe(3);
    expect(loginRateLimiter.recordFailure("lab", "10.0.0.9").failures).toBe(2);
  });
});
