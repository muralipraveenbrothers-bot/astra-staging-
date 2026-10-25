/**
 * Tool cards exposed to Hermes. Execution is permission-gated here, then
 * delegated to the existing ToolRegistry/command engine when a card declares
 * an existing executor.
 */

export type ToolClass =
  | "hospital_read"
  | "hospital_operations"
  | "clinical_read"
  | "clinical_write"
  | "evidence"
  | "documentation"
  | "voice";

export type ToolRisk = "INFO" | "REVERSIBLE" | "IMPORTANT" | "HIGH_RISK" | "CRITICAL";

export interface BrainToolCard {
  tool_id: string;
  purpose: string;
  inputs: string[];
  outputs: string[];
  read_or_write: "read" | "write";
  side_effect: string;
  risk_level: ToolRisk;
  data_access: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "PHI" | "HIGH-RISK CLINICAL";
  allowed_roles: string[];
  approval_required: boolean;
  timeout: string;
  retry_policy: string;
  owner: string;
  tool_class: ToolClass;
  /** Existing executor id invoked after role + approval checks pass. */
  existing_tool_id?: string;
}

export interface BrainToolTrace {
  at: string;
  toolId: string;
  executorId?: string;
  role: string;
  allowed: boolean;
  reason?: string;
  inputKeys: string[];
}

const BRAIN_TOOL_TRACE: BrainToolTrace[] = [];

function recordTrace(entry: Omit<BrainToolTrace, "at">): void {
  BRAIN_TOOL_TRACE.push({ at: new Date().toISOString(), ...entry });
  if (BRAIN_TOOL_TRACE.length > 100) BRAIN_TOOL_TRACE.splice(0, BRAIN_TOOL_TRACE.length - 100);
}

export function brainToolTrace(): BrainToolTrace[] {
  return [...BRAIN_TOOL_TRACE];
}

export const BRAIN_TOOLS: readonly BrainToolCard[] = [
  {
    tool_id: "hospital.census",
    purpose: "Read bed and patient census from the hospital database.",
    inputs: [],
    outputs: ["counts", "occupancy"],
    read_or_write: "read",
    side_effect: "none",
    risk_level: "INFO",
    data_access: "INTERNAL",
    allowed_roles: ["doctor", "ceo", "admin", "ward"],
    approval_required: false,
    timeout: "2s",
    retry_policy: "once",
    owner: "hospital-command",
    tool_class: "hospital_read",
    existing_tool_id: "getHospitalCensus",
  },
  {
    tool_id: "hospital.operations",
    purpose: "Draft staffing, roster, and department workflow notes.",
    inputs: ["request"],
    outputs: ["draft"],
    read_or_write: "write",
    side_effect: "creates an operational draft",
    risk_level: "REVERSIBLE",
    data_access: "INTERNAL",
    allowed_roles: ["ceo", "admin", "doctor"],
    approval_required: true,
    timeout: "5s",
    retry_policy: "none",
    owner: "executive-operations",
    tool_class: "hospital_operations",
  },
  {
    tool_id: "clinical.chart.read",
    purpose: "Read the active case presentation and existing record summary.",
    inputs: ["caseId"],
    outputs: ["presentation", "redFlags"],
    read_or_write: "read",
    side_effect: "none",
    risk_level: "IMPORTANT",
    data_access: "PHI",
    allowed_roles: ["doctor", "ward", "lab", "radiology", "pharmacy"],
    approval_required: false,
    timeout: "2s",
    retry_policy: "once",
    owner: "clinical-chart",
    tool_class: "clinical_read",
  },
  {
    tool_id: "clinical.order.propose",
    purpose: "Propose an investigation, prescription, or treatment change for doctor review.",
    inputs: ["caseId", "proposal"],
    outputs: ["proposal"],
    read_or_write: "write",
    side_effect: "no hospital write until a doctor confirms in the command engine",
    risk_level: "HIGH_RISK",
    data_access: "HIGH-RISK CLINICAL",
    allowed_roles: ["doctor"],
    approval_required: true,
    timeout: "5s",
    retry_policy: "none",
    owner: "doctor-review",
    tool_class: "clinical_write",
  },
  {
    tool_id: "evidence.lookup",
    purpose: "Request literature through the existing medical research path.",
    inputs: ["question"],
    outputs: ["citations"],
    read_or_write: "read",
    side_effect: "none",
    risk_level: "INFO",
    data_access: "PUBLIC",
    allowed_roles: ["doctor", "ceo", "admin"],
    approval_required: false,
    timeout: "20s",
    retry_policy: "once",
    owner: "scientist",
    tool_class: "evidence",
  },
  {
    tool_id: "documentation.draft",
    purpose: "Draft a note the doctor can edit.",
    inputs: ["caseId"],
    outputs: ["draft"],
    read_or_write: "write",
    side_effect: "draft only",
    risk_level: "REVERSIBLE",
    data_access: "PHI",
    allowed_roles: ["doctor"],
    approval_required: true,
    timeout: "8s",
    retry_policy: "none",
    owner: "documentation",
    tool_class: "documentation",
  },
  {
    tool_id: "voice.speak",
    purpose: "Speak a short reply through the existing Voicebox path.",
    inputs: ["speechText"],
    outputs: ["audio"],
    read_or_write: "read",
    side_effect: "plays audio",
    risk_level: "INFO",
    data_access: "INTERNAL",
    allowed_roles: ["doctor", "ceo", "admin", "reception", "pharmacy", "lab", "radiology", "ward", "ot", "billing"],
    approval_required: false,
    timeout: "20s",
    retry_policy: "none",
    owner: "voicebox",
    tool_class: "voice",
  },
];

