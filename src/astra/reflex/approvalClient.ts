import { apiFetch } from "@/services/apiFetch";
import type { ApprovalKind } from "@/astra/approval/approvalGate.ts";

export type ReflexActionChoice = "APPROVE_CASE_ONLY" | "REJECT_IGNORE" | "DISCUSS_ONLY";

export async function submitReflexApproval(params: {
  patientId: string;
  text: string;
  kind?: ApprovalKind;
  decision: ReflexActionChoice;
  reason?: string;
}) {
  const suggestion = await apiFetch("/api/clinical/approval/suggestion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patientId: params.patientId,
      kind: params.kind ?? "other",
      source: "clinical-reflex-mesh",
      payload: { text: params.text, route: "R5-01 approval gate" },
    }),
  }).then((r) => r.json());
  if (!suggestion.ok) throw new Error(suggestion.error ?? "approval suggestion failed");
  const suggestionId = suggestion.decision?.suggestionId ?? suggestion.approval?.suggestionId ?? suggestion.suggestionId;
  return apiFetch("/api/clinical/approval/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      suggestionId,
      decision: params.decision,
      doctorId: "reflex-panel",
      reason: params.reason ?? "Clinical reflex mesh doctor action",
    }),
  }).then((r) => r.json());
}

export async function postReflexOutcome(decisionId: string | undefined, truth: string) {
  if (!decisionId) return null;
  return apiFetch("/api/reflex/outcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisionId, truth, source: "approval" }),
  }).then((r) => r.json());
}
