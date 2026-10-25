/**
 * ASTRA AI — STAFF WORK-ORDER ENGINE (Hospital Operations Brain)
 * ============================================================================
 * Event-driven work-order state machine + staff registry. Implements the
 * master-prompt §29-35 flow: doctor order -> billing -> payment -> release ->
 * department ack -> in-progress -> result -> reviewed -> closed, with SLA
 * reminders and escalation. Persists to data/work-orders.json.
 *
 * Roles: doctor (create/review), billing (amount/discount), department staff
 * (ack/start/complete), admin (all). Every mutation is audit-logged via the
 * shared logAudit trail. No silent state loss: every transition is recorded.
 */
import fs from "fs";
import path from "path";
import { db } from "../db";
import { notifyClinicalBrainEscalation, notifyWorkOrderSla, notifyWorkOrderTransition } from "./workOrderNotifications";
import { ORDER_EVENTS } from "../../src/astra/clinical/workflow/orderEvents.js";
import { recordOrderEvent } from "../../src/astra/clinical/workflow/workflowGuard.js";

export type WorkArea =
  | "Pharmacy" | "Lab" | "Radiology" | "X-Ray" | "USG" | "CT" | "MRI"
  | "Ward" | "OT" | "SPL Room" | "Dressing Room" | "OT Clinic"
  | "Ward Cleaning" | "Bed Sheet Changing" | "Housekeeping" | "Billing"
  | "Reception" | "Stores" | "Maintenance" | "Biomedical" | "Transport" | "Security";

export type WorkOrderStatus =
  | "DRAFT" | "REQUESTED" | "VALIDATED" | "BILL_REQUIRED" | "BILL_CREATED"
  | "PAYMENT_PENDING" | "PAID" | "RELEASED" | "ASSIGNED" | "ACKNOWLEDGED"
  | "IN_PROGRESS" | "COMPLETED" | "RESULT_READY" | "REVIEWED" | "CLOSED"
  | "CANCELLED" | "REJECTED" | "FAILED" | "DELAYED" | "ESCALATED";

const TERMINAL_STATES = new Set<WorkOrderStatus>(["CLOSED", "CANCELLED", "REJECTED"]);

const EXISTING_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  DRAFT: ["REQUESTED"],
  REQUESTED: ["VALIDATED", "REJECTED", "FAILED"],
  VALIDATED: ["BILL_REQUIRED", "REJECTED", "FAILED"],
  BILL_REQUIRED: ["BILL_CREATED", "FAILED"],
  BILL_CREATED: ["PAYMENT_PENDING", "FAILED"],
  PAYMENT_PENDING: ["PAID", "FAILED"],
  PAID: ["RELEASED", "FAILED"],
  RELEASED: ["ASSIGNED", "ACKNOWLEDGED", "FAILED"],
  ASSIGNED: ["ACKNOWLEDGED", "FAILED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "COMPLETED", "FAILED"],
  IN_PROGRESS: ["COMPLETED", "FAILED"],
  COMPLETED: ["RESULT_READY", "FAILED"],
  RESULT_READY: ["REVIEWED", "FAILED"],
  REVIEWED: ["CLOSED", "FAILED"],
  DELAYED: ["ESCALATED", "ACKNOWLEDGED", "FAILED"],
  ESCALATED: ["ACKNOWLEDGED", "FAILED", "CLOSED"],
  FAILED: ["ESCALATED"],
  CLOSED: [],
  CANCELLED: [],
  REJECTED: [],
};

export function legalTargets(from: WorkOrderStatus): readonly WorkOrderStatus[] {
  if (TERMINAL_STATES.has(from)) return [];
  return [...new Set([
    ...(EXISTING_TRANSITIONS[from] ?? []),
    "DELAYED",
    "ESCALATED",
    "CANCELLED",
  ] as WorkOrderStatus[])];
}

export interface WorkOrderEvent {
  at: string; actor: string; role: string; from: WorkOrderStatus | "-"; to: WorkOrderStatus;
  note?: string;
}

