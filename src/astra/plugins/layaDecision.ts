/**
 * ASTRA — LAYA SYSTEM-1 DECISION ADAPTER (isolated, degradable)
 * ============================================================================
 * Laya is Astra's FAST, BOUNDED decision engine (System 1): choice / score /
 * noul typed decisions in a single non-autoregressive forward pass.
 *
 * It is NOT: a clinical reasoning model, a knowledge base, an EMR, a voice
 * engine or a memory engine.
 *
 * ISOLATION CONTRACT
 * ------------------
 *   Astra  →  LayaDecisionAdapter  →  local isolated Laya runtime (loopback HTTP)
 *
 *   • Astra core never imports Laya; only this adapter speaks to it.
 *   • If the runtime is stopped, unreachable or slow, `decide()` resolves to
 *     { status: "degraded" } — Astra, Dr. Mayin and Hermes keep working. Only
 *     rapid typed-decision acceleration is lost.
 *   • `choice` / `score` / `noul` are ROUTING CONFIDENCE from a general
 *     checkpoint, never "probability the patient has X".
 *
 * CLINICAL USE RULE
 * -----------------
 * A base Laya checkpoint has not been trained, calibrated, subgroup-tested or
 * externally validated on clinical outcomes, so its numbers may only drive
 * routing / sorting / workflow decisions. `isCalibratedForClinicalUse()`
 * returns false until a fine-tuned model has measured sensitivity,
 * specificity, AUROC, PPV, NPV, Brier score, calibration curve, ECE, subgroup
 * performance and external validation.
 */

import { agentBus } from "@/astra/runtime/agentBus";

/** Bounded tasks Laya may accelerate. Anything else is rejected by policy. */
export type LayaBoundedTask =
  | "language_routing"
  | "intent_routing"
  | "department_routing"
  | "command_type"
  | "urgency_classification"
  | "workflow_priority"
  | "document_classification"
  | "missing_data_flag"
  | "possible_emergency_flag"
  | "action_risk_level"
  | "needs_human_confirmation"
  | "note_type"
  | "message_triage";

export const LAYA_BOUNDED_TASKS: readonly LayaBoundedTask[] = [
  "language_routing",
  "intent_routing",
  "department_routing",
  "command_type",
  "urgency_classification",
  "workflow_priority",
  "document_classification",
  "missing_data_flag",
  "possible_emergency_flag",
  "action_risk_level",
  "needs_human_confirmation",
  "note_type",
  "message_triage",
];

/** Laya typed-question definition (mirrors the runtime contract 1:1). */
export interface LayaQuestion {
  type: "choice" | "score" | "noul";
  instructions: string;
  criteria?: Record<string, string> | string[];
}

export interface LayaAnswer {
  type: "choice" | "score" | "noul";
  choice?: string;
  score?: number;
  /** Laya's calibrated probability output for a yes/no question. */
  noul?: number;
  /** Laya's own confidence for this answer — routing confidence only. */
  confidence: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, string>;
}

/** Why a numeric Laya output may never be read as clinical probability. */
export type LayaScoreMeaning = "routing_confidence_not_clinical_probability";

export interface LayaRoutingInfo {
  model?: string;
  repo?: string;
  reason?: string;
}

export type LayaDecisionOutcome =
  | {
      status: "ok";
      task: LayaBoundedTask;
      answers: Record<string, LayaAnswer>;
      routing?: LayaRoutingInfo;
      model?: string;
      latencyMs: number;
      scoreMeaning: LayaScoreMeaning;
    }
  | {
      status: "degraded";
      task: LayaBoundedTask;
      reason: string;
      latencyMs: number;
      scoreMeaning: LayaScoreMeaning;
    }
  | {
      status: "rejected";
      task: string;
      reason: string;
      latencyMs: number;
      scoreMeaning: LayaScoreMeaning;
    };

export interface LayaDiagnostics {
  enabled: boolean;
  baseUrl: string;
  reachable: boolean;
  calls: number;
  degradedCalls: number;
  consecutiveFailures: number;
  lastCallAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
  modelLoaded?: boolean;
  device?: string;
}

