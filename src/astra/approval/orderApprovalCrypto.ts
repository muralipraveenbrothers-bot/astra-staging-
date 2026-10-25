import crypto from "crypto";
import type { ApprovalDecision } from "./approvalGate";

export const ORDER_FINGERPRINT_FIELDS = [
  "patientId",
  "serviceCode",
  "category",
  "procedure",
  "drugClass",
  "dose",
  "route",
  "frequency",
  "duration",
  "priority",
  "quantity",
  "emergencyRecordId",
] as const;

export const SECURITY_FIELDS = [
  "decisionId",
  "decidedBy",
  "orderFingerprint",
  "decidedAt",
  "expiresAt",
  "riskTier",
  "decidedByRole",
  "emergencyRecordId",
  "entryHash",
] as const satisfies readonly (keyof ApprovalDecision)[];

function canonicalFields<T extends readonly string[]>(
  fields: T,
  value: Record<string, unknown>,
): string {
  return fields
    .map((field) => JSON.stringify(value[field] ?? null))
    .join("|");
}

export function computeOrderFingerprint(order: Record<string, unknown>): string {
  const normalized = {
    ...order,
    patientId: order.patientId ?? order.uhid,
  };
  return crypto
    .createHash("sha256")
    .update(canonicalFields(ORDER_FINGERPRINT_FIELDS, normalized))
    .digest("hex");
}

function approvalPayload(decision: ApprovalDecision): string {
  return canonicalFields(SECURITY_FIELDS, decision as unknown as Record<string, unknown>);
}

function approvalSecret(): string {
  const secret = process.env.ASTRA_APPROVAL_HMAC_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("APPROVAL_HMAC_SECRET_MISSING_OR_TOO_SHORT");
  }
  return secret;
}

export function signApprovalSecurity(
  decision: ApprovalDecision,
  secret = approvalSecret(),
): string {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("APPROVAL_HMAC_SECRET_MISSING_OR_TOO_SHORT");
  }
  return crypto
    .createHmac("sha256", secret)
    .update(approvalPayload(decision))
    .digest("hex");
}

export function signApprovalSecurityReferenced(decision: ApprovalDecision, referencedEntryHash: string, secret?: string): string {
  return signApprovalSecurity({ ...decision, entryHash: referencedEntryHash }, secret);
}

export function verifyApprovalSecurity(
  decision: ApprovalDecision,
  secret = approvalSecret(),
): boolean {
  try {
    if (!decision.doctorSignature) return false;
    const supplied = Buffer.from(decision.doctorSignature, "hex");
    const expected = Buffer.from(signApprovalSecurity(decision, secret), "hex");
    if (supplied.length !== expected.length) return false;
    return crypto.timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

export function verifyApprovalSecurityReferenced(decision: ApprovalDecision, referencedEntryHash: string, secret?: string): boolean {
  return verifyApprovalSecurity({ ...decision, entryHash: referencedEntryHash }, secret);
}
