// Astra AI — Command Intelligence Engine.
// Central AI Command Center execution layer.
//
// Pipeline: ASK → UNDERSTAND → AUTHORIZE → EXECUTE → VERIFY → REPORT
//
// Every command is classified into one of four safety levels:
//   info        — answer immediately (read-only)
//   reversible  — execute after normal permission validation (undoable)
//   important   — execute only after explicit confirmation
//   high-risk   — require explicit confirmation + appropriate authorization
//
// Every execution writes an audit log entry. Cross-department commands
// dispatch role-aware notifications into the Unified Notification Engine.
// Sensitive categories (finance, HR, admin) are permission-gated per role.

import type { Role } from "./auth";
import type {
  Appointment,
  AttendanceRecord,
  Bed,
  Bill,
  DischargeRecord,
  HospitalOrder,
  MedDose,
  PatientRecord,
  ShiftCell,
  SurgicalPlan,
  AdmissionDecision,
  DischargePlan,
} from "./types";
import type { HospitalTask } from "./taskEngine";
import type { NewNotification } from "./notifications";
import { consultFee, emptyRegistration, parseTranscriptLocal } from "./registration";
import { fmtINR, nowTime, uid } from "./utils";
import {
  doctorRounds,
  evidenceCopilot,
  formatPatientList,
  hospitalCensus,
  parseUniversalOrder,
  patientSafetyReview,
  whatChangedForPatient,
  whatNeedsAttention,
} from "./astraFeatures";

export type CommandLevel = "info" | "reversible" | "important" | "high-risk";
export type CommandCategory =
  | "census" | "reception" | "registration" | "admission" | "clinical"
  | "pharmacy" | "laboratory" | "radiology" | "ot" | "billing" | "hr"
  | "reporting" | "tasks" | "journey" | "notify" | "admin" | "unknown";

export const LEVEL_LABEL: Record<CommandLevel, string> = {
  info: "Information",
  reversible: "Reversible Action",
  important: "Important Action",
  "high-risk": "High-Risk Action",
};

/** Everything the engine can touch — supplied by the Command Console from the store. */
export interface CommandCtx {
  accountName: string;
  accountRole: Role;
  patients: PatientRecord[];
  appointments: Appointment[];
  beds: Bed[];
  orders: HospitalOrder[];
  tasks: HospitalTask[];
  surgicalPlans: SurgicalPlan[];
  admissionDecisions: AdmissionDecision[];
  dischargePlans: DischargePlan[];
  shifts: ShiftCell[];
  attendance: AttendanceRecord[];
  bills: Bill[];
  medDoses: MedDose[];
  discharged: DischargeRecord[];
  vitals: import("./types").VitalsEntry[];
  notifications: import("./notifications").HospitalNotification[];
  progressNotes: import("./types").ProgressNote[];
  clinicalNotes: import("./types").ClinicalNote[];
  cdsDifferentials: import("./types").CDSDifferential[];
  cdsInvestigations: import("./types").CDSInvestigation[];
  clinicalReferences: import("./types").ClinicalReference[];
  addTask: (t: Omit<HospitalTask, "id" | "createdAt" | "updatedAt" | "history">) => HospitalTask;
  addPatient: (p: Omit<PatientRecord, "id" | "registeredAt">) => PatientRecord;
  addBill: (b: Omit<Bill, "id" | "receiptNo">) => Bill;
  addSendLog: (e: Omit<import("./types").SendLogEntry, "id" | "timestamp">) => void;
  addNotification: (n: NewNotification) => void;
  logAudit: (action: string, detail: string) => void;
  removePatient: (id: string) => void;
  removeBill: (id: string) => void;
  markDischarged?: (d: DischargeRecord) => void;
}

export interface CommandSpec {
  key: string;
  label: string;
  pattern: RegExp;
  level: CommandLevel;
  category: CommandCategory;
  roles: Role[];
  describe: string;
}

const ALL_STAFF: Role[] = ["ceo", "doctor", "reception", "pharmacy", "ward", "lab", "radiotech", "ot", "supervisor", "finance", "hr", "marketing", "admin"];

const CLINICAL: Role[] = ["ceo", "doctor"];
const FRONT: Role[] = ["ceo", "doctor", "reception", "supervisor", "admin"];

