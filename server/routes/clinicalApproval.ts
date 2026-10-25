import { Express, Request, Response } from "express";
import { ClinicalActionPipeline } from "../ai/orderValidator.js";
import { authenticate, requireRole } from "../rbac.js";
import type { UserSession } from "../types.js";
import {
  recordSuggestion,
  decideApproval,
  getDecision,
  getDecisionsForPatient,
  getAllDecisions,
  verifyHashChain,
  isMemoryToggleOn,
  setMemoryToggle,
  verifyPatientMessageGuard,
  type ApprovalKind,
  type DoctorDecisionChoice,
  appendSignedApprovalRecord,
} from "../../src/astra/approval/approvalGate.js";
import { computeOrderFingerprint, signApprovalSecurityReferenced } from "../../src/astra/approval/orderApprovalCrypto.js";
import { classifyOrderRisk, isOrderApprovalEnforced } from "../../src/astra/approval/orderRisk.js";
import { db } from "../db";

// Every route requires a real logged-in session (authenticate -> 401 otherwise).
// There is NO fallback doctor id: the actor is always the session user.
function sessionUser(req: Request): UserSession | undefined {
  return (req as any).user as UserSession | undefined;
}

export function registerClinicalApprovalRoutes(app: Express) {
  // 1. Stage a Clinical Write Action
  app.post("/api/clinical/action/stage", authenticate, (req: Request, res: Response) => {
    const { actionType, targetQueryKey, payload, idempotencyKey } = req.body;
    const user = sessionUser(req);
    if (!user?.userId) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    const doctorId = user.userId;

    const result = ClinicalActionPipeline.stageAction({
      actionType,
      targetQueryKey,
      payload,
      doctorId,
      idempotencyKey,
    });

    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error, validation: result.validation });
    }

    return res.json({ ok: true, stagedAction: result.stagedAction, validation: result.validation });
  });

  // 2. Authenticated Doctor Signature Endpoint (BACKEND APPROVAL STATE)
  // Text prompts CANNOT bypass this endpoint. Must provide valid actionHash.
  app.post("/api/clinical/approval/sign", authenticate, requireRole(["doctor"]), (req: Request, res: Response) => {
    const { actionId, actionHash } = req.body;
    const user = sessionUser(req);
    if (!user?.userId) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    const doctorId = user.userId;
    const role = user.role;

    const result = ClinicalActionPipeline.approveStagedAction({
      actionId,
      providedActionHash: actionHash,
      doctorId,
      role,
    });

    if (!result.success) {
      return res.status(403).json({ ok: false, error: result.error });
    }

    return res.json({ ok: true, approval: result.approval });
  });

  // 3. Commit Approved Action to HIMS Source-of-Truth
  app.post("/api/clinical/action/commit", authenticate, (req: Request, res: Response) => {
    const { actionId, idempotencyKey } = req.body;

    const result = ClinicalActionPipeline.commitAction(actionId, idempotencyKey);
    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    return res.json({ ok: true, result: result.result });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // DOCTOR APPROVAL GATE & AI DECISION LOG (R5-01)
  // ───────────────────────────────────────────────────────────────────────────

  // Record an AI suggestion awaiting doctor decision
  app.post("/api/clinical/approval/suggestion", authenticate, (req: Request, res: Response) => {
    const { suggestionId, patientId, kind, payload, source } = req.body ?? {};
    if (!patientId || !kind) {
      return res.status(400).json({ ok: false, error: "MISSING_REQUIRED_FIELDS", message: "patientId and kind are required." });
    }
    const entry = recordSuggestion({
      suggestionId,
      patientId: String(patientId),
      kind: kind as ApprovalKind,
      payload,
      source: String(source || "ai-engine"),
    });
    return res.status(201).json({ ok: true, suggestion: entry });
  });

  // Submit doctor decision (Discuss Only | Approve – This Case Only | Approve + Learning | Reject / Ignore)
  app.post("/api/clinical/approval/decision", authenticate, requireRole(["doctor", "admin"]), (req: Request, res: Response) => {
    const user = sessionUser(req);
    const { suggestionId, decision, reason, memoryToggle } = req.body ?? {};
    if (!suggestionId || !decision) {
      return res.status(400).json({ ok: false, error: "MISSING_DECISION", message: "suggestionId and decision are required." });
    }

    const validDecisions: DoctorDecisionChoice[] = [
      "DISCUSS_ONLY",
      "APPROVE_CASE_ONLY",
      "APPROVE_LEARNING",
      "REJECT_IGNORE",
    ];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_DECISION",
        message: `Decision must be one of: ${validDecisions.join(", ")}`,
      });
    }
    if (!user?.userId) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    if (!getDecision(String(suggestionId))) {
      return res.status(404).json({
        ok: false,
        error: "SUGGESTION_NOT_FOUND",
        message: `Suggestion '${suggestionId}' was not found in the AI decision log.`,
      });
    }

    const suggestion = getDecision(String(suggestionId));
    const order = suggestion?.payload && typeof suggestion.payload === "object" ? suggestion.payload as Record<string, unknown> : {};
    const enforced = isOrderApprovalEnforced();
    const riskTier = enforced ? classifyOrderRisk({ order, serviceCode: typeof order.serviceCode === "string" ? order.serviceCode : undefined, emergencyRecordId: typeof order.emergencyRecordId === "string" ? order.emergencyRecordId : undefined }) : undefined;
    if (enforced && (riskTier === "HIGH" || riskTier === "EMERGENCY") && user.role !== "doctor") {
      return res.status(403).json({ ok: false, error: "HIGH_RISK_DOCTOR_APPROVAL_REQUIRED" });
    }
    const decidedAt = new Date().toISOString();
    const expiresAt = new Date(Date.parse(decidedAt) + 30 * 60 * 1000).toISOString();
    const updated = decideApproval({
      suggestionId: String(suggestionId),
      decision: decision as DoctorDecisionChoice,
      doctorId: user.userId,
      reason: reason ? String(reason) : undefined,
      memoryToggleOverride: memoryToggle !== undefined ? !!memoryToggle : undefined,
      decidedByRole: user.role,
      riskTier,
      orderFingerprint: enforced && riskTier !== "STANDARD" ? computeOrderFingerprint({ ...order, patientId: suggestion?.patientId }) : undefined,
      expiresAt: enforced ? expiresAt : undefined,
      emergencyRecordId: typeof order.emergencyRecordId === "string" ? order.emergencyRecordId : undefined,
    });

    if (enforced && riskTier !== "STANDARD" && updated.status === "APPROVED") {
      appendSignedApprovalRecord(updated, (record) => signApprovalSecurityReferenced(record, updated.entryHash));
      db.logAudit({
        actorId: user.userId,
        actorName: "clinical-approval",
        actorRole: user.role,
        action: "APPROVAL_SIGNED",
        category: "approval",
        status: "SUCCESS",
        details: JSON.stringify({ decisionId: updated.decisionId, reason: "doctor approval signed" }),
      });
    }

    return res.json({ ok: true, decision: updated });
  });

  // Read-only AI Decisions View (Filtered by patientId or all)
  app.get("/api/clinical/approval/decisions", authenticate, (req: Request, res: Response) => {
    const patientId = req.query.patientId as string | undefined;
    if (patientId) {
      return res.json({ ok: true, decisions: getDecisionsForPatient(patientId) });
    }
    return res.json({ ok: true, decisions: getAllDecisions() });
  });

  // Tamper-evident hash chain verification
  app.get("/api/clinical/approval/verify-chain", authenticate, (_req: Request, res: Response) => {
    const result = verifyHashChain();
    return res.json({ ok: true, verification: result });
  });

  // Memory Toggle (default OFF)
  app.get("/api/clinical/approval/memory-toggle", authenticate, (_req: Request, res: Response) => {
    return res.json({ ok: true, enabled: isMemoryToggleOn() });
  });

  app.post("/api/clinical/approval/memory-toggle", authenticate, requireRole(["doctor", "admin"]), (req: Request, res: Response) => {
    const { enabled } = req.body ?? {};
    setMemoryToggle(!!enabled);
    return res.json({ ok: true, enabled: isMemoryToggleOn() });
  });

  // Patient-facing Guard
  app.post("/api/clinical/approval/patient-message-guard", authenticate, (req: Request, res: Response) => {
    const { isAiGenerated, approvalDecisionId, recipientType } = req.body ?? {};
    const guard = verifyPatientMessageGuard({
      isAiGenerated: !!isAiGenerated,
      approvalDecisionId,
      recipientType,
    });
    if (!guard.allowed) {
      return res.status(403).json({ ok: false, error: "GUARD_BLOCKED", reason: guard.reason });
    }
    return res.json({ ok: true, allowed: true, decision: guard.decision });
  });
}
