import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  computeOrderFingerprint,
  signApprovalSecurity,
  verifyApprovalSecurity,
} from "./orderApprovalCrypto";
import type { ApprovalDecision } from "./approvalGate";

const TEST_SECRET = "synthetic-test-secret-with-at-least-32-bytes";
let previousSecret: string | undefined;

function decision(): ApprovalDecision {
  return {
    decisionId: "decision-test",
    suggestionId: "suggestion-test",
    patientId: "synthetic-patient",
    kind: "medication",
    payload: { serviceCode: "SYNTHETIC-HIGH" },
    source: "test",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "APPROVED",
    decidedBy: "synthetic-doctor",
    decidedByRole: "doctor",
    decidedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T00:30:00.000Z",
    riskTier: "HIGH",
    orderFingerprint: "synthetic-fingerprint",
    emergencyRecordId: undefined,
    previousHash: "previous",
    entryHash: "entry",
    doctorSignature: "",
  };
}

describe("order approval crypto", () => {
  beforeEach(() => {
    previousSecret = process.env.ASTRA_APPROVAL_HMAC_SECRET;
    process.env.ASTRA_APPROVAL_HMAC_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.ASTRA_APPROVAL_HMAC_SECRET;
    else process.env.ASTRA_APPROVAL_HMAC_SECRET = previousSecret;
  });

  it("fingerprints fixed clinical fields independent of key order", () => {
    const a = { patientId: "synthetic-patient", serviceCode: "SYNTHETIC-HIGH", dose: "5", priority: "STAT" };
    const b = { priority: "STAT", dose: "5", serviceCode: "SYNTHETIC-HIGH", patientId: "synthetic-patient" };
    expect(computeOrderFingerprint(a)).toBe(computeOrderFingerprint(b));
  });

  it("does not fingerprint idempotencyKey", () => {
    const base = { uhid: "synthetic-patient", serviceCode: "SYNTHETIC-HIGH" };
    expect(computeOrderFingerprint({ ...base, idempotencyKey: "a" }))
      .toBe(computeOrderFingerprint({ ...base, idempotencyKey: "b" }));
  });

  it("changes when each clinical field changes", () => {
    const base = { patientId: "synthetic-patient", serviceCode: "SYNTHETIC-HIGH", dose: "5" };
    expect(computeOrderFingerprint(base)).not.toBe(computeOrderFingerprint({ ...base, dose: "10" }));
    expect(computeOrderFingerprint(base)).not.toBe(computeOrderFingerprint({ ...base, serviceCode: "SYNTHETIC-OTHER" }));
  });

  it("signs and verifies, while each security-field tamper fails", () => {
    const signed = decision();
    signed.doctorSignature = signApprovalSecurity(signed);
    expect(verifyApprovalSecurity(signed)).toBe(true);
    for (const field of ["decisionId", "decidedBy", "orderFingerprint", "decidedAt", "expiresAt", "riskTier", "decidedByRole", "entryHash"] as const) {
      const tampered = { ...signed, [field]: `${String(signed[field] ?? "")}-tampered` };
      expect(verifyApprovalSecurity(tampered)).toBe(false);
    }
  });

  it("rejects a wrong secret and malformed signature without throwing", () => {
    const signed = decision();
    signed.doctorSignature = signApprovalSecurity(signed);
    expect(verifyApprovalSecurity(signed, "wrong-secret-that-is-long-enough-0000")).toBe(false);
    expect(() => verifyApprovalSecurity({ ...signed, doctorSignature: "not-hex" })).not.toThrow();
    expect(verifyApprovalSecurity({ ...signed, doctorSignature: "not-hex" })).toBe(false);
  });

  it("throws for a missing or short signing secret", () => {
    expect(() => signApprovalSecurity(decision(), "short")).toThrow("APPROVAL_HMAC_SECRET_MISSING_OR_TOO_SHORT");
  });
});
