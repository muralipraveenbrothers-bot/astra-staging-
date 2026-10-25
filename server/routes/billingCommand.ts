import type { Express, Request, Response } from "express";
import { PENDING_EMERGENCY_BILL_LABEL } from "../../src/astra/clinical/workflow/orderEvents";
import { billLabelFor } from "../../src/astra/clinical/workflow/workflowGuard";
import { db, type BillingRecord, type BillingServiceCategory } from "../db";
import { authenticate, requireRole } from "../rbac";
import { realtimeHub } from "../events";
import { workOrderEngine } from "../services/workOrders";

const READ_ROLES = ["billing", "doctor", "ceo", "admin"] as const;
const CHARGE_ROLES = ["billing", "doctor", "ceo", "admin", "reception", "pharmacy", "lab", "radiology", "ward", "ot"] as const;

function actor(req: Request) {
  return (req as any).user as { userId: string; name: string; role: string };
}

function anomaliesFor(bill: BillingRecord, orders: ReturnType<typeof db.getOrders>) {
  const balance = Math.max(0, bill.totalAmount - bill.paidAmount);
  const ageHours = (Date.now() - new Date(bill.createdAt).getTime()) / 3_600_000;
  const patientOrders = orders.filter((order) => order.patientId === bill.patientId || order.uhid === bill.uhid);
  const alerts: Array<{ id: string; severity: "critical" | "warning" | "info"; title: string; detail: string; correction: string }> = [];
  if (bill.paidAmount > bill.totalAmount) alerts.push({ id: `${bill.id}-overpaid`, severity: "critical", title: "Payment exceeds bill total", detail: `Collected ₹${bill.paidAmount.toLocaleString("en-IN")} against ₹${bill.totalAmount.toLocaleString("en-IN")}.`, correction: "Stop settlement, verify receipts, and post an authorised refund or correction entry." });
  if (bill.status === "cleared" && balance > 0) alerts.push({ id: `${bill.id}-false-clear`, severity: "critical", title: "Incorrect clearance status", detail: `Bill is marked cleared with ₹${balance.toLocaleString("en-IN")} outstanding.`, correction: "Reopen the bill and reconcile the payment ledger before discharge." });
  if (bill.paidAmount > 0 && !(bill.payments?.length)) alerts.push({ id: `${bill.id}-missing-payment`, severity: "warning", title: "Legacy payment has no mode/reference", detail: "A paid amount exists without a structured receipt trail.", correction: "Attach the original receipt and record mode, date, collector and transaction reference." });
  if (ageHours > 24 && balance > 0) alerts.push({ id: `${bill.id}-aged`, severity: "warning", title: "Outstanding balance older than 24 hours", detail: `₹${balance.toLocaleString("en-IN")} remains unpaid for ${Math.floor(ageHours)} hours.`, correction: "Contact the patient/TPA, record the follow-up and set a collection owner." });
  if (!bill.pharmacyCleared || !bill.labCleared || !bill.doctorCleared) alerts.push({ id: `${bill.id}-clearance`, severity: "warning", title: "Department closure incomplete", detail: `Pending: ${[!bill.pharmacyCleared && "Pharmacy", !bill.labCleared && "Laboratory", !bill.doctorCleared && "Doctor"].filter(Boolean).join(", ")}.`, correction: "Request department sign-off and verify that all consumed services are posted before final bill." });
  const unpriced = patientOrders.filter((order) => !(bill.charges ?? []).some((charge) => charge.sourceRef === order.id));
  if (unpriced.length) alerts.push({ id: `${bill.id}-unpriced`, severity: "info", title: `${unpriced.length} service order(s) not linked to a charge`, detail: "Clinical orders exist without a matching billing source reference.", correction: "Review the service catalogue, then post or explicitly mark each order non-billable." });
  return alerts;
}

export function commandSnapshot() {
  const bills = db.getBills();
  const orders = db.getOrders();
  const patients = db.getPatients();
  const rows = bills.map((bill) => {
    const balance = Math.max(0, bill.totalAmount - bill.paidAmount);
    const liveLabel = billLabelFor(bill.uhid);
    const displayStatus = bill.settlementLabel || liveLabel || bill.status;
    return { ...bill, balance, displayStatus, settlementLabel: bill.settlementLabel ?? (liveLabel === PENDING_EMERGENCY_BILL_LABEL ? liveLabel : undefined), patient: patients.find((p) => p.id === bill.patientId), orders: orders.filter((o) => o.patientId === bill.patientId || o.uhid === bill.uhid), anomalies: anomaliesFor(bill, orders) };
  });
  const alerts = rows.flatMap((row) => row.anomalies.map((alert) => ({ ...alert, billId: row.id, billNumber: row.billNumber, patientName: row.patientName, uhid: row.uhid })));
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      bills: rows.length,
      gross: rows.reduce((sum, row) => sum + row.totalAmount, 0),
      collected: rows.reduce((sum, row) => sum + row.paidAmount, 0),
      outstanding: rows.reduce((sum, row) => sum + row.balance, 0),
      cleared: rows.filter((row) => row.status === "cleared" && row.balance === 0).length,
      pending: rows.filter((row) => row.balance > 0).length,
      exceptions: alerts.length,
    },
    bills: rows,
    alerts,
  };
}

