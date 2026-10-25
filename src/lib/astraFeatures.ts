// Astra AI — ASTRA feature integration layer.
//
// All functions operate on EXISTING Astra store data — never invent data.
// These are pure computation helpers consumed by the CommandEngine so the
// AI Command Centre can answer hospital-wide questions, run rounds, surface
// attention items, and compare patient changes over time.

import type {
    Appointment,
    Bed,
    HospitalOrder,
    MedDose,
    PatientRecord,
    VitalsEntry,
} from "./types";
import type { HospitalTask } from "./taskEngine";
import type { HospitalNotification } from "./notifications";

/* ------------------------------------------------------------------ */
/*  1. HOSPITAL CENSUS                                                 */
/* ------------------------------------------------------------------ */

export interface CensusBreakdown {
    total: number;
    op: number;
    ip: number;
    icu: number;
    ward: number;
    emergency: number;
    bedsOccupied: number;
    bedsVacant: number;
    bedsCleaning: number;
    dischargedToday: number;
    appointmentsToday: number;
}

export function hospitalCensus(
    patients: PatientRecord[],
    beds: Bed[],
    appointments: Appointment[],
    discharged: { patientId: string; dischargedAt: string }[]
): CensusBreakdown {
    const todayISO = new Date().toISOString().slice(0, 10);
    const occupied = beds.filter((b) => b.status === "occupied");
    const ip = patients.filter((p) => p.admissionStatus === "inpatient").length + occupied.length;
    const icu = beds.filter((b) => b.ward.toLowerCase().includes("icu")).length;
    const ward = beds.filter((b) => !b.ward.toLowerCase().includes("icu")).length;
    const emergency = patients.filter((p) => (p.department ?? "").toLowerCase().includes("emergency")).length;
    const op = patients.length - ip;
    const dischargedToday = discharged.filter((d) => d.dischargedAt.includes(todayISO) || d.dischargedAt.includes(new Date().toLocaleDateString("en-IN"))).length;
    const appointmentsToday = appointments.filter((a) => a.date === todayISO).length;

    return {
        total: patients.length,
        op: Math.max(0, op),
        ip,
        icu,
        ward,
        emergency,
        bedsOccupied: occupied.length,
        bedsVacant: beds.filter((b) => b.status === "vacant").length,
        bedsCleaning: beds.filter((b) => b.status === "cleaning").length,
        dischargedToday,
        appointmentsToday,
    };
}

/* ------------------------------------------------------------------ */
/*  2. WHAT NEEDS ATTENTION — priority queue                           */
/* ------------------------------------------------------------------ */

export interface AttentionItem {
    id: string;
    category: string;
    severity: "critical" | "high" | "normal" | "info";
    title: string;
    detail: string;
    patientId?: string;
    patientName?: string;
    actionRoute?: string;
}

export interface AttentionContext {
    patients: PatientRecord[];
    beds: Bed[];
    orders: HospitalOrder[];
    tasks: HospitalTask[];
    vitals: VitalsEntry[];
    medDoses: MedDose[];
    appointments: Appointment[];
    notifications: HospitalNotification[];
}

const OPEN_STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING"];

