/**
 * ASTRA AI — Unified Orchestrator (§6 / §8 / §9)
 * Single front door: intent → AITask → handler (clinical reasoner | gateway |
 * hospital tool) → clinical safety layer → structured response.
 * Preserves HermesBrain (server/langgraph.ts) and the CLI brain; composes them.
 */
import { db } from "./db";
import type { UserSession } from "./types";
import { HermesBrain } from "../src/agents/core/HermesBrain";
import { aiGatewayChat, type GatewayChatRequest } from "./ai/providerRegistry";
import { routeIntent } from "./ai/taskRouter";
import { AITask } from "./ai/types";

export type AvatarMode = "doctor" | "receptionist" | "patient_educator" | "clinical_copilot" | "emergency";

export interface OrchestratorRequest {
  query: string;
  user: UserSession;
  patientContext?: { uhid?: string; name?: string; summary?: string; vitals?: Record<string, unknown>; recentLabs?: unknown[] };
  language?: string;
  mode?: AvatarMode;
  clinical?: boolean;
  stream?: boolean;
  memory?: string;
  /** Spoken turn: FreeLLMAPI, then OmniRoute, then Ollama. Short answer. */
  voice?: boolean;
}

export interface ClinicalSynthesis {
  findings: string[];
  differentials: { dx: string; probability: string; for: string; against: string }[];
  redFlags: string[];
  uncertainty: string;
  missingInfo: string[];
  recommendations: string[];
}

export interface OrchestratorResponse {
  requestId: string;
  task: AITask;
  text: string;
  provider: string;
  language: string;
  mode: AvatarMode;
  clinical?: ClinicalSynthesis;
  reasoning?: { summary: string; trace: string[]; uncertainty: string };
  safetyFlags: string[];
  providerUsed: string[];
  fallbackUsed: boolean;
  fallbackText?: boolean;
}

const SUPPORTED_MODES: AvatarMode[] = ["doctor", "receptionist", "patient_educator", "clinical_copilot", "emergency"];
const CLINICAL_TASKS = new Set<AITask>([
  AITask.ClinicalReasoning, AITask.DiagnosisSupport, AITask.DifferentialGeneration,
  AITask.InvestigationPlanning, AITask.MedicationReview, AITask.DrugInteraction,
  AITask.EvidenceSearch, AITask.LiteratureSearch, AITask.Referral, AITask.Vision,
]);

const CLINICAL_SYSTEM =
  "You are Astra, the hospital's clinical decision-support copilot. You are NOT a physician. " +
  "Communicate uncertainty. Distinguish suggestions from confirmed findings. Flag red flags. " +
  "Do not fabricate data, labs, or citations. Defer diagnosis and treatment decisions to a licensed clinician.";
const EMERGENCY_PREFIX = "[EMERGENCY MODE — concise, high-priority] ";

function slimContext(p?: OrchestratorRequest["patientContext"]): string | undefined {
  if (!p) return undefined;
  const parts: string[] = [];
  if (p.name) parts.push(`Patient: ${p.name}`);
  if (p.uhid) parts.push(`UHID: ${maskId(p.uhid)}`);
  if (p.summary) parts.push(p.summary);
  return parts.length ? parts.join(". ") : undefined;
}
function maskId(uhid: string): string {
  const digits = uhid.replace(/[^\d]/g, "");
  return digits.slice(-4).padStart(4, "*").replace(/^(\d{2})(\d{2})$/, "**$2");
}

