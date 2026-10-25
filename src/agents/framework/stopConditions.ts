/**
 * ASTRA AI — Agent Operating Framework: Stop Conditions & Budgets
 * ============================================================================
 * Constitution §21. Every run must have at least one bounded stop mechanism.
 * When a limit is reached we do NOT fabricate completion: we return an honest
 * CompletionReport (COMPLETED / PARTIALLY COMPLETED / MISSING + WHY + NEXT STEP).
 */

import { CompletionReport, RunOutcome, StopCondition, StopReason } from "./types";

export interface Budget {
  maxSteps?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
  retryLimit?: number;
  startedAt: number;
  stepsUsed: number;
  toolCallsUsed: number;
  retriesUsed: number;
}

export function createBudget(cond: StopCondition | undefined, now: number = Date.now()): Budget {
  return {
    maxSteps: cond?.maxSteps ?? 10,
    maxToolCalls: cond?.maxToolCalls ?? 20,
    timeoutMs: cond?.timeoutMs ?? 60_000,
    retryLimit: cond?.retryLimit ?? 2,
    startedAt: now,
    stepsUsed: 0,
    toolCallsUsed: 0,
    retriesUsed: 0,
  };
}

export interface BudgetCheck {
  exhausted: boolean;
  reason?: StopReason;
}

/** Returns the first violated limit, or not-exhausted. Call before every DECIDE step. */
export function checkBudget(b: Budget, now: number = Date.now()): BudgetCheck {
  if (b.maxSteps !== undefined && b.stepsUsed >= b.maxSteps) {
    return { exhausted: true, reason: "STEP_LIMIT" };
  }
  if (b.maxToolCalls !== undefined && b.toolCallsUsed >= b.maxToolCalls) {
    return { exhausted: true, reason: "TOOL_CALL_LIMIT" };
  }
  if (b.timeoutMs !== undefined && now - b.startedAt >= b.timeoutMs) {
    return { exhausted: true, reason: "TIME_LIMIT" };
  }
  if (b.retryLimit !== undefined && b.retriesUsed >= b.retryLimit) {
    return { exhausted: true, reason: "RETRY_LIMIT" };
  }
  return { exhausted: false };
}

export function tickStep(b: Budget): void {
  b.stepsUsed += 1;
}

export function tickToolCall(b: Budget): void {
  b.toolCallsUsed += 1;
}

export function tickRetry(b: Budget): void {
  b.retriesUsed += 1;
}

export function buildReport(
  outcome: RunOutcome,
  reason: StopReason,
  detail: string,
  completed: string[],
  unresolved: string[],
  nextBestAction?: string,
): CompletionReport {
  return { outcome, whyStopped: reason, detail, completed, unresolved, nextBestAction };
}

/**
 * Did this run finish enough of the DONE TEST to count as COMPLETED?
 * If not, be honest: PARTIALLY_COMPLETED (limits hit) / MISSING (nothing done).
 */
export function outcomeForStop(
  reason: StopReason,
  doneTestSatisfied: boolean,
  workDone: number,
): RunOutcome {
  if (reason === "DONE" && doneTestSatisfied) return "COMPLETED";
  if (reason === "SAFETY_STOP") return "BLOCKED";
  if (workDone > 0) return "PARTIALLY_COMPLETED";
  return "MISSING";
}