export function whatNeedsAttention(ctx: AttentionContext): AttentionItem[] {
    const items: AttentionItem[] = [];
    const now = Date.now();

    // 1. Critical / high priority open tasks
    ctx.tasks
        .filter((t) => OPEN_STATUSES.includes(t.status) && (t.priority === "critical" || t.priority === "high"))
        .forEach((t) => {
            items.push({
                id: `att-task-${t.id}`,
                category: "Delayed / High-priority task",
                severity: t.priority === "critical" ? "critical" : "high",
                title: t.title,
                detail: `${t.department} · ${t.status} · created ${t.createdAt}${t.patientName ? ` · ${t.patientName}` : ""}`,
                patientId: t.patientId,
                patientName: t.patientName,
                actionRoute: "/tasks",
            });
        });

    // 2. Overdue medication doses
    ctx.medDoses
        .filter((m) => !m.givenAt && m.dueTs < now)
        .forEach((m) => {
            const mins = Math.round((now - m.dueTs) / 60000);
            items.push({
                id: `att-med-${m.id}`,
                category: "Delayed medication",
                severity: mins > 30 ? "critical" : "high",
                title: `Medication overdue — ${m.drug}`,
                detail: `${m.patientName} · ${m.dose} · due ${mins} min ago`,
                patientId: m.patientId,
                patientName: m.patientName,
                actionRoute: "/ward",
            });
        });

    // 3. Abnormal vitals (SpO2 < 94, temp > 100.4, pulse > 120 or < 50)
    ctx.vitals
        .filter((v) => v.abnormal.length > 0 || v.spo2 < 94 || v.tempF > 100.4 || v.pulse > 120 || v.pulse < 50)
        .slice(0, 8)
        .forEach((v) => {
            const patient = ctx.patients.find((p) => p.id === v.patientId);
            const abnormal = v.abnormal.length > 0 ? v.abnormal.join(", ") : `SpO2 ${v.spo2}% · Temp ${v.tempF}°F · Pulse ${v.pulse}`;
            items.push({
                id: `att-vit-${v.id}`,
                category: "Abnormal vitals",
                severity: v.spo2 < 90 ? "critical" : "high",
                title: `Vitals alert — ${patient?.name ?? v.patientId}`,
                detail: `${abnormal} · at ${v.at}`,
                patientId: v.patientId,
                patientName: patient?.name,
                actionRoute: "/ward",
            });
        });

    // 4. Unacknowledged / overdue orders
    ctx.orders
        .filter((o) => !o.acknowledgedAt)
        .slice(0, 8)
        .forEach((o) => {
            const mins = Math.round((now - o.createdTs) / 60000);
            items.push({
                id: `att-ord-${o.id}`,
                category: "Unacknowledged order",
                severity: mins > o.dueMin ? "high" : "normal",
                title: o.orderText,
                detail: `${o.targetDept ?? "Ward"} · Dr. ${o.doctor} · ${mins} min ago${o.escalated ? " · ESCALATED" : ""}`,
                patientId: o.patientId,
                actionRoute: o.targetDept === "Pharmacy" ? "/pharmacy" : o.targetDept === "Lab" ? "/lab" : "/ward",
            });
        });

    // 5. Long-waiting patients (appointments past their slot by > 30 min)
    const todayISO = new Date().toISOString().slice(0, 10);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    ctx.appointments
        .filter((a) => a.date === todayISO && a.status === "booked")
        .forEach((a) => {
            const [h, m] = a.slot.split(":").map(Number);
            const slotMin = (h ?? 0) * 60 + (m ?? 0);
            const wait = nowMin - slotMin;
            if (wait > 30) {
                items.push({
                    id: `att-wait-${a.id}`,
                    category: "Long waiting patient",
                    severity: wait > 60 ? "high" : "normal",
                    title: `${a.patientName} waiting ${wait} min`,
                    detail: `Booked ${a.slot} · Dr. ${a.doctor} · ${a.department}`,
                    actionRoute: "/reception",
                });
            }
        });

    // 6. High-risk patients (in ICU beds or with critical notifications)
    ctx.beds
        .filter((b) => b.status === "occupied" && b.ward.toLowerCase().includes("icu"))
        .forEach((b) => {
            items.push({
                id: `att-icu-${b.id}`,
                category: "ICU patient",
                severity: "high",
                title: `${b.patientName ?? "ICU patient"} — ${b.ward}`,
                detail: `${b.diagnosis ?? "No diagnosis recorded"} · ${b.label}`,
                patientId: b.patientId,
                patientName: b.patientName,
                actionRoute: "/ward",
            });
        });

    // 7. Unreviewed critical notifications
    ctx.notifications
        .filter((n) => n.status === "NEW" && (n.severity === "critical" || n.severity === "high"))
        .slice(0, 6)
        .forEach((n) => {
            items.push({
                id: `att-ntf-${n.id}`,
                category: "Unreviewed alert",
                severity: n.severity,
                title: n.title,
                detail: n.detail,
                patientId: n.linkedPatient ? undefined : undefined,
                patientName: n.linkedPatient,
                actionRoute: n.actionRoute,
            });
        });

    // Sort: critical first, then high, then normal
    const rank = { critical: 0, high: 1, normal: 2, info: 3 } as const;
    return items.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 20);
}

