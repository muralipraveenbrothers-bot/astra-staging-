// ASTRA AI — AstraVoiceGuardian.
//
// One lightweight supervisory layer around the EXISTING voice/chat interaction.
// It is NOT another brain and NOT a global planner: Hermes, LangGraph, LiteLLM,
// the tool registry and the Clinical Reasoning pipeline all stay exactly where
// they are. The Guardian only guarantees that a turn which was accepted actually
// completes visibly:
//
//   validate transcript → authenticated identity → RBAC dashboard check →
//   language → wake detection → intent + risk → existing brain/tools →
//   mandatory text answer → optional speech
//
// Responsible-role note: the ACTIVE WORKSPACE (specialist context) is separate
// from the AUTHENTICATED ROLE (permissions). A doctor viewing Reception gets the
// Reception specialist overlay WITH doctor permissions — never the other way.
//
// Relationship to the existing server-side guard:
//   server/ai/VoiceGuardian.ts (`AstraVoiceGuardian.check`) is a PRE-ROUTER
//   CLASSIFIER (EMERGENCY / COMPLAINT / CLINICAL + reception clinical-RBAC
//   refusal) that already runs inside /api/astra-voice-agent.
//   This client-side Guardian is the ROUND-TRIP SUPERVISOR around the whole
//   turn: auth → RBAC → language → wake → intent/risk → brain → text → speech.
//   It does NOT replace the server classifier — pass it in via `deps.classify`
//   (or an existing Hermes/LangGraph router) and the local heuristic is skipped.

import {
  newTurnId,
  type AstraAction,
  type AstraDashboard,
  type AstraLanguage,
  type AstraRisk,
  type AstraVoiceResponse,
} from "./contracts";
import { detectAstraLanguage } from "./language";
import { buildVoiceSystemPrompt } from "./roleOverlays";
import { buildWakeResponse, isCallingAstra, isHumanNameCall } from "./wakeDetection";

/** Identity resolved from the authenticated session — never from the model. */
export interface AstraIdentity {
  userId: string;
  name: string;
  /** Authenticated RBAC role. Sole authority on permissions. */
  role: string;
  /** Workspaces this identity may operate in. */
  dashboards: AstraDashboard[];
}

export interface GuardianClassification {
  intent: string;
  risk: AstraRisk;
  requiresConfirmation?: boolean;
  /** Extra per-turn guidance for the brain (task framing). */
  task?: string;
  /** Trusted per-turn data (tool output, patient context, RAG hits). */
  data?: string;
}

export interface GuardianRespondRequest {
  system: string;
  message: string;
  dashboard: AstraDashboard;
  language: AstraLanguage;
  risk: AstraRisk;
  context?: string;
}

export interface GuardianDeps {
  /** Existing auth service lookup. Return null when the session is invalid. */
  requireAuthenticatedUser(userId: string): Promise<AstraIdentity | null> | AstraIdentity | null;
  /** Existing RBAC/dashboard access assertion. */
  assertDashboardAccess(
    identity: AstraIdentity,
    dashboard: AstraDashboard
  ): { allowed: boolean; reason?: string };
  /** Existing intent/risk router (Hermes/LangGraph/router service). */
  classify(input: {
    text: string;
    dashboard: AstraDashboard;
    role: string;
    language: AstraLanguage;
  }): Promise<GuardianClassification> | GuardianClassification;
  /** Existing brain call (chat / Hermes / LangGraph / agent roster). */
  respond(
    request: GuardianRespondRequest
  ): Promise<{ text: string; actions?: AstraAction[] }> | { text: string; actions?: AstraAction[] };
  /** Existing Clinical Command Centre path for high-risk clinical turns. */
  clinicalRespond?(
    request: GuardianRespondRequest
  ): Promise<{ text: string; actions?: AstraAction[] }> | { text: string; actions?: AstraAction[] };
  /** Override language detection (defaults to the shared detector). */
  detectLanguage?: (text: string) => AstraLanguage;
}

export interface GuardianTurnInput {
  /** Reuse the id from capture/STT when one already exists. */
  turnId?: string;
  userId: string;
  /** ACTIVE WORKSPACE. Never the authenticated role. */
  dashboard: AstraDashboard;
  text: string;
  /** false disables speech for this turn only (text still mandatory). */
  speak?: boolean;
  /** Ask for a longer spoken explanation ("Explain fully"). */
  fullDetail?: boolean;
}

/** Honest, non-silent refusal used whenever a turn cannot be processed. */
function refusalResponse(input: {
  turnId: string;
  text: string;
  language: AstraLanguage;
  dashboard: AstraDashboard;
  risk?: AstraRisk;
  intent?: string;
  speak?: boolean;
}): AstraVoiceResponse {
  return {
    turnId: input.turnId,
    text: input.text,
    speechText: input.text,
    language: input.language,
    speak: input.speak ?? true,
    dashboard: input.dashboard,
    risk: input.risk ?? "normal",
    intent: input.intent ?? "refusal",
    degraded: "ROUTER_FAILED",
  };
}

/** How Astra addresses this person in a wake acknowledgement. */
export function addressFor(identity: AstraIdentity): string {
  const role = (identity.role ?? "").toLowerCase();
  // Professional honorifics only where the role itself is unambiguous. No gender
  // is inferred from a workspace, and no title is invented for an unknown role.
  if (role.includes("doctor") || role.includes("consultant") || role.includes("physician")) return "Doctor";
  if (role.includes("nurse") || role.includes("sister")) return "Sister";
  if (role.includes("pharmacist")) return "Pharmacist";
  const first = (identity.name ?? "").trim().split(/\s+/)[0];
  return first || "";
}

/**
 * Honest local heuristic used when no router is wired yet. It is deliberately
 * conservative: it only flags obvious risk and never attempts clinical reasoning.
 */