function publishBilling(type: "BILL_CHARGE_POSTED" | "BILL_PAYMENT_COLLECTED" | "BILL_ADJUSTMENT_POSTED" | "BILL_PAYMENT_REMINDER", payload: Record<string, unknown>) {
  const snapshot = commandSnapshot();
  realtimeHub.broadcast({ type, targetRoles: ["billing", "doctor", "ceo", "admin"], payload: { ...payload, snapshot } });
  return snapshot;
}

export function registerBillingCommandRoutes(app: Express) {
  app.get("/api/billing/command", authenticate, requireRole([...READ_ROLES]), (_req, res) => res.json(commandSnapshot()));

  app.post("/api/billing/counselling", authenticate, requireRole([...READ_ROLES, "reception"]), (req: Request, res: Response) => {
    const user = actor(req);
    const bill = db.getBills().find((candidate) => candidate.id === String(req.body?.billId ?? "") || candidate.billNumber === String(req.body?.billNumber ?? ""));
    if (!bill) return void res.status(404).json({ error: "BILL_NOT_FOUND" });
    const balance = Math.max(0, bill.totalAmount - bill.paidAmount);
    const items = (bill.charges ?? []).map((charge) => ({ category: charge.category, description: charge.description, amount: charge.amount, department: charge.department }));
    const response = { title: `Financial summary for ${bill.patientName}`, patientName: bill.patientName, billNumber: bill.billNumber, items, totals: { gross: bill.totalAmount, paid: bill.paidAmount, outstanding: balance, currency: "INR" }, paymentOptions: ["cash", "upi", "card", "bank", "insurance"], assistancePath: balance > 0 ? "Ask billing/insurance desk about verified coverage, instalment policy, or eligible government assistance; no promise is made by Astra." : "No outstanding balance recorded.", language: String(req.body?.language ?? "en"), reviewRequired: true };
    db.logAudit({ actorId: user.userId, actorName: user.name, actorRole: user.role, action: "BILL_FINANCIAL_COUNSELLING", category: "billing", status: "SUCCESS", details: `Counselling summary prepared for ${bill.billNumber}`, patientId: bill.patientId });
    res.json({ ok: true, response, safety: { transparentEstimateOnly: true, no_financial_guarantee: true, clinician_or_billing_confirmation_required: true } });
  });

  app.post("/api/billing/bills/:id/charges", authenticate, requireRole([...CHARGE_ROLES]), (req: Request, res: Response) => {
    const user = actor(req);
    const category = String(req.body?.category ?? "other") as BillingServiceCategory;
    const valid = new Set(["registration","consultation","pharmacy","laboratory","radiology","ward","procedure","surgery","dressing","other"]);
    if (!valid.has(category)) return void res.status(400).json({ error: "INVALID_SERVICE_CATEGORY" });
    const bill = db.addBillCharge(String(req.params.id), { category, description: String(req.body?.description ?? "").trim(), amount: Number(req.body?.amount), department: String(req.body?.department ?? user.role), sourceRef: req.body?.sourceRef ? String(req.body.sourceRef) : undefined, createdBy: `${user.name} (${user.role})` });
    if (!bill) return void res.status(409).json({ error: "CHARGE_REJECTED", message: "Invalid amount, duplicate source reference, or bill not found." });
    db.logAudit({ actorId: user.userId, actorName: user.name, actorRole: user.role, action: "BILL_CHARGE_POSTED", category: "billing", status: "SUCCESS", details: `${category} charge ₹${req.body.amount} added to ${bill.billNumber}`, patientId: bill.patientId });
    const snapshot = publishBilling("BILL_CHARGE_POSTED", { billId: bill.id, billNumber: bill.billNumber, patientName: bill.patientName, uhid: bill.uhid, amount: Number(req.body.amount), category, actor: user.name, message: `${category} charge posted` });
    res.json({ success: true, bill, snapshot });
  });

  app.post("/api/billing/bills/:id/payments", authenticate, requireRole([...READ_ROLES]), (req: Request, res: Response) => {
    const user = actor(req);
    const mode = String(req.body?.mode ?? "") as "cash" | "upi" | "card" | "bank" | "insurance";
    if (!["cash","upi","card","bank","insurance"].includes(mode)) return void res.status(400).json({ error: "INVALID_PAYMENT_MODE" });
    const reference = String(req.body?.reference ?? "").trim();
    if (mode !== "cash" && reference.length < 4) return void res.status(400).json({ error: "PAYMENT_REFERENCE_REQUIRED" });
    const bill = db.recordBillPayment(String(req.params.id), { amount: Number(req.body?.amount), mode, reference: reference || undefined, receivedBy: `${user.name} (${user.role})` });
    if (!bill) return void res.status(409).json({ error: "PAYMENT_REJECTED", message: "Amount must be positive and cannot exceed the live balance." });
    db.logAudit({ actorId: user.userId, actorName: user.name, actorRole: user.role, action: "BILL_PAYMENT_COLLECTED", category: "billing", status: "SUCCESS", details: `₹${req.body.amount} received via ${mode} for ${bill.billNumber}; ref ${reference || "cash"}`, patientId: bill.patientId });
    const syncedOrder = req.body?.workOrderId
      ? (() => { try { return workOrderEngine.recordPayment(String(req.body.workOrderId), user.name, user.role, reference || mode); } catch { return undefined; } })()
      : workOrderEngine.syncPaymentByBillId(bill.id, user.name, user.role, reference || mode);
    const snapshot = publishBilling("BILL_PAYMENT_COLLECTED", { billId: bill.id, billNumber: bill.billNumber, patientName: bill.patientName, uhid: bill.uhid, amount: Number(req.body.amount), mode, reference: reference || "cash", actor: user.name, message: `${mode.toUpperCase()} payment received` });
    res.json({ success: true, bill, snapshot, syncedOrderId: syncedOrder?.id ?? null });
  });

  app.post("/api/billing/bills/:id/adjustments", authenticate, requireRole([...READ_ROLES]), (req: Request, res: Response) => {
    const user = actor(req);
    const bill = db.adjustBill(String(req.params.id), { amount: Number(req.body?.amount), reason: String(req.body?.reason ?? "").trim(), createdBy: `${user.name} (${user.role})` });
    if (!bill) return void res.status(409).json({ error: "ADJUSTMENT_REJECTED", message: "Use a non-zero amount, an 8+ character reason, and never reduce total below payments." });
    db.logAudit({ actorId: user.userId, actorName: user.name, actorRole: user.role, action: "BILL_ADJUSTMENT_POSTED", category: "billing", status: "SUCCESS", details: `Adjustment ₹${req.body.amount} on ${bill.billNumber}. Reason: ${req.body.reason}`, patientId: bill.patientId });
    const snapshot = publishBilling("BILL_ADJUSTMENT_POSTED", { billId: bill.id, billNumber: bill.billNumber, patientName: bill.patientName, uhid: bill.uhid, amount: Number(req.body.amount), actor: user.name, message: "Audited correction posted" });
    res.json({ success: true, bill, snapshot });
  });

  app.post("/api/billing/bills/:id/reminders", authenticate, requireRole([...READ_ROLES]), (req: Request, res: Response) => {
    const user = actor(req);
    const before = db.getBills().find((candidate) => candidate.id === String(req.params.id) || candidate.billNumber === String(req.params.id));
    const balance = before ? Math.max(0, before.totalAmount - before.paidAmount) : 0;
    const custom = String(req.body?.message ?? "").trim();
    const message = custom || (before ? `Payment reminder: ${before.billNumber} has ${balance.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} due.` : "Payment reminder");
    const bill = db.recordBillReminder(String(req.params.id), { channel: "in_app", message, createdBy: `${user.name} (${user.role})` });
    if (!bill) return void res.status(409).json({ error: "REMINDER_REJECTED", message: "Only a bill with a current unpaid balance can receive a reminder." });
    db.logAudit({ actorId: user.userId, actorName: user.name, actorRole: user.role, action: "BILL_PAYMENT_REMINDER_SENT", category: "billing", status: "SUCCESS", details: `In-app due reminder sent for ${bill.billNumber}: ${message}`, patientId: bill.patientId });
    const snapshot = publishBilling("BILL_PAYMENT_REMINDER", { billId: bill.id, billNumber: bill.billNumber, patientName: bill.patientName, uhid: bill.uhid, amount: Math.max(0, bill.totalAmount - bill.paidAmount), actor: user.name, message: "Due-payment reminder delivered" });
    res.json({ success: true, bill, snapshot });
  });

  app.post("/api/billing/reminders/due", authenticate, requireRole([...READ_ROLES]), (req: Request, res: Response) => {
    const user = actor(req);
    const now = Date.now();
    const reminded: BillingRecord[] = [];
    for (const candidate of db.getBills()) {
      const balance = Math.max(0, candidate.totalAmount - candidate.paidAmount);
      const latest = candidate.reminders?.at(-1);
      const remindedRecently = latest ? now - new Date(latest.createdAt).getTime() < 24 * 3_600_000 : false;
      if (balance <= 0 || remindedRecently) continue;
      const message = `Payment reminder: ${candidate.billNumber} has ${balance.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} due.`;
      const bill = db.recordBillReminder(candidate.id, { channel: "in_app", message, createdBy: `${user.name} (${user.role})` });
      if (bill) {
        reminded.push(bill);
        db.logAudit({ actorId: user.userId, actorName: user.name, actorRole: user.role, action: "BILL_PAYMENT_REMINDER_SENT", category: "billing", status: "SUCCESS", details: `Bulk in-app due reminder sent for ${bill.billNumber}`, patientId: bill.patientId });
      }
    }
    const snapshot = publishBilling("BILL_PAYMENT_REMINDER", { count: reminded.length, actor: user.name, message: reminded.length ? `${reminded.length} due-payment reminder(s) delivered` : "No new reminders were due; 24-hour duplicate protection applied" });
    res.json({ success: true, reminded: reminded.length, snapshot });
  });
}