/* ------------------------------------------------------------------ */
/*  3. WHAT CHANGED — patient delta since yesterday                    */
/* ------------------------------------------------------------------ */

export interface PatientChange {
    category: string;
    title: string;
    detail: string;
    at: string;
    severity: "critical" | "high" | "normal" | "info";
}

export interface ChangeContext {
    patients: PatientRecord[];
    orders: HospitalOrder[];
    tasks: HospitalTask[];
    vitals: VitalsEntry[];
    medDoses: MedDose[];
    notifications: HospitalNotification[];
    progressNotes: { id: string; patientId: string; createdAt: string; doctor: string; assessment: string }[];
    clinicalNotes: { id: string; patientId: string; createdAt: string; doctor: string; content: string; type: string }[];
    cdsInvestigations: { id: string; test: string; status: string; result?: string; resultAt?: string }[];
}

function isTodayOrYesterday(ts: string): boolean {
    const today = new Date().toLocaleDateString("en-IN");
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-IN");
    return ts.includes(today) || ts.includes(yesterday);
}

export function whatChangedForPatient(patientId: string, ctx: ChangeContext): PatientChange[] {
    const changes: PatientChange[] = [];
    const patient = ctx.patients.find((p) => p.id === patientId);

    if (!patient) return changes;

    // New orders
    ctx.orders
        .filter((o) => o.patientId === patientId && isTodayOrYesterday(o.createdAt))
        .forEach((o) => {
            changes.push({
                category: "New order",
                title: o.orderText,
                detail: `By Dr. ${o.doctor} · ${o.targetDept ?? "Ward"} · ${o.createdAt}`,
                at: o.createdAt,
                severity: o.escalated ? "high" : "normal",
            });
        });

    // Task status changes
    ctx.tasks
        .filter((t) => (t.patientId === patientId || t.patientName === patient.name) && isTodayOrYesterday(t.updatedAt))
        .forEach((t) => {
            changes.push({
                category: "Task update",
                title: t.title,
                detail: `${t.status} · ${t.department} · updated ${t.updatedAt}`,
                at: t.updatedAt,
                severity: t.priority === "critical" ? "high" : "normal",
            });
        });

    // New vitals
    ctx.vitals
        .filter((v) => v.patientId === patientId && isTodayOrYesterday(v.at))
        .slice(0, 5)
        .forEach((v) => {
            changes.push({
                category: "Vitals",
                title: `Vitals recorded — ${v.at}`,
                detail: `Temp ${v.tempF}°F · Pulse ${v.pulse} · BP ${v.bp} · SpO2 ${v.spo2}%${v.abnormal.length ? ` · ⚠ ${v.abnormal.join(", ")}` : ""}`,
                at: v.at,
                severity: v.abnormal.length > 0 ? "high" : "normal",
            });
        });

    // Medication changes
    ctx.medDoses
        .filter((m) => m.patientId === patientId && (m.givenAt ? isTodayOrYesterday(m.givenAt) : m.dueTs > Date.now() - 86400000))
        .slice(0, 5)
        .forEach((m) => {
            changes.push({
                category: "Medication",
                title: m.givenAt ? `Dose given — ${m.drug}` : `Dose scheduled — ${m.drug}`,
                detail: `${m.dose} · ${m.givenAt ? `given by ${m.givenBy ?? "staff"}` : "pending"}${m.escalated ? " · ESCALATED" : ""}`,
                at: m.givenAt ?? new Date(m.dueTs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
                severity: m.escalated ? "high" : "normal",
            });
        });

    // New notifications for this patient
    ctx.notifications
        .filter((n) => (n.linkedPatient && patient.name.toLowerCase().includes(n.linkedPatient.toLowerCase())) || (n.linkedUhid && patient.id.includes(n.linkedUhid)))
        .filter((n) => isTodayOrYesterday(n.createdAt))
        .slice(0, 5)
        .forEach((n) => {
            changes.push({
                category: "Alert",
                title: n.title,
                detail: n.detail,
                at: n.createdAt,
                severity: n.severity,
            });
        });

    // Progress notes
    ctx.progressNotes
        .filter((n) => n.patientId === patientId && isTodayOrYesterday(n.createdAt))
        .slice(0, 3)
        .forEach((n) => {
            changes.push({
                category: "Progress note",
                title: `Progress note by ${n.doctor}`,
                detail: n.assessment.slice(0, 120),
                at: n.createdAt,
                severity: "info",
            });
        });

    // Clinical notes
    ctx.clinicalNotes
        .filter((n) => n.patientId === patientId && isTodayOrYesterday(n.createdAt))
        .slice(0, 3)
        .forEach((n) => {
            changes.push({
                category: `Clinical note (${n.type})`,
                title: `Note by ${n.doctor}`,
                detail: n.content.slice(0, 120),
                at: n.createdAt,
                severity: "info",
            });
        });

    // Investigation results
    ctx.cdsInvestigations
        .filter((i) => i.status === "result-available" && i.resultAt && isTodayOrYesterday(i.resultAt))
        .slice(0, 5)
        .forEach((i) => {
            changes.push({
                category: "Lab result",
                title: `${i.test} result available`,
                detail: i.result ?? "Result recorded",
                at: i.resultAt ?? "",
                severity: "high",
            });
        });

    return changes.sort((a, b) => {
        const rank = { critical: 0, high: 1, normal: 2, info: 3 } as const;
        return rank[a.severity] - rank[b.severity];
    });
}

/* ------------------------------------------------------------------ */
/*  4. DOCTOR ROUND MODE                                               */
/* ------------------------------------------------------------------ */

export interface RoundPatient {
    patient: PatientRecord;
    bed?: Bed;
    vitals: VitalsEntry[];
    diagnosis: string;
    pendingInvestigations: HospitalTask[];
    pendingOrders: HospitalOrder[];
    medicationChanges: MedDose[];
    alerts: HospitalNotification[];
    tasks: HospitalTask[];
}

export interface RoundContext {
    patients: PatientRecord[];
    beds: Bed[];
    vitals: VitalsEntry[];
    tasks: HospitalTask[];
    orders: HospitalOrder[];
    medDoses: MedDose[];
    notifications: HospitalNotification[];
}

export function doctorRounds(ctx: RoundContext): RoundPatient[] {
    const OPEN = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING"];
    return ctx.patients
        .filter((p) => p.admissionStatus === "inpatient" || ctx.beds.some((b) => b.patientId === p.id))
        .map((p) => {
            const bed = ctx.beds.find((b) => b.patientId === p.id);
            const patientVitals = ctx.vitals.filter((v) => v.patientId === p.id).slice(0, 5);
            const pendingInvestigations = ctx.tasks.filter(
                (t) => (t.patientId === p.id || t.patientName === p.name) && t.category === "lab" && OPEN.includes(t.status)
            );
            const pendingOrders = ctx.orders.filter((o) => o.patientId === p.id && !o.acknowledgedAt);
            const medicationChanges = ctx.medDoses.filter((m) => m.patientId === p.id).slice(0, 5);
            const alerts = ctx.notifications.filter(
                (n) => (n.linkedPatient && p.name.toLowerCase().includes(n.linkedPatient.toLowerCase())) || (n.linkedUhid && p.id.includes(n.linkedUhid))
            );
            const tasks = ctx.tasks.filter(
                (t) => (t.patientId === p.id || t.patientName === p.name) && OPEN.includes(t.status)
            );

            return {
                patient: p,
                bed,
                vitals: patientVitals,
                diagnosis: bed?.diagnosis ?? p.complaint ?? "No diagnosis recorded",
                pendingInvestigations,
                pendingOrders,
                medicationChanges,
                alerts,
                tasks,
            };
        });
}

/* ------------------------------------------------------------------ */
/*  5. PATIENT SAFETY / BLIND-SPOT REVIEW                              */
/* ------------------------------------------------------------------ */

export interface SafetyIssue {
    category: string;
    severity: "critical" | "high" | "normal" | "info";
    title: string;
    detail: string;
    label: "AI suggestion" | "possible issue";
}

export interface SafetyContext {
    patients: PatientRecord[];
    beds: Bed[];
    orders: HospitalOrder[];
    tasks: HospitalTask[];
    vitals: VitalsEntry[];
    medDoses: MedDose[];
    notifications: HospitalNotification[];
}

export function patientSafetyReview(patientId: string, ctx: SafetyContext): SafetyIssue[] {
    const issues: SafetyIssue[] = [];
    const patient = ctx.patients.find((p) => p.id === patientId);
    if (!patient) return issues;

    const OPEN = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING"];

    // 1. Abnormal result not reviewed
    const abnormalVitals = ctx.vitals.filter((v) => v.patientId === patientId && v.abnormal.length > 0);
    if (abnormalVitals.length > 0) {
        issues.push({
            category: "Abnormal vitals not reviewed",
            severity: "high",
            title: `${abnormalVitals.length} abnormal vital reading(s)`,
            detail: abnormalVitals.slice(0, 3).map((v) => `${v.at}: ${v.abnormal.join(", ")}`).join(" · "),
            label: "possible issue",
        });
    }

    // 2. Pending investigation
    const pendingLabs = ctx.tasks.filter(
        (t) => (t.patientId === patientId || t.patientName === patient.name) && t.category === "lab" && OPEN.includes(t.status)
    );
    if (pendingLabs.length > 0) {
        issues.push({
            category: "Pending investigation",
            severity: "normal",
            title: `${pendingLabs.length} investigation(s) pending`,
            detail: pendingLabs.map((t) => t.title).join(" · "),
            label: "AI suggestion",
        });
    }

    // 3. Delayed task
    const delayedTasks = ctx.tasks.filter(
        (t) => (t.patientId === patientId || t.patientName === patient.name) && OPEN.includes(t.status) && t.priority === "critical"
    );
    if (delayedTasks.length > 0) {
        issues.push({
            category: "Delayed critical task",
            severity: "critical",
            title: `${delayedTasks.length} critical task(s) not completed`,
            detail: delayedTasks.map((t) => `${t.id} ${t.title}`).join(" · "),
            label: "possible issue",
        });
    }

    // 4. Medication issue
    const overdueMeds = ctx.medDoses.filter((m) => m.patientId === patientId && !m.givenAt && m.dueTs < Date.now());
    if (overdueMeds.length > 0) {
        issues.push({
            category: "Overdue medication",
            severity: "high",
            title: `${overdueMeds.length} medication dose(s) overdue`,
            detail: overdueMeds.map((m) => `${m.drug} ${m.dose}`).join(" · "),
            label: "possible issue",
        });
    }

    // 5. Missing documentation
    const hasNotes = ctx.tasks.some((t) => t.patientId === patientId && t.category === "clinical");
    if (!hasNotes && patient.admissionStatus === "inpatient") {
        issues.push({
            category: "Missing documentation",
            severity: "normal",
            title: "No clinical notes found for inpatient",
            detail: "Consider adding a progress note or admission note.",
            label: "AI suggestion",
        });
    }

    // 6. Deteriorating trend (SpO2 dropping)
    const spo2Readings = ctx.vitals.filter((v) => v.patientId === patientId && v.spo2 > 0).slice(0, 5);
    if (spo2Readings.length >= 2) {
        const first = spo2Readings[spo2Readings.length - 1].spo2;
        const last = spo2Readings[0].spo2;
        if (last < first - 3) {
            issues.push({
                category: "Deteriorating SpO2 trend",
                severity: "high",
                title: `SpO2 dropped from ${first}% to ${last}%`,
                detail: "Review respiratory status and consider escalation.",
                label: "AI suggestion",
            });
        }
    }

    // 7. Unresolved clinical alert
    const unresolvedAlerts = ctx.notifications.filter(
        (n) => (n.linkedPatient && patient.name.toLowerCase().includes(n.linkedPatient.toLowerCase())) && n.status !== "RESOLVED"
    );
    if (unresolvedAlerts.length > 0) {
        issues.push({
            category: "Unresolved clinical alert",
            severity: "high",
            title: `${unresolvedAlerts.length} alert(s) not resolved`,
            detail: unresolvedAlerts.slice(0, 3).map((n) => n.title).join(" · "),
            label: "possible issue",
        });
    }

    return issues;
}

/* ------------------------------------------------------------------ */
/*  6. EVIDENCE AI COPILOT                                             */
/* ------------------------------------------------------------------ */

export interface EvidenceAnalysis {
    differentials: string[];
    ruleIn: string[];
    ruleOut: string[];
    testsNeeded: string[];
    redFlags: string[];
    management: string[];
    evidenceStrength: string;
    limitations: string[];
}

export interface EvidenceContext {
    patients: PatientRecord[];
    cdsDifferentials: { id: string; diagnosis: string; probability: string; rulesIn: string[]; rulesOut: string[]; reasoning: string; redFlags: string[] }[];
    cdsInvestigations: { id: string; test: string; reasoning: string; priority: string; guidelineRef: string }[];
    clinicalReferences: { id: string; title: string; source: string; url: string; summary: string; tags: string[]; specialty?: string }[];
}

export function evidenceCopilot(patientId: string, ctx: EvidenceContext): EvidenceAnalysis {
    const patient = ctx.patients.find((p) => p.id === patientId);
    const differentials = ctx.cdsDifferentials.filter((d) => d.id.includes(patientId) || d.id.includes(patient?.name ?? ""));
    const investigations = ctx.cdsInvestigations.filter((i) => i.id.includes(patientId) || i.id.includes(patient?.name ?? ""));

    // If no CDS data exists for this patient, derive from complaint
    const complaint = patient?.complaint?.toLowerCase() ?? "";

    const analysis: EvidenceAnalysis = {
        differentials: differentials.length > 0
            ? differentials.map((d) => `${d.diagnosis} (${d.probability})`)
            : complaint
                ? [`Based on presenting complaint "${patient?.complaint}": consider common differentials.`, "No CDS differentials recorded for this patient yet."]
                : ["No differential data available — add clinical intake to generate."],
        ruleIn: differentials.flatMap((d) => d.rulesIn).slice(0, 5),
        ruleOut: differentials.flatMap((d) => d.rulesOut).slice(0, 5),
        testsNeeded: investigations.length > 0
            ? investigations.map((i) => `${i.test} (${i.priority}) — ${i.reasoning}`)
            : ["No investigations recommended yet."],
        redFlags: differentials.flatMap((d) => d.redFlags).slice(0, 5),
        management: [],
        evidenceStrength: "Based on available Astra clinical data. Physician judgment required.",
        limitations: [
            "AI suggestions are decision-support only — never a substitute for clinical judgment.",
            "Evidence strength depends on completeness of recorded data.",
            "Guideline citations are shown when available; no references are fabricated.",
        ],
    };

    // Add guideline grounding from clinical references
    const refs = ctx.clinicalReferences.filter((r) =>
        r.tags.some((tag) => complaint.includes(tag)) || (r.specialty ?? "").toLowerCase().includes(patient?.department?.toLowerCase() ?? "")
    );
    if (refs.length > 0) {
        analysis.management.push(`Guideline grounding: ${refs.map((r) => `${r.title} (${r.source})`).join(" · ")}`);
    }

    return analysis;
}

/* ------------------------------------------------------------------ */
/*  7. UNIVERSAL DOCTOR ORDER PARSER                                   */
/* ------------------------------------------------------------------ */

export interface ParsedOrder {
    test?: string;
    patientName?: string;
    patientId?: string;
    priority: "routine" | "urgent" | "stat";
    department: "lab" | "radiology" | "pharmacy" | "ward";
    instruction?: string;
    raw: string;
}

const LAB_TESTS = [
    "cbc", "complete blood count", "lft", "liver function", "rft", "renal function",
    "platelet", "platelet count", "blood sugar", "hba1c", "lipid profile", "thyroid",
    "tsh", "urine", "urine analysis", "esr", "crp", "blood culture", "dengue",
    "malaria", "widal", "electrolytes", "sodium", "potassium", "creatinine", "urea",
    "bilirubin", "sgpt", "sgot", "alkaline phosphatase", "amylase", "lipase",
    "troponin", "d-dimer", "pt/inr", "aptt", "blood group", "cross match",
];

const RADIOLOGY_STUDIES = [
    "x-ray", "xray", "chest x-ray", "cxr", "usg", "ultrasound", "ct", "mri",
    "abdomen", "pelvis", "chest", "skull", "spine", "knee", "shoulder", "hip",
    "echocardiogram", "echo", "ecg", "ekg", "mammogram",
];

export function parseUniversalOrder(text: string, patients: PatientRecord[]): ParsedOrder | null {
    const q = text.toLowerCase();
    const raw = text.trim();

    // Resolve patient from name
    let patientName: string | undefined;
    let patientId: string | undefined;
    const nameMatch = raw.match(/for ([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/);
    if (nameMatch) {
        const token = nameMatch[1].toLowerCase();
        const p = patients.find((x) => x.name.toLowerCase().includes(token) || token.includes(x.name.toLowerCase()));
        if (p) {
            patientName = p.name;
            patientId = p.id;
        }
    }
    // Also try UHID
    const uhidMatch = raw.match(/uhid[-\s]?(\d+)/i);
    if (uhidMatch) {
        const digits = uhidMatch[1];
        const p = patients.find((x) => x.id.replace(/\D/g, "").endsWith(digits));
        if (p) {
            patientName = p.name;
            patientId = p.id;
        }
    }

    // Priority
    const priority: ParsedOrder["priority"] = q.includes("stat") ? "stat" : q.includes("urgent") ? "urgent" : "routine";

    // Detect lab test
    const labTest = LAB_TESTS.find((t) => q.includes(t));
    if (labTest) {
        return {
            test: labTest,
            patientName,
            patientId,
            priority,
            department: "lab",
            raw,
        };
    }

    // Detect radiology study
    const radStudy = RADIOLOGY_STUDIES.find((t) => q.includes(t));
    if (radStudy) {
        return {
            test: radStudy,
            patientName,
            patientId,
            priority,
            department: "radiology",
            raw,
        };
    }

    // Detect nursing instruction
    if (q.includes("nursing") || q.includes("monitor") || q.includes("vitals") || q.includes("observe")) {
        return {
            test: "nursing instruction",
            patientName,
            patientId,
            priority,
            department: "ward",
            instruction: raw,
            raw,
        };
    }

    // Detect pharmacy / medication
    if (q.includes("prescription") || q.includes("medication") || q.includes("dispense") || q.includes("tablet") || q.includes("injection")) {
        return {
            test: "prescription",
            patientName,
            patientId,
            priority,
            department: "pharmacy",
            instruction: raw,
            raw,
        };
    }

    return null;
}

/* ------------------------------------------------------------------ */
/*  8. PATIENT LIST FORMATTER                                          */
/* ------------------------------------------------------------------ */

export interface PatientListRow {
    id: string;
    name: string;
    age?: number;
    gender?: string;
    department?: string;
    doctor?: string;
    status: string;
    bed?: string;
}

export function formatPatientList(patients: PatientRecord[], beds: Bed[]): PatientListRow[] {
    return patients.map((p) => {
        const bed = beds.find((b) => b.patientId === p.id);
        return {
            id: p.id,
            name: p.name,
            age: p.age,
            gender: p.gender,
            department: p.department,
            doctor: p.linkedDoctor,
            status: p.admissionStatus ?? (bed ? "inpatient" : "outpatient"),
            bed: bed ? `${bed.label} (${bed.ward})` : undefined,
        };
    });
}
