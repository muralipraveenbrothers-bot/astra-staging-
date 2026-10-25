import type {
  AgentNode,
  Appointment,
  AttendanceRecord,
  Bed,
  Bill,
  Department,
  Goal,
  HospitalOrder,
  Issue,
  MedDose,
  PharmacyStockSeed,
  ProviderHealth,
  ServiceInfo,
  ShiftCell,
  ShiftCode,
  StaffMember,
} from "./types";
import { FREELLMAPI_API_URL } from "../config/freeLlmEndpoint";

export const initialServices: ServiceInfo[] = [
  { id: "freellmapi", name: "FreeLLMAPI", baseUrl: FREELLMAPI_API_URL, status: "healthy", latencyMs: 38, detail: "Unified LLM router · 24 models" },
  { id: "ollama", name: "Ollama", baseUrl: "http://127.0.0.1:11434", status: "healthy", latencyMs: 12, detail: "llama3.2:3b · qwen3:14b" },
  { id: "hermes", name: "Hermes", baseUrl: "http://127.0.0.1:8787", status: "healthy", latencyMs: 21, detail: "Skills/tools · memory v2" },
];

export const initialProviders: ProviderHealth[] = [
  { provider: "ollama / llama3.2:3b", models: 3, status: "healthy", latencyMs: 410 },
  { provider: "ollama / qwen3:14b", models: 3, status: "healthy", latencyMs: 1180 },
  { provider: "groq / llama-3.3-70b", models: 4, status: "healthy", latencyMs: 240 },
  { provider: "openrouter / auto", models: 12, status: "issues", latencyMs: 2300 },
  { provider: "SEA-LION / aisingapore", models: 2, status: "healthy", latencyMs: 890 },
  { provider: "NavyAI", models: 6, status: "healthy", latencyMs: 620 },
  { provider: "NaraRouter", models: 8, status: "healthy", latencyMs: 540 },
  { provider: "Aion", models: 5, status: "healthy", latencyMs: 710 },
  { provider: "Requesty", models: 14, status: "issues", latencyMs: 1640 },
  { provider: "AI Horde", models: 22, status: "healthy", latencyMs: 2100 },
  { provider: "Routeway", models: 4, status: "healthy", latencyMs: 480 },
  { provider: "BazaarLink", models: 7, status: "healthy", latencyMs: 760 },
  { provider: "AINative", models: 3, status: "healthy", latencyMs: 830 },
  { provider: "local fusion", models: 2, status: "disabled", latencyMs: 0 },
];

/** v0.5.0 API surfaces — capability chips shown under the provider table. */
export const providerCaps = [
  "Anthropic /v1/messages",
  "Image",
  "Audio / TTS",
  "MCP /mcp",
  "Embeddings",
];

export const initialDepartments: Department[] = [
  { id: "dept-reception", name: "Reception", head: "Meera Nair", staffCount: 8, color: "#d4af37" },
  { id: "dept-ward", name: "Ward", head: "Dr. Arjun Rao", staffCount: 22, color: "#39d5ff" },
  { id: "dept-pharmacy", name: "Pharmacy", head: "Sana Iqbal", staffCount: 6, color: "#f5d97e" },
];

export const initialStaff: StaffMember[] = [
  { id: "st-1", name: "Meera Nair", role: "Front Desk Lead", departmentId: "dept-reception", notifyWhatsApp: true, notifyTelegram: true, paperclipMapped: true },
  { id: "st-2", name: "Ravi Kumar", role: "Billing Clerk", departmentId: "dept-reception", notifyWhatsApp: true, notifyTelegram: false, paperclipMapped: true },
  { id: "st-3", name: "Dr. Arjun Rao", role: "Consultant — Medicine", departmentId: "dept-ward", notifyWhatsApp: false, notifyTelegram: true, paperclipMapped: true },
  { id: "st-4", name: "Anjali Verma", role: "Staff Nurse", departmentId: "dept-ward", linkedDoctor: "Dr. Arjun Rao", notifyWhatsApp: true, notifyTelegram: true, paperclipMapped: false },
  { id: "st-5", name: "Sana Iqbal", role: "Chief Pharmacist", departmentId: "dept-pharmacy", notifyWhatsApp: true, notifyTelegram: true, paperclipMapped: true },
  { id: "st-6", name: "Vikram Shah", role: "Pharmacy Assistant", departmentId: "dept-pharmacy", notifyWhatsApp: false, notifyTelegram: false, paperclipMapped: false },
];

