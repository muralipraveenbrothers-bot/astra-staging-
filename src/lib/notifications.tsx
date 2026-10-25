// Astra AI — Unified Smart Notification Engine.
// One role-aware notification system replaces scattered mechanism:
//   severity: critical | high | normal | info
//   lifecycle: NEW → ACKNOWLEDGED → ACTED → RESOLVED
// Every notification targets one or more roles; the bell and the
// Notification Center surface only what applies to the signed-in role.

import type { Role } from "./auth";
import { uid, nowTime } from "./utils";

export type NotificationSeverity = "critical" | "high" | "normal" | "info";
export type NotificationStatus = "NEW" | "ACKNOWLEDGED" | "ACTED" | "RESOLVED";

export interface HospitalNotification {
  id: string;
  title: string;
  detail: string;
  severity: NotificationSeverity;
  /** roles that should see this ("all" empty array = every staff role) */
  targetRoles: Role[];
  /** department it originated from — lets workspace cards filter */
  sourceDept?: string;
  createdAt: string;
  createdTs: number;
  status: NotificationStatus;
  acknowledgedAt?: string;
  actedAt?: string;
  resolvedAt?: string;
  /** quick-action label + destination (e.g. "View Lab Queue" → /lab) */
  actionLabel?: string;
  actionRoute?: string;
  /** patient context when applicable */
  linkedPatient?: string;
  linkedUhid?: string;
}

export const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  info: 3,
};

export const SEVERITY_LABEL: Record<NotificationSeverity, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  info: "Informational",
};

export const STATUS_FLOW: NotificationStatus[] = ["NEW", "ACKNOWLEDGED", "ACTED", "RESOLVED"];

/** Shape accepted by the store's addNotification. */
export type NewNotification = Omit<
  HospitalNotification,
  "id" | "createdAt" | "createdTs" | "status"
> & { targetRoles?: Role[] };

export function makeNotification(n: NewNotification): HospitalNotification {
  return {
    ...n,
    id: uid("ntf"),
    createdAt: nowTime(),
    createdTs: Date.now(),
    status: "NEW",
    targetRoles: n.targetRoles ?? [],
  };
}

/* ------------------------------------------------------------------ */
/*  Role-aware seed notification feeds (one healthy demo set per role) */
/* ------------------------------------------------------------------ */

