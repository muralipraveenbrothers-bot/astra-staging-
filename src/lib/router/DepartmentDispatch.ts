/**
 * ASTRA AI — DEPARTMENT DISPATCH SYSTEM
 * 
 * When an agent executes a command, the dispatch system:
 * 1. Notifies the relevant department inbox
 * 2. Logs to the audit trail
 * 3. Triggers voice/TTS response
 * 
 * Departments: Lab, Pharmacy, Ward, OT, Billing, Radiology, Reception, ICU, Blood Bank
 */

import type { DepartmentId, DepartmentNotification } from "./types";
import { auditLogger } from "../../services/auditLogger";

// ─── Department Inbox State ──────────────────────────────────────

const departmentInboxes: Record<DepartmentId, DepartmentNotification[]> = {
  LAB: [],
  PHARMACY: [],
  WARD: [],
  OT: [],
  BILLING: [],
  RADIOLOGY: [],
  RECEPTION: [],
  ICU: [],
  BLOOD_BANK: [],
};

// ─── Listeners (for UI reactivity) ──────────────────────────────

type InboxListener = (dept: DepartmentId, notifications: DepartmentNotification[]) => void;
const listeners: InboxListener[] = [];

function notifyListeners(dept: DepartmentId): void {
  const inbox = departmentInboxes[dept];
  for (const listener of listeners) {
    try { listener(dept, [...inbox]); } catch (e) { console.error("[DeptDispatch] Listener error:", e); }
  }
}

// ─── Department Metadata ─────────────────────────────────────────

interface DepartmentMeta {
  id: DepartmentId;
  name: string;
  icon: string;
  color: string;
  contactRole: string;
}

const DEPARTMENT_META: Record<DepartmentId, DepartmentMeta> = {
  LAB: { id: "LAB", name: "Laboratory", icon: "🔬", color: "#10b981", contactRole: "Lab Technician" },
  PHARMACY: { id: "PHARMACY", name: "Pharmacy", icon: "💊", color: "#8b5cf6", contactRole: "Pharmacist" },
  WARD: { id: "WARD", name: "Ward / Nursing", icon: "🏥", color: "#3b82f6", contactRole: "Ward Nurse" },
  OT: { id: "OT", name: "Operation Theater", icon: "🔪", color: "#ef4444", contactRole: "OT In-charge" },
  BILLING: { id: "BILLING", name: "Billing & Finance", icon: "💰", color: "#f59e0b", contactRole: "Billing Officer" },
  RADIOLOGY: { id: "RADIOLOGY", name: "Radiology & Imaging", icon: "📡", color: "#06b6d4", contactRole: "Radiographer" },
  RECEPTION: { id: "RECEPTION", name: "Front Desk / Reception", icon: "🎫", color: "#ec4899", contactRole: "Receptionist" },
  ICU: { id: "ICU", name: "Intensive Care Unit", icon: "❤️‍🩹", color: "#dc2626", contactRole: "ICU Nurse" },
  BLOOD_BANK: { id: "BLOOD_BANK", name: "Blood Bank", icon: "🩸", color: "#b91c1c", contactRole: "Blood Bank Tech" },
};

// ─── Dispatch Service ────────────────────────────────────────────

class DepartmentDispatchService {