export interface WorkOrder {
  id: string;
  /** Stable caller key; retries with the same key return the original order. */
  idempotencyKey?: string;
  patientId: string;          // UHID
  patientName: string;
  bed: string;                // e.g. "Bed 4" / "ICU-Bed-04"
  ward: string;
  department: WorkArea;       // target department
  serviceCode: string;        // e.g. CBP, XRAY-CHEST
  serviceName: string;
  priority: "STAT" | "URGENT" | "ROUTINE";
  status: WorkOrderStatus;
  amount?: number;
  discount?: number;
  billId?: string;
  paidAt?: string;
  assignedTo?: string;        // staff id
  assignedName?: string;
  acknowledgedAt?: string;
  startedAt?: string;
  completedAt?: string;
  resultSummary?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  slaMinutes: number;
  createdAt: string;
  updatedAt: string;
  events: WorkOrderEvent[];
  lastReminderAt?: string;
  escalated?: boolean;
}

export interface StaffRecord {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  department: WorkArea;
  workAreas: WorkArea[];
  shift: "Morning" | "Evening" | "Night" | "General";
  phone?: string;
  language: "Telugu" | "Hindi" | "English";
  status: "AVAILABLE" | "ON_TASK" | "OFF_DUTY";
  supervisor?: string;
  notifyWhatsApp: boolean;
  notifyTelegram: boolean;
  createdAt: string;
}

interface WorkOrderDb {
  orders: WorkOrder[];
  staff: StaffRecord[];
  seq: number;
}

export interface PersistedWorkOrderIssue {
  orderId: string;
  status?: string;
  issues: string[];
}

const DATA_DIR = process.env.ASTRA_DATA_DIR?.trim()
  || path.join(process.cwd(), "data");
const DB_PATH = process.env.ASTRA_WORK_ORDERS_DB_PATH?.trim()
  || path.join(DATA_DIR, "work-orders.json");

function load(): WorkOrderDb {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as WorkOrderDb;
      return { orders: raw.orders ?? [], staff: raw.staff ?? [], seq: raw.seq ?? 0 };
    }
  } catch { /* start empty */ }
  return { orders: [], staff: [], seq: 0 };
}

function persist(db: WorkOrderDb): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

const DEPARTMENT_DEFAULT_SLA: Record<string, number> = {
  Lab: 30, Radiology: 60, "X-Ray": 30, USG: 45, CT: 90, MRI: 120,
  Pharmacy: 20, Ward: 15, OT: 120, Billing: 10, Reception: 10,
  "Dressing Room": 30, "SPL Room": 30, "Ward Cleaning": 45, "Bed Sheet Changing": 30,
};

class WorkOrderEngine {
  private db: WorkOrderDb = load();

  /** Report persisted records that cannot participate in the current state contract. */
  validatePersistedOrders(): PersistedWorkOrderIssue[] {
    const known = new Set<WorkOrderStatus>([
      "DRAFT", "REQUESTED", "VALIDATED", "BILL_REQUIRED", "BILL_CREATED",
      "PAYMENT_PENDING", "PAID", "RELEASED", "ASSIGNED", "ACKNOWLEDGED",
      "IN_PROGRESS", "COMPLETED", "RESULT_READY", "REVIEWED", "CLOSED",
      "CANCELLED", "REJECTED", "FAILED", "DELAYED", "ESCALATED",
    ]);
    const required: Array<keyof WorkOrder> = [
      "id", "patientId", "patientName", "department", "serviceCode", "serviceName",
      "priority", "status", "slaMinutes", "createdAt", "updatedAt", "events",
    ];
    return this.db.orders.flatMap((order) => {
      const issues: string[] = [];
      if (!known.has(order.status)) issues.push("unknown status");
      for (const field of required) {
        const value = order[field];
        if (value === undefined || value === null || value === "" || (field === "events" && !Array.isArray(value))) {
          issues.push(`missing ${field}`);
        }
      }
      return issues.length ? [{ orderId: order.id || "<missing>", status: String(order.status ?? ""), issues }] : [];
    });
  }

  private save(): void { persist(this.db); }

  private nextId(prefix: string): string {
    this.db.seq += 1;
    return `${prefix}-${new Date().getFullYear()}-${String(this.db.seq).padStart(5, "0")}`;
  }