/** Approved Astra question templates — one bounded question per task. */
export const LAYA_TASK_QUESTIONS: Record<LayaBoundedTask, Record<string, LayaQuestion>> = {
  language_routing: {
    language: {
      type: "choice",
      instructions: "Which language is this hospital message written or spoken in?",
      criteria: {
        en: "English",
        te: "Telugu",
        hi: "Hindi",
        "te-en": "Telugu mixed with English",
        "hi-en": "Hindi mixed with English",
        mixed_other: "mixed with another language",
      },
    },
  },
  intent_routing: {
    intent: {
      type: "choice",
      instructions: "What does the doctor want Astra to do?",
      criteria: {
        patient_lookup: "find or select a patient",
        lab_query: "retrieve laboratory results or trends",
        report_query: "retrieve a radiology or other report",
        medication_query: "medication list, dose or interaction question",
        order_action: "place, send or change an order",
        workflow_task: "ask another department to do something",
        explanation_request: "explain a concept, mechanism or value",
        unknown: "none of the listed intents",
      },
    },
  },
  department_routing: {
    department: {
      type: "choice",
      instructions: "Which Astra department surface should handle this request?",
      criteria: {
        reception: "registration, appointments, patient movement",
        lab: "laboratory",
        radiology: "radiology or ultrasound",
        pharmacy: "pharmacy",
        ward: "ward or nursing",
        ot: "operation theatre",
        billing: "billing or insurance desk",
        cmrf: "medical records",
        command_centre: "whole-hospital overview",
      },
    },
  },
  command_type: {
    command_type: {
      type: "choice",
      instructions: "Is this message a command, a question, a note or conversation?",
      criteria: {
        command: "imperative instruction",
        question: "information request",
        dictation: "clinical dictation or note content",
        conversation: "greeting or small talk",
      },
    },
  },
  urgency_classification: {
    urgency: {
      type: "score",
      instructions: "How urgent is this request for the hospital?",
      criteria: ["routine", "soon", "urgent", "immediately life-threatening"],
    },
  },
  workflow_priority: {
    priority: {
      type: "score",
      instructions: "What priority should this workflow item receive?",
      criteria: ["background", "low", "normal", "high", "critical"],
    },
  },
  document_classification: {
    document_type: {
      type: "choice",
      instructions: "What kind of hospital document is this?",
      criteria: {
        discharge_summary: "discharge summary",
        progress_note: "progress note",
        lab_report: "laboratory report",
        radiology_report: "radiology report",
        prescription: "prescription or medication chart",
        consent: "consent form",
        referral: "referral letter",
        other: "none of these",
      },
    },
  },
  missing_data_flag: {
    missing_data: {
      type: "noul",
      instructions: "Does this clinical request lack information Astra needs before acting?",
    },
  },
  possible_emergency_flag: {
    emergency_signal: {
      type: "noul",
      instructions: "Does this text contain language suggesting an immediate emergency?",
    },
  },
  action_risk_level: {
    risk: {
      type: "score",
      instructions: "How risky is this action if executed without clinician review?",
      criteria: ["read-only", "draft only", "reversible change", "difficult to reverse", "irreversible"],
    },
  },
  needs_human_confirmation: {
    confirmation_needed: {
      type: "noul",
      instructions: "Does this action need authenticated clinician confirmation first?",
    },
  },
  note_type: {
    note_type: {
      type: "choice",
      instructions: "Which note type is being dictated?",
      criteria: {
        admission: "admission note",
        progress: "progress note",
        procedure: "procedure note",
        consultation: "consultation note",
        discharge: "discharge summary",
        other: "other",
      },
    },
  },
  message_triage: {
    triage: {
      type: "choice",
      instructions: "How should this internal hospital message be triaged?",
      criteria: {
        answer_now: "needs a reply immediately",
        queue: "queue for routine handling",
        route_elsewhere: "belongs to another department",
        ignore_noise: "no action required",
      },
    },
  },
};

// ------------------------------------------------------------------- config

export interface LayaAdapterConfig {
  baseUrl?: string;
  enabled?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:8791";

/** Loopback default; an injected global keeps the runtime URL configurable. */
function defaultBaseUrl(): string {
  const g = globalThis as unknown as { __ASTRA_LAYA_URL__?: string };
  return g.__ASTRA_LAYA_URL__ ?? DEFAULT_BASE_URL;
}

/** Why a numeric Laya output may never be read as a clinical probability. */
export const LAYA_SCORE_MEANING: LayaScoreMeaning = "routing_confidence_not_clinical_probability";

/**
 * Metrics a clinical Laya model must report before its outputs may be read as
 * risk of an outcome (§ disease-specific Laya training). Until then: routing only.
 */
export const LAYA_CLINICAL_CALIBRATION_REQUIREMENTS: readonly string[] = [
  "sensitivity",
  "specificity",
  "AUROC",
  "PPV",
  "NPV",
  "Brier score",
  "calibration curve",
  "ECE",
  "subgroup performance",
  "external validation",
];

// ------------------------------------------------------------------ adapter

export class LayaDecisionAdapter {
  private baseUrl: string;
  private enabled: boolean;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  private calls = 0;
  private degradedCalls = 0;
  private consecutiveFailures = 0;
  private reachable = false;
  private lastCallAt?: string;
  private lastLatencyMs?: number;
  private lastError?: string;
  private modelLoaded?: boolean;
  private device?: string;

  constructor(config: LayaAdapterConfig = {}) {
    this.baseUrl = (config.baseUrl ?? defaultBaseUrl()).replace(/\/$/, "");
    this.enabled = config.enabled ?? true;
    this.timeoutMs = config.timeoutMs ?? 2500;
    this.fetchImpl = config.fetchImpl ?? ((...args) => fetch(...args));
  }

  public configure(config: LayaAdapterConfig): void {
    if (config.baseUrl !== undefined) this.baseUrl = config.baseUrl.replace(/\/$/, "");
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.timeoutMs !== undefined) this.timeoutMs = config.timeoutMs;
    if (config.fetchImpl !== undefined) this.fetchImpl = config.fetchImpl;
  }

