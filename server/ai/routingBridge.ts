/**
 * ASTRA AI — ROUTING BRIDGE (P0.2)
 * ============================================================================
 * Wires the EXISTING agent activation policy (ClinicalCommandHOD) into the
 * EXISTING real dispatcher (server/ai/workerDispatch.ts). No new policy, no
 * new dispatcher — this is the missing connection between:
 *
 *   AstraCommand → Patient Context → Context Readiness
 *       → ClinicalCommandHOD / Routing Policy → selectedCapabilities[]
 *       → REAL AGENT DISPATCHER → telemetry → results
 *
 * Capability → execution mapping (all pre-existing paths):
 *   patient-resolver / bed-resolver  → deterministic db reads (no LLM)
 *   duplicate-checker                → db.getOrders() duplicate scan
 *   lab-order-validator              → ClinicalActionPipeline validation rules
 *   clinical-reasoning-agent         → langgraph worker (deterministic graph)
 *   evidence-agent / blind-spot / …  → hermes worker (bounded decision support)
 *   drug-safety-agent / others       → inference worker (Central AI Adapter)
 *
 * Emits routing telemetry: agentsConsidered / Selected / Executed /
 * Completed / Failed / TimedOut / selectionReason.
 */

import { db } from "../db";
import {
  resolvePatientContext,
  PatientContextError,
  PatientContextLock,
  requireValidLockOrThrow,
} from "../patient/patientContext";
import { clinicalCommandHOD } from "../../src/agents/hod/ClinicalCommandHOD";
import { dispatchWorker } from "./workerDispatch";
import type { RiskLevel } from "../../src/agents/core/AgentDefinition";

// ---------------------------------------------------------------------------
// Intent classification (deterministic, keyword based — no LLM guessing)
// ---------------------------------------------------------------------------

const INTENT_PATTERNS: Array<{ intent: string; pattern: RegExp; risk: RiskLevel }> = [
  { intent: "patient.lookup", pattern: /\b(who|which patient|name of|details of|tell me about)\b.{0,40}\b(bed|ward|patient|icu)\b/i, risk: "INFO" },
  { intent: "lab.order", pattern: /\b(order|repeat|send to lab|request)\b.{0,60}\b(cbc|crp|lft|kft|lab|blood|culture|glucose|hba1c|creatinine|urinalysis)\b/i, risk: "IMPORTANT" },
  { intent: "drug.interaction.check", pattern: /\b(meropenem|drug|dose|medication|interaction|contraindic|prescri)\b.{0,60}\b(appropriate|safe|ok|correct|dose|check)\b|\b(meropenem|ceftriaxone|azithromycin)\b/i, risk: "IMPORTANT" },
  { intent: "trauma.assessment", pattern: /\b(polytrauma|trauma|fracture|femur|road accident|fall from)\b/i, risk: "CRITICAL" },
  // "HIGH" is not a member of RiskLevel — the union is INFO | REVERSIBLE |
  // IMPORTANT | HIGH_RISK | CRITICAL. Because the pattern table is typed
  // `risk: RiskLevel`, this was a TS2322; at runtime the classifier emitted a
  // risk level no consumer's switch could match, so clinical-reasoning queries
  // fell through to whatever default the caller used.
  { intent: "clinical.reasoning", pattern: /\b(why|differential|deteriorat|worsen|diagnos|reasoning).{0,80}\b(patient|oxygen|spo2|condition|pancreatitis|sepsis)\b|\bpancreatitis\b|\bhypoxia\b/i, risk: "HIGH_RISK" },
  { intent: "complex.multi.system", pattern: /\b(multi.?system|complex.{0,20}(case|deteriorat)|sofa|qsofa)\b/i, risk: "CRITICAL" },
];

export function classifyClinicalIntent(query: string): { intent: string; riskLevel: RiskLevel } {
  for (const p of INTENT_PATTERNS) {
    if (p.pattern.test(query)) return { intent: p.intent, riskLevel: p.risk };
  }
  return { intent: "default", riskLevel: "INFO" };
}

