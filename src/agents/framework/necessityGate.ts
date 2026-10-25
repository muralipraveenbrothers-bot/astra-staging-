/**
 * ASTRA AI — Agent Operating Framework: Agent Necessity Gate
 * ============================================================================
 * Before Hermes launches ANY multi-agent workflow, ask three questions:
 *   1. Does the task require choosing the next step dynamically?
 *   2. Does it need access to something outside this conversation (EMR, labs,
 *      imaging, database, literature, another service)?
 *   3. Must the system decide for itself when enough work has been completed?
 * All three = agent. Otherwise prefer the cheapest correct tool — answer,
 * skill, deterministic function, or automation (§33: intelligence over activity).
 */

export type NonAgentVerdict =
  | "DIRECT_ANSWER"
  | "SKILL"
  | "FUNCTION"
  | "TOOL_CALL"
  | "AUTOMATION";
export type NecessityVerdict = NonAgentVerdict | "AGENT";

export interface NecessityAssessment {
  needsAgent: boolean;
  verdict: NecessityVerdict;
  reasons: string[];
}

export function assessAgentNecessity(answers: {
  needsDynamicStep: boolean;
  needsExternalAccess: boolean;
  selfDecidesCompletion: boolean;
}): NecessityAssessment {
  const reasons: string[] = [];
  if (answers.needsDynamicStep) reasons.push("later actions depend on earlier observations");
  if (answers.needsExternalAccess) reasons.push("requires retrieval outside the conversation");
  if (answers.selfDecidesCompletion) reasons.push("system must decide when 'enough' has been done");
  const all = answers.needsDynamicStep && answers.needsExternalAccess && answers.selfDecidesCompletion;
  return {
    needsAgent: all,
    verdict: all ? "AGENT" : "TOOL_CALL",
    reasons,
  };
}

/** Lightweight keyword heuristic when the asker did not answer the 3 questions. */
export function assessForRequest(
  request: string,
  externalAccessAvailable: boolean,
): NecessityAssessment {
  const lower = request.toLowerCase();
  const dynamic = predicateHints.some((h) => lower.includes(h));
  const external = externalAccessAvailable && accessHints.some((h) => lower.includes(h));
  const selfStop = stopHints.some((h) => lower.includes(h));
  return assessAgentNecessity({
    needsDynamicStep: dynamic,
    needsExternalAccess: external,
    selfDecidesCompletion: selfStop,
  });
}

export const predicateHints = [
  "deteriorat", "trend", "trajector", "evolv", "progress", "worsen", "assess", "diagnos", "plan",
  "monitor", "interpret",
];

export const accessHints = [
  "lab", "vital", "imaging", "x-ray", "emr", "record", "bed ", "prescri", "patient", "culture",
  "medication", "chart", "admission",
];

export const stopHints = [
  "when", "until", "decide", "check", "verify", "watch", "also", "then", "further",
  "worse", "trend", "concern", "risk", "evaluate", "investigate", "looks",
];

/**
 * Prefer the cheapest correct surface. Agent = expensive per turn; it must EARN it.
 * (Constitution §33 — smallest reliable reasoning structure.)
 */
export function cheapestSurface(assessment: NecessityAssessment): NecessityVerdict {
  if (assessment.needsAgent) return "AGENT";
  return assessment.reasons.length === 0 ? "DIRECT_ANSWER" : "TOOL_CALL";
}