  // ---------- Staff registry ----------
  listStaff(department?: WorkArea): StaffRecord[] {
    const all = this.db.staff;
    if (!department) return all;
    return all.filter((s) => s.workAreas.includes(department) || s.department === department);
  }

  addStaff(input: Omit<StaffRecord, "id" | "createdAt">): StaffRecord {
    const rec: StaffRecord = { ...input, id: this.nextId("STF"), createdAt: new Date().toISOString() };
    this.db.staff.push(rec);
    this.save();
    return rec;
  }

  updateStaff(id: string, patch: Partial<StaffRecord>): StaffRecord | undefined {
    const idx = this.db.staff.findIndex((s) => s.id === id);
    if (idx < 0) return undefined;
    this.db.staff[idx] = { ...this.db.staff[idx], ...patch, id };
    this.save();
    return this.db.staff[idx];
  }

  /** Auto-assign: role+area+shift+availability+workload (lowest open tasks first). */
  private pickAssignee(department: WorkArea): StaffRecord | undefined {
    const candidates = this.listStaff(department).filter((s) => s.status !== "OFF_DUTY");
    if (candidates.length === 0) return undefined;
    const openCount = new Map<string, number>();
    for (const o of this.db.orders) {
      if (o.assignedTo && !["CLOSED", "REVIEWED", "COMPLETED", "CANCELLED"].includes(o.status)) {
        openCount.set(o.assignedTo, (openCount.get(o.assignedTo) ?? 0) + 1);
      }
    }
    return candidates.sort((a, b) => (openCount.get(a.id) ?? 0) - (openCount.get(b.id) ?? 0))[0];
  }

  /**
   * Writes a work-order state transition into the hospital audit trail.
   *
   * This used to pass `{ actor, target, detail, role }`, none of which are
   * fields on `AuditEntry` — the real shape is
   * `{ actorId, actorName, actorRole, action, category, status, details }`.
   * TypeScript only started complaining once server/services was included in a
   * typecheck; at runtime the extra keys were silently dropped, so every entry
   * landed with `actorId: undefined`, `actorRole: undefined`,
   * `details: undefined` and no `status` — an unusable audit record. The bug
   * was latent only because no `workorder.*` transition had been written yet.
   *
   * `actor` carries an identifier-like value here (`"system"`, or the caller's
   * user id), so it maps to `actorId`/`actorName`; `role` maps to `actorRole`.
   * There is no `target` field, so the order id is folded into `details`.
   */
  private audit(orderId: string, actor: string, role: string, from: WorkOrderStatus | "-", to: WorkOrderStatus, note?: string): void {
    const detail = note ?? `state ${from} -> ${to}`;
    db.logAudit({
      actorId: actor,
      actorName: actor,
      actorRole: role,
      action: `workorder.${to.toLowerCase()}`,
      category: "hospital-ops",
      status: "SUCCESS",
      details: `[${orderId}] ${detail}`,
      patientId: this.getOrder(orderId)?.patientId,
    });
  }

  private transition(order: WorkOrder, to: WorkOrderStatus, actor: string, role: string, note?: string): WorkOrder {
    const from = order.status;
    if (!legalTargets(from).includes(to)) {
      throw new Error(`ILLEGAL_WORK_ORDER_TRANSITION: ${from} -> ${to}`);
    }
    order.status = to; order.updatedAt = new Date().toISOString();
    order.events.push({ at: order.updatedAt, actor, role, from, to, note });
    this.save(); this.audit(order.id, actor, role, from, to, note); notifyWorkOrderTransition(order, from, to, actor, note);
    const workflowEvent = to === "REQUESTED" ? ORDER_EVENTS.INVESTIGATION_ORDER_CREATED
      : to === "RELEASED" ? ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED
      : to === "RESULT_READY" ? ORDER_EVENTS.REPORT_UPLOADED
      : undefined;
    if (workflowEvent) recordOrderEvent({ event: workflowEvent, patientUhid: order.patientId, orderId: order.id, actorId: actor, actorRole: role, device: "work-order-engine", at: order.updatedAt });
    return order;
  }