export function seedForRole(role: Role): NewNotification[] {
  switch (role) {
    case "ceo":
      return [
        { title: "Collections below daily target", detail: "Revenue at 58% of today's target by 16:00. Cash drawer variance flagged on register.", severity: "critical", targetRoles: ["ceo", "finance"], sourceDept: "Billing", actionLabel: "Open Finance", actionRoute: "/finance" },
        { title: "OT variance — Theatre 2 finished 45m late", detail: "Hernia repair PT-103 ran 10:15–11:40 (plan 10:30–11:00). No patient safety issue.", severity: "high", targetRoles: ["ceo"], sourceDept: "OT", actionLabel: "View OT", actionRoute: "/ot" },
        { title: "Staffing gap — night shift Ward B", detail: "Roster shows 1 nurse short for tonight 9 PM–7 AM. Escalate to HR.", severity: "high", targetRoles: ["ceo", "hr"], sourceDept: "HR", actionLabel: "View HR", actionRoute: "/hr" },
        { title: "Lab TAT breach", detail: "3 samples exceeded 90-minute turnaround. Queue pressure on Hematology.", severity: "normal", targetRoles: ["ceo", "lab"], sourceDept: "Laboratory", actionLabel: "View Lab", actionRoute: "/lab" },
        { title: "Daily report generated", detail: "Dr. Anitha generated today's hospital report at 16:05.", severity: "info", targetRoles: ["ceo"], sourceDept: "Reports" },
      ];
    case "doctor":
      return [
        { title: "Critical lab result — K+ 6.1 mmol/L", detail: "PT-2210 (Meenakshi Sundaram). STAT review required before next dose cycle.", severity: "critical", targetRoles: ["doctor"], sourceDept: "Laboratory", actionLabel: "View Lab", actionRoute: "/lab", linkedPatient: "Meenakshi Sundaram" },
        { title: "Pending report review", detail: "2 radiology reports awaiting your sign-off (CXR PT-2212, USG PT-2215).", severity: "high", targetRoles: ["doctor"], sourceDept: "Radiology", actionLabel: "View Radiology", actionRoute: "/radiology" },
        { title: "OT consent pending", detail: "Suresh Babu — Hernia repair, 13 Aug 10:30. Digital consent signed by attender; physician signature pending.", severity: "high", targetRoles: ["doctor", "ot"], sourceDept: "OT", actionLabel: "View OT", actionRoute: "/ot" },
        { title: "Pharmacy dispensed Rx #P-552", detail: "Paracetamol + Azithromycin delivered to ward for PT-2214.", severity: "info", targetRoles: ["doctor"], sourceDept: "Pharmacy", actionLabel: "View Pharmacy", actionRoute: "/pharmacy" },
      ];
    case "reception":
      return [
        { title: "OPD queue — 5 walk-ins waiting", detail: "Lakshmi V and Imran Sheikh waiting 40+ minutes. Consider triage call.", severity: "high", targetRoles: ["reception"], sourceDept: "Reception", actionLabel: "Open Appointments", actionRoute: "/appointments" },
        { title: "Admission pending — bed allocation", detail: "PT-2215 doctor-recommended admission. 3 vacant beds available (G-03, S-02, I-02).", severity: "normal", targetRoles: ["reception", "ward"], sourceDept: "Reception", actionLabel: "View Ward", actionRoute: "/ward" },
        { title: "Billing clearance required before discharge", detail: "PT-1087 IP dues ₹24,800 — discharge holds until cleared.", severity: "high", targetRoles: ["reception", "finance"], sourceDept: "Billing", actionLabel: "Open Billing", actionRoute: "/billing" },
        { title: "3 appointments unconfirmed for tomorrow", detail: "Confirm slots before 5 PM to protect the afternoon schedule.", severity: "normal", targetRoles: ["reception"], sourceDept: "Reception", actionLabel: "Open Appointments", actionRoute: "/appointments" },
      ];
    case "pharmacy":
      return [
        { title: "New prescription Rx #P-556 — urgent", detail: "Dr. Karthik ordered Ceftriaxone 1g IV for PT-2215 — STAT dispensing.", severity: "high", targetRoles: ["pharmacy"], sourceDept: "Pharmacy", actionLabel: "View Orders", actionRoute: "/pharmacy" },
        { title: "Low stock — Amoxicillin 500mg", detail: "Below reorder level (58/60). Purchase order recommended.", severity: "high", targetRoles: ["pharmacy"], sourceDept: "Pharmacy" },
        { title: "Batch expiry alert — B2409", detail: "Paracetamol batch expires in 30 days (512 units in stock).", severity: "normal", targetRoles: ["pharmacy"], sourceDept: "Pharmacy" },
        { title: "Purchase order #PO-118 delivered", detail: "Ceftriaxone 40 vials received and added to stock register.", severity: "info", targetRoles: ["pharmacy"], sourceDept: "Pharmacy" },
      ];
    case "ward":
      return [
        { title: "Overdue medication — Ceftriaxone dose", detail: "R. Devi (Bed G-01) dose due 20 minutes ago. Administer and log.", severity: "critical", targetRoles: ["ward"], sourceDept: "Ward", actionLabel: "View Ward", actionRoute: "/ward", linkedPatient: "R. Devi" },
        { title: "New doctor order — Paracetamol IV q6h", detail: "PT-2210, started today. First dose due 15:30.", severity: "high", targetRoles: ["ward"], sourceDept: "Ward", actionLabel: "View Orders", actionRoute: "/ward" },
        { title: "Vitals anomaly — SpO2 91%", detail: "M. Singh (Bed S-01). Recheck within 30 minutes; escalate if < 90%.", severity: "high", targetRoles: ["ward"], sourceDept: "Ward", actionLabel: "View Ward", actionRoute: "/ward" },
        { title: "Shift handover pending", detail: "14:00 handover — update bed board before signing out.", severity: "normal", targetRoles: ["ward"], sourceDept: "Ward" },
      ];
    case "lab":
      return [
        { title: "3 STAT samples awaiting collection", detail: "ER panel PT-2215, PT-2216, PT-2217 — collect within 10 minutes.", severity: "high", targetRoles: ["lab"], sourceDept: "Laboratory", actionLabel: "View Lab", actionRoute: "/lab" },
        { title: "Pre-op CBC & LFT ordered", detail: "PT-2210 (Meenakshi Sundaram) — process before scheduled cholecystectomy.", severity: "normal", targetRoles: ["lab"], sourceDept: "Laboratory", actionLabel: "View Lab", actionRoute: "/lab" },
        { title: "Result entry pending", detail: "2 processed samples await verification (Hematology).", severity: "normal", targetRoles: ["lab"], sourceDept: "Laboratory" },
        { title: "QC calibration due", detail: "Hematology analyzer calibration window opens 17:00.", severity: "info", targetRoles: ["lab"], sourceDept: "Laboratory" },
      ];
    case "radiotech":
      return [
        { title: "STAT chest X-Ray — ER", detail: "PT-2215, portable. Radiologist on-call informed.", severity: "high", targetRoles: ["radiotech"], sourceDept: "Radiology", actionLabel: "View Radiology", actionRoute: "/radiology" },
        { title: "2 CT appointments scheduled today", detail: "Verify contrast consent before both slots.", severity: "normal", targetRoles: ["radiotech"], sourceDept: "Radiology" },
        { title: "Pending report sign-off — 1 USG study", detail: "PT-2212 abdomen study awaiting radiologist report.", severity: "info", targetRoles: ["radiotech", "doctor"], sourceDept: "Radiology" },
      ];
    case "ot":
      return [
        { title: "Consent verification pending", detail: "Suresh Babu — Hernia repair 13 Aug 10:30. Attender + witness signatures captured; physician pending.", severity: "high", targetRoles: ["ot", "doctor"], sourceDept: "OT", actionLabel: "View OT", actionRoute: "/ot" },
        { title: "Pre-op checklist incomplete — Theatre 1", detail: "14:00 lap chole: implant availability and deep-vein prophylaxis unchecked.", severity: "normal", targetRoles: ["ot"], sourceDept: "OT", actionLabel: "View OT", actionRoute: "/ot" },
        { title: "Consumables restock — Theatre 3", detail: "Suture set count below minimum. Raise requisition.", severity: "info", targetRoles: ["ot"], sourceDept: "OT" },
      ];
    case "finance":
      return [
        { title: "Unpaid IP dues above ₹20,000", detail: "PT-1087 (R. Devi) ₹24,800 · PT-1076 (M. Singh) ₹31,500. Follow-up needed.", severity: "high", targetRoles: ["finance"], sourceDept: "Billing", actionLabel: "Open Billing", actionRoute: "/billing" },
        { title: "PMJAY pre-auth pending", detail: "Sunita Reddy discharge claim awaiting final sign-off.", severity: "normal", targetRoles: ["finance", "reception"], sourceDept: "Billing", actionLabel: "Open Billing", actionRoute: "/billing" },
        { title: "Daily collections summary ready", detail: "UPI ₹48,200 · Card ₹31,900 · Cash ₹14,500.", severity: "info", targetRoles: ["finance", "ceo"], sourceDept: "Billing" },
      ];
    case "hr":
      return [
        { title: "Nurse coverage gap — tonight", detail: "Ward B night shift understaffed by 1. Open duty roster for swap.", severity: "normal", targetRoles: ["hr", "ceo"], sourceDept: "HR", actionLabel: "View HR", actionRoute: "/hr" },
        { title: "Attendance anomaly", detail: "Vikram Shah clocked in off-geofence at 09:31 — human review flagged.", severity: "normal", targetRoles: ["hr"], sourceDept: "HR", actionLabel: "View Attendance", actionRoute: "/attendance" },
        { title: "Leave requests — 2 staff", detail: "Pending approval for tomorrow (Pharmacy assistant, Ward nurse).", severity: "info", targetRoles: ["hr"], sourceDept: "HR" },
      ];
    case "supervisor":
      return [
        { title: "Front desk queue spike", detail: "5 walk-ins waiting; only 2 counters staffed since 13:00.", severity: "high", targetRoles: ["supervisor", "reception"], sourceDept: "Reception", actionLabel: "View Reception", actionRoute: "/reception" },
        { title: "Registration issue — duplicate UHID risk", detail: "PT-2213 phone number matches existing patient PT-2198.", severity: "high", targetRoles: ["supervisor", "reception"], sourceDept: "Reception" },
        { title: "Shift change overdue", detail: "Morning-shift handover notes not completed by Ravi Kumar.", severity: "normal", targetRoles: ["supervisor"], sourceDept: "Reception" },
      ];
    case "marketing":
      return [
        { title: "Campaign CTR below target", detail: "Festive checkup campaign 1.8% CTR vs 3.2% target. Pause and re-target.", severity: "normal", targetRoles: ["marketing"], sourceDept: "Marketing" },
        { title: "3 new Google reviews today", detail: "2 five-star, 1 four-star. Reply templates queued for approval.", severity: "info", targetRoles: ["marketing"], sourceDept: "Marketing", actionLabel: "View Reputation", actionRoute: "/reputation" },
      ];
    case "admin":
      return [
        { title: "Backup verification due", detail: "Nightly DB snapshot for 23:00 not yet confirmed by ops.", severity: "normal", targetRoles: ["admin"], sourceDept: "IT" },
        { title: "System audit log exported", detail: "Weekly export at 06:00 completed — 214 entries archived.", severity: "info", targetRoles: ["admin", "ceo"], sourceDept: "IT", actionLabel: "View Audit", actionRoute: "/audit" },
      ];
    default:
      return [
        { title: "Welcome to Astra AI", detail: "Your role-based workspace is ready. Commands run through the AI Command Center with permission checks.", severity: "info", targetRoles: [role] },
      ];
  }
}

/** Roles a notification with empty targetRoles applies to. */
export function notificationAppliesTo(n: HospitalNotification, role: Role): boolean {
  if (n.targetRoles.length === 0) return true;
  return n.targetRoles.includes(role);
}

/** Seeds the role-aware demo feed once per role (persisted guard). */
export function ensureRoleSeeds(
  role: Role,
  notifications: HospitalNotification[],
  addNotification: (n: NewNotification) => void
): void {
  const key = "astra.notifySeeded";
  let seeded: string[] = [];
  try {
    seeded = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch { /* ignore */ }
  if (seeded.includes(role) && notifications.length > 0) return;
  const fresh = notifications.filter((n) => n.targetRoles.includes(role)).length === 0;
  if (fresh) {
    seedForRole(role).forEach((n) => addNotification(n));
    seeded = [...new Set([...seeded, role])];
    try {
      localStorage.setItem(key, JSON.stringify(seeded));
    } catch { /* ignore */ }
  }
}
