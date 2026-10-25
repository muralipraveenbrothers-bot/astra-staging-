/**
 * Calls agent modules that already exist but were not invoked.
 * Drafts only. No new clinical engine. No mutation. Patient text is not sent out.
 */
import { ClinicalReasoningAgent } from "./specialists/ClinicalReasoningAgent";
import { EvidenceAgent } from "./specialists/EvidenceAgent";
import { HospitalQueryAgent } from "./specialists/HospitalQueryAgent";
import { PatientContextAgent } from "./specialists/PatientContextAgent";
import { UniversalAgentContextBuilder } from "./core/UniversalAgentContext";
import { UniversalIntentResolver, type ResolvedIntentOutput } from "./core/UniversalIntentResolver";
import { runHermesPath } from "../astra/brain/hermesPath";
import { memoryFabric } from "../astra/brain/part5/memoryFabric";

export interface ExistingAgentDraft {
  agentId: string;
  label: "draft";
  /** False only for the existing non-PHI literature lookup. */
  localOnly: boolean;
  note: string;
}

const HOSPITAL_INTENTS = new Set([
  "HOSPITAL_CENSUS",
  "IP_LIST",
  "OP_LIST",
  "ICU_LIST",
  "WARD_LIST",
  "LAB_PENDING",
  "RADIOLOGY_PENDING",
  "PHARMACY_PENDING",
  "OT_STATUS",
  "BILLING_SUMMARY",
]);

const REASONING_INTENTS = new Set(["DIAGNOSTIC_REASONING", "CLINICAL_QUESTION"]);

function contextFor(resolved: ResolvedIntentOutput, agentId: string, agentName: string) {
  return UniversalAgentContextBuilder.buildContext({
    rawRequest: resolved.rawRequest,
    normalizedRequest: resolved.normalizedRequest,
    intent: resolved.intent,
    entities: resolved.entities ?? {},
    riskLevel: resolved.riskLevel,
    agentId,
    agentName,
    user: { userId: "astra-draft", name: "Astra draft", role: "DOCTOR", department: "CLINICAL" },
    candidateToolIds: resolved.requiredTools ?? [],
  });
}

function namedInText(ref: string, text: string): boolean {
  const needle = ref.trim().toLowerCase();
  return needle.length > 0 && text.toLowerCase().includes(needle);
}

function field(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function looksLikeChart(row: unknown): row is Record<string, unknown> {
  return !!row && typeof row === "object" && ("uhid" in row || "bedNumber" in row || "age" in row || "name" in row);
}

function vitalsPhrase(row: Record<string, unknown>): string {
  const list = Array.isArray(row.vitals) ? row.vitals : [];
  const last = list.length > 0 ? list[list.length - 1] : null;
  if (!last || typeof last !== "object") return "vitals not on this local record";
  const v = last as Record<string, unknown>;
  const bp = field(v.bpSys) && field(v.bpDia) ? `${field(v.bpSys)}/${field(v.bpDia)}` : "bp not on this local record";
  return `vitals spo2 ${field(v.spo2) || "not on this local record"}, pulse ${field(v.heartRate) || "not on this local record"}, bp ${bp}, tempF ${field(v.tempF) || "not on this local record"}, rr ${field(v.respRate) || "not on this local record"}`;
}

function chartPhrase(row: Record<string, unknown>): string {
  const age = field(row.age) || "age not on this local record";
  const date = field(row.registeredAt) || field(row.admissionDate) || "date not on this local record";
  const bed = field(row.bedNumber) || field(row.bed) || "bed not on this local record";
  return `age ${age}; date ${date}; bed ${bed}; ${vitalsPhrase(row)}`;
}

function hospitalNote(intent: string, data: unknown): string {
  if (intent === "IP_LIST" && Array.isArray(data)) {
    const rows = data.filter(looksLikeChart);
    const shown = rows.slice(0, 8).map((row) => {
      const who = [field(row.name), field(row.uhid) || field(row.id)].filter(Boolean).join(" ");
      return `${who || "unnamed"}: ${chartPhrase(row)}`;
    });
    const more = rows.length > shown.length ? ` ${rows.length - shown.length} more local row(s) not listed here.` : "";
    return `DRAFT from the existing Hospital Query Agent (IP_LIST). ${rows.length} local inpatient row(s). ${shown.join(" | ")}${more} Not a diagnosis.`;
  }
  if (Array.isArray(data)) {
    return `DRAFT from the existing Hospital Query Agent (${intent}). ${data.length} local row(s). Not a diagnosis.`;
  }
  if (data && typeof data === "object" && "totalPatients" in data) {
    const row = data as { totalPatients?: number; inpatients?: number; outpatients?: number; icuPatients?: number };
    return `DRAFT from the existing Hospital Query Agent (${intent}). Census total ${row.totalPatients ?? "?"}, IP ${row.inpatients ?? "?"}, OP ${row.outpatients ?? "?"}, ICU ${row.icuPatients ?? "?"}. Not a diagnosis.`;
  }
  return `DRAFT from the existing Hospital Query Agent (${intent}). Local records only. Not a diagnosis.`;
}

function patientNote(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "DRAFT from the existing Patient Context Agent. No matching local record. Not a diagnosis.";
  }
  const row = data as { name?: string; uhid?: string; id?: string; error?: string };
  if (row.error || (!row.name && !row.uhid && !row.id)) {
    return "DRAFT from the existing Patient Context Agent. No matching local record. Not a diagnosis.";
  }
  const who = [row.name, row.uhid || row.id].filter(Boolean).join(" ");
  const chart = looksLikeChart(row) ? ` ${chartPhrase(row)}.` : "";
  return `DRAFT from the existing Patient Context Agent. Local chart opened for ${who}.${chart} Not a diagnosis and no order was placed.`;
}