export const initialBills: Bill[] = [
  { id: "bill-1", receiptNo: "RCPT-1041", patientId: "PT-2209", kind: "OP", service: "Consultation — General Medicine", amount: 800, staffName: "Ravi Kumar", timestamp: "09:12", mode: "UPI", reference: "upi://txn/9F31A2" },
  { id: "bill-2", receiptNo: "RCPT-1042", patientId: "PT-2210", kind: "OP", service: "CBC + ESR Panel", amount: 1450, staffName: "Ravi Kumar", timestamp: "09:47", mode: "Card", reference: "POS-88421" },
  { id: "bill-3", receiptNo: "RCPT-1043", patientId: "PT-1087", kind: "IP", service: "Ward charges — Day 3", amount: 6200, staffName: "Meera Nair", timestamp: "10:05", mode: "Cash", reference: "CASH-DRAWER-A" },
  { id: "bill-4", receiptNo: "RCPT-1044", patientId: "PT-2214", kind: "OP", service: "Pharmacy — Rx #P-552", amount: 1120, staffName: "Vikram Shah", timestamp: "10:32", mode: "UPI", reference: "upi://txn/7C20B9" },
];

export const initialIssues: Issue[] = [
  { id: "iss-1", title: "Investigate duplicate UPI charge on RCPT-1044", status: "in-progress", priority: "high", assignee: "Billing Fraud Auditor", createdAt: "Today 09:58" },
  { id: "iss-2", title: "Pharmacy stock variance — Amoxicillin 500mg", status: "todo", priority: "medium", assignee: "Ward Ops Reviewer", createdAt: "Today 08:15" },
  { id: "iss-3", title: "Nurse roster gap — night shift Ward B", status: "todo", priority: "critical", assignee: "Attendance Auditor", createdAt: "Yesterday" },
  { id: "iss-4", title: "Publish discount policy memo to front desk", status: "in-review", priority: "low", assignee: "Discount/Notification Agent", createdAt: "Yesterday" },
  { id: "iss-5", title: "Q3 insurance claim reconciliation", status: "done", priority: "medium", assignee: "Billing Fraud Auditor", createdAt: "2 days ago" },
];

export const initialAgents: AgentNode[] = [
  { id: "ag-ceo", name: "Hospital CEO / Admin", role: "Executive — human in the loop", runtime: "paperclip", model: "—", heartbeatMin: 0, status: "active", tier: 1, successRate: 100, monthlyTokens: 0, tokenBudget: 0, skills: [], instructions: "Top-level governance node. All agent escalations terminate here." },
  { id: "ag-sup", name: "Hospital Supervisor Chat", role: "Operations coordinator", runtime: "paperclip", model: "qwen3:14b", heartbeatMin: 15, status: "active", tier: 2, successRate: 97.2, monthlyTokens: 182000, tokenBudget: 400000, skills: ["triage", "escalation", "summary"], instructions: "Coordinate all departments. Escalate critical issues to CEO within 5 minutes." },
  { id: "ag-billing", name: "Billing Fraud Auditor", role: "Revenue integrity", runtime: "hermes+paperclip", model: "llama3.2:3b", heartbeatMin: 30, status: "active", tier: 3, successRate: 94.8, monthlyTokens: 96500, tokenBudget: 250000, skills: ["ledger-scan", "anomaly-detect", "recon"], instructions: "Scan every bill register entry for duplicates, round-tripping and mode mismatches. File an Issue on suspicion." },
  { id: "ag-attend", name: "Attendance Auditor", role: "Workforce compliance", runtime: "hermes+paperclip", model: "llama3.2:3b", heartbeatMin: 60, status: "active", tier: 3, successRate: 98.1, monthlyTokens: 41200, tokenBudget: 120000, skills: ["face-match-review", "roster-diff"], instructions: "Flag missing out-times, low face-match confidence and roster gaps. Never auto-approve anomalies." },
  { id: "ag-ward", name: "Ward Ops Reviewer", role: "Inpatient flow", runtime: "paperclip", model: "qwen3:14b", heartbeatMin: 30, status: "paused", tier: 3, successRate: 91.5, monthlyTokens: 121800, tokenBudget: 300000, skills: ["census-track", "order-escalate"], instructions: "Watch IP census, overdue orders and bed turnover. Escalate overdue orders at due+10m." },
  { id: "ag-cds", name: "Clinical Decision Support", role: "Doctor-facing assistant", runtime: "freellmapi", model: "qwen3:14b", heartbeatMin: 0, status: "active", tier: 3, successRate: 99.1, monthlyTokens: 210400, tokenBudget: 500000, skills: ["ddx-rank", "dose-check", "guideline-cite"], instructions: "Decision support only. Every output requires explicit physician confirmation. Pinned to Most-reliable routing." },
  { id: "ag-discount", name: "Discount/Notification Agent", role: "Patient comms", runtime: "hermes", model: "llama3.2:3b", heartbeatMin: 120, status: "active", tier: 3, successRate: 96.4, monthlyTokens: 38900, tokenBudget: 100000, skills: ["template-send", "policy-check"], instructions: "Send approved templates only (bill receipt, lab ready, appointment reminder). Discounts above 10% need CEO sign-off." },
];

