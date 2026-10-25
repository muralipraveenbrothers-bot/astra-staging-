import { appendApprovalRecord, getApprovedDecisionState, type ApprovalDecision } from "./approvalGate";
import { computeOrderFingerprint, verifyApprovalSecurityReferenced } from "./orderApprovalCrypto";
import { classifyOrderRisk, isOrderApprovalEnforced, riskRank, type RiskTier } from "./orderRisk";

export type OrderApprovalInput = {
  approvalDecisionId: string;
  patientId?: string;
  uhid?: string;
  order: Record<string, unknown>;
  serviceCode?: string;
  emergencyRecordId?: string;
  lookupEmergency?: Parameters<typeof classifyOrderRisk>[0]["lookupEmergency"];
  now?: number;
};

function reason(reason: string): { ok: false; reason: string } { return { ok: false, reason }; }

export function verifyOrderApproval(input: OrderApprovalInput): { ok: true; decision: ApprovalDecision; riskTier: RiskTier } | { ok: false; reason: string } {
  const state = getApprovedDecisionState(input.approvalDecisionId);
  if (!state.approved) return reason("APPROVAL_NOT_FOUND");
  if (state.consumed) return reason("ALREADY_CONSUMED");
  const decision = state.approved;
  const patientId = input.patientId ?? input.uhid ?? (typeof input.order.patientId === "string" ? input.order.patientId : input.order.uhid);
  if (!patientId || decision.patientId !== patientId) return reason("PATIENT_MISMATCH");
  if (decision.decidedByRole !== "doctor") return reason("APPROVER_NOT_DOCTOR");
  if (!decision.riskTier) return reason("RISK_TIER_MISSING");

  const riskTier = classifyOrderRisk({
    order: input.order,
    serviceCode: input.serviceCode,
    emergencyRecordId: input.emergencyRecordId ?? decision.emergencyRecordId,
    lookupEmergency: input.lookupEmergency,
  });
  if (riskTier === "EMERGENCY" && !input.lookupEmergency) return reason("EMERGENCY_LOOKUP_REQUIRED");
  if (riskRank(riskTier) > riskRank(decision.riskTier)) return reason("RISK_TIER_INCREASED");

  if (riskTier !== "STANDARD") {
    if (!decision.orderFingerprint || !decision.decidedAt || !decision.expiresAt) return reason("SECURITY_FIELDS_MISSING");
    const signed = getApprovedDecisionState(input.approvalDecisionId).signedRecord;
    if (!signed || !signed.doctorSignature || signed.payload?.referencedEntryHash !== decision.entryHash) return reason("SIGNED_RECORD_MISSING");
    for (const field of ["decidedBy", "decidedByRole", "decidedAt", "expiresAt", "riskTier", "orderFingerprint", "emergencyRecordId"] as const) {
      if (signed[field] !== decision[field]) return reason("SIGNED_RECORD_MISMATCH");
    }
    if (!verifyApprovalSecurityReferenced(signed, decision.entryHash)) return reason("APPROVAL_SIGNATURE_INVALID");
    if (decision.orderFingerprint !== computeOrderFingerprint({ ...input.order, patientId })) return reason("ORDER_FINGERPRINT_MISMATCH");
    if (Date.parse(decision.expiresAt) <= (input.now ?? Date.now())) return reason("APPROVAL_EXPIRED");
  }
  if (riskTier === "EMERGENCY" && input.lookupEmergency) {
    const emergency = input.lookupEmergency(decision.emergencyRecordId ?? input.emergencyRecordId!);
    if (!emergency?.exists || !emergency.unexpired || !emergency.namedDoctorValid || !emergency.overdueTaskExists) return reason("EMERGENCY_RECORD_INVALID");
  }
  return { ok: true, decision, riskTier };
}

export function consumeApprovalAndCreateOrderAtomically<T>(input: OrderApprovalInput & { createOrder: () => T }): T {
  if (!isOrderApprovalEnforced()) return input.createOrder();
  const verified = verifyOrderApproval(input);
  if (!verified.ok) throw new Error(verified.reason);
  const consumed = appendApprovalRecord({
    ...verified.decision,
    decisionId: `consumed-${verified.decision.decisionId}-${Date.now()}`,
    suggestionId: verified.decision.suggestionId,
    status: "CONSUMED",
    payload: { approvedDecisionId: verified.decision.decisionId, order: input.order },
    createdAt: new Date().toISOString(),
    consumedAt: new Date().toISOString(),
  });
  try {
    return input.createOrder();
  } catch (error) {
    appendApprovalRecord({
      ...verified.decision,
      decisionId: `restore-${verified.decision.decisionId}-${Date.now()}`,
      status: "APPROVED",
      payload: { approvedDecisionId: verified.decision.decisionId, restoredDecisionId: verified.decision.decisionId },
      createdAt: new Date().toISOString(),
    });
    throw error;
  }
}
