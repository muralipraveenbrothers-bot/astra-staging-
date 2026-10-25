/**
 * One command surface. The role decides the tools. The screen stays one Astra.
 */
import { nodesToRerun } from "../part2/follow";

export const COMMAND_MODES = ["DOCTOR", "CEO", "ADMIN", "NURSING", "DEPARTMENT", "DEVELOPER"] as const;
export type CommandMode = (typeof COMMAND_MODES)[number];

export const OPERATIONS = [
  "Reception", "OPD", "Admissions", "Beds", "Wards", "ICU", "OT", "Pharmacy", "Lab", "USG",
  "Radiology", "Discharge", "Billing", "CMRF", "Staff communication", "Equipment", "Service status",
] as const;

const TOOLS: Record<CommandMode, string[]> = {
  DOCTOR: ["clinical review", "7D", "differential", "what changed", "orders for confirmation", "wards", "OT list"],
  CEO: ["census", "staffing", "finance", "department performance", "service health", "workflow"],
  ADMIN: ["workflow", "service health", "access", "nonclinical configuration"],
  NURSING: ["wards", "pending tasks", "what changed", "discharge preparation"],
  DEPARTMENT: ["own department queue", "pending results", "service status"],
  DEVELOPER: ["navigation", "nonclinical automation", "skill drafts", "health"],
};

export function modeForRole(role: string): CommandMode {
  const value = (role ?? "").toLowerCase();
  if (value === "ceo") return "CEO";
  if (value === "admin") return "ADMIN";
  if (value === "doctor") return "DOCTOR";
  if (value === "ward" || value === "nursing") return "NURSING";
  if (value === "developer") return "DEVELOPER";
  return "DEPARTMENT";
}

export function toolsForMode(mode: CommandMode): string[] {
  return TOOLS[mode];
}

export interface StructuredCommand {
  utterance: string;
  intent: string;
  navigate?: string;
  rerun?: string[];
  allowed: boolean;
  reply: string;
}

export function parseCommand(text: string, mode: CommandMode): StructuredCommand {
  const said = text.trim();
  const clinical = /differential|7d|creatinine|diagnosis|prescribe/i.test(said);
  const allowed = !clinical || mode === "DOCTOR";
  if (/icu patients needing doctor review/i.test(said)) {
    return { utterance: said, intent: "icu-doctor-review", allowed: mode === "DOCTOR" || mode === "NURSING", reply: allowed || mode === "NURSING" ? "ICU list filtered to patients waiting for a doctor." : "A doctor reviews the ICU clinical list." };
  }
  if (/discharges are pending/i.test(said)) {
    return { utterance: said, intent: "pending-discharges", allowed: true, reply: "Pending discharges, with the blocking reason kept separate from the diagnosis." };
  }
  if (/bed\s*4/i.test(said)) {
    return { utterance: said, intent: "bed-block", allowed: true, reply: "Bed 4 is checked for a clinical, investigation, pharmacy, billing, documentation, or transport block." };
  }
  if (/open the pharmacy/i.test(said)) {
    return { utterance: said, intent: "navigate", navigate: "/pharmacy", allowed: true, reply: "Opening the pharmacy dashboard." };
  }
  if (/lab results pending more than 2 hours/i.test(said)) {
    return { utterance: said, intent: "stale-labs", allowed: true, reply: "Laboratory queue filtered to results older than two hours." };
  }
  if (/today's ot list|ot list/i.test(said)) {
    return { utterance: said, intent: "ot-list", allowed: mode !== "DEVELOPER", reply: "Today's OT list." };
  }
  if (/pharmacy consumption/i.test(said)) {
    return { utterance: said, intent: "pharmacy-delta", allowed: mode === "CEO" || mode === "DEPARTMENT" || mode === "ADMIN" || mode === "DOCTOR", reply: "Pharmacy consumption compared with yesterday from recorded issues only." };
  }
  if (/mrn\s*\w+.*7d|review patient/i.test(said)) {
    return { utterance: said, intent: "open-7d", allowed: mode === "DOCTOR", reply: mode === "DOCTOR" ? "Opening the existing 7D synthesis for that record." : "7D review stays with the doctor." };
  }
  if (/differential.*creatinine|creatinine/i.test(said)) {
    return { utterance: said, intent: "rerun-creatinine", rerun: nodesToRerun("new creatinine result"), allowed: mode === "DOCTOR", reply: mode === "DOCTOR" ? "Rerun is limited to investigation, drug safety, comorbidity, management, and monitoring." : "A doctor reruns the clinical differential." };
  }
  if (/what changed overnight/i.test(said)) {
    return { utterance: said, intent: "overnight-delta", allowed: true, reply: "Overnight change uses the saved checkpoint. Nothing is reported as changed until that checkpoint exists." };
  }
  if (/why is this patient not discharged/i.test(said)) {
    const blockers = dischargeBlockers(said);
    return {
      utterance: said,
      intent: "discharge-block",
      allowed: true,
      reply: blockers.length ? `Blocking reasons: ${blockers.join(", ")}.` : "The note does not say why discharge is waiting.",
    };
  }
  return { utterance: said, intent: "unknown", allowed: false, reply: "That command is not in the operations list." };
}

export type DischargeBlocker = "clinical" | "investigation" | "doctor review" | "pharmacy" | "billing" | "documentation" | "transport" | "administrative";

export function dischargeBlockers(text: string): DischargeBlocker[] {
  const found: DischargeBlocker[] = [];
  if (/fever|unstable|pain uncontrolled|not medically fit|clinical/i.test(text)) found.push("clinical");
  if (/pending (ct|lab|report|investigation)|awaiting (ct|lab|result)/i.test(text)) found.push("investigation");
  if (/doctor (has not|hasn't) reviewed|awaiting doctor/i.test(text)) found.push("doctor review");
  if (/pharmacy|medicines not ready|discharge med/i.test(text)) found.push("pharmacy");
  if (/bill|payment|insurance|cmrf/i.test(text)) found.push("billing");
  if (/summary not|documentation|paperwork/i.test(text)) found.push("documentation");
  if (/transport|ambulance|family not here/i.test(text)) found.push("transport");
  if (/administrative|bed management/i.test(text)) found.push("administrative");
  return found;
}

export function reviewProgress(text: string): Array<{ label: string; state: "done" | "working" }> {
  const neuro = /back|limb|weakness|numb|radiat/i.test(text);
  return [
    { label: "red flags", state: "done" },
    { label: "neuro-localization", state: neuro ? "done" : "working" },
    { label: "existing investigations", state: "done" },
    { label: "differential", state: "working" },
    { label: "evidence", state: "working" },
  ];
}

export const COCKPIT_PANELS = [
  "Diagnosis / problem", "Current 7D state", "Red flags", "Differential", "Pathophysiology", "Investigations",
  "Trend", "Management", "Medications", "Procedure", "Complication Watch", "Expected LOS", "Cost estimate",
  "Pending tasks", "Doctor approvals", "Discharge milestones",
] as const;

export const SURGICAL_PANELS = [
  "Surgical indication", "Procedure", "Alternatives", "Pre-op readiness", "Anesthesia considerations", "OT requirements",
  "Implants", "Consumables", "Blood", "Antibiotic prophylaxis", "Critical steps", "Post-op plan",
  "Potential complications", "Expected LOS", "Cost", "Discharge criteria",
] as const;