export const initialGoals: Goal[] = [
  {
    id: "goal-1",
    title: "Zero revenue leakage by Q4",
    progress: 68,
    children: [
      { id: "goal-1a", title: "100% bill register ↔ gateway reconciliation", progress: 82 },
      { id: "goal-1b", title: "Fraud audit coverage on all IP bills", progress: 55 },
    ],
  },
  {
    id: "goal-2",
    title: "Average OP wait under 15 minutes",
    progress: 41,
    children: [{ id: "goal-2a", title: "Reception triage automation", progress: 60 }],
  },
  { id: "goal-3", title: "CDS adoption in 80% of consults", progress: 23 },
];

export const initialAttendance: AttendanceRecord[] = [
  { id: "at-1", staffName: "Meera Nair", department: "Reception", inTime: "08:02", outTime: undefined, faceConfidence: 0.97, geofenceOk: true },
  { id: "at-2", staffName: "Ravi Kumar", department: "Reception", inTime: "08:11", faceConfidence: 0.92, geofenceOk: true },
  { id: "at-3", staffName: "Dr. Arjun Rao", department: "Ward", inTime: "07:55", outTime: "13:40", faceConfidence: 0.99, geofenceOk: true },
  { id: "at-4", staffName: "Anjali Verma", department: "Ward", inTime: "08:20", faceConfidence: 0.61, geofenceOk: true, anomaly: "Low face-match confidence — human review" },
  { id: "at-5", staffName: "Sana Iqbal", department: "Pharmacy", inTime: "08:05", outTime: undefined, faceConfidence: 0.95, geofenceOk: true, anomaly: "Missing out-time" },
  { id: "at-6", staffName: "Vikram Shah", department: "Pharmacy", inTime: "09:31", faceConfidence: 0.94, geofenceOk: false, anomaly: "Geofence miss — off-site clock-in" },
];

export const deptThroughput = [
  { day: "Mon", reception: 118, ward: 42, pharmacy: 96 },
  { day: "Tue", reception: 132, ward: 47, pharmacy: 101 },
  { day: "Wed", reception: 121, ward: 39, pharmacy: 112 },
  { day: "Thu", reception: 148, ward: 51, pharmacy: 118 },
  { day: "Fri", reception: 156, ward: 55, pharmacy: 124 },
  { day: "Sat", reception: 141, ward: 48, pharmacy: 109 },
  { day: "Sun", reception: 96, ward: 36, pharmacy: 74 },
];

export const kpiSpark = {
  opVisits: [82, 96, 91, 110, 124, 118, 134],
  ipCensus: [31, 33, 32, 35, 34, 36, 38],
  collections: [64000, 72000, 69500, 81000, 88400, 79200, 93600],
  waitTime: [22, 19, 21, 18, 16, 17, 14],
};

/* ---------------- pharmacy seeds ---------------- */

export const initialPharmacyStock: PharmacyStockSeed[] = [
  { item: "Ceftriaxone 1g Inj", opening: 40, reorderLevel: 12, unitPrice: 145 },
  { item: "Amoxicillin 500mg Cap", opening: 220, reorderLevel: 60, unitPrice: 9 },
  { item: "Paracetamol 650mg Tab", opening: 500, reorderLevel: 120, unitPrice: 2.5 },
  { item: "Azithromycin 500mg Tab", opening: 90, reorderLevel: 30, unitPrice: 28 },
  { item: "ORS Sachet", opening: 140, reorderLevel: 40, unitPrice: 18 },
  { item: "Insulin Glargine 10ml", opening: 18, reorderLevel: 8, unitPrice: 640 },
];