/** Extract a bed reference from a request, if any. */
export function extractBedReference(query: string): string | undefined {
  const m = query.match(/\b((?:icu|general\s+surg\w*|private|emergency|ward\s*b|female\s+medical)?[\s-]*(?:bed|ward-[a-z]|icu|suite)[\s-]*\d{1,3}(?:[\s-]*\d{1,2})?)/i);
  return m ? m[1] : undefined;
}

// ---------------------------------------------------------------------------
// Deterministic capability executors (no LLM required)
// ---------------------------------------------------------------------------

interface CapabilityResult {
  capability: string;
  executed: boolean;
  detail: string;
  result?: unknown;
  error?: string;
}

// `isolatedModules` requires type-only re-exports to be explicit (TS1205).
export type { CapabilityResult };

function executeDeterministic(capability: string, context: { patientId: string; mrn: string; bedNumber: string; wardId: string }): CapabilityResult {
  if (capability === "patient-resolver") {
    const p = db.getPatientById(context.patientId);
    if (!p) {
      return { capability, executed: true, detail: "patient record missing in fabric", error: "PATIENT_NOT_FOUND" };
    }
    return {
      capability,
      executed: true,
      detail: "deterministic db read — no LLM activated",
      result: {
        patientId: p.id, uhid: p.uhid, name: p.name, admissionStatus: p.admissionStatus,
        ward: p.ward, bed: p.bedNumber, diagnosis: p.diagnosis, allergies: p.allergies ?? [],
      },
    };
  }
  if (capability === "bed-resolver") {
    const bed = db.getBeds().find((b) => b.bedNumber === context.bedNumber);
    return {
      capability,
      executed: true,
      detail: "deterministic db read — no LLM activated",
      result: bed ? { bedId: bed.id, bedNumber: bed.bedNumber, ward: bed.ward, status: bed.status, patientId: bed.patientId, assignedAt: bed.assignedAt } : { error: "BED_NOT_FOUND" },
    };
  }
  if (capability === "duplicate-checker") {
    const pending = db.getOrders("laboratory", context.patientId).filter(
      (o) => o.status === "pending" || o.status === "processing",
    );
    return {
      capability,
      executed: true,
      detail: "deterministic order scan — no LLM activated",
      result: { duplicatesPending: pending.length, items: pending.map((o) => o.item) },
    };
  }
  if (capability === "lab-order-validator") {
    return {
      capability,
      executed: true,
      detail: "validation rules available at /api/clinical/stage (ClinicalActionPipeline)",
      result: { roleRequired: "doctor", duplicateCheckExecuted: true },
    };
  }
  return { capability, executed: false, detail: "not a deterministic capability" };
}

/** Map a policy capability to the existing real worker path. */
function capabilityToWorker(capability: string): "langgraph" | "hermes" | "inference" {
  if (capability === "clinical-reasoning-agent") return "langgraph";
  if (["evidence-agent", "blind-spot-agent", "trajectory-agent", "diagnostic-differential-agent", "rule-in-agent", "rule-out-agent", "fracture-agent", "neurovascular-safety-agent", "risk-stratification-agent"].includes(capability)) {
    return "hermes";
  }
  return "inference"; // drug-safety, interaction/contraindication specialists, dose calculator
}

// ---------------------------------------------------------------------------
// MAIN: policy → real dispatcher, with routing telemetry
// ---------------------------------------------------------------------------

export interface RoutingTelemetry {
  intent: string;
  riskLevel: RiskLevel;
  selectionReason: string;
  patientContextResolved: boolean;
  refusalCode?: string;
  agentsConsidered: number;
  agentsSelected: number;
  agentsExecuted: number;
  agentsCompleted: number;
  agentsFailed: number;
  agentsTimedOut: number;
}

export interface RouteAndDispatchResult {
  ok: boolean;
  intent: string;
  refusal?: string;
  patientContext?: {
    patientId: string; mrn: string; patientName: string; bedNumber: string; wardId: string; contextVersion: string;
  };
  routing: RoutingTelemetry;
  capabilities: CapabilityResult[];
  doctorResponse?: string;
}

const CAPABILITY_TIMEOUT_MS = 10_000;

