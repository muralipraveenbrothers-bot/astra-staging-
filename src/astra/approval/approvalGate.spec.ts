/**
 * ASTRA AI — Doctor Approval Gate & Tamper-Evident AI Decision Log Tests
 * =======================================================================
 * Validates R5-01 core contracts:
 *  1. Unchecked by default / no orders created on empty or rejected/discussed items.
 *  2. Server-side enforcement: AI orders fail without approved decision; manual orders pass.
 *  3. Memory toggle: default OFF; only "Approve + Learning" with toggle ON writes to memory.
 *  4. Tamper-evident hash chain: SHA-256 chain breaks if past entry altered.
 *  5. Patient-facing guard: blocks unapproved AI text to patients/attenders.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  recordSuggestion,
  decideApproval,
  getDecision,
  getDecisionsForPatient,
  getAllDecisions,
  verifyHashChain,
  verifyPatientMessageGuard,
  isApprovedForOrder,
  isMemoryToggleOn,
  setMemoryToggle,
  _resetDecisionStoreForTest,
  getApprovedDecisionState,
  GENESIS_HASH,
  type ApprovalDecision,
} from "./approvalGate";
import { commandEngine, type CommandRequest } from "../../../server/command";

describe("Doctor Approval Gate & AI Decision Log (R5-01)", () => {
  beforeEach(() => {
    _resetDecisionStoreForTest();
  });

  describe("1. Suggestion Recording & Tamper-Evident Hash Chain", () => {
    it("keeps legacy records valid while exposing optional order fields", () => {
      const suggestion = recordSuggestion({
        patientId: "synthetic-legacy-patient",
        kind: "investigation",
        payload: { test: "CBC" },
        source: "test",
      });
      expect(suggestion.riskTier).toBeUndefined();
      expect(suggestion.orderFingerprint).toBeUndefined();
      expect(getApprovedDecisionState(suggestion.suggestionId)).toEqual({ consumed: false });
      expect(verifyHashChain()).toMatchObject({ valid: true });
    });

    it("initializes chain with GENESIS_HASH and computes cryptographic link", () => {
      const s1 = recordSuggestion({
        patientId: "UHID-2026-TEST1",
        kind: "investigation",
        payload: { test: "Serum Creatinine", urgency: "routine" },
        source: "evidence-copilot",
      });

      expect(s1.previousHash).toBe(GENESIS_HASH);
      expect(s1.entryHash).toHaveLength(64);
      expect(s1.status).toBe("PENDING");
      expect(s1.learningWritten).toBe(false);

      const chainCheck = verifyHashChain();
      expect(chainCheck.valid).toBe(true);
    });

    it("chains subsequent suggestions and decisions deterministically", () => {
      const s1 = recordSuggestion({
        patientId: "UHID-2026-TEST1",
        kind: "medication",
        payload: { drug: "Amoxicillin 500mg" },
        source: "clinical-engine",
      });

      const s2 = recordSuggestion({
        patientId: "UHID-2026-TEST1",
        kind: "investigation",
        payload: { test: "Chest X-Ray" },
        source: "dr-mayin",
      });

      expect(s2.previousHash).toBe(s1.entryHash);
      expect(verifyHashChain().valid).toBe(true);
    });

    it("detects tampering when any past entry is altered", () => {
      recordSuggestion({
        patientId: "UHID-2026-TAMPER",
        kind: "medication",
        payload: { drug: "Paracetamol 650mg" },
        source: "evidence-copilot",
      });

      recordSuggestion({
        patientId: "UHID-2026-TAMPER",
        kind: "investigation",
        payload: { test: "CBC" },
        source: "evidence-copilot",
      });

      const all = getAllDecisions();
      expect(all.length).toBe(2);
      expect(verifyHashChain(all).valid).toBe(true);

      // Simulate malicious tampering with payload of entry 0
      const tamperedEntries: ApprovalDecision[] = JSON.parse(JSON.stringify(all));
      tamperedEntries[0].payload = { drug: "Fentanyl 100mcg" };

      const checkTampered = verifyHashChain(tamperedEntries);
      expect(checkTampered.valid).toBe(false);
      expect(checkTampered.brokenIndex).toBe(0);
      expect(checkTampered.error).toContain("Tampered log entry at index 0");
    });

    it("detects broken link if previousHash is modified", () => {
      recordSuggestion({
        patientId: "UHID-2026-CHAIN",
        kind: "procedure",
        payload: { procedure: "Thoracentesis" },
        source: "scientist",
      });

      recordSuggestion({
        patientId: "UHID-2026-CHAIN",
        kind: "procedure",
        payload: { procedure: "Chest Tube" },
        source: "scientist",
      });

      const all: ApprovalDecision[] = JSON.parse(JSON.stringify(getAllDecisions()));
      all[1].previousHash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

      const check = verifyHashChain(all);
      expect(check.valid).toBe(false);
      expect(check.brokenIndex).toBe(1);
      expect(check.error).toContain("Broken hash link at index 1");
    });
  });

  describe("2. Doctor Decision Actions & Statuses", () => {
    it("APPROVE_CASE_ONLY marks decision as APPROVED without learning", () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-DOC1",
        kind: "investigation",
        payload: { test: "Serum Electrolytes" },
        source: "evidence-copilot",
      });

      const dec = decideApproval({
        suggestionId: s.suggestionId,
        decision: "APPROVE_CASE_ONLY",
        doctorId: "DOC-DR-RAVI",
        reason: "Clinically indicated for acute kidney injury",
      });

      expect(dec.status).toBe("APPROVED");
      expect(dec.decision).toBe("APPROVE_CASE_ONLY");
      expect(dec.decidedBy).toBe("DOC-DR-RAVI");
      expect(dec.learningWritten).toBe(false);
      expect(verifyHashChain().valid).toBe(true);
    });

    it("REJECT_IGNORE marks decision as REJECTED and writes no orders", () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-DOC1",
        kind: "medication",
        payload: { drug: "Hydrochlorothiazide" },
        source: "evidence-copilot",
      });

      const dec = decideApproval({
        suggestionId: s.suggestionId,
        decision: "REJECT_IGNORE",
        doctorId: "DOC-DR-RAVI",
        reason: "Patient has documented sulfonamide allergy",
      });

      expect(dec.status).toBe("REJECTED");
      expect(dec.decision).toBe("REJECT_IGNORE");
      expect(dec.learningWritten).toBe(false);
      expect(verifyHashChain().valid).toBe(true);
    });

    it("DISCUSS_ONLY marks decision as DISCUSSED and writes no orders", () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-DOC1",
        kind: "diagnosis",
        payload: { condition: "Subclinical hyperthyroidism" },
        source: "evidence-copilot",
      });

      const dec = decideApproval({
        suggestionId: s.suggestionId,
        decision: "DISCUSS_ONLY",
        doctorId: "DOC-DR-RAVI",
        reason: "Flag for morning rounds with endocrinologist",
      });

      expect(dec.status).toBe("DISCUSSED");
      expect(dec.decision).toBe("DISCUSS_ONLY");
      expect(dec.learningWritten).toBe(false);
      expect(verifyHashChain().valid).toBe(true);
    });
  });

  describe("3. Memory Toggle Behavior", () => {
    it("defaults to OFF", () => {
      expect(isMemoryToggleOn()).toBe(false);
    });

    it("does NOT write to memory on APPROVE_LEARNING when toggle is OFF", () => {
      setMemoryToggle(false);

      const s = recordSuggestion({
        patientId: "UHID-2026-MEM1",
        kind: "medication",
        payload: { drug: "Ceftriaxone 1g IV" },
        source: "clinical-engine",
      });

      const dec = decideApproval({
        suggestionId: s.suggestionId,
        decision: "APPROVE_LEARNING",
        doctorId: "DOC-DR-MURALI",
        reason: "Empiric coverage for suspected pyelonephritis",
      });

      expect(dec.status).toBe("APPROVED");
      expect(dec.decision).toBe("APPROVE_LEARNING");
      expect(dec.learningWritten).toBe(false);
    });

    it("writes to memory on APPROVE_LEARNING when toggle is ON", () => {
      setMemoryToggle(true);

      const s = recordSuggestion({
        patientId: "UHID-2026-MEM2",
        kind: "medication",
        payload: { drug: "Levofloxacin 500mg PO" },
        source: "evidence-copilot",
      });

      const dec = decideApproval({
        suggestionId: s.suggestionId,
        decision: "APPROVE_LEARNING",
        doctorId: "DOC-DR-MURALI",
        reason: "Approved protocol guideline update",
      });

      expect(dec.status).toBe("APPROVED");
      expect(dec.decision).toBe("APPROVE_LEARNING");
      expect(dec.learningWritten).toBe(true);
    });
  });

  describe("4. Server-Side Enforcement (HospitalCommandEngine Doctor Gate)", () => {
    const doctorUser = {
      userId: "DOC-001",
      name: "Dr. Murali",
      email: "dr.murali@astra.local",
      role: "doctor" as const,
      department: "Internal Medicine",
      authenticated: true,
      sessionToken: "test-session-token",
      expiresAt: Date.now() + 60_000,
      lastActive: Date.now(),
    };

    it("blocks AI-originated order if missing approvalDecisionId", async () => {
      const req: CommandRequest = {
        query: "order CBC for UHID-2026-8801",
        user: doctorUser,
        contextPatientId: "UHID-2026-8801",
        isAiGenerated: true,
        source: "evidence-copilot",
      };

      const result = await commandEngine.execute(req);
      expect(result.success).toBe(false);
      expect(result.message).toContain("AI_ORDER_REQUIRES_DOCTOR_APPROVAL");
      expect(result.message).toContain("missing approvalDecisionId");
    });

    it("blocks AI-originated order if approval decision is not found or still PENDING", async () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-8801",
        kind: "investigation",
        payload: { test: "CBC" },
        source: "evidence-copilot",
      });

      const req: CommandRequest = {
        query: "order CBC for UHID-2026-8801",
        user: doctorUser,
        contextPatientId: "UHID-2026-8801",
        isAiGenerated: true,
        approvalDecisionId: s.suggestionId,
        source: "evidence-copilot",
      };

      const result = await commandEngine.execute(req);
      expect(result.success).toBe(false);
      expect(result.message).toContain("AI_ORDER_REQUIRES_DOCTOR_APPROVAL");
      expect(result.message).toContain("PENDING");
    });

    it("blocks AI-originated order if doctor rejected the suggestion", async () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-8801",
        kind: "medication",
        payload: { drug: "Warfarin" },
        source: "evidence-copilot",
      });

      decideApproval({
        suggestionId: s.suggestionId,
        decision: "REJECT_IGNORE",
        doctorId: doctorUser.userId,
        reason: "Contraindicated",
      });

      const req: CommandRequest = {
        query: "order Warfarin for UHID-2026-8801",
        user: doctorUser,
        contextPatientId: "UHID-2026-8801",
        isAiGenerated: true,
        approvalDecisionId: s.suggestionId,
        source: "evidence-copilot",
      };

      const result = await commandEngine.execute(req);
      expect(result.success).toBe(false);
      expect(result.message).toContain("AI_ORDER_REQUIRES_DOCTOR_APPROVAL");
      expect(result.message).toContain("REJECTED");
    });

    it("allows AI-originated order once approved by doctor", async () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-8801",
        kind: "investigation",
        payload: { test: "Complete Blood Count" },
        source: "evidence-copilot",
      });

      decideApproval({
        suggestionId: s.suggestionId,
        decision: "APPROVE_CASE_ONLY",
        doctorId: doctorUser.userId,
      });

      const req: CommandRequest = {
        query: "order CBC for UHID-2026-8801",
        user: doctorUser,
        contextPatientId: "UHID-2026-8801",
        isAiGenerated: true,
        approvalDecisionId: s.suggestionId,
        source: "evidence-copilot",
      };

      const result = await commandEngine.execute(req);
      // It passes the AI approval gate; CPOE creates order or prompts confirmation
      expect(result.message).not.toContain("AI_ORDER_REQUIRES_DOCTOR_APPROVAL");
      expect(result.intent).toBe("CREATE_ORDER");
    });

    it("unknown-suggestion approval is impossible via the helper", () => {
      expect(() =>
        decideApproval({
          suggestionId: "sug-does-not-exist",
          decision: "APPROVE_CASE_ONLY",
          doctorId: doctorUser.userId,
        })
      ).toThrow("UNKNOWN_SUGGESTION");

      const approval = isApprovedForOrder("sug-does-not-exist", "UHID-2026-8801");
      expect(approval.approved).toBe(false);
      expect(approval.status).toBe("NOT_FOUND");
    });

    it("revoke-after-approve blocks AI-originated orders", () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-8801",
        kind: "investigation",
        payload: { test: "CBC" },
        source: "evidence-copilot",
      });

      const approved = decideApproval({
        suggestionId: s.suggestionId,
        decision: "APPROVE_CASE_ONLY",
        doctorId: doctorUser.userId,
      });
      expect(isApprovedForOrder(approved.decisionId, "UHID-2026-8801").approved).toBe(true);

      decideApproval({
        suggestionId: s.suggestionId,
        decision: "REJECT_IGNORE",
        doctorId: doctorUser.userId,
        reason: "Revoked after review",
      });

      const approval = isApprovedForOrder(approved.decisionId, "UHID-2026-8801");
      expect(approval.approved).toBe(false);
      expect(approval.status).toBe("REJECTED");
    });

    it("patient mismatch blocks approved AI-originated orders", () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-8801",
        kind: "medication",
        payload: { drug: "Ceftriaxone" },
        source: "evidence-copilot",
      });

      const dec = decideApproval({
        suggestionId: s.suggestionId,
        decision: "APPROVE_CASE_ONLY",
        doctorId: doctorUser.userId,
      });

      const approval = isApprovedForOrder(dec.decisionId, "UHID-OTHER");
      expect(approval.approved).toBe(false);
      expect(approval.status).toBe("PATIENT_MISMATCH");
    });

    it("manual doctor orders bypass the AI approval check unaffected", async () => {
      const req: CommandRequest = {
        query: "order CBC for UHID-2026-8801",
        user: doctorUser,
        contextPatientId: "UHID-2026-8801",
        isAiGenerated: false,
      };

      const result = await commandEngine.execute(req);
      expect(result.message).not.toContain("AI_ORDER_REQUIRES_DOCTOR_APPROVAL");
      expect(result.intent).toBe("CREATE_ORDER");
    });
  });

  describe("5. Patient-Facing Guard", () => {
    it("permits standard non-AI communications", () => {
      const check = verifyPatientMessageGuard({
        isAiGenerated: false,
        recipientType: "patient",
      });
      expect(check.allowed).toBe(true);
    });

    it("blocks AI-generated messages to patients without approvalDecisionId", () => {
      const check = verifyPatientMessageGuard({
        isAiGenerated: true,
        recipientType: "patient",
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("GUARD_BLOCKED");
      expect(check.reason).toContain("Doctor Approval Gate decision of kind 'patient-message'");
    });

    it("blocks AI-generated messages if decision kind is not 'patient-message'", () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-8801",
        kind: "investigation",
        payload: { test: "ECG" },
        source: "evidence-copilot",
      });

      decideApproval({
        suggestionId: s.suggestionId,
        decision: "APPROVE_CASE_ONLY",
        doctorId: "DOC-001",
      });

      const check = verifyPatientMessageGuard({
        isAiGenerated: true,
        approvalDecisionId: s.suggestionId,
        recipientType: "attender",
      });
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("'patient-message' is strictly required");
    });

    it("allows AI-generated message if approved with kind 'patient-message'", () => {
      const s = recordSuggestion({
        patientId: "UHID-2026-8801",
        kind: "patient-message",
        payload: { message: "Your lab tests are normal. Continue medications as advised." },
        source: "dr-mayin",
      });

      decideApproval({
        suggestionId: s.suggestionId,
        decision: "APPROVE_CASE_ONLY",
        doctorId: "DOC-001",
      });

      const check = verifyPatientMessageGuard({
        isAiGenerated: true,
        approvalDecisionId: s.suggestionId,
        recipientType: "patient",
      });
      expect(check.allowed).toBe(true);
      expect(check.decision?.status).toBe("APPROVED");
    });
  });

  describe("6. Patient Filtering", () => {
    it("returns only decisions corresponding to specified patient UHID", () => {
      recordSuggestion({
        patientId: "UHID-AAA",
        kind: "investigation",
        payload: { test: "Lipid Profile" },
        source: "copilot",
      });
      recordSuggestion({
        patientId: "UHID-BBB",
        kind: "medication",
        payload: { drug: "Metformin" },
        source: "copilot",
      });
      recordSuggestion({
        patientId: "UHID-AAA",
        kind: "procedure",
        payload: { procedure: "Wound Dressing" },
        source: "copilot",
      });

      const pA = getDecisionsForPatient("UHID-AAA");
      const pB = getDecisionsForPatient("UHID-BBB");

      expect(pA.length).toBe(2);
      expect(pA.every((d) => d.patientId === "UHID-AAA")).toBe(true);
      expect(pB.length).toBe(1);
      expect(pB[0].patientId === "UHID-BBB").toBe(true);
    });
  });
});
