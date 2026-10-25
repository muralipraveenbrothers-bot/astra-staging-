/**
 * R5-08 patient-message check. Runtime approval logic stays on the server.
 * This module uses apiFetch plus a type-only import — never approvalGate.ts values.
 */

import type { ApprovalDecision } from "@/astra/approval/approvalGate";
import { apiFetch, authHeaders } from "@/services/apiFetch";
import { voiceSession } from "./voiceSession";

export async function fetchPatientMessageGrant(params: {
  approvalDecisionId?: string;
  recipientType: "patient" | "attender";
}): Promise<{ allowed: boolean; decisionId?: string }> {
  if (!params.approvalDecisionId) return { allowed: false };
  try {
    const response = await apiFetch("/api/clinical/approval/patient-message-guard", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        isAiGenerated: true,
        approvalDecisionId: params.approvalDecisionId,
        recipientType: params.recipientType,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      allowed?: boolean;
      decision?: ApprovalDecision;
    };
    const decision = data.decision;
    if (!response.ok || data.allowed !== true) return { allowed: false };
    if (!decision || decision.kind !== "patient-message" || decision.status !== "APPROVED") return { allowed: false };
    return { allowed: true, decisionId: decision.decisionId };
  } catch {
    return { allowed: false };
  }
}

voiceSession.setGrantFetcher(async (approvalDecisionId, surface) => {
  const grant = await fetchPatientMessageGrant({ approvalDecisionId, recipientType: surface });
  return grant.allowed;
});
