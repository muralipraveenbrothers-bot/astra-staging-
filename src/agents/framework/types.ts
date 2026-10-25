/**
 * ASTRA AI — Agent Operating Framework: Core Types
 * ============================================================================
 * Implements the ASTRA Universal Agent Intelligence Constitution (v2) and the
 * 16-Step Intelligent Agent Framework. An agent is a GOAL-DIRECTED LOOP, not a
 * chatbot: Goal → Decide → Act → Observe → Reassess → Continue/Stop.
 */

/** How much authority the agent owns right now (start low, raise with evidence). */
export type AutonomyLevel = "READ_ONLY" | "RECOMMEND_ONLY" | "APPROVAL_REQUIRED" | "AUTONOMOUS";

/** Constitution §17 permission ladder. */
export type PermissionClass = "GREEN" | "AMBER" | "RED";

/** Every bounded run must terminate with one of these reasons (constitution §21). */
export type StopReason =
  | "DONE"
  | "STEP_LIMIT"
  | "TOOL_CALL_LIMIT"
  | "TIME_LIMIT"
  | "RETRY_LIMIT"
  | "LOOP_DETECTED"
  | "HUMAN_CHECKPOINT"
  | "SAFETY_STOP"
  | "ESCALATED";

export type RunOutcome = "COMPLETED" | "PARTIALLY_COMPLETED" | "MISSING" | "BLOCKED";

/** Phases of the 16-step universal execution protocol. */
export type TracePhase =
  | "GOAL"
  | "CONTEXT"
  | "PLAN"
  | "DECIDE"
  | "ACT"
  | "OBSERVE"
  | "REASSESS"
  | "BLIND_SPOT"
  | "VALIDATE"
  | "CONSENSUS"
  | "PERMISSION"
  | "DONE";

export type TraceStepStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";

/** Constitution §2 six-block Agent Contract. */
export interface AgentContract {
  /** Agent Spec Card identity. */
  id: string;
  version: string;
  name?: string;
  /** BLOCK 1 — GOAL: what success means + an explicit DONE TEST. */
  goal: { objective: string; doneTest: string };
  /** BLOCK 2 — TOOLS: capability ceiling; the only things this agent can touch. */
  tools: { allowedToolIds: string[] };
  /** BLOCK 3 — INSTRUCTIONS: how the agent should work/what rules to follow. */
  instructions: string[];
  /** BLOCK 4 — CONTEXT: what starting knowledge is required/available. */
  context: { required: string[]; initial?: Record<string, unknown> };
  /** BLOCK 5 — GUARDRAILS: prohibited actions, red lines, escalation point. */
  guardrails: { prohibitedActions: string[]; escalateTo?: string; redLines?: string[] };
  /** BLOCK 6 — STOP CONDITION: bounded termination (constitution §21). */
  stopCondition: StopCondition;
  /** Current autonomy grant; the permission ladder is enforced on top of it. */
  autonomy: AutonomyLevel;
}

export interface StopCondition {
  maxSteps?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
  retryLimit?: number;
  /** When a human checkpoint must pause/approve. Defaults to "on-red". */
  humanCheckpoint: "never" | "on-amber" | "on-red" | "always";
}

/** A working diagnosis/explanation held with calibrated confidence. */
export interface Hypothesis {
  id: string;
  label: string;
  /** 0..1 — never hide uncertainty; calibrated language. */
  probability: number;
  supporting: string[];
  contradicting: string[];
  status: "active" | "resolved";
}

/** Constitution §24 — a record of why the agent changed its mind. */
export interface HypothesisDelta {
  previous: string;
  newEvidence: string;
  updated: string;
  why: string;
}

export interface TraceStep {
  stepIndex: number;
  phase: TracePhase;
  action?: string;
  toolId?: string;
  agentId?: string;
  inputSnippet: string;
  outputSnippet: string;
  status: TraceStepStatus;
  timestamp: string;
  latencyMs: number;
}

/** One observed result from a tool/sub-agent/context source, in the trace. */
export interface Observation {
  source: string;
  summary: string;
  raw?: unknown;
  ts: string;
}

/** An output of the permission gate: prepared but (almost never) executed here. */
export interface PreparedAction {
  description: string;
  permission: PermissionClass;
  prepared: boolean;
  executed: boolean;
  requiresApproval: boolean;
  approvalRole?: string;
}

/** Constitution §21 honest completion — never invent what wasn't done. */
export interface CompletionReport {
  outcome: RunOutcome;
  whyStopped: StopReason;
  detail: string;
  completed: string[];
  unresolved: string[];
  nextBestAction?: string;
}

export interface AgentRunResult {
  contractId: string;
  startedAt: string;
  finishedAt: string;
  outcome: RunOutcome;
  stopReason: StopReason;
  report: CompletionReport;
  trace: TraceStep[];
  hypotheses: Hypothesis[];
  deltas: HypothesisDelta[];
  observations: Observation[];
  preparedActions: PreparedAction[];
  consensus?: { verdict: string; confidence: string; detail: string };
  verification?: { verdict: string; passedCount: number; checks?: string[] };
}

/** Mutable state threaded through one agent run. */
export interface AgentRunState {
  contract: AgentContract;
  request: string;
  context: Record<string, unknown>;
  observations: Observation[];
  hypotheses: Hypothesis[];
  deltas: HypothesisDelta[];
  preparedActions: PreparedAction[];
  /** High-signal instrument current phase for the execution trace. */
  phase: TracePhase;
}