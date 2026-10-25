/**
 * ASTRA AI — Agent Operating Framework: Failure Autopsy
 * ============================================================================
 * Constitution §23. When something fails, classify WHY and correct the CLASS of
 * failure instead of blindly retrying the same failing step.
 */

import { TraceStep } from "./types";

export type FailureCause =
  | "MISSING_TOOL"
  | "WRONG_TOOL"
  | "INSUFFICIENT_CONTEXT"
  | "AMBIGUOUS_GOAL"
  | "BAD_ROUTING"
  | "MODEL_FAILURE"
  | "PERMISSION_FAILURE"
  | "UNAVAILABLE_SERVICE"
  | "CONFLICTING_DATA"
  | "VALIDATION_FAILURE"
  | "SAFETY_BLOCK"
  | "RESOURCE_CAP"
  | "LOOP_DETECTED";

export interface AutopsyResult {
  primaryCause: FailureCause;
  evidence: string[];
  recommendedFix: string;
}

const PATTERNS: { cause: FailureCause; matchers: RegExp[]; fix: string }[] = [
  {
    cause: "MISSING_TOOL",
    matchers: [/no such tool/i, /unknown tool/i, /tool .* not found/i, /no tool registered/i],
    fix: "Add the required tool to the agent's allowedToolIds; never prompt-replace a missing capability (constitution §2 BLOCK 2).",
  },
  {
    cause: "PERMISSION_FAILURE",
    matchers: [/permission/i, /denied/i, /unauthori[sz]ed/i, /forbidden/i, /rbac/i, /not allowed/i],
    fix: "Correct the permission grant or route to a higher-privilege authorized agent; never bypass the gate.",
  },
  {
    cause: "UNAVAILABLE_SERVICE",
    matchers: [/unreachable/i, /timed? ?out/i, /connect/i, /refused/i, /503/i, /service unavailable/i, /offline/i],
    fix: "Check upstream service health; retry once through a different route (§14), then escalate honestly.",
  },
  {
    cause: "WRONG_TOOL",
    matchers: [/invalid input/i, /schema/i, /bad request/i, /400/i, /type error/i],
    fix: "Select the correct tool/parameters — wrong-tool means the DECIDE step misrouted.",
  },
  {
    cause: "INSUFFICIENT_CONTEXT",
    matchers: [/missing.*context/i, /context.*required/i, /no patient/i, /unknown patient/i, /insufficient/i],
    fix: "Assemble the missing context pack (§4) before re-running; ask the doctor only what ASTRA cannot retrieve.",
  },
  {
    cause: "SAFETY_BLOCK",
    matchers: [/guardrail/i, /red ?line/i, /safety stop/i, /blocked by policy/i, /prohibited/i],
    fix: "Respect the guardrail — reframe into an allowed form or escalate to the responsible clinician.",
  },
  {
    cause: "RESOURCE_CAP",
    matchers: [/budget/i, /token limit/i, /rate limit/i, /step limit/i, /quota/i],
    fix: "Split the task or raise the budget after review; report PARTIALLY COMPLETED honestly.",
  },
  {
    cause: "MODEL_FAILURE",
    matchers: [/inference.*fail/i, /provider.*error/i, /finish_reason/i, /max context/i],
    fix: "Route through the fallback gateway (FreeLLMAPI → OmniRoute → Ollama) and retry with a tighter budget.",
  },
  {
    cause: "CONFLICTING_DATA",
    matchers: [/conflict/i, /contradict/i, /disagreement/i, /inconsistent/i],
    fix: "Surface the conflict to pragnya_coordinator consensus instead of silently choosing one side.",
  },
  {
    cause: "VALIDATION_FAILURE",
    matchers: [/verifier/i, /verification/i, /validator/i, /did not pass/i],
    fix: "Return to the agent loop and repair the failing check — do not merely append a warning (§16).",
  },
  {
    cause: "AMBIGUOUS_GOAL",
    matchers: [/ambiguous/i, /unclear goal/i, /multiple intents/i, /cannot determine intent/i],
    fix: "Tighten the Goal + DONE TEST (Block 1); ask one clarifying question if needed.",
  },
  {
    cause: "BAD_ROUTING",
    matchers: [/wrong agent/i, /unrelated agent/i, /not the right specialist/i],
    fix: "Re-route through Hermes intent classification; correct the delegate list.",
  },
  {
    cause: "LOOP_DETECTED",
    matchers: [/loop/i, /repeated/i, /same action/i],
    fix: "Stop the loop (§22); change approach or escalate.",
  },
];

export function autopsy(
  failure: unknown,
  step?: TraceStep,
  knownCauses: FailureCause[] = [],
): AutopsyResult {
  const message = failure instanceof Error ? `${failure.message} ${failure.stack ?? ""}` : String(failure);
  const evidence: string[] = [];

  for (const p of PATTERNS) {
    if (p.matchers.some((m) => m.test(message))) {
      evidence.push(`${p.cause}: ${message.slice(0, 160)}`);
      return { primaryCause: p.cause, evidence, recommendedFix: p.fix };
    }
  }

  if (step) {
    evidence.push(
      `failed at ${step.phase}${step.toolId ? " tool=" + step.toolId : ""}${step.agentId ? " agent=" + step.agentId : ""}`,
    );
  }

  if (knownCauses.length > 0) {
    const c = knownCauses[0];
    const p = PATTERNS.find((x) => x.cause === c);
    return { primaryCause: c, evidence, recommendedFix: p?.fix ?? "Re-evaluate the run configuration." };
  }

  return {
    primaryCause: "AMBIGUOUS_GOAL",
    evidence,
    recommendedFix: "Add a clearer DONE TEST and richer context; if still failing, escalate.",
  };
}