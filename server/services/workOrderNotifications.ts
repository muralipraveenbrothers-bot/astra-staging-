import fs from "fs";
import path from "path";
import { realtimeHub } from "../events";
import { db } from "../db";
import type { Role } from "../types";
import type { WorkOrder, WorkOrderStatus } from "./workOrders";

export type WorkOrderNotificationStatus = "UNREAD" | "ACKNOWLEDGED";
export interface WorkOrderNotification {
  id: string;
  orderId: string;
  patientId: string;
  department: string;
  recipientRole: Role;
  type: "WORK_ORDER_STATUS";
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  title: string;
  detail: string;
  status: WorkOrderNotificationStatus;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export interface ClinicalReviewTask {
  id: string;
  orderId: string;
  targetRoles: Role[];
  status: "OPEN" | "ACKNOWLEDGED" | "ESCALATED";
  createdAt: string;
  dueAt: string;
  repeatCount: number;
}
interface Store { notifications: WorkOrderNotification[]; seq: number; taskSeq?: number; clinicalReviewTasks?: ClinicalReviewTask[] }
const DATA_DIR = process.env.ASTRA_DATA_DIR?.trim() || path.join(process.cwd(), "data");
const FILE = process.env.ASTRA_WORK_ORDER_NOTIFICATIONS_PATH?.trim()
  || path.join(DATA_DIR, "work-order-notifications.json");
let store: Store | undefined;

function read(): Store {
  if (store) return store;
  try { store = JSON.parse(fs.readFileSync(FILE, "utf8")) as Store; }
  catch { store = { notifications: [], seq: 0, taskSeq: 0, clinicalReviewTasks: [] }; }
  store.notifications ??= []; store.seq ??= 0; store.taskSeq ??= 0; store.clinicalReviewTasks ??= [];
  return store;
}
function save(): void { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(read(), null, 2), "utf8"); }

const recipients: Partial<Record<WorkOrderStatus, Role[]>> = {
  REQUESTED: ["billing"], BILL_CREATED: ["reception", "billing"], PAYMENT_PENDING: ["reception"],
  RELEASED: ["doctor", "admin"], ACKNOWLEDGED: ["doctor"], COMPLETED: ["doctor"],
  RESULT_READY: ["doctor"], REVIEWED: ["admin", "ceo"], ESCALATED: ["supervisor", "admin", "ceo"],
};

export function notifyWorkOrderTransition(order: WorkOrder, from: WorkOrderStatus, to: WorkOrderStatus, actor: string, note?: string): WorkOrderNotification[] {
  const roles = recipients[to] ?? [];
  const db = read(); const now = new Date().toISOString(); const created: WorkOrderNotification[] = [];
  for (const recipientRole of roles) {
    const duplicate = db.notifications.find((n) => n.orderId === order.id && n.to === to && n.recipientRole === recipientRole);
    if (duplicate) continue;
    const n: WorkOrderNotification = { id: `WON-${++db.seq}`, orderId: order.id, patientId: order.patientId, department: order.department, recipientRole, type: "WORK_ORDER_STATUS", from, to, title: `${order.serviceName}: ${to.replaceAll("_", " ")}`, detail: note ?? `Order ${order.id} moved from ${from} to ${to} by ${actor}`, status: "UNREAD", createdAt: now };
    db.notifications.push(n); created.push(n);
    realtimeHub.broadcast({ type: "ORDER_WORKFLOW_EVENT", targetRoles: [recipientRole], payload: { notification: n } });
  }
  if (created.length) save();
  return created;
}

