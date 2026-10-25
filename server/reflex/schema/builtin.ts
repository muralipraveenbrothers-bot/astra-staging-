import { register } from "./registry";
import type { DecisionOption, DecisionSchema } from "./types";

const createdAt = "2026-09-29T00:00:00.000Z";
const thresholds = { auto: 0.9, assist: 0.65, minMargin: 0.25 };
const common = { version: 1, dataClass: "non_phi_decision_state", defaultMode: "SHADOW" as const, thresholds, languages: ["en", "te", "hi"] as Array<"en" | "te" | "hi">, owner: "astra-reflex" };
const abstain: DecisionOption[] = [
  { key: "unknown", label: "Unknown" },
  { key: "human_review", label: "Human review" },
];

function choice(id: string, domain: DecisionSchema["domain"], question: string, options: DecisionOption[]): DecisionSchema {
  return { ...common, id, kind: "choice", question, options: [...options, ...abstain], abstainKeys: abstain.map((o) => o.key), domain, createdAt };
}

function score(id: string, domain: DecisionSchema["domain"], question: string, levels: string[]): DecisionSchema {
  return { ...common, id, kind: "score", question, levels, abstainKeys: ["unknown"], domain, createdAt };
}

function noul(id: string, domain: DecisionSchema["domain"], question: string): DecisionSchema {
  return { ...common, id, kind: "noul", question, abstainKeys: ["unknown"], domain, createdAt };
}

export const BUILTIN_DECISION_SCHEMAS: DecisionSchema[] = [
  choice("language_routing", "router", "Which language is this message written or spoken in?", [
    { key: "en", label: "English", description: "English language content" },
    { key: "te", label: "Telugu", description: "Telugu language content" },
    { key: "hi", label: "Hindi", description: "Hindi language content" },
    { key: "te_en", label: "Telugu mixed English", description: "Telugu mixed with English" },
    { key: "hi_en", label: "Hindi mixed English", description: "Hindi mixed with English" },
    { key: "other", label: "Other", description: "Other language content" },
  ]),
  choice("intent_routing", "router", "What does the user want Astra to do?", [
    { key: "patient_lookup", label: "Patient lookup", description: "find or select patient" },
    { key: "lab_query", label: "Lab query", description: "retrieve laboratory results" },
    { key: "report_query", label: "Report query", description: "retrieve radiology reports" },
    { key: "medication_query", label: "Medication query", description: "medication list question" },
    { key: "order_action", label: "Order action", description: "place or change order" },
    { key: "workflow_task", label: "Workflow task", description: "department workflow request" },
    { key: "explanation_request", label: "Explanation", description: "explain concept or value" },
    { key: "emergency", label: "Emergency", description: "immediate emergency routing" },
    { key: "other", label: "Other", description: "other user intent" },
  ]),
  choice("department_routing", "router", "Which Astra department surface should handle this?", [
    { key: "reception", label: "Reception", description: "registration appointments movement" },
    { key: "lab", label: "Lab", description: "laboratory tests results" },
    { key: "radiology", label: "Radiology", description: "radiology ultrasound imaging" },
    { key: "pharmacy", label: "Pharmacy", description: "medications dispensing stock" },
    { key: "ward", label: "Ward", description: "ward nursing beds" },
    { key: "ot", label: "OT", description: "operation theatre scheduling" },
    { key: "billing", label: "Billing", description: "payments invoices refunds" },
    { key: "cmrf", label: "CMRF", description: "medical records documents" },
    { key: "command_centre", label: "Command centre", description: "whole hospital overview" },
    { key: "emergency", label: "Emergency", description: "immediate emergency routing" },
    { key: "other", label: "Other", description: "other department surface" },
  ]),
  choice("command_type", "router", "Is this a command, question, note or conversation?", [
    { key: "command", label: "Command", description: "imperative action instruction" },
    { key: "question", label: "Question", description: "information request question" },
    { key: "dictation", label: "Dictation", description: "clinical note dictation" },
    { key: "conversation", label: "Conversation", description: "greeting small talk" },
    { key: "other", label: "Other", description: "other interaction type" },
  ]),
  score("urgency_classification", "safety", "How urgent is this request for hospital routing?", ["routine", "soon", "urgent", "immediately life-threatening"]),
  score("workflow_priority", "ops", "What priority should this workflow item receive?", ["background", "low", "normal", "high", "critical"]),
  choice("document_classification", "context", "What kind of hospital document is this?", [
    { key: "discharge_summary", label: "Discharge summary", description: "patient discharge document" },
    { key: "progress_note", label: "Progress note", description: "clinical progress note" },
    { key: "lab_report", label: "Lab report", description: "laboratory report document" },
    { key: "radiology_report", label: "Radiology report", description: "imaging report document" },
    { key: "prescription", label: "Prescription", description: "medication prescription chart" },
    { key: "consent", label: "Consent", description: "procedure consent form" },
    { key: "referral", label: "Referral", description: "referral letter document" },
    { key: "other", label: "Other", description: "other document type" },
  ]),
  noul("missing_data_flag", "safety", "Does this request lack information Astra needs before acting?"),
  noul("possible_emergency_flag", "safety", "Does this text contain language suggesting an immediate emergency?"),
  score("action_risk_level", "safety", "How risky is this action if executed without clinician review?", ["read-only", "draft only", "reversible change", "difficult to reverse", "irreversible"]),
  noul("needs_human_confirmation", "safety", "Does this action need authenticated clinician confirmation first?"),
  choice("note_type", "context", "Which note type is being dictated?", [
    { key: "admission", label: "Admission", description: "admission note content" },
    { key: "progress", label: "Progress", description: "progress note content" },
    { key: "procedure", label: "Procedure", description: "procedure note content" },
    { key: "consultation", label: "Consultation", description: "consultation note content" },
    { key: "discharge", label: "Discharge", description: "discharge summary content" },
    { key: "other", label: "Other", description: "other note type" },
  ]),
  choice("message_triage", "ops", "How should this internal hospital message be triaged?", [
    { key: "answer_now", label: "Answer now", description: "needs immediate reply" },
    { key: "queue", label: "Queue", description: "routine queued handling" },
    { key: "route_elsewhere", label: "Route elsewhere", description: "belongs another department" },
    { key: "ignore_noise", label: "Ignore noise", description: "no action required" },
    { key: "emergency", label: "Emergency", description: "immediate emergency routing" },
    { key: "other", label: "Other", description: "other message triage" },
  ]),
];

export function registerBuiltins(): void {
  for (const schema of BUILTIN_DECISION_SCHEMAS) register(schema);
}

registerBuiltins();
