import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { appendSignedApprovalRecord, decideApproval, getDecision, recordSuggestion, verifyHashChain, _resetDecisionStoreForTest } from "./approvalGate";
import { computeOrderFingerprint, signApprovalSecurityReferenced } from "./orderApprovalCrypto";
import { consumeApprovalAndCreateOrderAtomically, verifyOrderApproval } from "./orderApprovalGate";

const SECRET = "synthetic-order-approval-secret-32-bytes";

describe("order approval gate", () => {
  let oldLog: string | undefined;
  let oldFlag: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    oldLog = process.env.ASTRA_DECISION_LOG_PATH;
    oldFlag = process.env.ASTRA_ORDER_APPROVAL_ENFORCE;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-approval-"));
    process.env.ASTRA_DECISION_LOG_PATH = path.join(tempDir, "decisions.json");
    process.env.ASTRA_ORDER_APPROVAL_ENFORCE = "1";
    process.env.ASTRA_APPROVAL_HMAC_SECRET = SECRET;
    _resetDecisionStoreForTest();
  });

  afterEach(() => {
    if (oldLog === undefined) delete process.env.ASTRA_DECISION_LOG_PATH; else process.env.ASTRA_DECISION_LOG_PATH = oldLog;
    if (oldFlag === undefined) delete process.env.ASTRA_ORDER_APPROVAL_ENFORCE; else process.env.ASTRA_ORDER_APPROVAL_ENFORCE = oldFlag;
    delete process.env.ASTRA_APPROVAL_HMAC_SECRET;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function fixture() {
    const order = { patientId: "synthetic-patient", serviceCode: "SYNTH-HIGH", dose: "5" };
    const suggestion = recordSuggestion({ patientId: order.patientId, kind: "medication", payload: order, source: "test" });
    const approved = decideApproval({ suggestionId: suggestion.suggestionId, decision: "APPROVE_CASE_ONLY", doctorId: "synthetic-doctor" });
    const stored = getDecision(approved.decisionId)!;
    stored.riskTier = "HIGH";
    stored.orderFingerprint = computeOrderFingerprint(order);
    stored.decidedByRole = "doctor";
    stored.expiresAt = new Date(Date.now() + 60_000).toISOString();
    appendSignedApprovalRecord(stored, (signed) => signApprovalSecurityReferenced(signed, stored.entryHash));
    return { order, approvalDecisionId: stored.decisionId };
  }

  it("valid use and append-only reuse rejection", () => {
    const f = fixture();
    expect(verifyOrderApproval(f)).toMatchObject({ ok: true });
    consumeApprovalAndCreateOrderAtomically({ ...f, createOrder: () => "created" });
    expect(() => consumeApprovalAndCreateOrderAtomically({ ...f, createOrder: () => "again" })).toThrow("ALREADY_CONSUMED");
    expect(verifyHashChain().valid).toBe(true);
  });

  it("rejects tampered fingerprint, expiry, wrong secret, non-doctor and increased tier", () => {
    const f = fixture();
    getDecision(f.approvalDecisionId)!.orderFingerprint = "tampered";
    expect(verifyOrderApproval(f)).toMatchObject({ ok: false, reason: "SIGNED_RECORD_MISMATCH" });
    const f2 = fixture();
    getDecision(f2.approvalDecisionId)!.expiresAt = new Date(Date.now() - 1).toISOString();
    expect(verifyOrderApproval(f2)).toMatchObject({ ok: false, reason: "SIGNED_RECORD_MISMATCH" });
    const f3 = fixture();
    process.env.ASTRA_APPROVAL_HMAC_SECRET = "wrong-order-approval-secret-32-bytes";
    expect(verifyOrderApproval(f3)).toMatchObject({ ok: false, reason: "APPROVAL_SIGNATURE_INVALID" });
    const f4 = fixture();
    getDecision(f4.approvalDecisionId)!.decidedByRole = "admin";
    expect(verifyOrderApproval(f4)).toMatchObject({ ok: false, reason: "APPROVER_NOT_DOCTOR" });
    const f5 = fixture();
    getDecision(f5.approvalDecisionId)!.riskTier = "STANDARD";
    expect(verifyOrderApproval(f5)).toMatchObject({ ok: false, reason: "RISK_TIER_INCREASED" });
  });

  it("rejects an incoming order whose clinical field changed", () => {
    const f = fixture();
    const changed = { ...f, order: { ...f.order, dose: "10" } };
    expect(verifyOrderApproval(changed)).toMatchObject({ ok: false, reason: "ORDER_FINGERPRINT_MISMATCH" });
  });

  it("restores usability when order creation throws", () => {
    const f = fixture();
    let attempted = 0;
    expect(() => consumeApprovalAndCreateOrderAtomically({ ...f, createOrder: () => { attempted += 1; throw new Error("CREATE_FAILED"); } })).toThrow("CREATE_FAILED");
    expect(consumeApprovalAndCreateOrderAtomically({ ...f, createOrder: () => { attempted += 1; return "retry"; } })).toBe("retry");
    expect(attempted).toBe(2);
  });

  it("allows a doctor-signed HIGH approval to be consumed by an admin actor", () => {
    const f = fixture();
    expect(consumeApprovalAndCreateOrderAtomically({ ...f, createOrder: () => ({ actorRole: "admin" }) })).toEqual({ actorRole: "admin" });
    expect(() => consumeApprovalAndCreateOrderAtomically({ ...f, createOrder: () => ({ actorRole: "admin" }) })).toThrow("ALREADY_CONSUMED");
  });

  it("keeps existing creation behavior when enforcement is OFF", () => {
    const f = fixture();
    process.env.ASTRA_ORDER_APPROVAL_ENFORCE = "0";
    expect(consumeApprovalAndCreateOrderAtomically({ ...f, createOrder: () => "created-without-enforcement" })).toBe("created-without-enforcement");
  });
});
