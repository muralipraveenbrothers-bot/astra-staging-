/**
 * ASTRA AI — Work-Order REST API (/api/workorders)
 * ============================================================================
 * Doctor Command Center → staff workflow. Role-gated per §54 action classes:
 * doctor creates/reviews; billing sets amounts; department ack/start/complete;
 * admin/seo for registry mutations. Mounted at /api/workorders.
 */
import type { Express, Request } from "express";
import { workOrderEngine, type WorkOrderStatus, type WorkArea } from "../services/workOrders";
import type { UserSession } from "../types";
import { isApprovedForOrder } from "../../src/astra/approval/approvalGate.js";
import { consumeApprovalAndCreateOrderAtomically } from "../../src/astra/approval/orderApprovalGate.js";
import { classifyOrderRisk, isOrderApprovalEnforced } from "../../src/astra/approval/orderRisk.js";
import { acknowledgeClinicalReviewTask, acknowledgeWorkOrderNotification, listClinicalReviewTasks, listWorkOrderNotifications } from "../services/workOrderNotifications";
import { requireRole } from "../rbac";
import { db } from "../db";

// `authenticate` (server/rbac.ts) attaches `req.user`, but Express's Request
// type does not declare it, so the direct cast was TS2352. Route through
// `unknown` to make the assertion explicit.
function who(req: Request): UserSession { return (req as unknown as { user: UserSession }).user; }
function isAdmin(u: UserSession): boolean { return u.role === "admin" || u.role === "ceo"; }

