/**
 * ASTRA AI — Avatar session contracts (Phase 2 §11 / §14 / §15)
 * ============================================================
 * Provider-neutral avatar abstraction. The working A2F path (routes/avatar.ts
 * + server/avatar/*.py) remains the primary provider; adapters sit on top and
 * never replace it. States derive from REAL service/session state only.
 */

export type AvatarConnectionState =
  | "OFFLINE"
  | "CONNECTING"
  | "READY"
  | "LISTENING"
  | "TRANSCRIBING"
  | "THINKING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "DEGRADED"
  | "ERROR";

export interface AvatarSessionInfo {
  sessionId: string;
  providerId: string;
  language: string;
  mode: string;
  startedAt: string;
  state: AvatarConnectionState;
}

export interface AstraAvatarProvider {
  id: string;
  /** Truthful health: configured ≠ reachable ≠ ready. */
  healthCheck(): Promise<{ configured: boolean; reachable: boolean; ready: boolean; latencyMs: number | null; detail?: string }>;
  /** Optional session lifecycle for providers that maintain one. */
  startSession?(language: string, mode: string): Promise<AvatarSessionInfo>;
  stopSession?(sessionId: string): Promise<void>;
}

/** Clinical response contract for patient-facing output (§17). */
export interface PatientFacingResponse {
  answer: string;
  speakableText: string;
  language: string;
  urgency: "routine" | "elevated" | "emergency";
  redFlags?: string[];
  uncertainty?: string;
  requestId?: string;
  clinical?: unknown;
}

/** Base URL of the verified A2F controller microservice (env-overridable). */
export const A2F_BASE = process.env.A2F_CONTROLLER_URL || "http://127.0.0.1:8283";
export const OPENAVATAR_BASE = process.env.OPENAVATAR_URL || "http://127.0.0.1:8282";
export const VOICEBOX_BASE = process.env.VOICEBOX_URL || "http://127.0.0.1:17493";