  /** Never true for a general checkpoint — clinical validation is missing. */
  public isCalibratedForClinicalUse(): boolean {
    return false;
  }

  public diagnostics(): LayaDiagnostics {
    return {
      enabled: this.enabled,
      baseUrl: this.baseUrl,
      reachable: this.reachable,
      calls: this.calls,
      degradedCalls: this.degradedCalls,
      consecutiveFailures: this.consecutiveFailures,
      lastCallAt: this.lastCallAt,
      lastLatencyMs: this.lastLatencyMs,
      lastError: this.lastError,
      modelLoaded: this.modelLoaded,
      device: this.device,
    };
  }

  /**
   * Run ONE bounded typed decision. Resolves (never rejects) so a stopped Laya
   * runtime can only ever cost speed, never functionality (§56 failure rule).
   */
  public async decide(
    task: LayaBoundedTask | string,
    request: { text: string; state?: Record<string, unknown> | string },
  ): Promise<LayaDecisionOutcome> {
    if (!LAYA_BOUNDED_TASKS.includes(task as LayaBoundedTask)) {
      return {
        status: "rejected",
        task,
        reason:
          "not an approved bounded Laya task — Laya is never asked to diagnose or to estimate clinical probability",
        latencyMs: 0,
        scoreMeaning: LAYA_SCORE_MEANING,
      };
    }
    const boundedTask = task as LayaBoundedTask;
    if (!this.enabled) {
      return this.degrade(boundedTask, "Laya adapter disabled by configuration", 0);
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const direct = import.meta.env?.VITE_LAYA_DIRECT === "1";
      const endpoint = direct ? `${this.baseUrl}/v1/decide` : "/api/reflex/decide";
      const res = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(direct ? {
          task: boundedTask,
          state: request.state ?? request.text,
          questions: LAYA_TASK_QUESTIONS[boundedTask],
        } : {
          schemaId: boundedTask,
          text: request.text,
          pack: "router",
        }),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) return this.degrade(boundedTask, `laya runtime returned ${res.status}`, latencyMs);

      const payload = (await res.json()) as {
        ok?: boolean;
        answers?: Record<string, LayaAnswer>;
        routing?: LayaRoutingInfo;
        model?: string;
        error?: string;
      };
      if (payload.ok === false || !payload.answers || Object.keys(payload.answers).length === 0) {
        return this.degrade(
          boundedTask,
          payload.error ?? "laya runtime returned no usable answers",
          latencyMs,
        );
      }

      this.calls += 1;
      this.consecutiveFailures = 0;
      this.reachable = true;
      this.lastCallAt = new Date().toISOString();
      this.lastLatencyMs = latencyMs;
      this.lastError = undefined;
      publishLayaEvent("laya.decision", boundedTask, latencyMs);

      return {
        status: "ok",
        task: boundedTask,
        answers: payload.answers,
        routing: payload.routing,
        model: payload.model,
        latencyMs,
        scoreMeaning: LAYA_SCORE_MEANING,
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      return this.degrade(boundedTask, err instanceof Error ? err.message : String(err), latencyMs);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Probe the loopback runtime. Never changes overall Astra status. */
  public async health(): Promise<{ reachable: boolean; modelLoaded?: boolean; device?: string }> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/health`);
      if (!res.ok) {
        this.reachable = false;
        return { reachable: false };
      }
      const body = (await res.json()) as { modelLoaded?: boolean; device?: string };
      this.reachable = true;
      this.modelLoaded = body.modelLoaded;
      this.device = body.device;
      return { reachable: true, modelLoaded: body.modelLoaded, device: body.device };
    } catch {
      this.reachable = false;
      return { reachable: false };
    }
  }

  /** Test-only reset — production code never calls this. */
  public __resetForTest(): void {
    this.calls = 0;
    this.degradedCalls = 0;
    this.consecutiveFailures = 0;
    this.reachable = false;
    this.lastCallAt = undefined;
    this.lastLatencyMs = undefined;
    this.lastError = undefined;
  }

  private degrade(task: LayaBoundedTask, reason: string, latencyMs: number): LayaDecisionOutcome {
    this.degradedCalls += 1;
    this.consecutiveFailures += 1;
    this.reachable = false;
    this.lastError = reason;
    this.lastCallAt = new Date().toISOString();
    publishLayaEvent("laya.degraded", task, latencyMs, reason);
    return { status: "degraded", task, reason, latencyMs, scoreMeaning: LAYA_SCORE_MEANING };
  }
}

function publishLayaEvent(
  type: "laya.decision" | "laya.degraded",
  task: string,
  latencyMs: number,
  reason?: string,
): void {
  try {
    agentBus.publish(type, { task, latencyMs, reason });
  } catch {
    // Best-effort visual signal: a bus problem must never break decisions.
  }
}

/** Shared singleton used by the Astra UI and server-side services. */
export const layaDecisionAdapter = new LayaDecisionAdapter();