export function registerWorkOrderRoutes(app: Express): void {
  const eng = workOrderEngine;

  // Seed demo data on first run (staff registry + Bed-4 CBP order)
  app.post("/api/workorders/seed", (_req, res) => { eng.seedDemo(); res.json({ ok: true, seeded: true }); });
  app.get("/api/workorders/dashboard", (_req, res) => res.json(eng.dashboard()));
  app.get("/api/workorders/sla", (_req, res) => res.json({ overdue: eng.checkSla() }));
  app.get("/api/workorders/performance", (_req, res) => res.json(eng.staffPerformance()));
  app.get("/api/workorders/notifications", (req, res) => {
    const u = who(req);
    res.json({ notifications: listWorkOrderNotifications({ status: req.query.status as any, orderId: req.query.orderId as string | undefined, role: u.role }) });
  });
  app.get("/api/workorders/clinical-review-inbox", (req, res) => {
    res.json({ tasks: listClinicalReviewTasks(who(req).role) });
  });
  app.post("/api/workorders/clinical-review-inbox/:id/ack", (req, res) => {
    const user = who(req);
    const task = acknowledgeClinicalReviewTask(req.params.id, user.role);
    if (!task) return res.status(403).json({ error: "FORBIDDEN" });
    res.json({ task });
  });
  app.post("/api/workorders/notifications/:id/ack", (req, res) => {
    const u = who(req); const existing = listWorkOrderNotifications().find((x) => x.id === req.params.id);
    if (!existing) return res.status(404).json({ error: "NOT_FOUND" });
    if (existing.recipientRole !== u.role && !isAdmin(u)) return res.status(403).json({ error: "FORBIDDEN" });
    const n = acknowledgeWorkOrderNotification(req.params.id, u.name)!;
    res.json({ notification: n });
  });

  // ---- Staff registry ----
  app.get("/api/workorders/staff", (req, res) => {
    const dept = req.query.department as WorkArea | undefined;
    res.json({ staff: eng.listStaff(dept) });
  });
  app.post("/api/workorders/staff", (req, res) => {
    const u = who(req); if (!isAdmin(u)) return res.status(403).json({ error: "FORBIDDEN" });
    res.status(201).json(eng.addStaff(req.body));
  });
  app.patch("/api/workorders/staff/:id", (req, res) => {
    const u = who(req); if (!isAdmin(u)) return res.status(403).json({ error: "FORBIDDEN" });
    const r = eng.updateStaff(req.params.id, req.body);
    res.json(r ?? { error: "NOT_FOUND" });
  });

  // ---- Work orders ----
  app.get("/api/workorders", (req, res) => {
    const { status, department, patientId } = req.query;
    res.json({ orders: eng.listOrders({ status: status as WorkOrderStatus | undefined, department: department as WorkArea | undefined, patientId: patientId as string | undefined }) });
  });
  app.get("/api/workorders/:id", (req, res) => {
    const o = eng.getOrder(req.params.id);
    res.json(o ?? { error: "NOT_FOUND" });
  });

  // CREATE clinical order (doctor)
  app.post("/api/workorders", requireRole(["doctor", "ceo", "admin"]), (req, res) => {
    const u = who(req);
    const { isAiGenerated, approvalDecisionId, source } = req.body ?? {};
    if (isAiGenerated || source === "AI" || source === "evidence-copilot" || source === "astra_ai") {
      if (!approvalDecisionId) {
        return res.status(403).json({
          error: "AI_ORDER_UNAPPROVED",
          message: "AI-originated clinical order requires an approved Doctor Approval Gate decision (missing approvalDecisionId).",
        });
      }
      const approval = isApprovedForOrder(approvalDecisionId, req.body?.patientId || req.body?.uhid);
      if (!approval.approved) {
        return res.status(403).json({
          error: "AI_ORDER_UNAPPROVED",
          message: `AI-originated clinical order requires an approved Doctor Approval Gate decision (status is ${approval.status}).`,
        });
      }
    }
    try {
      const idempotencyKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : req.body?.idempotencyKey;
      const create = () => eng.createClinicalOrder({ ...req.body, idempotencyKey, actor: u.name, role: u.role });
      const enforcement = isOrderApprovalEnforced();
      const tier = classifyOrderRisk({
        order: req.body ?? {},
        serviceCode: typeof req.body?.serviceCode === "string" ? req.body.serviceCode : undefined,
        emergencyRecordId: typeof req.body?.emergencyRecordId === "string" ? req.body.emergencyRecordId : undefined,
      });
      if (enforcement && tier !== "STANDARD") {
        if (!approvalDecisionId) {
          db.logAudit({
            actorId: u.userId,
            actorName: "work-order-gate",
            actorRole: u.role,
            action: "ORDER_BLOCKED_UNAPPROVED",
            category: "approval",
            status: "DENIED",
            details: JSON.stringify({ decisionId: "none", reason: "ORDER_APPROVAL_REQUIRED" }),
          });
          return res.status(403).json({ error: "ORDER_APPROVAL_REQUIRED", message: "Non-standard clinical orders require an approved decision." });
        }
        const order = consumeApprovalAndCreateOrderAtomically({
          approvalDecisionId: String(approvalDecisionId),
          patientId: req.body?.patientId,
          uhid: req.body?.uhid,
          order: req.body ?? {},
          serviceCode: req.body?.serviceCode,
          emergencyRecordId: req.body?.emergencyRecordId,
          createOrder: create,
        });
        db.logAudit({
          actorId: u.userId,
          actorName: "work-order-gate",
          actorRole: u.role,
          action: "APPROVAL_CONSUMED",
          category: "approval",
          status: "SUCCESS",
          details: JSON.stringify({ decisionId: String(approvalDecisionId), orderId: typeof order?.id === "string" ? order.id : "created", reason: "approval consumed" }),
        });
        return res.status(201).json(order);
      }
      const order = create();
      res.status(201).json(order);
    }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // BILL amount/discount
  app.post("/api/workorders/:id/bill", requireRole(["billing", "doctor", "ceo", "admin"]), (req, res) => {
    const u = who(req);
    try { res.json(eng.billAmount(req.params.id, Number(req.body.amount), Number(req.body.discount ?? 0), u.name, u.role, req.body.note)); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // PAYMENT
  app.post("/api/workorders/:id/pay", requireRole(["billing", "reception", "doctor", "ceo", "admin"]), (req, res) => {
    const u = who(req);
    try { res.json(eng.recordPayment(req.params.id, u.name, u.role, req.body.reference)); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // ACKNOWLEDGE (department)
  app.post("/api/workorders/:id/ack", requireRole(["lab", "radiology", "pharmacy", "ward", "nurse", "ot", "billing", "reception", "doctor", "admin"]), (req, res) => {
    const u = who(req);
    try { res.json(eng.acknowledge(req.params.id, u.name, u.role)); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // START work
  app.post("/api/workorders/:id/start", requireRole(["lab", "radiology", "pharmacy", "ward", "nurse", "ot", "billing", "reception", "doctor", "admin"]), (req, res) => {
    const u = who(req);
    try { res.json(eng.startWork(req.params.id, u.name, u.role)); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // COMPLETE + result
  app.post("/api/workorders/:id/complete", requireRole(["lab", "radiology", "pharmacy", "ward", "nurse", "ot", "billing", "reception", "doctor", "admin"]), (req, res) => {
    const u = who(req);
    try { res.json(eng.complete(req.params.id, req.body.resultSummary, u.name, u.role)); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // REVIEW (doctor)
  app.post("/api/workorders/:id/review", requireRole(["doctor", "ceo", "admin"]), (req, res) => {
    const u = who(req);
    try { res.json(eng.review(req.params.id, u.name, u.role, req.body.notes)); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // CANCEL / ESCALATE
  app.post("/api/workorders/:id/cancel", requireRole(["doctor", "ceo", "admin"]), (req, res) => {
    const u = who(req);
    try { res.json(eng.cancel(req.params.id, u.name, u.role, req.body.reason)); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });
  app.post("/api/workorders/:id/escalate", requireRole(["doctor", "supervisor", "ceo", "admin"]), (req, res) => {
    const u = who(req);
    try { res.json(eng.escalate(req.params.id, u.name, u.role, req.body.reason)); }
    catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });
}