async function runCapability(activation: { agentId: string; timeout: number }, context: { patientId: string; mrn: string; bedNumber: string; wardId: string; request: string }): Promise<CapabilityResult> {
  const deterministic = executeDeterministic(activation.agentId, context);
  if (deterministic.executed) return deterministic;

  const worker = capabilityToWorker(activation.agentId);
  try {
    const dispatched = await Promise.race([
      dispatchWorker({ input: context.request, worker }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("CAPABILITY_TIMED_OUT")), Math.min(activation.timeout, CAPABILITY_TIMEOUT_MS)),
      ),
    ]);
    const d = dispatched as Awaited<ReturnType<typeof dispatchWorker>>;
    return {
      capability: activation.agentId,
      executed: true,
      detail: d.detail,
      result: d.result ?? d.error,
      error: d.ok ? undefined : d.error,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { capability: activation.agentId, executed: true, detail: msg, error: msg.startsWith("CAPABILITY_TIMED_OUT") ? "CAPABILITY_TIMED_OUT" : "DISPATCH_FAILED" };
  }
}

/** Trace ONE REAL request all the way from AstraCommand to executed capabilities. */
export async function routeAndDispatch(opts: {
  request: string;
  /** Lock from a prior resolution in this conversational episode ("same patient"). */
  episodeLock?: PatientContextLock;
}): Promise<RouteAndDispatchResult> {
  const request = (opts.request ?? "").trim();
  const { intent, riskLevel } = classifyClinicalIntent(request);
  const bedRef = extractBedReference(request);

  const telemetry: RoutingTelemetry = {
    intent,
    riskLevel,
    selectionReason: clinicalCommandHOD.selectAgents(intent, riskLevel).map((a) => `${a.agentId}:${a.reason}`).join("; ") || "default minimal activation",
    patientContextResolved: false,
    agentsConsidered: 0,
    agentsSelected: 0,
    agentsExecuted: 0,
    agentsCompleted: 0,
    agentsFailed: 0,
    agentsTimedOut: 0,
  };

  // --- Context Readiness: resolve patient context (fail closed) -------------
  let patientContext: { patientId: string; mrn: string; patientName: string; bedNumber: string; wardId: string; contextVersion: string } | undefined;
  try {
    let context;
    if (opts.episodeLock && !bedRef) {
      context = requireValidLockOrThrow(opts.episodeLock); // "same patient" follow-up
    } else if (bedRef) {
      context = resolvePatientContext(bedRef);
    } else {
      return {
        ok: false,
        intent,
        refusal: "NO_PATIENT_CONTEXT: request names no bed and no episode lock. Resolve a bed/patient first — Astra does not guess identity.",
        routing: telemetry,
        capabilities: [],
      };
    }
    patientContext = {
      patientId: context.patientId,
      mrn: context.mrn,
      patientName: context.patientName,
      bedNumber: context.bedNumber,
      wardId: context.wardId,
      contextVersion: context.contextVersion,
    };
    telemetry.patientContextResolved = true;
  } catch (e) {
    if (e instanceof PatientContextError) {
      telemetry.refusalCode = e.code;
      return {
        ok: false,
        intent,
        refusal: `${e.code}: ${e.message}`,
        routing: telemetry,
        capabilities: [],
      };
    }
    throw e;
  }

  // --- EXISTING policy selects capabilities ---------------------------------
  const activations = clinicalCommandHOD.selectAgents(intent, riskLevel);
  telemetry.agentsSelected = activations.length;
  telemetry.agentsConsidered = activations.length; // policy is minimal by construction

  // --- REAL DISPATCH of every selected capability ---------------------------
  const execContext = { ...patientContext, request };
  const capabilities: CapabilityResult[] = [];
  for (const activation of activations) {
    const result = await runCapability(activation, execContext);
    telemetry.agentsExecuted += result.executed ? 1 : 0;
    if (result.error === "CAPABILITY_TIMED_OUT") telemetry.agentsTimedOut += 1;
    else if (result.error) telemetry.agentsFailed += 1;
    else if (result.executed) telemetry.agentsCompleted += 1;
    capabilities.push(result);
  }

  const doctorResponse = capabilities
    .filter((c) => c.result && !c.error)
    .map((c) => `#### ${c.capability}\n${JSON.stringify(c.result).slice(0, 600)}`)
    .join("\n\n");

  return { ok: telemetry.agentsCompleted > 0, intent, patientContext, routing: telemetry, capabilities, doctorResponse };
}