/* ---------------- ward seeds ---------------- */

export const initialBeds: Bed[] = [
  // General Ward
  { id: "bed-g1", ward: "General Ward", label: "G-01", status: "occupied", patientId: "PT-1087", patientName: "R. Devi", admittedAt: "4 days ago", diagnosis: "Enteric fever" },
  { id: "bed-g2", ward: "General Ward", label: "G-02", status: "occupied", patientId: "PT-1091", patientName: "S. Khan", admittedAt: "2 days ago", diagnosis: "Cholelithiasis — pre-op" },
  { id: "bed-g3", ward: "General Ward", label: "G-03", status: "vacant" },
  { id: "bed-g4", ward: "General Ward", label: "G-04", status: "cleaning" },
  // Semi-private
  { id: "bed-s1", ward: "Semi-private", label: "S-01", status: "occupied", patientId: "PT-1076", patientName: "M. Singh", admittedAt: "2 days ago", diagnosis: "Community-acquired pneumonia" },
  { id: "bed-s2", ward: "Semi-private", label: "S-02", status: "vacant" },
  { id: "bed-s3", ward: "Semi-private", label: "S-03", status: "vacant" },
  // ICU step-down
  { id: "bed-i1", ward: "ICU step-down", label: "I-01", status: "occupied", patientId: "PT-1102", patientName: "K. Rajan", admittedAt: "1 day ago", diagnosis: "Post-MI observation" },
  { id: "bed-i2", ward: "ICU step-down", label: "I-02", status: "vacant" },
];

const H = 3600_000;
const M = 60_000;

export const initialMedDoses: MedDose[] = [
  { id: "md-1", patientId: "PT-1087", patientName: "R. Devi", drug: "Ceftriaxone 1g IV", dose: "1 vial BD", dueTs: Date.now() + 9 * M },
  { id: "md-2", patientId: "PT-1087", patientName: "R. Devi", drug: "Paracetamol 650mg", dose: "1 tab TDS", dueTs: Date.now() + 2.2 * H },
  { id: "md-3", patientId: "PT-1076", patientName: "M. Singh", drug: "Azithromycin 500mg", dose: "1 tab OD", dueTs: Date.now() - 14 * M },
  { id: "md-4", patientId: "PT-1076", patientName: "M. Singh", drug: "Nebulization (Duolin)", dose: "4 hourly", dueTs: Date.now() + 41 * M },
  { id: "md-5", patientId: "PT-1102", patientName: "K. Rajan", drug: "Insulin Glargine", dose: "10 units SC", dueTs: Date.now() + 3.1 * H },
  { id: "md-6", patientId: "PT-1102", patientName: "K. Rajan", drug: "ECG + Troponin panel", dose: "q6h", dueTs: Date.now() - 52 * M },
];

/* ---------------- appointment seeds ---------------- */

const todayISO = new Date().toISOString().slice(0, 10);
const tomorrowISO = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export const initialAppointments: Appointment[] = [
  { id: "ap-1", patientName: "Ramesh Kumar", phone: "9876501234", doctor: "Dr. Arjun Rao", department: "General Medicine", date: todayISO, slot: "10:30", mode: "WhatsApp", status: "checked-in", createdAt: "Today 08:40" },
  { id: "ap-2", patientName: "Lakshmi V", phone: "9845011223", doctor: "Dr. Nandini S", department: "OBG", date: todayISO, slot: "11:00", mode: "Phone", status: "booked", createdAt: "Today 08:55" },
  { id: "ap-3", patientName: "Imran Sheikh", phone: "9890765432", doctor: "Dr. Kunal M", department: "Orthopaedics", date: todayISO, slot: "11:30", mode: "Walk-in", status: "booked", createdAt: "Today 09:10" },
  { id: "ap-4", patientName: "Baby Diya (Paed)", phone: "9812345670", doctor: "Dr. Nandini S", department: "Paediatrics", date: tomorrowISO, slot: "09:30", mode: "WhatsApp", status: "booked", createdAt: "Today 09:40" },
];

/* ---------------- nurse roster seeds ---------------- */