  getOrder(id: string): WorkOrder | undefined { return this.db.orders.find((o) => o.id === id); }
  listOrders(filter?: { status?: WorkOrderStatus; department?: WorkArea; patientId?: string }): WorkOrder[] {
    return this.db.orders.filter((o) => (!filter?.status || o.status === filter.status) && (!filter?.department || o.department === filter.department) && (!filter?.patientId || o.patientId === filter.patientId));
  }

  createClinicalOrder(input: { patientId: string; patientName: string; bed: string; ward: string; department: WorkArea; serviceCode: string; serviceName: string; priority?: "STAT" | "URGENT" | "ROUTINE"; slaMinutes?: number; actor: string; role: string; idempotencyKey?: string; }): WorkOrder {
    if (input.idempotencyKey) {
      const existing = this.db.orders.find((o) => o.idempotencyKey === input.idempotencyKey);
      if (existing) return existing;
    }
    const snapshot = JSON.parse(JSON.stringify(this.db)) as WorkOrderDb;
    let order: WorkOrder;
    let assignee: StaffRecord | undefined;
    try {
      if (!input.patientId || !input.serviceCode || !input.serviceName || !input.department) {
        throw new Error("INVALID_CLINICAL_ORDER_INPUT");
      }
      const now = new Date().toISOString();
      assignee = this.pickAssignee("Billing");
      order = { id: this.nextId("WO"), idempotencyKey: input.idempotencyKey, patientId: input.patientId, patientName: input.patientName, bed: input.bed, ward: input.ward, department: input.department, serviceCode: input.serviceCode, serviceName: input.serviceName, priority: input.priority ?? "ROUTINE", status: "DRAFT", slaMinutes: input.slaMinutes ?? DEPARTMENT_DEFAULT_SLA[input.department] ?? 60, createdAt: now, updatedAt: now, events: [], assignedTo: assignee?.id, assignedName: assignee?.name };
      this.db.orders.push(order);
      this.save();
    } catch (error) {
      this.db = snapshot;
      try { this.save(); } catch { /* preserve the original failure */ }
      db.logAudit({ actorId: input.actor, actorName: input.actor, actorRole: input.role, action: "workorder.create_failed", category: "hospital-ops", status: "FAILURE", details: error instanceof Error ? error.message : "clinical order persistence failed" });
      throw error;
    }
    try {
      this.transition(order!, "REQUESTED", input.actor, input.role, `Order ${input.serviceName} for ${input.patientName} (${input.bed})`);
      this.transition(order!, "VALIDATED", "system", "auto-validate", "Clinical order validated");
      this.transition(order!, "BILL_REQUIRED", "system", "auto-route", `Billing task -> ${assignee?.name ?? "unassigned"}`);
    } catch (error) {
      db.logAudit({ actorId: input.actor, actorName: input.actor, actorRole: input.role, action: "workorder.post_commit_failed", category: "hospital-ops", status: "FAILURE", details: error instanceof Error ? error.message : "clinical order side effect failed" });
      throw error;
    }
    return order!;
  }

  billAmount(orderId: string, amount: number, discount: number, actor: string, role: string, note?: string): WorkOrder {
    const order = this.getOrder(orderId); if (!order) throw new Error(`Work order ${orderId} not found`);
    if (!["BILL_REQUIRED", "BILL_CREATED", "PAYMENT_PENDING"].includes(order.status)) throw new Error(`Cannot bill in status ${order.status}`);
    order.amount = amount; order.discount = discount; order.billId = `BILL-${order.id}`; order.updatedAt = new Date().toISOString(); this.save();
    this.transition(order, "BILL_CREATED", actor, role, note ?? `Bill Rs.${amount} (discount Rs.${discount}). BillID ${order.billId}`);
    this.transition(order, "PAYMENT_PENDING", actor, role, "Bill sent to reception/patient");
    return order;
  }