export function listWorkOrderNotifications(filter?: { status?: WorkOrderNotificationStatus; role?: Role; orderId?: string }): WorkOrderNotification[] {
  return read().notifications.filter((n) => (!filter?.status || n.status === filter.status) && (!filter?.role || n.recipientRole === filter.role) && (!filter?.orderId || n.orderId === filter.orderId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function acknowledgeWorkOrderNotification(id: string, actor: string): WorkOrderNotification | undefined {
  const n = read().notifications.find((x) => x.id === id); if (!n) return undefined;
  n.status = "ACKNOWLEDGED"; n.acknowledgedAt = new Date().toISOString(); n.acknowledgedBy = actor; save(); return n;
}

export function notifyWorkOrderSla(order: WorkOrder, action: "REMIND" | "SUPERVISOR_ALERT" | "ESCALATE", overdueMinutes: number): WorkOrderNotification[] {
  const roles: Role[] = action === "REMIND" ? ["supervisor", "admin"] : action === "SUPERVISOR_ALERT" ? ["supervisor", "admin", "ceo"] : ["supervisor", "admin", "ceo"];
  const db = read(); const day = new Date().toISOString().slice(0, 10); const created: WorkOrderNotification[] = [];
  for (const recipientRole of roles) {
    if (db.notifications.some((n) => n.orderId === order.id && n.to === "ESCALATED" && n.recipientRole === recipientRole && n.detail.includes(`[${day}]`))) continue;
    const n: WorkOrderNotification = { id: `WON-${++db.seq}`, orderId: order.id, patientId: order.patientId, department: order.department, recipientRole, type: "WORK_ORDER_STATUS", from: order.status, to: "ESCALATED", title: `SLA ${action}: ${order.serviceName}`, detail: `[${day}] Order ${order.id} is ${overdueMinutes} minutes overdue`, status: "UNREAD", createdAt: new Date().toISOString() };
    db.notifications.push(n); created.push(n);
    realtimeHub.broadcast({ type: "ORDER_WORKFLOW_EVENT", targetRoles: [recipientRole], payload: { notification: n } });
  }
  if (created.length) save();
  return created;
}

export function notifyClinicalBrainEscalation(order: WorkOrder): void {
  const current = read();
  const existing = current.clinicalReviewTasks!.find((task) => task.orderId === order.id && task.status !== "ACKNOWLEDGED");
  const task = existing ?? {
    id: `CRT-${++current.taskSeq!}`,
    orderId: order.id,
    targetRoles: ["doctor", "admin", "ceo", "supervisor"] as Role[],
    status: "OPEN" as const,
    createdAt: new Date().toISOString(),
    dueAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    repeatCount: 0,
  };
  if (!existing) current.clinicalReviewTasks!.push(task);
  save();
  db.logAudit({
    actorId: "system",
    actorName: "system",
    actorRole: "system",
    action: "CLINICAL_BRAIN_ORDER_ESCALATION",
    category: "clinical",
    status: "SUCCESS",
    details: `Clinical review task ${task.id} created for SLA escalation`,
    patientId: order.patientId,
  });
  realtimeHub.broadcast({
    type: "ASTRA_BRAIN_EVENT",
    targetRoles: ["doctor", "admin", "ceo", "supervisor"],
    payload: { kind: "WORK_ORDER_ESCALATED", orderId: order.id, taskId: task.id, department: order.department, status: order.status },
  });
}

export function listClinicalReviewTasks(role?: Role): ClinicalReviewTask[] {
  return (read().clinicalReviewTasks ?? []).filter((task) => !role || task.targetRoles.includes(role));
}

export function acknowledgeClinicalReviewTask(id: string, role: Role): ClinicalReviewTask | undefined {
  const current = read();
  const task = current.clinicalReviewTasks!.find((candidate) => candidate.id === id);
  if (!task || (!task.targetRoles.includes(role) && role !== "admin")) return undefined;
  task.status = "ACKNOWLEDGED";
  save();
  return task;
}

export function processClinicalEscalationTasks(now = Date.now()): ClinicalReviewTask[] {
  const current = read(); const changed: ClinicalReviewTask[] = [];
  for (const task of current.clinicalReviewTasks ?? []) {
    if (task.status !== "OPEN" && task.status !== "ESCALATED") continue;
    if (Date.parse(task.dueAt) > now) continue;
    task.repeatCount += 1; task.status = "ESCALATED";
    task.dueAt = new Date(now + 15 * 60_000).toISOString();
    const final = task.repeatCount >= 3;
    db.logAudit({
      actorId: "system", actorName: "system", actorRole: "system",
      action: final ? "CLINICAL_BRAIN_FINAL_CEO_ESCALATION" : "CLINICAL_BRAIN_REESCALATION",
      category: "clinical", status: "SUCCESS",
      details: `Clinical review task ${task.id} escalated${final ? " to CEO" : ""}`,
    });
    realtimeHub.broadcast({
      type: "ASTRA_BRAIN_EVENT",
      targetRoles: final ? ["ceo"] : task.targetRoles,
      payload: { kind: final ? "WORK_ORDER_ESCALATION_FINAL_CEO" : "WORK_ORDER_ESCALATION_REESCALATED", taskId: task.id, orderId: task.orderId },
    });
    changed.push(task);
  }
  if (changed.length) save();
  return changed;
}

export function startClinicalEscalationScheduler(clock: () => number = Date.now, intervalMs = 60_000): NodeJS.Timeout {
  const timer = setInterval(() => processClinicalEscalationTasks(clock()), intervalMs);
  timer.unref();
  return timer;
}

export function stopClinicalEscalationScheduler(timer: NodeJS.Timeout): void { clearInterval(timer); }

