// ASTRA AI — Voice round-trip health + latency.
//
// Surfaces exactly which stage of MIC → STT → ROUTER → LLM → TEXT → TTS →
// PLAYBACK is broken, so "nothing happened" can never be the only symptom.
// Every probe is injected, so this file stays free of environment assumptions.

export type VoiceStageKey =
  | "microphone"
  | "stt"
  | "router"
  | "llm"
  | "textDelivery"
  | "tts"
  | "audioPlayback"
  | "websocket";

export interface VoiceStageDiagnostic {
  key: VoiceStageKey;
  label: string;
  ready: boolean;
  detail?: string;
}

export interface VoiceDiagnosticReport {
  ok: boolean;
  stages: VoiceStageDiagnostic[];
  latency: VoiceLatency;
  checkedAt: number;
}

export interface VoiceLatency {
  /** ms from mic press to audio captured */
  capture?: number;
  /** ms for speech → text */
  stt?: number;
  /** ms for the model answer */
  llm?: number;
  /** ms for any tool call inside the turn */
  tool?: number;
  /** ms for text → audio ready */
  tts?: number;
  /** ms from turn start to first audible audio */
  firstAudio?: number;
}

const STAGE_LABELS: Record<VoiceStageKey, string> = {
  microphone: "Microphone",
  stt: "STT",
  router: "Router",
  llm: "LLM",
  textDelivery: "Text delivery",
  tts: "TTS",
  audioPlayback: "Audio playback",
  websocket: "WebSocket",
};

/** Probe signature: return a boolean, a detail string, or an object of both. */
export type VoiceProbe = () =>
  | boolean
  | string
  | { ready: boolean; detail?: string }
  | Promise<boolean | string | { ready: boolean; detail?: string }>;

export type VoiceProbes = Partial<Record<VoiceStageKey, VoiceProbe>>;

function normalize(probe: VoiceProbe, value: unknown): { ready: boolean; detail?: string } {
  if (typeof value === "string") return { ready: value.length > 0 ? true : false, detail: value };
  if (value && typeof value === "object" && "ready" in (value as object)) {
    const v = value as { ready: boolean; detail?: string };
    return { ready: Boolean(v.ready), detail: v.detail };
  }
  return { ready: Boolean(value) };
}

/** Run every supplied probe. Missing probes are reported as `not wired` — never faked. */
export async function collectVoiceDiagnostics(
  probes: VoiceProbes,
  latency: VoiceLatency = {}
): Promise<VoiceDiagnosticReport> {
  const keys = Object.keys(STAGE_LABELS) as VoiceStageKey[];
  const stages: VoiceStageDiagnostic[] = [];

  for (const key of keys) {
    const probe = probes[key];
    const label = STAGE_LABELS[key];
    if (!probe) {
      stages.push({ key, label, ready: false, detail: "not wired" });
      continue;
    }
    try {
      const result = normalize(probe, await probe());
      stages.push({ key, label, ready: result.ready, detail: result.detail });
    } catch (e) {
      stages.push({
        key,
        label,
        ready: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    ok: stages.every((s) => s.ready),
    stages,
    latency,
    checkedAt: Date.now(),
  };
}

/** Ordered latency capture across the round trip (one tracker per turn). */
export function createVoiceLatencyTracker(now: () => number = () => Date.now()) {
  const marks: Partial<Record<VoiceStageKey | "start", number>> = { start: now() };

  return {
    mark(key: VoiceStageKey | "start"): void {
      marks[key] = now();
    },
    /** Elapsed ms between two marks (undefined when either is missing). */
    between(from: VoiceStageKey | "start", to: VoiceStageKey | "start"): number | undefined {
      const a = marks[from];
      const b = marks[to];
      if (a === undefined || b === undefined) return undefined;
      return Math.max(0, b - a);
    },
    snapshot(): VoiceLatency {
      return {
        capture: this.between("microphone", "stt"),
        stt: this.between("stt", "router"),
        llm: this.between("router", "llm"),
        tool: this.between("llm", "textDelivery"),
        tts: this.between("textDelivery", "tts"),
        firstAudio: this.between("start", "audioPlayback"),
      };
    },
  };
}