  recordPayment(orderId: string, actor: string, role: string, reference?: string): WorkOrder {
    const order = this.getOrder(orderId); if (!order) throw new Error(`Work order ${orderId} not found`);
    if (order.status !== "PAYMENT_PENDING") throw new Error(`Cannot pay in status ${order.status}`);
    order.paidAt = new Date().toISOString(); this.save();
    this.transition(order, "PAID", actor, role, `Payment received. Ref: ${reference ?? order.billId}`);
    this.transition(order, "RELEASED", "system", "auto-release", "Order released - department notified");
    return order;
  }

  /** Reconcile a payment posted by the billing command with its originating order. */
  syncPaymentByBillId(billId: string, actor: string, role: string, reference?: string): WorkOrder | undefined {
    const order = this.db.orders.find((candidate) => candidate.billId === billId);
    if (!order || order.status !== "PAYMENT_PENDING") return undefined;
    return this.recordPayment(order.id, actor, role, reference);
  }

  acknowledge(orderId: string, actor: string, role: string): WorkOrder {
    const order = this.getOrder(orderId); if (!order) throw new Error(`Work order ${orderId} not found`);
    if (!["RELEASED", "ASSIGNED"].includes(order.status)) throw new Error(`Cannot ack in status ${order.status}`);
    order.acknowledgedAt = new Date().toISOString();
    // Reassign to the department staff who is actually performing the work
    // (§33 automatic assignment): match the acknowledging actor to a staff
    // record for the order's department, then credit performance there.
    // Reassign to the department staff who is actually performing the work
    // (§33 automatic assignment): match the acknowledging actor/role to a staff
    // record for the order's department, then credit performance there.
    const deptStaff = this.listStaff(order.department);
    const worker = deptStaff.find((s) => s.name.toLowerCase() === String(actor).toLowerCase())
      ?? deptStaff.find((s) => {
        // role e.g. "lab-tech" → keywords ["lab","tech"] matched to designation
        const roleKw = String(role).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean);
        const dsg = s.designation.toLowerCase();
        return roleKw.length > 0 && roleKw.filter((k) => dsg.includes(k)).length >= Math.min(roleKw.length, 2);
      });
    if (worker) { order.assignedTo = worker.id; order.assignedName = worker.name; }
    this.save();
    this.transition(order, "ACKNOWLEDGED", actor, role, `Staff acknowledged - starting work`);
    return order;
  }

  startWork(orderId: string, actor: string, role: string): WorkOrder {
    const order = this.getOrder(orderId); if (!order) throw new Error(`Work order ${orderId} not found`);
    if (order.status !== "ACKNOWLEDGED") throw new Error(`Cannot start in status ${order.status}`);
    order.startedAt = new Date().toISOString(); this.save();
    this.transition(order, "IN_PROGRESS", actor, role, "Work started");
    return order;
  }

  complete(orderId: string, resultSummary: string, actor: string, role: string): WorkOrder {
    const order = this.getOrder(orderId); if (!order) throw new Error(`Work order ${orderId} not found`);
    if (!["IN_PROGRESS", "ACKNOWLEDGED"].includes(order.status)) throw new Error(`Cannot complete in status ${order.status}`);
    order.completedAt = new Date().toISOString(); order.resultSummary = resultSummary; this.save();
    this.transition(order, "COMPLETED", actor, role, "Work completed");
    this.transition(order, "RESULT_READY", "system", "auto-close", `Result: ${resultSummary}`);
    return order;
  }

  review(orderId: string, actor: string, role: string, notes?: string): WorkOrder {
    const order = this.getOrder(orderId); if (!order) throw new Error(`Work order ${orderId} not found`);
    if (order.status !== "RESULT_READY") throw new Error(`Cannot review in status ${order.status}`);
    order.reviewedAt = new Date().toISOString(); order.reviewedBy = actor; this.save();
    this.transition(order, "REVIEWED", actor, role, notes ?? "Reviewed by doctor");
    this.transition(order, "CLOSED", "system", "auto-close", "Order closed");
    return order;
  }

  cancel(orderId: string, actor: string, role: string, reason: string): WorkOrder {
    const order = this.getOrder(orderId); if (!order) throw new Error(`Work order ${orderId} not found`);
    this.transition(order, "CANCELLED", actor, role, `Cancelled: ${reason}`); return order;
  }

  escalate(orderId: string, actor: string, role: string, reason: string): WorkOrder {
    const order = this.getOrder(orderId); if (!order) throw new Error(`Work order ${orderId} not found`);
    order.escalated = true; order.updatedAt = new Date().toISOString(); this.save();
    this.transition(order, "ESCALATED", actor, role, `ESCALATED: ${reason}`); return order;
  }

  checkSla(): Array<{ order: WorkOrder; overdueMinutes: number; action: "REMIND" | "SUPERVISOR_ALERT" | "ESCALATE" }> {
    const now = Date.now(); const result: Array<{ order: WorkOrder; overdueMinutes: number; action: "REMIND" | "SUPERVISOR_ALERT" | "ESCALATE" }> = [];
    for (const o of this.db.orders) {
      try {
        if (["CLOSED", "CANCELLED", "REJECTED"].includes(o.status)) continue;
        const elapsedMin = (now - new Date(o.createdAt).getTime()) / 60000;
        if (elapsedMin <= o.slaMinutes) continue;
        const overdue = Math.round(elapsedMin - o.slaMinutes);
        let action: "REMIND" | "SUPERVISOR_ALERT" | "ESCALATE" = "REMIND";
        if (overdue > o.slaMinutes) action = "SUPERVISOR_ALERT";
        if (overdue > o.slaMinutes * 2) action = "ESCALATE";
        if (action === "ESCALATE" && o.status !== "ESCALATED") {
          this.transition(o, "ESCALATED", "system", "system", `SLA exceeded by ${overdue} minutes`);
          notifyClinicalBrainEscalation(o);
        } else if (o.status !== "ESCALATED") {
          notifyWorkOrderSla(o, action, overdue);
        }
        result.push({ order: o, overdueMinutes: overdue, action });
      } catch (error) {
        db.logAudit({
          actorId: "system",
          actorName: "system",
          actorRole: "system",
          action: "workorder.sla_check_failed",
          category: "hospital-ops",
          status: "FAILURE",
          details: `Order SLA check failed: ${error instanceof Error ? error.message : "unknown error"}`,
        });
      }
    }
    return result.sort((a, b) => b.overdueMinutes - a.overdueMinutes);
  }

  /**
   * Duty roster + performance (§31-35). Computes, for every staff member:
   * assigned / completed / active task counts, completion rate, overdue-and-
   * not-started count, avg completion time and SLA-hit rate, derived from the
   * live work-order trail. Grouped by shift for the roster view.
   */
  staffPerformance() {
    const byStaff: Record<string, {
      id: string; name: string; designation: string; department: WorkArea; shift: string;
      status: string; language: string; phone?: string; workAreas: WorkArea[]; supervisor?: string;
      assigned: number; completed: number; active: number; overdue: number; slaHit: number; totalClosed: number;
    }> = {};
    for (const s of this.db.staff) {
      byStaff[s.id] = { id: s.id, name: s.name, designation: s.designation, department: s.department, shift: s.shift, status: s.status, language: s.language, phone: s.phone, workAreas: s.workAreas, supervisor: s.supervisor, assigned: 0, completed: 0, active: 0, overdue: 0, slaHit: 0, totalClosed: 0 };
    }
    const slaMinutesNow = (created: string, sla: number, completedAt?: string) => {
      const end = completedAt ? new Date(completedAt).getTime() : Date.now();
      return (end - new Date(created).getTime()) / 60000 <= sla;
    };
    for (const o of this.db.orders) {
      const target = o.assignedTo ? byStaff[o.assignedTo] : undefined;
      if (!target) continue;
      target.assigned++;
      const done = ["COMPLETED", "RESULT_READY", "REVIEWED", "CLOSED"].includes(o.status);
      const active = !["CLOSED", "CANCELLED", "REJECTED"].includes(o.status);
      if (done && !["CANCELLED"].includes(o.status)) { target.completed++; target.totalClosed++; if (slaMinutesNow(o.createdAt, o.slaMinutes, o.completedAt)) target.slaHit++; }
      else if (active) target.active++;
      if (active && Date.now() - new Date(o.createdAt).getTime() > o.slaMinutes * 60000) target.overdue++;
    }
    const list = Object.values(byStaff);
    const roster: Record<string, typeof list> = { Morning: [], Evening: [], Night: [], General: [] };
    for (const s of list) (roster[s.shift] = roster[s.shift] ?? []).push(s);
    const deptStats: Record<string, { staff: number; active: number; overdue: number }> = {};
    for (const s of list) {
      const d = deptStats[s.department] = deptStats[s.department] ?? { staff: 0, active: 0, overdue: 0 };
      d.staff++; d.active += s.active > 0 ? 1 : 0; d.overdue += s.overdue;
    }
    return { staff: list, roster, departments: deptStats };
  }

  dashboard() {
    const counts: Record<string, number> = {}; let total = 0;
    for (const o of this.db.staff) counts["staff:" + o.department] = (counts["staff:" + o.department] ?? 0) + 1;
    for (const o of this.db.orders) { counts[o.status] = (counts[o.status] ?? 0) + 1; total++; }
    return { totalOrders: total, totalStaff: this.db.staff.length, statusCounts: counts, activeOrders: this.db.orders.filter((o) => !["CLOSED", "CANCELLED"].includes(o.status)).length, overdue: this.checkSla().length };
  }

  seedDemo(): void {
    if (this.db.staff.length > 0) return;
    const staff: Omit<StaffRecord, "id" | "createdAt">[] = [
      { employeeId: "LAB-001", name: "Suresh Tech", designation: "Lab Technician", department: "Lab", workAreas: ["Lab", "Pharmacy"], shift: "General", language: "Telugu", status: "AVAILABLE", notifyWhatsApp: true, notifyTelegram: false, phone: "9123400001" },
      { employeeId: "BIL-001", name: "Priya Billing", designation: "Billing Officer", department: "Billing", workAreas: ["Billing", "Reception"], shift: "General", language: "Telugu", status: "AVAILABLE", notifyWhatsApp: true, notifyTelegram: true, phone: "9123400002" },
      { employeeId: "XRAY-001", name: "Kumar Radio", designation: "Radiographer", department: "X-Ray", workAreas: ["X-Ray", "Radiology", "CT"], shift: "General", language: "Hindi", status: "AVAILABLE", notifyWhatsApp: false, notifyTelegram: true, phone: "9123400003" },
      { employeeId: "PHAR-001", name: "Anita Pharma", designation: "Pharmacist", department: "Pharmacy", workAreas: ["Pharmacy", "Stores"], shift: "Morning", language: "English", status: "AVAILABLE", notifyWhatsApp: true, notifyTelegram: false, phone: "9123400004" },
      { employeeId: "WARD-001", name: "Kavitha Nurse", designation: "Staff Nurse", department: "Ward", workAreas: ["Ward", "Dressing Room", "OT Clinic", "Bed Sheet Changing"], shift: "General", language: "Telugu", status: "AVAILABLE", notifyWhatsApp: true, notifyTelegram: false, phone: "9123400005" },
      { employeeId: "CLN-001", name: "Ravi Housekeep", designation: "Housekeeping", department: "Housekeeping", workAreas: ["Housekeeping", "Ward Cleaning", "Bed Sheet Changing"], shift: "Morning", language: "Telugu", status: "AVAILABLE", notifyWhatsApp: true, notifyTelegram: false, phone: "9123400006" },
    ];
    for (const s of staff) this.addStaff(s);
    const order = this.createClinicalOrder({ patientId: "UHID-2026-8804", patientName: "Rajesh Kumar", bed: "Bed 4", ward: "General Ward", department: "Lab", serviceCode: "CBP", serviceName: "Complete Blood Picture (CBP)", priority: "ROUTINE", actor: "Dr. Murali", role: "doctor" });
    this.billAmount(order.id, 300, 0, "Priya Billing", "billing", "No discount, Rs.300");
    this.recordPayment(order.id, "Reception", "reception", "CASH-8804");
    this.acknowledge(order.id, "Suresh Tech", "lab-tech");
  }
}

export const workOrderEngine = new WorkOrderEngine();
