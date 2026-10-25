/**
 * ASTRA AI — Agent Operating Framework: Public API
 * ============================================================================
 * One import surface for the 16-step universal execution protocol.
 */

export * from "./types";
export {
  classifyAction,
  permissionFromRiskLevel,
  permissionForAutonomy,
  guardAction,
} from "./permissionLadder";
export {
  createBudget,
  checkBudget,
  tickStep,
  tickToolCall,
  tickRetry,
  buildReport,
  outcomeForStop,
} from "./stopConditions";
export { LoopDetector, fingerprint } from "./loopDetector";
export { autopsy } from "./failureAutopsy";
export {
  assessAgentNecessity,
  assessForRequest,
  cheapestSurface,
} from "./necessityGate";
export {
  buildSpecCard,
  autonomyFromRiskLevel,
  contractFromRecord,
} from "./specCard";
export {
  ExecutionTrace,
  recordHypothesisDelta,
  pushObservation,
  upsertHypothesis,
} from "./executionTrace";
export { runAgentContract } from "./agentOperatingSystem";
export type { AgentRuntime, Decision, Hooks, RunOptions } from "./agentOperatingSystem";