  /**
   * Dispatch a notification to a department inbox.
   */
  dispatch(notification: Omit<DepartmentNotification, "id" | "createdAt" | "acknowledged">): DepartmentNotification {
    const fullNotification: DepartmentNotification = {
      ...notification,
      id: `DEPT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      acknowledged: false,
    };

    departmentInboxes[notification.departmentId].unshift(fullNotification);

    // Keep inbox manageable (last 200 notifications)
    if (departmentInboxes[notification.departmentId].length > 200) {
      departmentInboxes[notification.departmentId] = departmentInboxes[notification.departmentId].slice(0, 200);
    }

    // Audit log
    auditLogger.log({
      action: "TASK_CREATED",
      performedBy: notification.createdBy,
      userRole: "System",
      patientUhid: notification.patientUhid,
      details: `[${notification.departmentId}] ${notification.title}: ${notification.body}`,
      sourceModule: "department_dispatch",
      sourceRecordId: fullNotification.id,
    });

    // Notify UI listeners
    notifyListeners(notification.departmentId);

    console.log(
      `[DeptDispatch] ${DEPARTMENT_META[notification.departmentId].icon} ${notification.departmentId} ← ` +
      `${notification.type} [${notification.priority}] ${notification.title}`
    );

    return fullNotification;
  }

  /**
   * Dispatch a lab order notification.
   */
  dispatchLabOrder(params: {
    orderId: string;
    patientUhid: string;
    tests: string[];
    priority: "routine" | "urgent" | "stat";
    orderedBy: string;
  }): DepartmentNotification {
    return this.dispatch({
      departmentId: "LAB",
      type: "ORDER",
      priority: params.priority === "stat" ? "CRITICAL" : params.priority === "urgent" ? "HIGH" : "NORMAL",
      title: `Lab Order: ${params.tests.join(", ")}`,
      body: `Patient UHID ${params.patientUhid} — ${params.tests.length} test(s) ordered by ${params.orderedBy}. Priority: ${params.priority.toUpperCase()}.`,
      patientUhid: params.patientUhid,
      orderId: params.orderId,
      createdBy: params.orderedBy,
    });
  }

  /**
   * Dispatch a radiology order notification.
   */
  dispatchRadiologyOrder(params: {
    orderId: string;
    patientUhid: string;
    modality: string;
    bodyPart: string;
    orderedBy: string;
  }): DepartmentNotification {
    return this.dispatch({
      departmentId: "RADIOLOGY",
      type: "ORDER",
      priority: "NORMAL",
      title: `${params.modality.toUpperCase()}: ${params.bodyPart}`,
      body: `Patient UHID ${params.patientUhid} — ${params.modality} of ${params.bodyPart} ordered by ${params.orderedBy}.`,
      patientUhid: params.patientUhid,
      orderId: params.orderId,
      createdBy: params.orderedBy,
    });
  }

  /**
   * Dispatch a pharmacy prescription notification.
   */
  dispatchPrescription(params: {
    rxId: string;
    patientUhid: string;
    medications: string[];
    prescribedBy: string;
  }): DepartmentNotification {
    return this.dispatch({
      departmentId: "PHARMACY",
      type: "ORDER",
      priority: "NORMAL",
      title: `Prescription: ${params.medications.length} medication(s)`,
      body: `Patient UHID ${params.patientUhid} — ${params.medications.join(", ")}. Prescribed by ${params.prescribedBy}.`,
      patientUhid: params.patientUhid,
      orderId: params.rxId,
      createdBy: params.prescribedBy,
    });
  }

  /**
   * Dispatch a billing clearance request.
   */
  dispatchBillingClearance(params: {
    patientUhid: string;
    purpose: string;
    requestedBy: string;
  }): DepartmentNotification {
    return this.dispatch({
      departmentId: "BILLING",
      type: "CLEARANCE",
      priority: "HIGH",
      title: `Billing Clearance: ${params.purpose}`,
      body: `Patient UHID ${params.patientUhid} requires billing clearance for ${params.purpose}. Requested by ${params.requestedBy}.`,
      patientUhid: params.patientUhid,
      createdBy: params.requestedBy,
    });
  }

  /**
   * Dispatch an OT alert.
   */
  dispatchOTAlert(params: {
    title: string;
    body: string;
    priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
    patientUhid?: string;
    createdBy: string;
  }): DepartmentNotification {
    return this.dispatch({
      departmentId: "OT",
      type: "ALERT",
      ...params,
    });
  }

  /**
   * Dispatch an ICU critical alert.
   */
  dispatchICUAlert(params: {
    title: string;
    body: string;
    patientUhid: string;
    createdBy: string;
  }): DepartmentNotification {
    return this.dispatch({
      departmentId: "ICU",
      type: "ALERT",
      priority: "CRITICAL",
      ...params,
    });
  }

  /**
   * Acknowledge a notification.
   */
  acknowledge(notificationId: string, acknowledgedBy: string): boolean {
    for (const dept of Object.keys(departmentInboxes) as DepartmentId[]) {
      const notification = departmentInboxes[dept].find((n) => n.id === notificationId);
      if (notification) {
        notification.acknowledged = true;
        notification.acknowledgedBy = acknowledgedBy;
        notification.acknowledgedAt = Date.now();
        notifyListeners(dept);
        return true;
      }
    }
    return false;
  }

  /**
   * Get inbox for a specific department.
   */
  getInbox(dept: DepartmentId): DepartmentNotification[] {
    return [...(departmentInboxes[dept] ?? [])];
  }

  /**
   * Get unacknowledged count for a department.
   */
  getUnacknowledgedCount(dept: DepartmentId): number {
    return (departmentInboxes[dept] ?? []).filter((n) => !n.acknowledged).length;
  }

  /**
   * Get all department metadata.
   */
  getDepartments(): DepartmentMeta[] {
    return Object.values(DEPARTMENT_META);
  }

  /**
   * Get department metadata by ID.
   */
  getDepartment(id: DepartmentId): DepartmentMeta | undefined {
    return DEPARTMENT_META[id];
  }

  /**
   * Subscribe to inbox changes.
   */
  subscribe(listener: InboxListener): () => void {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  /**
   * Get summary across all departments.
   */
  getSummary(): {
    departments: { id: DepartmentId; name: string; icon: string; total: number; unacknowledged: number }[];
    totalUnacknowledged: number;
  } {
    const departments = (Object.keys(departmentInboxes) as DepartmentId[]).map((id) => ({
      id,
      name: DEPARTMENT_META[id].name,
      icon: DEPARTMENT_META[id].icon,
      total: departmentInboxes[id].length,
      unacknowledged: departmentInboxes[id].filter((n) => !n.acknowledged).length,
    }));

    return {
      departments,
      totalUnacknowledged: departments.reduce((sum, d) => sum + d.unacknowledged, 0),
    };
  }
}

// ─── Singleton Export ─────────────────────────────────────────────

export const departmentDispatch = new DepartmentDispatchService();