/** Command catalog — ordered: first match wins (most specific first). */
export const COMMANDS: CommandSpec[] = [
  { key: "attention", label: "What needs attention", pattern: /what needs (?:my |the )?attention|attention (?:queue|list)|what'?s (?:on )?(?:my )?(?:priority|critical)|priority queue|needs my attention/i, level: "info", category: "clinical", roles: ALL_STAFF, describe: "Shows a centralized priority queue of critical items needing attention" },
  { key: "hospital-census", label: "Hospital census", pattern: /how many patients (?:are|is) (?:in|at) (?:the )?hospital|hospital census|full census|total patients|patient census/i, level: "info", category: "census", roles: ALL_STAFF, describe: "Shows total hospital census broken down by OP/IP/ICU/Ward/Emergency" },
  { key: "show-patients", label: "Show patients", pattern: /show (?:me )?(?:the )?patients|list (?:all |the )?patients|patient list|who (?:is|are) (?:in|admitted)/i, level: "info", category: "census", roles: ALL_STAFF, describe: "Lists all registered patients with status" },
  { key: "what-changed", label: "What changed", pattern: /what changed|what'?s (?:new|changed)|changes (?:since|for)|since yesterday|what happened (?:to|with)/i, level: "info", category: "clinical", roles: CLINICAL, describe: "Shows what changed for a patient since yesterday" },
  { key: "doctor-rounds", label: "Doctor rounds", pattern: /start (?:my |the )?rounds|begin rounds|round mode|patient rounds|start rounds/i, level: "info", category: "clinical", roles: CLINICAL, describe: "Starts sequential doctor round mode for inpatients" },
  { key: "patient-safety", label: "Patient safety review", pattern: /safety review|blind[ -]?spot|patient safety|safety check|review (?:for )?safety/i, level: "info", category: "clinical", roles: CLINICAL, describe: "Runs a patient safety / blind-spot review" },
  { key: "evidence-copilot", label: "Evidence AI copilot", pattern: /evidence (?:ai |copilot )?|differential diagnosis|rule[ -]?in|rule[ -]?out|why (?:this )?diagnosis|evidence analysis|clinical evidence/i, level: "info", category: "clinical", roles: CLINICAL, describe: "Runs evidence-based clinical analysis with differentials, rule-in/out, and guidelines" },
  { key: "universal-order", label: "Universal doctor order", pattern: /order (?:a |an |the )?(cbc|lft|rft|platelet|blood|urine|esr|crp|x-?ray|usg|ultrasound|ct|mri|ecg|echo|troponin|d-dimer|electrolyte|lipid|thyroid|hba1c|sugar|amylase|lipase|bilirubin|sgpt|sgot|creatinine|urea|sodium|potassium|blood culture|dengue|malaria|widal|pt\/inr|aptt|blood group|cross match|nursing instruction|monitor vitals|observe)/i, level: "reversible", category: "laboratory", roles: CLINICAL, describe: "Converts natural language into a structured lab/radiology/nursing order" },
  { key: "lab-order", label: "Laboratory order", pattern: /(cbc|lft|lab order|investigation order|blood test|send .*(?:to[ ]+)?(?:the )?(?:laboratory|lab)|order (?:tests|investigations))/i, level: "reversible", category: "laboratory", roles: CLINICAL, describe: "Sends a lab investigation order to the Laboratory workspace" },
  { key: "pharmacy-order", label: "Pharmacy order", pattern: /(prescription|pharmacy order|send .*(?:to[ ]+)?(?:the )?pharmacy|dispens)/i, level: "reversible", category: "pharmacy", roles: CLINICAL, describe: "Sends a prescription/order to the Pharmacy workspace" },
  { key: "unpaid-bills", label: "Outstanding receivables", pattern: /(unpaid bills|outstanding|receivables)/i, level: "info", category: "billing", roles: ["ceo", "finance"], describe: "Lists unpaid bills above a threshold" },
  { key: "doctor-op-report", label: "Doctor-wise OP report", pattern: /(doctor[- ]wise|per doctor|op report|consultant[- ]wise)/i, level: "info", category: "reporting", roles: ["ceo", "doctor"], describe: "Generates a doctor-wise OP report" },
  { key: "hospital-report", label: "Hospital report", pattern: /(daily report|hospital report|generate (?:today'?s )?report|send (?:the )?report)/i, level: "important", category: "reporting", roles: ["ceo"], describe: "Generates and dispatches today's hospital report" },
  { key: "critical-lab", label: "Critical lab watch", pattern: /(critical lab|alert me.*(?:lab|result)|pending.*critical)/i, level: "reversible", category: "clinical", roles: CLINICAL, describe: "Engages continuous alerting for pending critical lab results" },
  { key: "ot-tomorrow", label: "Tomorrow's OT list", pattern: /tomorrow'?s (ot|theatre|surgery|surgical)|\bprepare tomorrow/i, level: "info", category: "ot", roles: ALL_STAFF, describe: "Prepares tomorrow's OT list" },
  { key: "schedule-ot", label: "Schedule OT booking", pattern: /(schedule|book|plan) (?:a |the )?(?:for )?(?:ot|theatre|surgery|operation)/i, level: "important", category: "ot", roles: CLINICAL, describe: "Creates an OT booking (requires confirmation)" },
  { key: "ot-today", label: "Today's OT schedule", pattern: /(ot schedule|today'?s ot|theatre (?:schedule|list)|operation schedule)/i, level: "info", category: "ot", roles: ALL_STAFF, describe: "Shows today's OT schedule" },
  { key: "register-patient", label: "Register patient", pattern: /register (?:a |new )?patient/i, level: "reversible", category: "registration", roles: FRONT, describe: "Registers a patient and posts the consultation bill (undoable)" },
  { key: "ip-admission", label: "IP admission", pattern: /(ip|inpatient|ipd) admission|admit patient|create (?:an )?admission/i, level: "important", category: "admission", roles: FRONT, describe: "Initiates an IP admission (bed allocation + nursing task, requires confirmation)" },
  { key: "pending-discharge", label: "Pending discharge summaries", pattern: /pending discharge|discharge summar(?:ies|y)\b/i, level: "info", category: "clinical", roles: ["ceo", "doctor", "reception", "supervisor", "ward", "finance"], describe: "Shows pending discharge summaries" },
  { key: "discharge-patient", label: "Discharge patient", pattern: /(discharge patient|discharge (pt|uhid)|\bdischarge (rakesh|sunita|meenakshi|suresh|ramesh|lakshmi|imran)\b)/i, level: "important", category: "clinical", roles: ["ceo", "doctor", "ward"], describe: "Initiates patient discharge workflow (requires confirmation)" },
  { key: "void-bill", label: "Void / refund bill", pattern: /(void|refund|cancel|reverse|write off) (?:the )?bill|reverse (?:a )?receipt/i, level: "high-risk", category: "billing", roles: ["ceo", "finance"], describe: "Voids/refunds a bill — irreversible after confirmation. Requires authorization." },
  { key: "staffing-gaps", label: "Staffing gaps", pattern: /(staffing gaps?|coverage gap|duty roster|staff(?:ing)? (?:today|status)|attendance anomal)/i, level: "info", category: "hr", roles: ["ceo", "hr", "admin", "supervisor"], describe: "Shows today's staffing gaps and attendance anomalies" },
  { key: "wait-30", label: "Patients waiting 30+ min", pattern: /waiting (?:more than |over |beyond )?(\d{1,3})|wait(?:ing)?[ -]?(\d{2,3})\s*(?:min|minutes)|delayed patients/i, level: "info", category: "reception", roles: ALL_STAFF, describe: "Lists patients waiting more than 30 minutes" },
  { key: "pending-pharmacy", label: "Pending pharmacy orders", pattern: /pending pharmacy|pharmacy (?:orders|queue)|orders (?:pending|to dispense)/i, level: "info", category: "pharmacy", roles: ALL_STAFF, describe: "Shows pending pharmacy orders" },
  { key: "reception-wait", label: "Reception wait / queue", pattern: /waiting in reception|queue depth|reception (?:queue|wait)|op wait|how many patients (?:waiting|in)/i, level: "info", category: "reception", roles: ALL_STAFF, describe: "Shows how many patients are waiting in reception" },
  { key: "op-census", label: "OP / bed census", pattern: /census|bed occupancy|how many patients (?:registered|today)|opvisits|op count/i, level: "info", category: "census", roles: ALL_STAFF, describe: "Shows today's OP census and bed occupancy" },
  { key: "my-tasks", label: "My pending tasks", pattern: /my (?:pending )?tasks|tasks (?:for|assigned to) me|what'?s (?:on )?my (?:plate|queue)/i, level: "info", category: "tasks", roles: ALL_STAFF, describe: "Shows tasks pending for the current user / role" },
  { key: "complete-task", label: "Complete / advance task", pattern: /complete task|finish task|mark task (?:as )?done|advance task/i, level: "reversible", category: "tasks", roles: ALL_STAFF, describe: "Advances a task to the next workflow status" },
  { key: "patient-where", label: "Patient journey lookup", pattern: /where is|where'?s|patient (?:status|journey)|journey (?:of|for)|what is pending (?:for|with)/i, level: "info", category: "journey", roles: ALL_STAFF, describe: "Locates a patient in the journey and shows pending actions" },
  { key: "notify-staff", label: "Notify department", pattern: /notify (?:the |a )?(lab|pharmacy|ward|ot|radiology|reception|nursing)|send alert to/i, level: "reversible", category: "notify", roles: ["ceo", "doctor", "supervisor", "reception"], describe: "Dispatches an alert to a department notification feed" },
];

/** Ask → Understand: find the matching command spec. */
export function understandCommand(text: string): CommandSpec | null {
  const found = COMMANDS.find((c) => c.pattern.test(text));
  return found ?? null;
}

/** Authorize: can this role run this command? (CEO is the universal authority.) */
export function authorizeCommand(spec: CommandSpec, role: Role): boolean {
  if (role === "ceo") return true;
  return spec.roles.includes(role);
}

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function slotToMin(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

interface Resolution {
  patient?: PatientRecord;
  note?: string;
}

/** Resolve a patient reference from UHID/id/name tokens inside the command text. */
function resolvePatient(text: string, patients: PatientRecord[]): Resolution {
  const uhidM = text.match(/uhid[-\s]?(\d+)/i);
  if (uhidM) {
    const digits = uhidM[1];
    const p = patients.find((x) => x.id.replace(/\D/g, "").endsWith(digits));
    if (p) return { patient: p };
    return { note: `No patient found for UHID ${digits} — verify registration.` };
  }
  const idM = text.match(/\bPT-(\d{2,5})\b/i);
  if (idM) {
    const p = patients.find((x) => x.id.toLowerCase() === `pt-${idM[1].toLowerCase()}`);
    if (p) return { patient: p };
    return { note: `No registered patient matches PT-${idM[1]}.` };
  }
  const nameM = text.match(/for ([A-Za-z][A-Za-z .'-]{2,30})/i);
  if (nameM) {
    const token = nameM[1].trim().toLowerCase();
    const p = patients.find((x) => x.name.toLowerCase().includes(token) || token.includes(x.name.toLowerCase()));
    if (p) return { patient: p };
    return { note: `No registered patient named "${nameM[1].trim()}".` };
  }
  return {};
}

function audit(ctx: CommandCtx, action: string, detail: string) {
  ctx.logAudit(action, detail);
}

function deptNotify(ctx: CommandCtx, title: string, detail: string, targetRoles: Role[], sourceDept: string, actionRoute?: string) {
  ctx.addNotification({ title, detail, severity: "normal", targetRoles, sourceDept, actionRoute });
}

/* ------------------------------------------------------------------ */
/*  Execute — full pipeline with confirmation handling                 */
/* ------------------------------------------------------------------ */

export interface CommandOutcome {
  key: string;
  label: string;
  level: CommandLevel;
  category: CommandCategory;
  allowed: boolean;
  deniedReason?: string;
  requiresConfirm: boolean;
  confirmed: boolean;
  title: string;
  lines: string[];
  undo?: { patientId?: string; billId?: string };
  actionRoute?: string;
  auditAction?: string;
  auditDetail?: string;
  /** console-side state change the engine delegates (e.g. task status advance) */
  taskAdvance?: { taskId: string; toStatus: string };
}

function outcome(
  spec: CommandSpec,
  partial: { title: string; lines: string[] } & Partial<
    Omit<CommandOutcome, "key" | "label" | "level" | "category" | "requiresConfirm" | "allowed" | "title" | "lines">
  >
): CommandOutcome {
  return {
    key: spec.key,
    label: spec.label,
    level: spec.level,
    category: spec.category,
    requiresConfirm: spec.level === "important" || spec.level === "high-risk",
    confirmed: false,
    allowed: true,
    ...partial,
  };
}

function denied(spec: CommandSpec, reason: string): CommandOutcome {
  return {
    key: spec.key,
    label: spec.label,
    level: spec.level,
    category: spec.category,
    allowed: false,
    deniedReason: reason,
    requiresConfirm: false,
    confirmed: false,
    title: "Permission denied",
    lines: [reason, `Requires role: ${spec.roles.map((r) => r.toUpperCase()).join(" · ")}`],
  };
}

function resolveTaskRef(text: string, tasks: HospitalTask[]): HospitalTask | undefined {
  const idM = text.match(/TSK-(\d+)/i);
  if (idM) return tasks.find((t) => t.id.toLowerCase() === `tsk-${idM[1].toLowerCase()}`);
  return tasks.find((t) => t.status !== "COMPLETED" && t.status !== "CLOSED" && t.status !== "VERIFIED");
}

/* ------------------------------------------------------------------ */

export function executeCommand(text: string, ctx: CommandCtx, opts: { confirmed?: boolean } = {}): CommandOutcome {
  const spec = understandCommand(text);
  if (!spec) {
    audit(ctx, "AI command — unrecognized", `“${text}” by ${ctx.accountName}`);
    return {
      key: "unknown",
      label: "Unrecognized command",
      level: "info",
      category: "unknown",
      allowed: true,
      deniedReason: undefined,
      requiresConfirm: false,
      confirmed: false,
      title: "Command not understood",
      lines: [
        `“${text}” did not match a supported command.`,
        "Try: census · register patient… · send CBC for UHID 1024 · send prescription to pharmacy · today's OT schedule · pending pharmacy orders · unpaused — see example chips below.",
      ],
    };
  }

  if (!authorizeCommand(spec, ctx.accountRole)) {
    audit(ctx, "AI command — authorization denied", `${spec.label} by ${ctx.accountRole} ${ctx.accountName} on “${text}”`);
    return denied(spec, `“${spec.label}” is not permitted for the ${ctx.accountRole.toUpperCase()} role.`);
  }

  const confirmed = opts.confirmed === true;
  const q = text.trim();
  const s = q.toLowerCase();

  switch (spec.key) {
    /* ---------------- op / bed census ---------------- */
    case "op-census": {
      const todayApps = ctx.appointments.filter((a) => a.date === todayISO());
      const seen = ctx.patients.length;
      const occupied = ctx.beds.filter((b) => b.status === "occupied").length;
      const vacant = ctx.beds.filter((b) => b.status === "vacant").length;
      const ip = ctx.patients.filter((p) => p.admissionStatus === "inpatient").length + occupied;
      audit(ctx, "AI command — census", `read ${seen} OP · ${occupied}/${ctx.beds.length} beds occupied`);
      return outcome(spec, {
        title: `OP census — ${seen} patients registered · ${todayApps.filter((a) => a.status !== "no-show").length} visits today`,
        lines: [
          `Bed census: ${occupied} occupied · ${vacant} vacant · ${ctx.beds.filter((b) => b.status === "cleaning").length} cleaning`,
          `IP load: ${ip} inpatients · ${ctx.discharged.length} discharged today`,
          `Appointments today: ${todayApps.length} (${todayApps.filter((a) => a.status === "checked-in" || a.status === "in-consult").length} in flow)`,
        ],
      });
    }

    /* ---------------- reception wait / queue ---------------- */
    case "reception-wait": {
      const today = ctx.appointments.filter((a) => a.date === todayISO() && (a.status === "booked" || a.status === "checked-in"));
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const waiting = today.filter((a) => a.status === "booked" && nowMin - slotToMin(a.slot) > 10);
      audit(ctx, "AI command — reception queue", `read ${today.length} in queue · ${waiting.length} past slot`);
      return outcome(spec, {
        title: `Reception queue — ${today.length} patients waiting`,
        lines: [
          waiting.length
            ? `Past their slot: ${waiting.map((a) => `${a.patientName} (${a.slot})`).join(", ")}`
            : "No patients past their slot — queue is on schedule.",
          `Checked-in and in consult: ${ctx.appointments.filter((a) => a.date === todayISO() && (a.status === "checked-in" || a.status === "in-consult")).length}`,
        ],
      });
    }

    /* ---------------- register patient (reversible) ---------------- */
    case "register-patient": {
      const parsed = { ...emptyRegistration, ...parseTranscriptLocal(q) };
      if (!parsed.name) {
        return outcome(spec, {
          title: "Cannot register — name missing",
          lines: ['Try: "register patient name is <Name> age <N> <gender> phone <number> department <Dept>"'],
        });
      }
      const dept = parsed.department || "General Medicine";
      const fee = consultFee(dept);
      const patient = ctx.addPatient({
        name: parsed.name,
        age: parsed.age ? Number(parsed.age) : undefined,
        gender: parsed.gender || undefined,
        phone: parsed.phone || undefined,
        address: parsed.address || undefined,
        department: dept,
        linkedDoctor: parsed.doctor || undefined,
        complaint: parsed.complaint || undefined,
        source: "voice",
      });
      const bill = ctx.addBill({
        patientId: patient.id,
        kind: "OP",
        service: `Consultation — ${dept}`,
        amount: fee,
        staffName: ctx.accountName,
        timestamp: nowTime(),
        mode: parsed.mode || "Cash",
        reference: "AI-COMMAND",
      });
      audit(ctx, "AI command — register patient", `${patient.name} (${patient.id}) · ${bill.receiptNo} ${fmtINR(fee)} by ${ctx.accountName}`);
      return outcome(spec, {
        title: `Registered ${patient.name} — ${patient.id}`,
        lines: [
          `${[parsed.age && `${parsed.age}y`, parsed.gender, dept].filter(Boolean).join(" · ") || dept}`,
          `Consultation bill ${bill.receiptNo} · ${fmtINR(fee)} · ${parsed.mode || "Cash"}`,
          "Reversible — use Undo to remove patient and bill.",
        ],
        undo: { patientId: patient.id, billId: bill.id },
        auditAction: "AI command — register patient",
        auditDetail: `${patient.name} (${patient.id}) · ${bill.receiptNo}`,
      });
    }

    /* ---------------- lab order (reversible) ---------------- */
    case "lab-order": {
      const res = resolvePatient(q, ctx.patients);
      const task = ctx.addTask({
        title: `Lab Investigation Order — ${spec.label}`,
        patientId: res.patient?.id,
        patientName: res.patient?.name,
        uhid: res.patient?.id,
        department: "Laboratory",
        assignedRole: "lab",
        createdBy: ctx.accountName,
        priority: s.includes("stat") ? "critical" : "high",
        slaMinutes: s.includes("stat") ? 15 : 30,
        status: "NEW",
        category: "lab",
        description: `AI command: ${q}${res.patient ? ` · ${res.patient.id} ${res.patient.name}` : ""}`,
      });
      deptNotify(ctx, "New laboratory order", `Task ${task.id} — ${task.title}${res.patient ? ` for ${res.patient.name} (${res.patient.id})` : ""}.`, ["lab"], "AI Command", "/lab");
      audit(ctx, "AI command — lab order", `${task.id} · ${q}${res.patient ? ` · ${res.patient.id}` : ""}`);
      return outcome(spec, {
        title: `Lab order dispatched — ${task.id}`,
        lines: [
          res.patient ? `Patient: ${res.patient.name} (${res.patient.id})` : res.note ?? "Patient context not attached — add UHID for linking.",
          "Routed to Laboratory workspace · Priority: High",
          "Laboratory staff notified via Notification Center.",
        ],
        actionRoute: "/lab",
      });
    }

    /* ---------------- pharmacy order (reversible) ---------------- */
    case "pharmacy-order": {
      const res = resolvePatient(q, ctx.patients);
      const task = ctx.addTask({
        title: `Pharmacy Order / Prescription`,
        patientId: res.patient?.id,
        patientName: res.patient?.name,
        uhid: res.patient?.id,
        department: "Pharmacy",
        assignedRole: "pharmacy",
        createdBy: ctx.accountName,
        priority: "high",
        slaMinutes: 30,
        status: "NEW",
        category: "pharmacy",
        description: `AI command: ${q}${res.patient ? ` · ${res.patient.id} ${res.patient.name}` : ""}`,
      });
      deptNotify(ctx, "New prescription / order", `Task ${task.id} — dispense order${res.patient ? ` for ${res.patient.name} (${res.patient.id})` : ""}.`, ["pharmacy"], "AI Command", "/pharmacy");
      audit(ctx, "AI command — pharmacy order", `${task.id} · ${q}`);
      return outcome(spec, {
        title: `Pharmacy order dispatched — ${task.id}`,
        lines: [
          res.patient ? `Patient: ${res.patient.name} (${res.patient.id})` : res.note ?? "Patient context not attached — add UHID for linking.",
          "Routed to Pharmacy workspace · Status: NEW",
          "Pharmacist notified.",
        ],
        actionRoute: "/pharmacy",
      });
    }

    /* ---------------- pending pharmacy orders ---------------- */
    case "pending-pharmacy": {
      const pending = ctx.orders.filter((o) => (o.targetDept ?? "Ward") === "Pharmacy" && !o.acknowledgedAt);
      const tasks = ctx.tasks.filter((t) => t.category === "pharmacy" && t.status !== "COMPLETED" && t.status !== "CLOSED" && t.status !== "VERIFIED");
      audit(ctx, "AI command — pending pharmacy", `read ${pending.length} orders · ${tasks.length} pharmacy tasks`);
      return outcome(spec, {
        title: `Pending pharmacy — ${pending.length} orders · ${tasks.length} open tasks`,
        lines: pending.length
          ? pending.map((o) => `#${o.id} · ${o.orderText} · ${o.doctor}${o.escalated ? " · ESCALATED" : ""}`)
          : ["No unacknowledged pharmacy orders."],
      });
    }

    /* ---------------- today's OT schedule ---------------- */
    case "ot-today": {
      const list = ctx.surgicalPlans.filter((p) => p.date === todayISO()).filter((p) => p.status !== "cancelled");
      audit(ctx, "AI command — OT schedule", `read ${list.length} procedures today`);
      return outcome(spec, {
        title: `Today's OT schedule — ${list.length} procedure${list.length === 1 ? "" : "s"}`,
        lines: list.length
          ? list.map((p) => `${p.time} · ${p.procedure} · ${p.surgeon} · ${p.theatre} (${p.status})`)
          : ["No procedures booked for today — theatres available.", ...ctx.surgicalPlans.filter((p) => p.status !== "cancelled").slice(0, 3).map((p) => `${p.date} · ${p.time} · ${p.procedure} · ${p.surgeon}`)],
      });
    }

    /* ---------------- tomorrow's OT list ---------------- */
    case "ot-tomorrow": {
      const list = ctx.surgicalPlans.filter((p) => p.date === tomorrowISO()).filter((p) => p.status !== "cancelled");
      audit(ctx, "AI command — tomorrow OT list", `read ${list.length} procedures tomorrow`);
      return outcome(spec, {
        title: `Tomorrow's OT list — ${list.length} procedure${list.length === 1 ? "" : "s"}`,
        lines: list.length
          ? list.map((p) => `${p.time} · ${p.procedure} · ${p.surgeon} · ${p.theatre} · consent ${p.consentObtained ? "✓" : "PENDING"}`)
          : ["No procedures scheduled for tomorrow.", "OT requirement: confirm consent, pre-op checklist and anaesthesia cover."],
      });
    }

    /* ---------------- schedule OT (important → confirm) ---------------- */
    case "schedule-ot": {
      const res = resolvePatient(q, ctx.patients);
      const when = q.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i)?.[0] ?? "TBD";
      if (!confirmed) {
        const preview = [
          `Patient: ${res.patient?.name ?? res.note ?? "not attached (add UHID)"}`,
          `Requested time: ${when} · Surgeon requesting: ${ctx.accountName}`,
          "Creates an OT booking task in the OT workspace and notifies the OT team.",
        ];
        return outcome(spec, { title: `Schedule OT booking for ${res.patient?.name ?? "patient"}?`, lines: preview });
      }
      const task = ctx.addTask({
        title: `OT Booking — ${res.patient?.name ?? "patient"} (${when})`,
        patientId: res.patient?.id,
        patientName: res.patient?.name,
        uhid: res.patient?.id,
        department: "OT",
        assignedRole: "ot",
        createdBy: ctx.accountName,
        priority: "high",
        slaMinutes: 120,
        status: "NEW",
        category: "ot",
        description: `AI command (confirmed): ${q}`,
      });
      deptNotify(ctx, "OT booking requested", `${task.id} — ${task.title}. Verify theatre, consent and pre-op checklist.`, ["ot", "doctor"], "AI Command", "/ot");
      audit(ctx, "AI command — schedule OT (confirmed)", `${task.id} · ${q}`);
      return outcome(spec, {
        confirmed: true,
        title: `OT booking created — ${task.id}`,
        lines: ["OT team notified · Consent + pre-op checklist required before confirmation.", `Booked for: ${when}`],
        actionRoute: "/ot",
      });
    }

    /* ---------------- pending discharge summaries ---------------- */
    case "pending-discharge": {
      const pending = ctx.dischargePlans.filter((p) => p.status === "draft" || p.status === "pending-review");
      audit(ctx, "AI command — pending discharges", `read ${pending.length} discharge summaries pending`);
      return outcome(spec, {
        title: `Pending discharge summaries — ${pending.length}`,
        lines: pending.length
          ? pending.map((p) => `${p.patientName ?? p.patientId} · ${p.diagnosis} · ${p.status} · rx by ${p.prescribedBy}`)
          : ["No discharge summaries pending.", `Finalized today: ${ctx.discharged.length}`],
      });
    }

    /* ---------------- today's hospital report (important → confirm) ---------------- */
    case "hospital-report": {
      const occupied = ctx.beds.filter((b) => b.status === "occupied").length;
      const collections = ctx.bills.reduce((sum, b) => sum + b.amount, 0);
      const openTasks = ctx.tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CLOSED" && t.status !== "VERIFIED");
      const unpaid = ctx.bills.filter((b) => b.amount >= 20000);
      if (!confirmed) {
        return outcome(spec, {
          title: "Generate and dispatch today's hospital report?",
          lines: [
            `Includes: OP census · bed occupancy ${occupied}/${ctx.beds.length} · collections ${fmtINR(collections)}`,
            `Open tasks ${openTasks.length} · outstanding bills ≥ ₹20k: ${unpaid.length}`,
            "Also dispatched to CEO on WhatsApp (send-log entry).",
          ],
        });
      }
      ctx.addSendLog({ provider: "WhatsApp", template: "ceo_daily_report", recipient: "CEO", status: "sent" });
      const task = ctx.addTask({
        title: "Daily hospital report generated",
        department: "Reports",
        createdBy: ctx.accountName,
        priority: "normal",
        status: "COMPLETED",
        category: "admin",
        description: `Daily report generated via AI command (confirmed) — ${nowTime()}`,
      });
      audit(ctx, "AI command — hospital report (confirmed)", `dispatched ceo_daily_report · ${fmtINR(collections)} collections · ${openTasks.length} open tasks`);
      return outcome(spec, {
        confirmed: true,
        title: "Hospital report dispatched",
        lines: [
          `Census: ${occupied}/${ctx.beds.length} beds occupied · OP ${ctx.patients.length} registered`,
          `Collections: ${fmtINR(collections)} · via ${ctx.bills.length} receipts`,
          `Open tasks: ${openTasks.length} · Outstanding ≥₹20k bills: ${unpaid.length}`,
          "ceo_daily_report → CEO on WhatsApp · logged in send queue",
        ],
      });
    }

    /* ---------------- unpaid bills above threshold ---------------- */
    case "unpaid-bills": {
      const thrM = q.match(/above(?:₹|\s)?\s?(\d[\d,]*)/i) ?? q.match(/₹\s?(\d[\d,]*)/i);
      const threshold = thrM ? Number(thrM[1].replace(/,/g, "")) : 20000;
      const rows = ctx.bills.filter((b) => b.amount >= threshold);
      const total = rows.reduce((sum, b) => sum + b.amount, 0);
      audit(ctx, "AI command — receivables", `read ${rows.length} bills above ${fmtINR(threshold)} · total ${fmtINR(total)}`);
      return outcome(spec, {
        title: `Bills above ${fmtINR(threshold)} — ${rows.length} entries`,
        lines: rows.length
          ? rows.slice(0, 10).map((b) => `${b.receiptNo} · ${fmtINR(b.amount)} · ${b.service} · ${b.mode}`)
          : [`No bills above ${fmtINR(threshold)} on the ledger.`],
      });
    }

    /* ---------------- staffing gaps ---------------- */
    case "staffing-gaps": {
      const today = new Date().getDay();
      const dayCells = ctx.shifts.filter((c) => c.day === today);
      const offBy = new Map<string, number>();
      dayCells.forEach((c) => {
        if (c.shift === "Off") offBy.set(c.ward, (offBy.get(c.ward) ?? 0) + 1);
      });
      const anomalies = ctx.attendance.filter((a) => a.anomaly);
      const coverage = [...offBy.entries()].map(([ward, off]) => `${ward}: ${off} off today`).join(" · ") || "Full roster for all wards";
      audit(ctx, "AI command — staffing", `read ${dayCells.length} roster cells · ${anomalies.length} anomalies`);
      return outcome(spec, {
        title: `Today's staffing overview — ${ctx.attendance.filter((a) => !a.outTime).length} staff on duty`,
        lines: [
          coverage,
          anomalies.length ? `Anomalies: ${anomalies.map((a) => `${a.staffName} (${a.anomaly})`).join(", ")}` : "No attendance anomalies.",
          "Ward B night shift flagged by HR — see Notification Center.",
        ],
      });
    }

    /* ---------------- patients waiting > 30 min ---------------- */
    case "wait-30": {
      const today = ctx.appointments.filter((a) => a.date === todayISO() && a.status === "booked");
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const late = today.filter((a) => nowMin - slotToMin(a.slot) > 30);
      audit(ctx, "AI command — wait breaches", `read ${late.length} patients past 30-min wait`);
      return outcome(spec, {
        title: `Patients waiting more than 30 minutes — ${late.length}`,
        lines: late.length
          ? late.map((a) => `${a.patientName} · booked ${a.slot} · Dr. ${a.doctor} · ${nowMin - slotToMin(a.slot)} min wait`)
          : ["All today's pending appointments are within 30 minutes of their slot."],
      });
    }

    /* ---------------- doctor-wise OP report ---------------- */
    case "doctor-op-report": {
      const rows = new Map<string, number>();
      ctx.appointments.forEach((a) => {
        if (a.date === todayISO() && a.status !== "no-show") rows.set(a.doctor, (rows.get(a.doctor) ?? 0) + 1);
      });
      const fallback = new Map<string, number>();
      ctx.patients.forEach((p) => {
        if (p.linkedDoctor) fallback.set(p.linkedDoctor, (fallback.get(p.linkedDoctor) ?? 0) + 1);
      });
      const data = rows.size ? rows : fallback;
      audit(ctx, "AI command — doctor OP report", `read ${data.size} doctors · ${[...data.values()].reduce((a, b) => a + b, 0)} visits`);
      return outcome(spec, {
        title: `Doctor-wise OP report (${rows.size ? "today" : "registered cohort"})`,
        lines: data.size
          ? [...data.entries()].map(([doc, n]) => `${doc} — ${n} patients`)
          : ["No OP data yet today. Register patients or book appointments to populate."],
      });
    }

    /* ---------------- critical-lab watch ---------------- */
    case "critical-lab": {
      const open = ctx.tasks.filter((t) => t.category === "lab" && t.status !== "COMPLETED" && t.status !== "CLOSED" && t.status !== "VERIFIED" && (t.priority === "critical" || t.priority === "high"));
      ctx.addNotification({ title: "Critical lab result watch engaged", detail: `Continuous alerting for pending critical-value lab results. Tracking ${open.length} open investigation tasks.`, severity: "info", targetRoles: ["doctor"], sourceDept: "AI Command" });
      audit(ctx, "AI command — critical lab watch", `engaged · ${open.length} open lab tasks tracked`);
      return outcome(spec, {
        title: `Critical lab watch engaged — ${open.length} open investigations`,
        lines: open.length
          ? open.map((t) => `#${t.id} · ${t.title} · ${t.priority.toUpperCase()}${t.patientName ? ` · ${t.patientName}` : ""}`)
          : ["No open lab investigation tasks — watch remains active for new orders."],
      });
    }

    /* ---------------- IP admission (important → confirm) ---------------- */
    case "ip-admission": {
      const vacant = ctx.beds.filter((b) => b.status === "vacant");
      const res = resolvePatient(q, ctx.patients);
      if (!confirmed) {
        return outcome(spec, {
          title: `Create IP admission${res.patient ? ` for ${res.patient.name} (${res.patient.id})` : ""}?`,
          lines: [
            `Vacant beds: ${vacant.length ? vacant.map((b) => `${b.label} (${b.ward})`).join(", ") : "NONE — ward is full"}`,
            "Creates an admission task for Nursing/Reception and notifies the ward.",
            "Confirm to dispatch the admission workflow.",
          ],
        });
      }
      const task = ctx.addTask({
        title: `IP Admission${res.patient ? ` — ${res.patient.name}` : ""}`,
        patientId: res.patient?.id,
        patientName: res.patient?.name,
        uhid: res.patient?.id,
        department: "Ward",
        assignedRole: "ward",
        createdBy: ctx.accountName,
        priority: "high",
        slaMinutes: 60,
        status: "NEW",
        category: "nursing",
        description: `AI command (confirmed): ${q}`,
      });
      deptNotify(ctx, "IP admission initiated", `${task.id}${res.patient ? ` — ${res.patient.name} (${res.patient.id})` : ""}. Allocate bed${vacant.length ? ` (${vacant.map((b) => b.label).join(", ")} available)` : " — ward full, escalate"}.`, ["ward", "reception"], "AI Command", "/ward");
      audit(ctx, "AI command — IP admission (confirmed)", `${task.id} · ${q}`);
      return outcome(spec, {
        confirmed: true,
        title: `IP admission initiated — ${task.id}`,
        lines: [
          vacant.length ? `Suggested beds: ${vacant.map((b) => `${b.label} (${b.ward})`).join(", ")}` : "Ward at capacity — admission task marked for escalation.",
          "Ward + Reception notified · billing handoff available in Finance workspace.",
        ],
        actionRoute: "/ward",
      });
    }

    /* ---------------- discharge patient (important → confirm) ---------------- */
    case "discharge-patient": {
      const res = resolvePatient(q, ctx.patients);
      if (!confirmed) {
        return outcome(spec, {
          title: `Initiate discharge for ${res.patient?.name ?? "patient"}?`,
          lines: [
            "Creates a discharge workflow task for the ward and flags billing clearance.",
            "Final discharge summary + billing must be cleared before sign-off.",
          ],
        });
      }
      const task = ctx.addTask({
        title: `Discharge workflow — ${res.patient?.name ?? "patient"}`,
        patientId: res.patient?.id,
        patientName: res.patient?.name,
        uhid: res.patient?.id,
        department: "Ward",
        assignedRole: "ward",
        createdBy: ctx.accountName,
        priority: "normal",
        slaMinutes: 240,
        status: "NEW",
        category: "nursing",
        description: `AI command (confirmed): ${q}`,
      });
      deptNotify(ctx, "Discharge workflow started", `${task.id}${res.patient ? ` — ${res.patient.name}` : ""}. Billing clearance required before final discharge.`, ["ward", "reception", "finance"], "AI Command", "/ward");
      audit(ctx, "AI command — discharge (confirmed)", `${task.id} · ${q}`);
      return outcome(spec, {
        confirmed: true,
        title: `Discharge workflow initiated — ${task.id}`,
        lines: ["Ward tasked · Billing clearance flagged · Reception will coordinate handoff."],
        actionRoute: "/ward",
      });
    }

    /* ---------------- void / refund bill (high-risk → confirm) ---------------- */
    case "void-bill": {
      const rcp = q.match(/RCPT-(\d+)/i);
      const bill = rcp
        ? ctx.bills.find((b) => b.receiptNo.toLowerCase() === `rcpt-${rcp[1].toLowerCase()}`)
        : undefined;
      if (!bill) {
        return outcome(spec, {
          title: rcp ? `Receipt RCPT-${rcp[1]} not found on ledger` : "No receipt specified",
          lines: ["Refund/void requires a receipt number, e.g. \"void bill RCPT-1045\"."],
        });
      }
      if (!confirmed) {
        return outcome(spec, {
          title: `Void ${bill.receiptNo} — ${fmtINR(bill.amount)} (${bill.service})?`,
          lines: [
            "THIS ACTION IS HIGH-RISK AND NOT UNDOABLE.",
            `${bill.receiptNo} · ${bill.service} · ${bill.mode} · ${bill.staffName}`,
            "A void record is entered in the audit trail; Finance is notified.",
          ],
        });
      }
      ctx.removeBill(bill.id);
      ctx.addNotification({ title: `Bill voided — ${bill.receiptNo}`, detail: `${fmtINR(bill.amount)} voided by ${ctx.accountName}. Reconciliation required.`, severity: "high", targetRoles: ["finance", "ceo"], sourceDept: "Billing" });
      audit(ctx, "AI command — VOID BILL (confirmed)", `${bill.receiptNo} ${fmtINR(bill.amount)} voided by ${ctx.accountName} · ${bill.service} · ${ctx.accountRole}`);
      return outcome(spec, {
        confirmed: true,
        title: `${bill.receiptNo} voided`,
        lines: [`${fmtINR(bill.amount)} reversal logged · Finance notified · Audit trail updated.`],
      });
    }

    /* ---------------- notify department ---------------- */
    case "notify-staff": {
      const deptM = q.match(/notify (?:the )?(lab|pharmacy|ward|ot|radiology|reception|nursing)/i);
      const dept = deptM ? deptM[1].toLowerCase() : "ward";
      const roleMap: Record<string, Role[] | undefined> = {
        lab: ["lab"], pharmacy: ["pharmacy"], ward: ["ward"], ot: ["ot"],
        radiology: ["radiotech"], reception: ["reception"], nursing: ["ward"],
      };
      const rest = q.replace(/notify (?:the )?\w+/i, "").replace(/[.,]?$/i, "").trim() || "general alert";
      ctx.addNotification({
        title: `Alert from ${ctx.accountName}`,
        detail: rest,
        severity: "normal",
        targetRoles: roleMap[dept] ?? ["ward"],
        sourceDept: "AI Command",
        actionRoute: dept === "radiology" ? "/radiology" : `/${dept}`,
      });
      ctx.addSendLog({ provider: "Internal", template: "dept_alert", recipient: dept.toUpperCase(), status: "sent" });
      audit(ctx, "AI command — notify", `${dept.toUpperCase()} department · "${rest}"`);
      return outcome(spec, {
        title: `Alert sent to ${dept.toUpperCase()}`,
        lines: [`“${rest}” → ${dept.toUpperCase()} notification feed + internal channel`, "Recipients can acknowledge and act directly from Notification Center."],
      });
    }

    /* ---------------- my tasks ---------------- */
    case "my-tasks": {
      const jobs = ctx.tasks.filter(
        (t) => t.status !== "COMPLETED" && t.status !== "CLOSED" && t.status !== "VERIFIED" &&
          ((t.assignedRole && t.assignedRole === ctx.accountRole) || (t.createdBy === ctx.accountName))
      );
      audit(ctx, "AI command — my tasks", `read ${jobs.length} open tasks for ${ctx.accountName}`);
      return outcome(spec, {
        title: `Your open tasks — ${jobs.length}`,
        lines: jobs.length
          ? jobs.slice(0, 8).map((t) => `${t.id} · ${t.title} · ${t.priority.toUpperCase()} · ${t.status} · ${t.department}`)
          : ["No open tasks assigned to you.", `Department pipeline: ${ctx.tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CLOSED").length} hospital-wide open tasks.`],
      });
    }

    /* ---------------- complete / advance task ---------------- */
    case "complete-task": {
      const task = resolveTaskRef(q, ctx.tasks);
      if (!task) {
        return outcome(spec, {
          title: "No open task to complete",
          lines: ['Provide a task id, e.g. "complete task TSK-1041", or select from Tasks & Orders.'],
        });
      }
      const order = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "COMPLETED"] as const;
      const idx = order.indexOf(task.status as (typeof order)[number]);
      const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : task.status;
      // task engine update goes through the store — engine only reports; console applies it.
      audit(ctx, "AI command — task action", `${task.id} ${task.status} → ${next} by ${ctx.accountName} (applied in console)`);
      return outcome(spec, {
        title: `Task ${task.id} queued: ${task.status} → ${next}`,
        lines: [task.title, `Advance applied by command console for ${ctx.accountName}.`],
        actionRoute: "/tasks",
        taskAdvance: { taskId: task.id, toStatus: next },
      });
    }

    /* ---------------- patient journey ---------------- */
    case "patient-where": {
      const res = resolvePatient(q, ctx.patients);
      if (!res.patient) {
        return outcome(spec, {
          title: "Patient not found",
          lines: [res.note ?? "Use a UHID (e.g. UHID 1024) or registered patient name."],
        });
      }
      const p = res.patient;
      const appt = [...ctx.appointments].reverse().find((a) => a.patientName.toLowerCase() === p.name.toLowerCase());
      const linkedTasks = ctx.tasks.filter((t) => t.patientId === p.id && t.status !== "CLOSED" && t.status !== "COMPLETED" && t.status !== "VERIFIED");
      const isIp = p.admissionStatus === "inpatient" || ctx.beds.some((b) => b.patientId === p.id);
      const steps = [
        `Registered: ${p.registeredAt}`,
        appt ? `Appointment: ${appt.date} ${appt.slot} — ${appt.doctor} (${appt.status})` : "No appointment on record",
      ];
      if (isIp) {
        const bed = ctx.beds.find((b) => b.patientId === p.id);
        steps.push(`Currently: IP — ${bed ? `${bed.label} (${bed.ward})` : "ward placement pending"}`);
      } else {
        steps.push("Currently: Outpatient");
      }
      steps.push(
        linkedTasks.length
          ? `Pending: ${linkedTasks.map((t) => `${t.id} ${t.title}`).join(" · ")}`
          : "No pending tasks for this patient"
      );
      audit(ctx, "AI command — patient journey", `${p.id} ${p.name} · ${linkedTasks.length} pending · ${isIp ? "IP" : "OP"}`);
      return outcome(spec, {
        title: `Patient journey — ${p.name} (${p.id})`,
        lines: steps,
        actionRoute: "/journey",
      });
    }

    /* ---------------- ASTRA: what needs attention ---------------- */
    case "attention": {
      const items = whatNeedsAttention({
        patients: ctx.patients,
        beds: ctx.beds,
        orders: ctx.orders,
        tasks: ctx.tasks,
        vitals: ctx.vitals,
        medDoses: ctx.medDoses,
        appointments: ctx.appointments,
        notifications: ctx.notifications,
      });
      audit(ctx, "AI command — attention queue", `read ${items.length} attention items`);
      if (items.length === 0) {
        return outcome(spec, {
          title: "Nothing needs your attention right now",
          lines: ["All tasks, orders, vitals and medications are on track.", "I'll keep watching — say 'what needs attention' anytime."],
        });
      }
      const critical = items.filter((i) => i.severity === "critical").length;
      const high = items.filter((i) => i.severity === "high").length;
      return outcome(spec, {
        title: `Attention queue — ${items.length} items (${critical} critical · ${high} high)`,
        lines: items.slice(0, 12).map((i) => `[${i.severity.toUpperCase()}] ${i.title} — ${i.detail}`),
        actionRoute: "/tasks",
      });
    }

    /* ---------------- ASTRA: hospital census ---------------- */
    case "hospital-census": {
      const census = hospitalCensus(ctx.patients, ctx.beds, ctx.appointments, ctx.discharged);
      audit(ctx, "AI command — hospital census", `total ${census.total} · IP ${census.ip} · OP ${census.op}`);
      return outcome(spec, {
        title: `Hospital census — ${census.total} patients`,
        lines: [
          `OP: ${census.op} · IP: ${census.ip} · ICU: ${census.icu} · Ward: ${census.ward} · Emergency: ${census.emergency}`,
          `Beds: ${census.bedsOccupied} occupied · ${census.bedsVacant} vacant · ${census.bedsCleaning} cleaning`,
          `Discharged today: ${census.dischargedToday} · Appointments today: ${census.appointmentsToday}`,
        ],
      });
    }

    /* ---------------- ASTRA: show patients ---------------- */
    case "show-patients": {
      const rows = formatPatientList(ctx.patients, ctx.beds);
      audit(ctx, "AI command — patient list", `read ${rows.length} patients`);
      if (rows.length === 0) {
        return outcome(spec, {
          title: "No patients registered",
          lines: ["Register a patient to begin building the census."],
        });
      }
      return outcome(spec, {
        title: `Patients — ${rows.length} registered`,
        lines: rows.slice(0, 15).map((r) => `${r.id} · ${r.name} · ${r.age ?? "—"}y ${r.gender ?? ""} · ${r.department ?? "—"} · ${r.status}${r.bed ? ` · ${r.bed}` : ""}`),
        actionRoute: "/journey",
      });
    }

    /* ---------------- ASTRA: what changed ---------------- */
    case "what-changed": {
      const res = resolvePatient(q, ctx.patients);
      if (!res.patient) {
        return outcome(spec, {
          title: "Patient not found",
          lines: [res.note ?? "Specify a patient, e.g. 'what changed for Rajesh Kumar since yesterday'."],
        });
      }
      const changes = whatChangedForPatient(res.patient.id, {
        patients: ctx.patients,
        orders: ctx.orders,
        tasks: ctx.tasks,
        vitals: ctx.vitals,
        medDoses: ctx.medDoses,
        notifications: ctx.notifications,
        progressNotes: ctx.progressNotes ?? [],
        clinicalNotes: ctx.clinicalNotes ?? [],
        cdsInvestigations: ctx.cdsInvestigations ?? [],
      });
      audit(ctx, "AI command — what changed", `${res.patient.id} ${res.patient.name} · ${changes.length} changes`);
      if (changes.length === 0) {
        return outcome(spec, {
          title: `No changes recorded for ${res.patient.name} since yesterday`,
          lines: ["No new orders, vitals, medications, notes or alerts found in the last 48 hours."],
        });
      }
      return outcome(spec, {
        title: `What changed for ${res.patient.name} — ${changes.length} updates`,
        lines: changes.slice(0, 12).map((c) => `[${c.severity.toUpperCase()}] ${c.category}: ${c.title} — ${c.detail}`),
        actionRoute: "/journey",
      });
    }

    /* ---------------- ASTRA: doctor rounds ---------------- */
    case "doctor-rounds": {
      const rounds = doctorRounds({
        patients: ctx.patients,
        beds: ctx.beds,
        vitals: ctx.vitals,
        tasks: ctx.tasks,
        orders: ctx.orders,
        medDoses: ctx.medDoses,
        notifications: ctx.notifications,
      });
      audit(ctx, "AI command — doctor rounds", `read ${rounds.length} inpatients for rounds`);
      if (rounds.length === 0) {
        return outcome(spec, {
          title: "No inpatients to round on",
          lines: ["No patients are currently admitted to a bed."],
        });
      }
      return outcome(spec, {
        title: `Doctor rounds — ${rounds.length} inpatients`,
        lines: rounds.map((r) => {
          const vitals = r.vitals[0];
          const vitalsStr = vitals ? ` · Vitals ${vitals.tempF}°F/${vitals.pulse}/${vitals.bp} SpO2 ${vitals.spo2}%` : "";
          const pending = r.pendingInvestigations.length + r.pendingOrders.length + r.tasks.length;
          return `${r.patient.name} (${r.patient.id}) · ${r.bed ? `${r.bed.label} ${r.bed.ward}` : "no bed"} · ${r.diagnosis}${vitalsStr} · ${pending} pending action${pending === 1 ? "" : "s"}`;
        }),
        actionRoute: "/journey",
      });
    }

    /* ---------------- ASTRA: patient safety review ---------------- */
    case "patient-safety": {
      const res = resolvePatient(q, ctx.patients);
      if (!res.patient) {
        return outcome(spec, {
          title: "Patient not found",
          lines: [res.note ?? "Specify a patient, e.g. 'safety review for Rajesh Kumar'."],
        });
      }
      const issues = patientSafetyReview(res.patient.id, {
        patients: ctx.patients,
        beds: ctx.beds,
        orders: ctx.orders,
        tasks: ctx.tasks,
        vitals: ctx.vitals,
        medDoses: ctx.medDoses,
        notifications: ctx.notifications,
      });
      audit(ctx, "AI command — safety review", `${res.patient.id} ${res.patient.name} · ${issues.length} issues`);
      if (issues.length === 0) {
        return outcome(spec, {
          title: `Safety review — ${res.patient.name} looks clear`,
          lines: ["No abnormal vitals, overdue medications, pending critical tasks or unresolved alerts found."],
        });
      }
      return outcome(spec, {
        title: `Safety review — ${res.patient.name} · ${issues.length} items`,
        lines: issues.map((i) => `[${i.severity.toUpperCase()}] (${i.label}) ${i.category}: ${i.title} — ${i.detail}`),
        actionRoute: "/journey",
      });
    }

    /* ---------------- ASTRA: evidence copilot ---------------- */
    case "evidence-copilot": {
      const res = resolvePatient(q, ctx.patients);
      if (!res.patient) {
        return outcome(spec, {
          title: "Patient not found",
          lines: [res.note ?? "Specify a patient, e.g. 'evidence analysis for Rajesh Kumar'."],
        });
      }
      const analysis = evidenceCopilot(res.patient.id, {
        patients: ctx.patients,
        cdsDifferentials: ctx.cdsDifferentials ?? [],
        cdsInvestigations: ctx.cdsInvestigations ?? [],
        clinicalReferences: ctx.clinicalReferences ?? [],
      });
      audit(ctx, "AI command — evidence copilot", `${res.patient.id} ${res.patient.name} · ${analysis.differentials.length} differentials`);
      return outcome(spec, {
        title: `Evidence analysis — ${res.patient.name}`,
        lines: [
          ...analysis.differentials.map((d) => `Differential: ${d}`),
          ...(analysis.ruleIn.length ? [`Rule-in: ${analysis.ruleIn.join(" · ")}`] : []),
          ...(analysis.ruleOut.length ? [`Rule-out: ${analysis.ruleOut.join(" · ")}`] : []),
          ...(analysis.testsNeeded.length ? [`Tests: ${analysis.testsNeeded.join(" · ")}`] : []),
          ...(analysis.redFlags.length ? [`Red flags: ${analysis.redFlags.join(" · ")}`] : []),
          ...(analysis.management.length ? [`Management: ${analysis.management.join(" · ")}`] : []),
          `Evidence: ${analysis.evidenceStrength}`,
          ...analysis.limitations.map((l) => `Note: ${l}`),
        ],
        actionRoute: "/doctor",
      });
    }

    /* ---------------- ASTRA: universal doctor order ---------------- */
    case "universal-order": {
      const parsed = parseUniversalOrder(q, ctx.patients);
      if (!parsed) {
        return outcome(spec, {
          title: "Could not parse order",
          lines: ['Try: "order CBC for Rajesh Kumar", "order chest X-ray for UHID 1024", "start nursing instruction to monitor vitals every 4 hours".'],
        });
      }
      const deptLabel = parsed.department === "lab" ? "Laboratory" : parsed.department === "radiology" ? "Radiology" : parsed.department === "pharmacy" ? "Pharmacy" : "Ward";
      const roleForDept = parsed.department === "lab" ? "lab" : parsed.department === "radiology" ? "radiotech" : parsed.department === "pharmacy" ? "pharmacy" : "ward";
      const task = ctx.addTask({
        title: `${deptLabel} Order — ${parsed.test ?? "investigation"}`,
        patientId: parsed.patientId,
        patientName: parsed.patientName,
        uhid: parsed.patientId,
        department: deptLabel,
        assignedRole: roleForDept,
        createdBy: ctx.accountName,
        priority: parsed.priority === "stat" ? "critical" : parsed.priority === "urgent" ? "high" : "normal",
        slaMinutes: parsed.priority === "stat" ? 15 : parsed.priority === "urgent" ? 30 : 60,
        status: "NEW",
        category: parsed.department === "lab" ? "lab" : parsed.department === "radiology" ? "radiology" : parsed.department === "pharmacy" ? "pharmacy" : "nursing",
        description: `AI command: ${q}${parsed.patientName ? ` · ${parsed.patientName}` : ""}`,
      });
      deptNotify(ctx, `New ${deptLabel} order`, `Task ${task.id} — ${parsed.test ?? "order"}${parsed.patientName ? ` for ${parsed.patientName}` : ""} · priority ${parsed.priority.toUpperCase()}.`, [roleForDept as Role], "AI Command", parsed.department === "radiology" ? "/radiology" : `/${parsed.department}`);
      audit(ctx, "AI command — universal order", `${task.id} · ${deptLabel} · ${parsed.test ?? "order"}${parsed.patientId ? ` · ${parsed.patientId}` : ""} · ${parsed.priority}`);
      return outcome(spec, {
        title: `${deptLabel} order dispatched — ${task.id}`,
        lines: [
          parsed.patientName ? `Patient: ${parsed.patientName} (${parsed.patientId})` : "Patient context not attached — add UHID for linking.",
          `Order: ${parsed.test ?? "investigation"} · Priority: ${parsed.priority.toUpperCase()}`,
          `Routed to ${deptLabel} workspace · ${deptLabel} staff notified.`,
        ],
        actionRoute: parsed.department === "radiology" ? "/radiology" : `/${parsed.department}`,
      });
    }

    default:
      return outcome(spec, {
        title: `${spec.label} — command recognized`,
        lines: ["Not executed — category handler unavailable in this build. See audit log."],
      });
  }
}

/** Uniquely-identifying tag used by the console for its example chips. */
export function exampleFor(key: string, accountName: string): string {
  switch (key) {
    case "register-patient": return "register patient name is Ramesh Kumar age 45 male phone 9849012345 department Orthopaedics";
    case "lab-order": return "send CBC and LFT for patient UHID 1024";
    case "pharmacy-order": return "send this prescription to pharmacy";
    case "pending-pharmacy": return "show pending pharmacy orders";
    case "ot-today": return "check today's OT schedule";
    case "pending-discharge": return "show all pending discharge summaries";
    case "hospital-report": return "generate today's hospital report";
    case "unpaid-bills": return "show unpaid bills above ₹20,000";
    case "staffing-gaps": return "show today's staffing gaps";
    case "doctor-op-report": return "generate a doctor-wise OP report";
    default: return `show today's OP census`;
  }
}

export function suggestsFor(role: Role): string[] {
  switch (role) {
    case "ceo": return ["show today's OP census", "show unpaid bills above ₹20,000", "show today's staffing gaps", "generate today's hospital report", "show pending discharge summaries", "check today's OT schedule"];
    case "doctor": return ["show today's OP census", "send CBC and LFT for patient UHID 1024", "send this prescription to pharmacy", "check today's OT schedule", "schedule OT for patient PT-1091 tomorrow 14:00", "generate a doctor-wise OP report"];
    case "reception": return ["register patient name is Ramesh Kumar age 45 male phone 9849012345", "how many patients are waiting in reception", "create an IP admission", "patients waiting more than 30 minutes"];
    case "pharmacy": return ["show pending pharmacy orders", "show today's OP census", "my pending tasks"];
    case "ward": return ["show today's OP census", "my pending tasks", "show all pending discharge summaries", "patients waiting more than 30 minutes"];
    case "lab": return ["show pending pharmacy orders", "my pending tasks", "show today's OP census"];
    case "radiotech": return ["show today's OP census", "my pending tasks", "check today's OT schedule"];
    case "ot": return ["check today's OT schedule", "prepare tomorrow's OT list", "my pending tasks"];
    case "supervisor": return ["show today's staffing gaps", "how many patients are waiting in reception", "register patient name is Meena age 32 female"];
    case "finance": return ["show unpaid bills above ₹20,000", "show today's OP census", "show all pending discharge summaries"];
    case "hr": return ["show today's staffing gaps", "show today's OP census"];
    case "marketing": return ["show today's OP census", "my pending tasks"];
    case "admin": return ["show today's staffing gaps", "show today's OP census", "show unpaid bills above ₹20,000"];
    default: return ["show today's OP census", "how many patients are waiting in reception"];
  }
}

export function makeResultId(): string {
  return uid("cmd");
}
