/**
 * ASTRA AI — Circuit breaker tests (Phase 2 §26 / §36)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  breakerState, canAttempt, recordFailure, recordSuccess, resetBreakers, breakerSnapshot,
} from "./circuitBreaker";

let now = 0;
const clock = () => now;

beforeEach(() => {
  now = 0;
  resetBreakers();
});
afterEach(() => resetBreakers());

describe("provider circuit breaker", () => {
  it("opens after threshold failures and blocks attempts", () => {
    recordFailure("p1", { failureThreshold: 2, cooldownMs: 1000, now: clock });
    expect(canAttempt("p1", { failureThreshold: 2, cooldownMs: 1000, now: clock })).toBe(true);
    recordFailure("p1", { failureThreshold: 2, cooldownMs: 1000, now: clock });
    expect(breakerState("p1", { failureThreshold: 2, cooldownMs: 1000, now: clock })).toBe("open");
    expect(canAttempt("p1", { failureThreshold: 2, cooldownMs: 1000, now: clock })).toBe(false);
  });

  it("recovers via half-open after the cooldown", () => {
    recordFailure("p2", { failureThreshold: 1, cooldownMs: 5000, now: clock });
    expect(canAttempt("p2", { failureThreshold: 1, cooldownMs: 5000, now: clock })).toBe(false);
    now = 6000;
    expect(breakerState("p2", { failureThreshold: 1, cooldownMs: 5000, now: clock })).toBe("half-open");
    expect(canAttempt("p2", { failureThreshold: 1, cooldownMs: 5000, now: clock })).toBe(true);
    recordSuccess("p2");
    expect(breakerState("p2")).toBe("closed");
  });

  it("a success closes an open breaker and resets the failure count", () => {
    recordFailure("p3", { failureThreshold: 2, cooldownMs: 1000, now: clock });
    recordSuccess("p3");
    recordFailure("p3", { failureThreshold: 2, cooldownMs: 1000, now: clock });
    expect(breakerState("p3", { failureThreshold: 2, cooldownMs: 1000, now: clock })).toBe("closed");
  });

  it("snapshot reveals open providers without secrets", () => {
    recordFailure("p4", { failureThreshold: 1, cooldownMs: 1000, now: clock });
    const snap = breakerSnapshot();
    expect(snap.p4.state).toBe("open");
    expect(JSON.stringify(snap)).not.toMatch(/key|secret|token/i);
  });
});

describe("fallback (no fake success)", () => {
  it("open breaker routes elsewhere and never reports readiness", async () => {
    recordFailure("p5", { failureThreshold: 1, cooldownMs: 10000, now: clock });
    expect(canAttempt("p5", { failureThreshold: 1, cooldownMs: 10000, now: clock })).toBe(false); // routed elsewhere
    const snap = breakerSnapshot();
    expect(snap.p5.state).toBe("open");
    expect(JSON.stringify(snap)).not.toMatch(/"ready":\s*true|"healthy":\s*true/); // no fake readiness
  });
});