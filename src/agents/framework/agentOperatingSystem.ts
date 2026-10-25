/**
 * ASTRA AI — Agent Operating Framework: Universal Runner
 * ============================================================================
 * Implements the 16-STEP UNIVERSAL EXECUTION PROTOCOL:
 * COMMAND → UNDERSTAND → GOAL+DONE TEST → CONTEXT → PLAN → DELEGATE → ACT →
 * OBSERVE → UPDATE HYPOTHESIS → BLIND-SPOT → VERIFY → CONSENSUS → PERMISSION →
 * ACTION/RECOMMENDATION → DONE TEST → STOP → DOCTOR.
 *
 * The runner is the LOOP; hooks (decide/reassess) are the INTELLIGENCE. Any
 * runtime (Hermes, LangGraph, OpenHands, Paperclip, Agent Zero) can drive it.
 */

import { AgentContract, AgentRunResult, AgentRunState, Observation, PreparedAction, StopReason, TraceStep } from "./types";
import { ExecutionTrace, pushObservation } from "./executionTrace";
import { createBudget, checkBudget, tickStep, tickToolCall, tickRetry, buildReport, outcomeForStop, Budget } from "./stopConditions";
import { LoopDetector, fingerprint } from "./loopDetector";
import { autopsy } from "./failureAutopsy";
import { classifyAction } from "./permissionLadder";

/** Web-of-services seam: real runtimes plug in here. */
export interface AgentRuntime {
  callTool(toolId: string, input: unknown): Promise<unknown>;
  callSubAgent(agentId: string, task: string, context?: Record<string, unknown>): Promise<unknown>;
}

export interface Decision {
  kind: "tool" | "subagent" | "done" | "escalate";
  toolId?: string;
  input?: unknown;
  agentId?: string;
  task?: string;
  note?: string;
}

export interface Hooks {
  decide(state: AgentRunState): Promise<Decision> | Decision;
  doneTest?(state: AgentRunState): Promise<boolean> | boolean;
  reassess?(state: AgentRunState, observation: Observation): Promise<void> | void;
  blindSpot?(state: AgentRunState): Promise<string[]> | string[];
  validator?(state: AgentRunState): Promise<{ verdict: string; passedCount: number; checks?: string[] }> | { verdict: string; passedCount: number; checks?: string[] };
  consensus?(state: AgentRunState): Promise<{ verdict: string; confidence: string; detail: string }> | { verdict: string; confidence: string; detail: string };
  classifyAction?(description: string): string;
  onStep?(step: TraceStep, state: AgentRunState): void;
}

export interface RunOptions {
  runtime: AgentRuntime;
  hooks: Hooks;
  budgetOverride?: Partial<{ maxSteps: number; maxToolCalls: number; timeoutMs: number; retryLimit: number }>;
  repeatedLimit?: number;
}

function summarize(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s ? (s.length > 400 ? s.slice(0, 400) + "…" : s) : String(value);
  } catch {
    return String(value);
  }
}