const NURSES = ["Anjali Verma", "Priya Nair", "Deepa K", "Shalini R", "Rosy Thomas", "Kavitha M"];
const ROSTER: ShiftCode[][] = [
  ["M", "M", "M", "E", "M", "M", "Off"],
  ["M", "E", "M", "M", "E", "M", "M"],
  ["E", "M", "E", "M", "M", "E", "M"],
  ["N", "N", "Off", "N", "N", "Off", "N"],
  ["M", "M", "E", "Off", "M", "N", "E"],
  ["Off", "N", "N", "M", "Off", "M", "N"],
];
const NURSE_WARDS = ["General Ward", "General Ward", "Semi-private", "ICU step-down", "General Ward", "Semi-private"];

export const initialShifts: ShiftCell[] = NURSES.flatMap((nurse, i) =>
  ROSTER[i].map((shift, day) => ({ id: `sc-${i}-${day}`, nurseName: nurse, day, shift, ward: NURSE_WARDS[i] }))
);

export const NURSE_NAMES = NURSES;

/* ---------------- doctor order seeds (department-routed) ---------------- */

export const initialOrders: HospitalOrder[] = [
  { id: "ord-1", patientId: "PT-1087", orderText: "IV Ceftriaxone 1 g BD — administer next dose", doctor: "Dr. Arjun Rao", createdAt: "08:40", createdTs: Date.now() - 1000 * 60 * 95, dueMin: 60, escalated: true, targetDept: "Pharmacy", drug: "Ceftriaxone 1g Inj", dose: "1 vial IV BD", qty: 1, unitPrice: 145, acknowledgedBy: "Anjali Verma", acknowledgedAt: "09:12", proofNote: "Dose given IV over 4 min, tolerated well.", proofPhoto: true },
  { id: "ord-2", patientId: "PT-1091", orderText: "NPO from midnight — pre-op (Lap chole tomorrow)", doctor: "Dr. Arjun Rao", createdAt: "09:05", createdTs: Date.now() - 1000 * 60 * 20, dueMin: 120, targetDept: "Ward" },
  { id: "ord-3", patientId: "PT-1102", orderText: "Hourly vitals × 6h, escalate if SpO2 < 94%", doctor: "Dr. Arjun Rao", createdAt: "09:50", createdTs: Date.now() - 1000 * 60 * 33, dueMin: 30, targetDept: "Ward" },
];

import type { ClinicalReference } from "./types";
export const initialClinicalReferences: ClinicalReference[] = [
  { id: "ref-1", title: "Acute Pharyngitis in Adults", specialty: "General Medicine", source: "UpToDate", url: "https://www.uptodate.com", summary: "Evidence-based approach to diagnosis and management of acute pharyngitis, including Centor criteria and when to test for GAS.", tags: ["pharyngitis", "ENT", "infectious disease"], addedBy: "System", addedAt: "2024-01-15" },
  { id: "ref-2", title: "Hypertension Guidelines 2024", specialty: "Cardiology", source: "ACC/AHA", url: "https://www.acc.org", summary: "Latest evidence for hypertension diagnosis, staging, and management including pharmacotherapy algorithms.", tags: ["hypertension", "cardiology", "guidelines"], addedBy: "System", addedAt: "2024-02-01" },
  { id: "ref-3", title: "Diabetes Management in Hospital", specialty: "Endocrinology", source: "ADA Standards", url: "https://diabetesjournals.org", summary: "Inpatient glycemic management protocols including insulin sliding scales and DKA management.", tags: ["diabetes", "endocrinology", "inpatient"], addedBy: "System", addedAt: "2024-03-10" },
  { id: "ref-4", title: "Surgical Antibiotic Prophylaxis", specialty: "Surgery", source: "WHO Guidelines", url: "https://www.who.int", summary: "Recommendations for perioperative antibiotic prophylaxis to prevent surgical site infections.", tags: ["surgery", "antibiotics", "infection-control"], addedBy: "System", addedAt: "2024-01-20" },
  { id: "ref-5", title: "ACS Management Protocol", specialty: "Cardiology", source: "ESC Guidelines", url: "https://www.escardio.org", summary: "Acute coronary syndrome diagnosis, risk stratification, and management including STEMI/NSTEMI pathways.", tags: ["cardiology", "ACS", "emergency"], addedBy: "System", addedAt: "2024-04-05" },
];
