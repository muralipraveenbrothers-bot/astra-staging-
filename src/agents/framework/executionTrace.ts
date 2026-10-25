/**
 * ASTRA AI — Agent Operating Framework: Execution Trace
 * ============================================================================
 * Constitution §26/§27. Records the high-level operational trace
 * (DECIDE → ACT → OBSERVE → REASSESS) with hypothesis versioning (§24) and
 * honest per-step status so the Doctor Command Centre can audit the run.
 */

import { AgentRunState, Hypothesis, Observation, TracePhase, TraceStep, TraceStepStatus } from "./types";

export class ExecutionTrace {
  private steps: TraceStep[] = [];

  constructor(private readonly startedAt: number = Date.now()) {}

  public record(
    phase: TracePhase,
    state: AgentRunState,
    opts: {
      action?: string;
      toolId?: string;
      agentId?: string;
      inputSnippet?: string;
      outputSnippet?: string;
      status?: TraceStepStatus;
    } = {},
  ): TraceStep {
    const step: TraceStep = {
      stepIndex: this.steps.length + 1,
      phase,
      action: opts.action,
      toolId: opts.toolId,
      agentId: opts.agentId,
      inputSnippet: opts.inputSnippet ?? "",
      outputSnippet: opts.outputSnippet ?? "",
      status: opts.status ?? "COMPLETED",
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - this.startedAt,
    };
    state.phase = phase;
    this.steps.push(step);
    return step;
  }

  /** Update the last step (e.g., flip RUNNING → FAILED with an error snippet). */
  public patchLast(patch: Partial<TraceStep>): void {
    if (this.steps.length > 0) {
      this.steps[this.steps.length - 1] = { ...this.steps[this.steps.length - 1], ...patch };
    }
  }

  public get(): TraceStep[] {
    return this.steps;
  }

  public clear(): void {
    this.steps = [];
  }
}

/** Constitution §24 — record why the agent changed its mind (never silently). */
export function recordHypothesisDelta(
  state: AgentRunState,
  previous: string,
  newEvidence: string,
  updated: string,
  why: string,
): void {
  state.deltas.push({ previous, newEvidence, updated, why });
}

export function pushObservation(
  state: AgentRunState,
  source: string,
  summary: string,
  raw?: unknown,
): Observation {
  const obs: Observation = { source, summary, raw, ts: new Date().toISOString() };
  state.observations.push(obs);
  return obs;
}

/** Set/refresh a working hypothesis with calibrated probability. */
export function upsertHypothesis(
  state: AgentRunState,
  label: string,
  probability: number,
  supporting: string[] = [],
  contradicting: string[] = [],
): Hypothesis {
  const existing = state.hypotheses.find((h) => h.label === label);
  if (existing) {
    existing.probability = probability;
    existing.supporting = supporting;
    existing.contradicting = contradicting;
    return existing;
  }
  const h: Hypothesis = {
    id: `H${state.hypotheses.length + 1}`,
    label,
    probability,
    supporting,
    contradicting,
    status: "active",
  };
  state.hypotheses.push(h);
  return h;
}