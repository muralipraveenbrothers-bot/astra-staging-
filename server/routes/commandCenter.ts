import type { Express, Request } from "express";
import { authenticate, requireRole } from "../rbac";
import { db } from "../db";
import { workOrderEngine } from "../services/workOrders";
import { listWorkOrderNotifications } from "../services/workOrderNotifications";
import { listCriticalAlerts } from "../../src/astra/clinical/results/resultsLoop.js";
import { listReportVersions, listResultsLog, listResultNotifications } from "../../src/astra/clinical/results/resultsLoop.js";
import { listWorkflowEvents } from "../../src/astra/clinical/workflow/workflowGuard.js";
import { resolveAndLock, validatePatientLock, type PatientContextLock } from "../patient/patientContext";
import { advanceTransfusion, createTransfusion, getTransfusion, listTransfusions, type TransfusionState } from "../services/transfusionSafety";
import { execCeoAgent } from "../../src/agents/executive/ExecCeoAgent";

export function registerCommandCenterRoutes(app: Express): void {
  app.get("/api/command-center/overview", authenticate, requireRole(["doctor", "ceo", "admin"]), (req: Request, res) => {
    const user = (req as any).user as { role: string; userId: string };
    const dashboard = workOrderEngine.dashboard();
    const notifications = listWorkOrderNotifications({ role: user.role as any });
    const bills = db.getBills();
    const alerts = listCriticalAlerts("open");
    res.json({ ok: true, generatedAt: new Date().toISOString(), role: user.role, orders: dashboard, notifications: { unread: notifications.filter((n) => n.status === "UNREAD").length, items: notifications.slice(0, 50) }, billing: { bills: bills.length, outstanding: bills.reduce((sum, b) => sum + Math.max(0, b.totalAmount - b.paidAmount), 0), pending: bills.filter((b) => b.totalAmount > b.paidAmount).length }, clinical: { openCriticalAlerts: alerts.length }, safety: { doctorConfirmationRequiredForClinicalActions: true, ceoAdministrativeOversightOnly: true } });
  });
  app.post("/api/command-center/executive-report", authenticate, requireRole(["ceo", "admin"]), async (req: Request, res) => {
    const domain = String(req.body?.domain ?? "operations") as any;
    const report = await execCeoAgent.generateReport({ query: String(req.body?.query ?? "overview"), domain }, {
      orders: workOrderEngine.listOrders().map((order) => ({ department: order.department, status: order.status, dueAt: order.dueAt })),
      bills: db.getBills().map((bill) => ({ totalAmount: bill.totalAmount, paidAmount: bill.paidAmount })),
      staff: workOrderEngine.listStaff().map((member) => ({ department: member.department, status: member.status })),
      alerts: listCriticalAlerts("all").map((alert) => ({ severity: alert.severity, status: alert.acknowledged ? "acknowledged" : "open" })),
    });
    res.json({ ok: true, report, safety: "Read-only executive intelligence; no clinical authority or operational mutation." });
  });
  app.get("/api/command-center/orders/query", authenticate, requireRole(["doctor", "ceo", "admin"]), (req: Request, res) => {
    const dashboard = workOrderEngine.listOrders({ patientId: req.query.patientUhid ? String(req.query.patientUhid) : undefined, status: req.query.status as any, department: req.query.department as any });
    const now = Date.now();
    const orders = dashboard.map((order) => ({ ...order, owner: order.assignedTo ?? null, ageMinutes: Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000)), delayed: Boolean(order.dueAt && new Date(order.dueAt).getTime() < now && !["COMPLETED", "CANCELLED"].includes(order.status)), accountability: { requestedBy: order.requestedBy, patient: { id: order.patientId, name: order.patientName, bed: order.bed, ward: order.ward }, ordered: { serviceCode: order.serviceCode, serviceName: order.serviceName, priority: order.priority }, authorizedBy: order.requestedBy, department: order.department, responsibleWorker: order.assignedName ?? order.assignedTo ?? null, timestamps: { created: order.createdAt, acknowledged: order.acknowledgedAt ?? null, started: order.startedAt ?? null, completed: order.completedAt ?? null, updated: order.updatedAt }, deadline: order.dueAt ?? null, currentState: order.status, blocker: order.status === "DELAYED" || order.status === "ESCALATED" ? "SLA or escalation requires follow-up" : null, completionEvidence: order.resultSummary ?? null, reviewedBy: order.reviewedBy ?? null } }));
    res.json({ ok: true, orders, query: { patientUhid: req.query.patientUhid ?? null, status: req.query.status ?? "any", department: req.query.department ?? "any" }, safety: "Read-only oversight query; no order state is changed." });
  });
  app.get("/api/command-center/delays", authenticate, requireRole(["doctor", "ceo", "admin"]), (_req, res) => {
    const now = Date.now();
    const delayed = workOrderEngine.listOrders().filter((order) => !["COMPLETED", "CANCELLED", "CLOSED"].includes(order.status) && (((order as any).dueAt ? new Date((order as any).dueAt).getTime() < now : new Date(order.createdAt).getTime() + order.slaMinutes * 60_000 < now) || order.status === "DELAYED" || order.status === "ESCALATED"));
    const staff = workOrderEngine.listStaff();
    const groups = new Map<string, { department: string; supervisor: string | null; count: number; orders: unknown[] }>();
    for (const order of delayed) {
      const assigned = staff.find((member) => member.id === order.assignedTo || member.name === order.assignedName);
      const key = `${order.department}:${assigned?.supervisor ?? "unassigned"}`;
      const group = groups.get(key) ?? { department: order.department, supervisor: assigned?.supervisor ?? null, count: 0, orders: [] };
      group.count += 1; group.orders.push({ id: order.id, patientId: order.patientId, serviceName: order.serviceName, status: order.status, assignedTo: order.assignedName ?? order.assignedTo ?? null, updatedAt: order.updatedAt }); groups.set(key, group);
    }
    res.json({ ok: true, generatedAt: new Date().toISOString(), totalDelayed: delayed.length, groups: [...groups.values()].sort((a, b) => b.count - a.count), safety: "Read-only operational oversight; no escalation or order mutation is performed." });
  });
  app.get("/api/command-center/accountability", authenticate, requireRole(["doctor", "ceo", "admin"]), (_req, res) => {
    const terminal = new Set(["COMPLETED", "CANCELLED", "CLOSED"]);
    const records = workOrderEngine.listOrders().map((order) => {
      const unresolved = !terminal.has(order.status);
      const overdue = unresolved && (order.status === "DELAYED" || order.status === "ESCALATED" || Date.now() > new Date(order.dueAt ?? order.createdAt).getTime() + (order.dueAt ? 0 : order.slaMinutes * 60_000));
      return { id: order.id, patientId: order.patientId, status: order.status, terminal: !unresolved, unresolved, owner: order.assignedName ?? order.assignedTo ?? null, reason: unresolved ? (overdue ? "SLA deadline exceeded or escalation required" : `Awaiting ${order.status.toLowerCase().replaceAll("_", " ")}`) : null, escalationPath: unresolved ? (order.status === "ESCALATED" || overdue ? `Supervisor → ${order.department} lead → CEO oversight` : `Department owner → ${order.department} supervisor`) : null, evidence: order.resultSummary ?? null, updatedAt: order.updatedAt };
    });
    const unresolved = records.filter((record) => record.unresolved);
    res.json({ ok: true, generatedAt: new Date().toISOString(), successCondition: "completed | explicitly cancelled | visibly unresolved with owner, reason and escalation pathway", totals: { accepted: records.length, completedOrCancelled: records.length - unresolved.length, unresolved: unresolved.length }, records, safety: "Read-only accountability audit; no order state is changed." });
  });
  app.get("/api/command-center/patient-timeline/:uhid", authenticate, requireRole(["doctor", "ceo", "admin", "nurse", "ward", "lab", "radiology"]), (req: Request, res) => {
    const uhid = String(req.params.uhid);
    const patient = db.getPatientById(uhid);
    if (!patient) return void res.status(404).json({ ok: false, error: "PATIENT_NOT_FOUND" });
    const events: Array<{ at: string; type: string; source: string; detail: unknown }> = [];
    for (const order of workOrderEngine.listOrders({ patientId: patient.uhid })) events.push({ at: order.createdAt, type: `ORDER_${order.status}`, source: "work-order", detail: { id: order.id, service: order.serviceName, department: order.department, assignedTo: order.assignedTo ?? null } });
    for (const report of listReportVersions(patient.uhid)) events.push({ at: report.uploadedAt, type: "REPORT", source: "results", detail: { id: report.id, title: report.title, status: report.status } });
    for (const result of listResultsLog(patient.uhid)) events.push({ at: result.at, type: "RESULT", source: "results", detail: result });
    for (const event of listWorkflowEvents(patient.uhid)) events.push({ at: event.at, type: event.event, source: "workflow", detail: event });
    for (const alert of listCriticalAlerts("all", patient.uhid)) events.push({ at: alert.createdAt, type: "CRITICAL_ALERT", source: "results", detail: { id: alert.id, severity: alert.severity, acknowledged: alert.acknowledged } });
    for (const notification of listResultNotifications(patient.uhid, false)) events.push({ at: notification.createdAt, type: "RESULT_NOTIFICATION", source: "results", detail: notification });
    for (const audit of db.getAuditTrail(1000).filter((entry) => entry.patientId === patient.id || entry.patientId === patient.uhid)) events.push({ at: audit.timestamp, type: "AUDIT", source: "audit", detail: { action: audit.action, actor: audit.actorName, status: audit.status } });
    events.sort((a, b) => b.at.localeCompare(a.at));
    res.json({ ok: true, patient: { uhid: patient.uhid, name: patient.name, admissionStatus: patient.admissionStatus }, events, provenance: ["hospital-db", "work-order-engine", "results-loop", "workflow-guard", "audit-log"] });
  });
  app.post("/api/command-center/patient-lock", authenticate, requireRole(["doctor", "nurse", "ward", "lab", "radiology", "admin"]), (req: Request, res) => {
    try {
      const reference = String(req.body?.bedNumber ?? req.body?.patientReference ?? "").trim();
      if (!reference) return void res.status(400).json({ ok: false, error: "PATIENT_REFERENCE_REQUIRED" });
      const resolved = resolveAndLock({ bedNumber: reference, wardHint: req.body?.wardHint ? String(req.body.wardHint) : undefined });
      res.json({ ok: true, context: resolved.context, lock: resolved.lock, safety: "Lock must be validated immediately before consequential clinical action." });
    } catch (error) { res.status(409).json({ ok: false, error: error instanceof Error ? error.message : "PATIENT_CONTEXT_REFUSED" }); }
  });
  app.post("/api/command-center/patient-lock/validate", authenticate, requireRole(["doctor", "nurse", "ward", "lab", "radiology", "admin"]), (req: Request, res) => {
    const lock = req.body?.lock as PatientContextLock | undefined;
    if (!lock?.patientId || !lock.contextVersion) return void res.status(400).json({ ok: false, error: "LOCK_REQUIRED" });
    const result = validatePatientLock(lock);
    res.status(result.valid ? 200 : 409).json({ ok: result.valid, ...result, safety: "Fail closed on patient reassignment, stale context, transfer, discharge, or bed reuse." });
  });
  app.get("/api/command-center/transfusions", authenticate, requireRole(["doctor", "nurse", "ward", "admin"]), (req, res) => res.json({ ok: true, records: listTransfusions(req.query.patientUhid ? String(req.query.patientUhid) : undefined) }));
  app.post("/api/command-center/transfusions", authenticate, requireRole(["doctor", "ward", "admin"]), (req: Request, res) => { try { res.status(201).json({ ok: true, record: createTransfusion({ patientUhid: String(req.body?.patientUhid ?? ""), product: String(req.body?.product ?? ""), units: Number(req.body?.units), actor: String((req as any).user?.name ?? "unknown") }) }); } catch (e) { res.status(400).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); } });
  app.post("/api/command-center/transfusions/:id/advance", authenticate, requireRole(["doctor", "nurse", "ward", "admin"]), (req: Request, res) => { try { const record = advanceTransfusion(req.params.id, String(req.body?.state) as TransfusionState, String((req as any).user?.name ?? "unknown"), req.body?.checks); res.json({ ok: true, record }); } catch (e) { res.status(409).json({ ok: false, error: e instanceof Error ? e.message : String(e), record: getTransfusion(req.params.id) ?? null }); } });
  app.get("/api/command-center/discharge-readiness/:uhid", authenticate, requireRole(["doctor", "ward", "billing", "admin"]), (req: Request, res) => {
    const uhid = String(req.params.uhid); const patient = db.getPatientById(uhid);
    if (!patient) return void res.status(404).json({ ok: false, error: "PATIENT_NOT_FOUND" });
    const openOrders = workOrderEngine.listOrders({ patientId: patient.uhid }).filter((o) => !["COMPLETED", "CANCELLED"].includes(o.status));
    const alerts = listCriticalAlerts("open", patient.uhid);
    const bills = db.getBills().filter((b) => b.patientId === patient.id || b.uhid === patient.uhid);
    const outstanding = bills.reduce((sum, b) => sum + Math.max(0, b.totalAmount - b.paidAmount), 0);
    const clinicallyReady = alerts.length === 0 && openOrders.length === 0;
    const administrativelyReady = outstanding === 0;
    res.json({ ok: true, patient: { uhid: patient.uhid, name: patient.name, admissionStatus: patient.admissionStatus }, readiness: { clinicallyReady, administrativelyReady, physicallyDischarged: patient.admissionStatus === "discharged", blockers: [...alerts.map((a) => `Critical alert: ${a.id}`), ...openOrders.map((o) => `Open order: ${o.id}`), ...(outstanding ? [`Outstanding balance: ₹${outstanding}`] : [])] }, counts: { openOrders: openOrders.length, criticalAlerts: alerts.length, outstanding }, safety: "Read-only readiness assessment; discharge authorization remains with the treating doctor and authorized hospital workflow." });
  });
  app.get("/api/command-center/discharge-bottlenecks", authenticate, requireRole(["doctor", "ceo", "admin"]), (_req, res) => {
    const groups = new Map<string, { department: string; patients: Array<{ uhid: string; name: string; orderId?: string; reason: string }> }>();
    for (const patient of db.getPatients().filter((p) => p.admissionStatus === "inpatient" || p.admissionStatus === "emergency")) {
      for (const order of workOrderEngine.listOrders({ patientId: patient.uhid }).filter((o) => !["COMPLETED", "CANCELLED", "CLOSED"].includes(o.status))) {
        const group = groups.get(order.department) ?? { department: order.department, patients: [] }; group.patients.push({ uhid: patient.uhid, name: patient.name, orderId: order.id, reason: `Open ${order.serviceName} (${order.status})` }); groups.set(order.department, group);
      }
      const outstanding = db.getBills().filter((b) => b.patientId === patient.id || b.uhid === patient.uhid).reduce((sum, b) => sum + Math.max(0, b.totalAmount - b.paidAmount), 0);
      if (outstanding > 0) { const group = groups.get("Billing") ?? { department: "Billing", patients: [] }; group.patients.push({ uhid: patient.uhid, name: patient.name, reason: `Outstanding balance ₹${outstanding}` }); groups.set("Billing", group); }
    }
    res.json({ ok: true, generatedAt: new Date().toISOString(), groups: [...groups.values()].sort((a, b) => b.patients.length - a.patients.length), safety: "Read-only bottleneck report; clinical and discharge authorization remain with authorized staff." });
  });
  app.get("/api/command-center/shift-handover", authenticate, requireRole(["doctor", "nurse", "ward", "admin"]), (req: Request, res) => {
    const activeOrders = workOrderEngine.listOrders().filter((order) => !["COMPLETED", "CANCELLED", "CLOSED"].includes(order.status));
    const alerts = listCriticalAlerts("open");
    res.json({ ok: true, generatedAt: new Date().toISOString(), shift: String(req.query.shift ?? "current"), activeTasks: activeOrders.map((order) => ({ id: order.id, patientId: order.patientId, service: order.serviceName, department: order.department, status: order.status, assignedTo: order.assignedName ?? order.assignedTo ?? null })), criticalAlerts: alerts, acknowledgmentRequired: activeOrders.length > 0 || alerts.length > 0, safety: "Incoming staff must acknowledge the handover; acknowledgment does not change clinical orders." });
  });
  app.post("/api/command-center/shift-handover/acknowledge", authenticate, requireRole(["doctor", "nurse", "ward", "admin"]), (req: Request, res) => {
    const user = (req as any).user as { userId: string; name: string; role: string };
    const snapshot = { shift: String(req.body?.shift ?? "current"), notes: String(req.body?.notes ?? "").slice(0, 2000), acknowledgedAt: new Date().toISOString(), acknowledgedBy: user.name };
    db.logAudit({ actorId: user.userId, actorName: user.name, actorRole: user.role, action: "SHIFT_HANDOVER_ACKNOWLEDGED", category: "clinical", status: "SUCCESS", details: JSON.stringify(snapshot) });
    res.json({ ok: true, handover: snapshot, safety: "Handover acknowledgment is recorded; it does not authorize a new diagnosis, prescription, or procedure." });
  });
}
