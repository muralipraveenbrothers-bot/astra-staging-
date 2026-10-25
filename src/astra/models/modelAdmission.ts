export type ModelAdmissionGate =
  | "GROUNDING_TEST" | "PROMPT_INJECTION_TEST" | "PHI_LEAK_TEST" | "TOOL_USE_TEST" | "HALLUCINATION_TEST"
  | "RELIABILITY_TEST" | "LATENCY_TEST" | "PRIVACY_CLASSIFICATION" | "LICENSE_REVIEW";
export type ModelCapability = "CLINICAL_REASONING" | "DETERMINISTIC_LOOKUP" | "STRUCTURED_OUTPUT" | "WORKFLOW_EXECUTION" | "VOICE_LANGUAGE";
export interface ModelAdmissionInput {
  modelId: string; provider: string; licenseApproved: boolean; privacyClass: "PHI_SAFE" | "PHI_CAPABLE_DEIDENT_REQUIRED" | "NO_PHI";
  gates: Array<{ gate: ModelAdmissionGate; passed: boolean; detail: string }>; medianLatencySeconds: number; costTier: number; reliability: number;
  requestedCapabilities: ModelCapability[];
}
export const REQUIRED_ADMISSION_GATES: ModelAdmissionGate[] = ["GROUNDING_TEST", "PROMPT_INJECTION_TEST", "PHI_LEAK_TEST", "TOOL_USE_TEST", "HALLUCINATION_TEST", "RELIABILITY_TEST", "LATENCY_TEST", "PRIVACY_CLASSIFICATION", "LICENSE_REVIEW"];
const admitted = new Map<string, ModelCapability[]>();
export function admitModel(input: ModelAdmissionInput) {
  const reasons: string[] = [];
  for (const gate of REQUIRED_ADMISSION_GATES) {
    const result = input.gates.find((g) => g.gate === gate);
    if (!result) reasons.push(`${gate} missing from admission tests`);
    else if (!result.passed) reasons.push(gate);
  }
  if (!input.licenseApproved) reasons.push("LICENSE_REVIEW");
  if (input.reliability < 0.9) reasons.push("RELIABILITY_TEST");
  if (input.privacyClass === "NO_PHI") reasons.push("PRIVACY_CLASSIFICATION");
  if (reasons.length) {
    admitted.set(input.modelId, []);
    return { status: "REJECTED", rejectedReasons: reasons, allowedCapabilities: [] as ModelCapability[] };
  }
  const allowed = input.requestedCapabilities.filter((c) => c !== "VOICE_LANGUAGE" || input.medianLatencySeconds <= 2);
  admitted.set(input.modelId, allowed);
  return { status: "ADMITTED", rejectedReasons: [], allowedCapabilities: allowed };
}
export function capabilitiesForModel(modelId: string | null | undefined): ModelCapability[] {
  return modelId ? admitted.get(modelId) ?? [] : [];
}
export function toScorecardClearance(modelId: string | null | undefined) {
  const caps = capabilitiesForModel(modelId);
  return caps.length ? { behaviorallyCleared: true } : { behaviorallyCleared: false, reason: "never passed Astra admission" };
}
