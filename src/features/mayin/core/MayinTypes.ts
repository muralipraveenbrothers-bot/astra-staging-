/**
 * ASTRA 7D — DR. MAYIN CORE TYPES
 * ============================================================================
 * Canonical state / context / event vocabulary for the Dr. Mayin interaction
 * layer. States reflect REAL system events (agent bus, voice engine, 7D
 * workflow nodes) — never timer-driven theatre.
 *
 * The "1D → 7D" naming is a clinical reasoning metaphor, not literal
 * dimensional physics. All calculations remain Bayesian / decision-theoretic.
 */

/** Full Mayin visual/agent state set (spec §3) plus legacy view states kept
 *  so existing visualisation panels continue to compile. */
export type MayinState =
  // canonical agent states
  | "idle"
  | "wake"
  | "listening"
  | "understanding"
  | "retrieving"
  | "thinking"
  | "analysing"
  | "comparing"
  | "speaking"
  | "paused"
  | "showing_result"
  | "showing_anatomy"
  | "timeline"
  | "dispatching"
  | "waiting"
  | "attention"
  | "critical"
  | "complete"
  // legacy aliases used by existing panels (mapped 1:1 to canonical states)
  | "vision"
  | "showing-lab"
  | "showing-report"
  | "showing-anatomy"
  | "dispatching-order"
  | "task-complete";

/** Conversation controller lifecycle (spec §13). */
export type ConversationState =
  | "idle"
  | "listening"
  | "user_speaking"
  | "waiting"
  | "thinking"
  | "mayin_speaking"
  | "paused"
  | "interrupted";

/** Turn-taking eagerness (spec §15). Hospital default = NORMAL. */
export type TurnEagerness = "LOW" | "NORMAL" | "FAST";

/** Visual quality tiers (spec §6). Never degrades clinical data paths. */
export type VisualQuality = "HIGH" | "BALANCED" | "LOW";

/** Multilingual router state (spec §25). */
export interface LanguageState {
  primaryLanguage: MayinLanguage;
  secondaryLanguage: MayinLanguage | null;
  codeSwitching: boolean;
  confidence: number; // 0..1 — script/token evidence only, not model probability
}

export type MayinLanguage = "en" | "te" | "hi" | "te-en" | "hi-en" | "unknown";

/**
 * Global context pointer (spec §34) — lets "this / that / him / continue"
 * resolve against the doctor's actual current selection.
 */
export interface MayinContext {
  userId: string;
  role: string;
  patientId?: string;
  encounterId?: string;
  module?: string;
  selectedObject?: unknown;
  selectedLabId?: string;
  selectedReportId?: string;
  selectedAnatomyNode?: string;
  selectedMedicationId?: string;
  activeAnalysisId?: string;
  activeTaskId?: string;
}

/** Events the Mayin visual engine understands (spec §60 + voice/d7 wiring). */
export type MayinEventType =
  | "patient.registered"
  | "patient.selected"
  | "lab.query.started"
  | "lab.query.completed"
  | "lab.resulted"
  | "lab.critical"
  | "radiology.query.started"
  | "radiology.reported"
  | "radiology.critical"
  | "evidence.search.started"
  | "reasoning.started"
  | "reasoning.completed"
  | "d7.node"
  | "voice.listening"
  | "voice.transcript"
  | "voice.speaking"
  | "voice.paused"
  | "voice.interrupted"
  | "pharmacy.order.created"
  | "pharmacy.order.acknowledged"
  | "pharmacy.order.dispensed"
  | "pharmacy.order.failed"
  | "task.created"
  | "task.acknowledged"
  | "task.completed"
  | "task.failed"
  | "confirmation.required"
  | "critical.acknowledged"
  // System-1 (Laya) reflex signals — informational only, never clinical.
  | "laya.decision"
  | "laya.degraded"
  // Browser-native gesture/vision signals (§32, §47).
  | "gesture.command"
  | "gesture.engine.started"
  | "gesture.engine.stopped"
  | "vision.camera.started"
  | "vision.camera.stopped"
  | "vision.analysis.completed"
  // AstraMemoryGateway signals (§48).
  | "memory.remembered"
  | "memory.recalled"
  | "memory.degraded";

export interface MayinEvent {
  type: MayinEventType;
  payload?: Record<string, unknown>;
  ts?: number;
}

/** One node of the department constellation that fired an event. */
export type AstraDepartmentNode =
  | "lab"
  | "radiology"
  | "pharmacy"
  | "reception"
  | "ward"
  | "billing"
  | "ot"
  | "cmrf";