export async function executeBrainTool(toolId: string, role: string, input: Record<string, unknown> = {}): Promise<{ ok: boolean; reason?: string; output?: unknown; trace?: BrainToolTrace }> {
  const who = (role ?? "").toLowerCase();
  const card = BRAIN_TOOLS.find((tool) => tool.tool_id === toolId || tool.existing_tool_id === toolId);
  const inputKeys = Object.keys(input).filter((key) => key.toLowerCase() !== "text" && key.toLowerCase() !== "patienttext");
  if (!card) {
    const trace = { at: new Date().toISOString(), toolId, role: who, allowed: false, reason: "Unknown tool.", inputKeys };
    recordTrace(trace);
    return { ok: false, reason: "Unknown tool.", trace };
  }
  if (!card.allowed_roles.includes(who)) {
    const trace = { at: new Date().toISOString(), toolId: card.tool_id, executorId: card.existing_tool_id, role: who, allowed: false, reason: "This role cannot use that tool.", inputKeys };
    recordTrace(trace);
    return { ok: false, reason: "This role cannot use that tool.", trace };
  }
  if (card.approval_required && input.approved !== true) {
    const trace = { at: new Date().toISOString(), toolId: card.tool_id, executorId: card.existing_tool_id, role: who, allowed: false, reason: "Approval is required before this tool runs.", inputKeys };
    recordTrace(trace);
    return { ok: false, reason: "Approval is required before this tool runs.", trace };
  }
  if (!card.existing_tool_id) {
    const trace = { at: new Date().toISOString(), toolId: card.tool_id, role: who, allowed: false, reason: "This card has no hospital executor.", inputKeys };
    recordTrace(trace);
    return { ok: false, reason: "This card has no hospital executor.", trace };
  }
  const { ToolRegistry } = await import("../../src/agents/core/ToolRegistry");
  const output = await ToolRegistry.execute(card.existing_tool_id, input);
  const trace = { at: new Date().toISOString(), toolId: card.tool_id, executorId: card.existing_tool_id, role: who, allowed: true, inputKeys };
  recordTrace(trace);
  return { ok: true, output, trace };
}

export function toolsForRole(role: string, classes: readonly ToolClass[]): BrainToolCard[] {
  const allowed = new Set(classes);
  const who = (role ?? "").toLowerCase();
  return BRAIN_TOOLS.filter((tool) => allowed.has(tool.tool_class) && tool.allowed_roles.includes(who));
}