/** Local text only. Does not call lab, billing, WhatsApp, or any other sender. */
function unsentHospitalOrder(text: string): ExistingAgentDraft | null {
  const said = text.toLowerCase();
  const aimed = /\b(patient|this|order|for)\b/.test(said);
  const labOrder = /\b(cbp|cbc)\b/.test(said) && aimed;
  const deptOrder = /\b(notify|alert|send|order)\b/.test(said) && /\b(lab|pharmacy|radiology|x-?ray|bill|billing|ward|dressing|ot|reception)\b/.test(said);
  const bedside = /\b(x-?ray|dressing)\b/.test(said) && aimed;
  if (!labOrder && !deptOrder && !bedside) return null;
  return {
    agentId: "hospital_notify_draft",
    label: "draft",
    localOnly: true,
    note: "DRAFT on this PC. Not sent. Lab and the bill counter were not notified. Seen/unseen was not tracked. A 10-minute reminder was not started. The doctor was not escalated. No order was placed.",
  };
}


/** Local functions from the named architecture files. No store, no mock differentials, no PHI posted to Laya. */
async function namedPathDrafts(text: string, allowExternalEvidence: boolean): Promise<ExistingAgentDraft[]> {
  const drafts: ExistingAgentDraft[] = [];
  try {
    const path = runHermesPath(text, "in-process", "doctor");
    drafts.push({
      agentId: "hermes_path",
      label: "draft",
      localOnly: true,
      note: `DRAFT from existing runHermesPath. route=${path.route}; diagnosis=null; ordersPlaced=${path.ordersPlaced}.`,
    });
  } catch {
    /* in-process Hermes path failed closed */
  }

  try {
    const gates = memoryFabric.gates(text);
    const recall = memoryFabric.recall({ text, limit: 3 });
    drafts.push({
      agentId: "memory_fabric",
      label: "draft",
      localOnly: true,
      note: `DRAFT from existing memoryFabric. ${gates.explanation}. Recalled ${recall.records.length} record(s); blocked=${recall.blocked ?? "no"}. Nothing was stored.`,
    });
  } catch {
    /* memory read failed closed */
  }

  void allowExternalEvidence;
  return drafts;
}

async function finish(drafts: ExistingAgentDraft[], text: string, allowExternalEvidence: boolean): Promise<ExistingAgentDraft[]> {
  const unsent = unsentHospitalOrder(text);
  try {
    const named = await namedPathDrafts(text, allowExternalEvidence);
    return [...drafts, ...named, ...(unsent ? [unsent] : [])];
  } catch {
    return [...drafts, ...(unsent ? [unsent] : [])];
  }
}

export async function collectExistingAgentDrafts(
  text: string,
  options?: { allowExternalEvidence?: boolean },
): Promise<ExistingAgentDraft[]> {
  const said = (text ?? "").trim();
  if (!said) return [];
  const resolved = UniversalIntentResolver.resolve(said, false);
  const drafts: ExistingAgentDraft[] = [];

  if (HOSPITAL_INTENTS.has(resolved.intent)) {
    try {
      const data = await HospitalQueryAgent.execute(said, contextFor(resolved, HospitalQueryAgent.agentId, "Hospital Query Agent"));
      drafts.push({
        agentId: HospitalQueryAgent.agentId,
        label: "draft",
        localOnly: true,
        note: hospitalNote(resolved.intent, data),
      });
    } catch {
      /* existing tool failed; do not invent a result */
    }
    return finish(drafts, said, options?.allowExternalEvidence === true);
  }

  const ref = String(resolved.patientReference || resolved.entities?.patientName || "").trim();
  if (resolved.requiredAgents.includes("patient_context_agent") && namedInText(ref, said)) {
    try {
      const data = await PatientContextAgent.execute(said, contextFor(resolved, PatientContextAgent.agentId, "Patient Context Agent"));
      drafts.push({
        agentId: PatientContextAgent.agentId,
        label: "draft",
        localOnly: true,
        note: patientNote(data),
      });
    } catch {
      /* lookup failed closed */
    }
    return finish(drafts, said, options?.allowExternalEvidence === true);
  }

  if (resolved.intent === "PUBMED_SEARCH" && options?.allowExternalEvidence === true) {
    try {
      const data = await EvidenceAgent.execute(said);
      const hits = data && typeof data === "object" && Array.isArray((data as { evidenceHits?: unknown }).evidenceHits)
        ? (data as { evidenceHits: unknown[] }).evidenceHits.length
        : 0;
      drafts.push({
        agentId: EvidenceAgent.agentId,
        label: "draft",
        localOnly: false,
        note: `DRAFT from the existing Evidence Agent. Literature lookup only. ${hits} hit(s). Not a diagnosis and not a consensus.`,
      });
    } catch {
      /* external lookup failed; no fabricated citations */
    }
    return finish(drafts, said, options?.allowExternalEvidence === true);
  }

  if (REASONING_INTENTS.has(resolved.intent)) {
    try {
      const reasoning = await ClinicalReasoningAgent.execute(said);
      const understanding = typeof reasoning?.understanding === "string" ? reasoning.understanding.trim() : "";
      if (understanding) {
        drafts.push({
          agentId: ClinicalReasoningAgent.agentId,
          label: "draft",
          localOnly: true,
          note: `DRAFT from the existing Clinical Reasoning Agent on the local Hermes path. No diagnosis and no order. ${understanding}`,
        });
      }
    } catch {
      /* local path failed closed */
    }
  }

  return finish(drafts, said, options?.allowExternalEvidence === true);
}