export async function runAgentContract(
  contract: AgentContract,
  request: string,
  initialContext: Record<string, unknown>,
  options: RunOptions,
): Promise<AgentRunResult> {
  const startedAt = new Date().toISOString();
  const trace = new ExecutionTrace();
  const state: AgentRunState = {
    contract,
    request,
    context: { ...(contract.context.initial ?? {}), ...initialContext },
    observations: [],
    hypotheses: [],
    deltas: [],
    preparedActions: [],
    phase: "GOAL",
  };
  const budget: Budget = createBudget(contract.stopCondition, Date.now());
  if (options.budgetOverride) {
    budget.maxSteps = options.budgetOverride.maxSteps ?? budget.maxSteps;
    budget.maxToolCalls = options.budgetOverride.maxToolCalls ?? budget.maxToolCalls;
    budget.timeoutMs = options.budgetOverride.timeoutMs ?? budget.timeoutMs;
    budget.retryLimit = options.budgetOverride.retryLimit ?? budget.retryLimit;
  }
  const detector = new LoopDetector(options.repeatedLimit ?? 3);
  const hooks = options.hooks;
  const allowedTools = new Set(contract.tools.allowedToolIds);

  let stopReason: StopReason = "DONE";
  let doneTestSatisfied = false;
  let workDone = 0;
  let blindSpots: string[] = [];
  let looped = false;

  trace.record("GOAL", state, { action: "goal", outputSnippet: `objective=${contract.goal.objective}` });
  trace.record("CONTEXT", state, { action: "context", inputSnippet: request, outputSnippet: `${Object.keys(state.context).length} context slice(s)` });

  while (true) {
    const bc = checkBudget(budget);
    if (bc.exhausted) {
      stopReason = bc.reason ?? "STEP_LIMIT";
      break;
    }

    // DONE-TEST short-circuit (§2) — stop before spending another turn.
    if (hooks.doneTest && (await hooks.doneTest(state))) {
      doneTestSatisfied = true;
      stopReason = "DONE";
      break;
    }

    // DECIDE
    const decideStep = trace.record("DECIDE", state, { action: "decide-next", status: "RUNNING" });
    let decision: Decision;
    try {
      decision = await hooks.decide(state);
    } catch (err) {
      trace.patchLast({ status: "FAILED", outputSnippet: `decision failed: ${summarize(err)}` });
      pushObservation(state, "failure-autopsy", `${autopsy(err, decideStep).primaryCause} — ${autopsy(err, decideStep).recommendedFix}`, err);
      stopReason = "ESCALATED";
      break;
    }
    trace.patchLast({ status: "COMPLETED", outputSnippet: `kind=${decision.kind}${decision.note ? " note=" + decision.note : ""}` });
    if (hooks.onStep) hooks.onStep(decideStep, state);

    if (decision.kind === "done") {
      doneTestSatisfied = hooks.doneTest ? await hooks.doneTest(state) : true;
      stopReason = "DONE";
      break;
    }
    if (decision.kind === "escalate") {
      stopReason = "ESCALATED";
      break;
    }

    // Structural capability guard — §20 min privilege: allowed tools ONLY.
    if (decision.kind === "tool" && !allowedTools.has(decision.toolId ?? "")) {
      trace.record("ACT", state, {
        action: "blocked-tool",
        toolId: decision.toolId,
        status: "FAILED",
        outputSnippet: `tool "${decision.toolId}" not in allowedToolIds — SAFETY STOP (min privilege)`,
      });
      pushObservation(state, "guardrail", `tool "${decision.toolId}" is outside the contract capability ceiling`);
      stopReason = "SAFETY_STOP";
      break;
    }

    // ACT with bounded retries
    let ok = false;
    for (let attempt = 0; attempt <= (budget.retryLimit ?? 3); attempt++) {
      if (attempt > 0) {
        tickRetry(budget);
        if (checkBudget(budget).exhausted) {
          stopReason = "RETRY_LIMIT";
          break;
        }
      }
      const actStep = trace.record("ACT", state, {
        action: decision.kind,
        toolId: decision.toolId,
        agentId: decision.agentId,
        inputSnippet: decision.task ?? summarize(decision.input),
        status: "RUNNING",
      });
      try {
        let result: unknown;
        if (decision.kind === "tool") {
          tickToolCall(budget);
          result = await options.runtime.callTool(decision.toolId as string, decision.input);
        } else {
          result = await options.runtime.callSubAgent(decision.agentId as string, decision.task as string, state.context);
        }
        trace.patchLast({ status: "COMPLETED", outputSnippet: summarize(result) });

        // OBSERVE then REASSESS (§24 — hypotheses may change with evidence).
        const obs = pushObservation(state, (decision.toolId ?? decision.agentId) as string, summarize(result), result);
        trace.record("OBSERVE", state, { action: "observe", toolId: decision.toolId, agentId: decision.agentId, outputSnippet: summarize(result) });
        if (hooks.reassess) await hooks.reassess(state, obs);
        trace.record("REASSESS", state, { action: "reassess", outputSnippet: `hypotheses=${state.hypotheses.length} deltas=${state.deltas.length}` });
        workDone += 1;

        const newEvidence = state.deltas.length > 0;
        looped = detector.record(fingerprint(decision.kind, (decision.toolId ?? decision.agentId) as string, decision.input), newEvidence);
        if (looped) {
          stopReason = "LOOP_DETECTED";
          break;
        }
        ok = true;
        break;
      } catch (err) {
        trace.patchLast({ status: "FAILED", outputSnippet: summarize(err) });
        const a = autopsy(err, actStep);
        pushObservation(state, "failure-autopsy", `${a.primaryCause} — ${a.recommendedFix}`, err);
      }
    }

    if (stopReason === "LOOP_DETECTED" || stopReason === "RETRY_LIMIT" || (stopReason as string) === "SAFETY_STOP") break;
    if (!ok) {
      stopReason = "ESCALATED";
      break;
    }
    tickStep(budget);
  }
  //__PART3__

  // STEP 9: BLIND-SPOT PASS (§9) — once, before finalizing.
  if (hooks.blindSpot) {
    const bs = trace.record("BLIND_SPOT", state, { action: "blind-spot-pass", status: "RUNNING" });
    try {
      blindSpots = (await hooks.blindSpot(state)) ?? [];
    } catch (err) {
      trace.patchLast({ status: "FAILED", outputSnippet: summarize(err) });
      blindSpots = [];
    }
    trace.patchLast({ status: "COMPLETED", outputSnippet: blindSpots.join(" | ") || "(none)" });
    for (const b of blindSpots) pushObservation(state, "blind-spot", b);
  }

  // STEP 10: VALIDATE (§16)
  let verification: { verdict: string; passedCount: number; checks?: string[] } | undefined;
  if (hooks.validator) {
    const v = trace.record("VALIDATE", state, { action: "validator-gate", status: "RUNNING" });
    try {
      verification = await hooks.validator(state);
    } catch {
      verification = { verdict: "FAIL", passedCount: 0 };
    }
    trace.patchLast({ status: verification.verdict === "FAIL" ? "FAILED" : "COMPLETED", outputSnippet: `verdict=${verification.verdict}` });
  }

  // STEP 11: CONSENSUS (§7)
  let consensus: { verdict: string; confidence: string; detail: string } | undefined;
  if (hooks.consensus) {
    trace.record("CONSENSUS", state, { action: "pragnya-consensus", status: "RUNNING" });
    consensus = await hooks.consensus(state);
    trace.patchLast({ status: "COMPLETED", outputSnippet: `${consensus.verdict} / ${consensus.confidence}` });
  }

  // STEP 12: PERMISSION GATE (§17) on prepared actions — prepared, not executed.
  const classifier = hooks.classifyAction ?? classifyAction;
  const guarded: PreparedAction[] = state.preparedActions.map((a) => {
    const cls = classifier(a.description);
    return {
      description: a.description,
      permission: cls as PreparedAction["permission"],
      prepared: true,
      executed: false,
      requiresApproval: cls === "AMBER",
      approvalRole: cls === "AMBER" ? "responsible-clinician" : undefined,
    };
  });
  trace.record("PERMISSION", state, { action: "permission-ladder", outputSnippet: guarded.map((g) => `${g.description}=${g.permission}`).join(", ") });
  trace.record("DONE", state, { action: "stop", outputSnippet: `${stopReason} outcome=${outcomeForStop(stopReason, doneTestSatisfied, workDone)}` });

  const completed = [
    ...state.observations.map((o) => `observed ${o.source}`),
    `hypotheses ranked: ${state.hypotheses.length}`,
    verification ? `validation=${verification.verdict}` : "validation=skipped",
  ];
  const unresolved = [...blindSpots];
  if (looped) unresolved.push("loop was detected; run stopped instead of burning resources");

  const outcome = outcomeForStop(stopReason, doneTestSatisfied, workDone);
  const report = buildReport(
    outcome,
    stopReason,
    `contract ${contract.id} finished after ${workDone} action(s)`,
    completed,
    unresolved,
    stopReason === "DONE" ? undefined : "Escalate with trace + failure-autopsy classification",
  );

  return {
    contractId: contract.id,
    startedAt,
    finishedAt: new Date().toISOString(),
    outcome,
    stopReason,
    report,
    trace: trace.get(),
    hypotheses: state.hypotheses,
    deltas: state.deltas,
    observations: state.observations,
    preparedActions: guarded,
    consensus,
    verification,
  };
}