export function classifyLocally(text: string): GuardianClassification {
  const value = (text ?? "").toLowerCase();
  const highRisk = /\b(emergency|code blue|arrest|unconscious|unresponsive|not breathing|collapse|deteriorat\w*|sepsis|shock|desatur\w*|mlc|medico[- ]?legal|overdose|anaphyla\w*|bleeding|death|died)\b/.test(
    value
  );
  if (highRisk) return { intent: "clinical_urgent", risk: "high_clinical" };

  const clinical = /\b(patient|bed|hba1c|hb|haemoglobin|hemoglobin|potassium|sodium|creatinine|wbc|platelet|dosage|dose|prescrib\w*|report|cbc|ecg|x[- ]?ray|ct|mri|usg|vitals|diagnos\w*|injection|antibiotic)\b/.test(
    value
  );
  if (clinical) return { intent: "clinical_query", risk: "clinical" };

  return { intent: "general", risk: "normal" };
}

/** The supervisory Guardian. Stateless — safe to reuse across dashboards. */
export class AstraVoiceGuardian {
  constructor(private readonly deps: GuardianDeps) {}

  private detect(text: string): AstraLanguage {
    try {
      return this.deps.detectLanguage?.(text) ?? detectAstraLanguage(text);
    } catch {
      return "en";
    }
  }

  /**
   * Handle one accepted turn. ALWAYS resolves with a response whose `text` is
   * non-empty, so the UI can never end up with "nothing happened".
   */
  async handleTurn(input: GuardianTurnInput): Promise<AstraVoiceResponse> {
    const turnId = input.turnId ?? newTurnId();
    const dashboard = input.dashboard;
    const rawText = (input.text ?? "").trim();
    const language = this.detect(rawText);
    const speak = input.speak !== false;

    // ---- validate transcript ----------------------------------------------
    if (!rawText) {
      return refusalResponse({
        turnId,
        dashboard,
        language,
        speak: false,
        text: "I did not catch that — nothing was recognised from the microphone. Please say it again, or type it below.",
        intent: "empty_transcript",
      });
    }

    // ---- authenticated identity (never trust the model/dashboard claim) ----
    let identity: AstraIdentity | null = null;
    try {
      identity = await this.deps.requireAuthenticatedUser(input.userId);
    } catch {
      identity = null;
    }
    if (!identity) {
      return refusalResponse({
        turnId,
        dashboard,
        language,
        speak,
        text: "Your session is no longer authenticated, so I cannot act on this. Please sign in again and I will pick this up.",
        intent: "unauthenticated",
      });
    }

    // ---- RBAC: the workspace must be permitted ----------------------------
    const access = this.deps.assertDashboardAccess(identity, dashboard);
    if (!access?.allowed) {
      return refusalResponse({
        turnId,
        dashboard,
        language,
        speak,
        text: `I can't do this from the ${dashboard} workspace with your current permissions.${access?.reason ? ` ${access.reason}` : ""}`,
        intent: "access_denied",
      });
    }

    // ---- wake / name call: deterministically, before any semantic reasoning -
    if (isCallingAstra(rawText) || isHumanNameCall(rawText)) {
      return buildWakeResponse({
        turnId,
        text: rawText,
        language,
        dashboard,
        address: addressFor(identity),
        seed: turnId.length + rawText.length,
      });
    }

    // ---- intent + risk -----------------------------------------------------
    let classification: GuardianClassification;
    try {
      classification = await this.deps.classify({
        text: rawText,
        dashboard,
        role: identity.role,
        language,
      });
    } catch {
      return refusalResponse({
        turnId,
        dashboard,
        language,
        speak,
        text: "I couldn't classify that request just now. Please try once more, or rephrase it slightly.",
        intent: "router_failed",
      });
    }

    const risk = classification.risk ?? "normal";
    const system = buildVoiceSystemPrompt({
      dashboard,
      language,
      risk,
      instructions: classification.data,
      userText: rawText,
      fullDetail: input.fullDetail === true,
    });
    const request: GuardianRespondRequest = {
      system,
      message: rawText,
      dashboard,
      language,
      risk,
      context: classification.data,
    };

    // ---- high clinical risk → existing clinical architecture ---------------
    let answer: { text: string; actions?: AstraAction[] } | null = null;
    let degraded: AstraVoiceResponse["degraded"];
    const clinicalPath = risk === "high_clinical" || risk === "clinical";
    try {
      if (clinicalPath && this.deps.clinicalRespond) {
        answer = await this.deps.clinicalRespond(request);
      } else {
        answer = await this.deps.respond(request);
      }
    } catch {
      answer = null;
    }

    if (!answer || !(answer.text ?? "").trim()) {
      // The Guardian's core promise: never a silent stop. If the model/tool path
      // fails, the user is told which stage failed.
      degraded = clinicalPath && this.deps.clinicalRespond ? "TOOL_FAILED" : "MODEL_FAILED";
      return {
        turnId,
        text: "Dr. Mayin couldn't complete that step. Nothing was changed. Hospital controls and local commands are fully operational.",
        speechText: "Dr. Mayin here. Please try once more.",
        language,
        speak,
        dashboard,
        risk,
        intent: classification.intent,
        degraded,
      };
    }

    return {
      turnId,
      text: answer.text,
      speechText: answer.text,
      language,
      speak,
      dashboard,
      risk,
      intent: classification.intent,
      actions: answer.actions,
      requiresConfirmation: classification.requiresConfirmation,
    };
  }
}

/** Convenience factory so dashboards share exactly one Guardian shape. */
export function createAstraVoiceGuardian(deps: GuardianDeps): AstraVoiceGuardian {
  return new AstraVoiceGuardian(deps);
}