export class AstraOrchestrator {
  private requestId(): string {
    return `ORCH-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
    /** Route a free-text intent to an AITask (deterministic heuristics, no LLM guess). */
  public intentToTask(query: string, categoryHint?: string): AITask {
    return routeIntent(query, categoryHint);
  }

  /**
   * Primary entry point. Preserves patient context isolation: only slimContext
   * (name token + summary) reaches providers/agents; no full records.
   */
  public async handle(req: OrchestratorRequest): Promise<OrchestratorResponse> {
    const requestId = this.requestId();
    const task = routeIntent(req.query);
    const mode = SUPPORTED_MODES.includes(req.mode ?? "doctor") ? (req.mode ?? "doctor") : "doctor";
    const language = req.language ?? "en";
    const trace: string[] = [];
    trace.push(`intent→task: ${task}`);

    if (task === AITask.HospitalOperations || task === AITask.PatientRegistry) {
      return this.handleHospital(req, task, mode, language, requestId, trace);
    }
    if (req.voice) {
      trace.push("voice→freellmapi then omniroute");
      return this.handleGateway(req, AITask.FastConversation, mode, language, requestId, trace);
    }
    if (CLINICAL_TASKS.has(task)) {
      return this.handleClinical(req, task, mode, language, requestId, trace);
    }
    return this.handleGateway(req, task, mode, language, requestId, trace);
  }

  /** Deterministic hospital census from the canonical DB — never padded, never LLM-invented. */
  private async handleHospital(
    req: OrchestratorRequest,
    task: AITask,
    mode: AvatarMode,
    language: string,
    requestId: string,
    trace: string[],
  ): Promise<OrchestratorResponse> {
    const patients = db.getPatients();
    const beds = db.getBeds();
    const orders = db.getOrders();
    const op = patients.filter((p) => p.admissionStatus === "outpatient").length;
    const ip = patients.filter((p) => p.admissionStatus === "inpatient").length;
    const occupied = beds.filter((b) => b.status === "occupied").length;
    const pendingLab = orders.filter((o) => o.category === "laboratory" && o.status !== "completed").length;
    const text =
      `Hospital census (live DB, not estimated): ${patients.length} patients on file ` +
      `(OP ${op}, IP ${ip}). Beds occupied ${occupied}/${beds.length || 0}. ` +
      `Open laboratory orders: ${pendingLab}.`;
    trace.push("hospital: canonical db counts (no LLM, no padded pulse)");
    db.logAudit({
      actorId: req.user?.userId ?? "anon",
      actorName: req.user?.name ?? "anon",
      actorRole: req.user?.role ?? "doctor",
      action: "orchestrator.hospital",
      category: "operations",
      status: "SUCCESS",
      details: `task=${task} patients=${patients.length}`,
    });
    return {
      requestId,
      task,
      text,
      provider: "hospital-db",
      language,
      mode,
      safetyFlags: [],
      providerUsed: ["hospital-db"],
      fallbackUsed: false,
    };
  }

  private async handleClinical(
    req: OrchestratorRequest,
    task: AITask,
    mode: AvatarMode,
    language: string,
    requestId: string,
    trace: string[],
  ): Promise<OrchestratorResponse> {
    let synthesis: Awaited<ReturnType<typeof HermesBrain.reason>> | null = null;
    let clinicalError: string | undefined;
    try {
      synthesis = await HermesBrain.reason(req.query, req.patientContext as any);
      trace.push(`hermes.reason ok (delegates: ${synthesis.delegatedSpecialists.join(", ")})`);
    } catch (e) {
      clinicalError = e instanceof Error ? e.message : String(e);
      trace.push(`hermes.reason failed: ${clinicalError}`);
    }

    const clinical: ClinicalSynthesis = synthesis
      ? {
          findings: synthesis.keyFindings,
          differentials: synthesis.differential.likely.map((dx) => ({ dx, probability: "likely", for: "", against: "" })),
          redFlags: [
            ...(synthesis.differential?.mustNotMiss ?? []),
            ...(synthesis.safetyCheck?.contraindications ?? []),
          ],
          uncertainty: synthesis.uncertaintyStatement,
          missingInfo: synthesis.missingInformation,
          recommendations: synthesis.nextHighValueTest,
        }
      : {
          findings: [], differentials: [], redFlags: ["Clinical reasoning engine unavailable — escalate to clinician"],
          uncertainty: "Unable to generate structured reasoning.", missingInfo: ["Clinical data unavailable"], recommendations: [],
        };

    const prefix = mode === "emergency" ? EMERGENCY_PREFIX : "";
    let text = prefix + (clinical.uncertainty ?? "Structured clinical reasoning prepared — see findings below.");
    let provider = "hermes-deterministic";
    let fallbackText = false;
    let tried: string[] = [];

    const ctx = slimContext(req.patientContext);
    const gatewayReq: GatewayChatRequest = {
      messages: [
        { role: "system", content: CLINICAL_SYSTEM },
        ...(synthesis?.evidence?.length
          ? [{ role: "system" as const, content: `Evidence:\n${synthesis.evidence.map((e) => `[${e.source}${e.pmid ? " PMID " + e.pmid : ""}] ${e.quote}`).join("\n")}` }]
          : []),
        {
          role: "user",
          content: [
            ctx ? `Patient: ${ctx}` : "",
            `Clinical context (structured, NOT definitive): findings=${clinical.findings.join(", ")}; ` +
              `differentials=${clinical.differentials.map((d) => d.dx).join(", ")}; ` +
              `red flags=${clinical.redFlags.join(", ")}; missing=${clinical.missingInfo.join(", ")}.`,
            `Physician request: ${prefix}${req.query}`,
            `Respond in ${language}. Do NOT present inferred findings as confirmed. State uncertainty explicitly.`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      task, language, requestId,
      patientName: req.patientContext?.name,
      uhid: req.patientContext?.uhid,
      note: req.patientContext?.summary,
    };

    try {
      const g = await aiGatewayChat(gatewayReq);
      tried = g.tried;
      if (g.text && g.text.trim()) {
        text = prefix + g.text;
        provider = g.providerId;
      } else {
        fallbackText = true;
        trace.push("gateway returned empty text → deterministic clinical synthesis only");
      }
    } catch (e) {
      fallbackText = true;
      trace.push(`gateway failed (${e instanceof Error ? e.message : String(e)}) → deterministic clinical synthesis only`);
    }

    db.logAudit({
      actorId: req.user?.userId ?? "anon", actorName: req.user?.name ?? "anon",
      actorRole: (req.user?.role ?? "doctor") as any, action: "orchestrator.clinical", category: "clinical",
      status: "SUCCESS", details: `task=${task} provider=${provider} fallback=${fallbackText}`,
      patientId: req.patientContext?.uhid ? maskId(req.patientContext.uhid) : undefined,
    });

    const safetyFlags: string[] = [];
    if (clinicalError) safetyFlags.push(`reasoning engine error: ${clinicalError}`);
    if (/uncertain|limited/i.test(clinical.uncertainty)) safetyFlags.push("UNCERTAIN — confirm with clinician");
    safetyFlags.push(...clinical.redFlags.map((r) => `red-flag: ${r}`));

    return {
      requestId, task, text, provider, language, mode, clinical,
      reasoning: { summary: clinical.uncertainty, trace, uncertainty: clinical.uncertainty },
      safetyFlags,
      providerUsed: tried.length ? tried : [provider],
      fallbackUsed: fallbackText, fallbackText,
    };
  }
  
  private async handleGateway(
    req: OrchestratorRequest,
    task: AITask,
    mode: AvatarMode,
    language: string,
    requestId: string,
    trace: string[],
  ): Promise<OrchestratorResponse> {
    const voice = req.voice === true;
    const messages = [
      {
        role: "system" as const,
        content: voice
          ? "You are Dr. Mayin, speaking with the doctor. Reply in one or two short spoken sentences, in the same language as the doctor. No markdown, no lists."
          : "You are Astra, the hospital's AI copilot. Give concise, safe answers. Do not fabricate data.",
      },
      ...(req.memory ? [{ role: "system" as const, content: `Context:\n${req.memory}` }] : []),
      { role: "system" as const, content: `Language: ${language}. Mode: ${mode}. Task: ${task}.` },
      { role: "user" as const, content: req.query },
    ];

    const prefix = mode === "emergency" ? EMERGENCY_PREFIX : "";
    const g = await aiGatewayChat({
      messages,
      task,
      language,
      requestId,
      stream: req.stream,
      timeoutMs: voice ? 12_000 : undefined,
      max_tokens: voice ? 160 : undefined,
      patientName: req.patientContext?.name,
      uhid: req.patientContext?.uhid,
      note: req.patientContext?.summary,
    });
    trace.push(`gateway: provider=${g.providerId} tried=[${g.tried.join(",")}]`);

    db.logAudit({
      actorId: req.user?.userId ?? "anon", actorName: req.user?.name ?? "anon",
      actorRole: (req.user?.role ?? "doctor") as any, action: "orchestrator.chat", category: "agent",
      status: "SUCCESS", details: `task=${task} provider=${g.providerId}`,
    });

    return {
      requestId, task,
      text: prefix + (g.text ?? ""),
      provider: g.providerId,
      language, mode,
      safetyFlags: [],
      providerUsed: g.tried.length ? g.tried : [g.providerId],
      fallbackUsed: g.fallbackUsed,
      fallbackText: !g.text?.trim(),
    };
  }
}
export const astraOrchestrator = new AstraOrchestrator();
