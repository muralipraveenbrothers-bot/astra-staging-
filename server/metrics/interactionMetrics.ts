/**
 * ASTRA AI — Interaction Metrics (Phase 2 §29)
 * ============================================
 * Real-time latency/counter capture for the patient interaction pipeline:
 *   STT → AI (first-token/total) → TTS (first-audio) → avatar (first-frame).
 * Counters only and numeric latencies — NO PHI, NO transcript content.
 * In-memory ring buffers bounded in size; safe for the smoke environment.
 */

export type InteractionStage =
  | "stt"
  | "aiFirstToken"
  | "aiTotal"
  | "ttsFirstAudio"
  | "avatarFirstFrame"
  | "total";

const MAX_SAMPLES = 200;

interface MetricsState {
  counters: Record<string, number>;
  latency: Record<InteractionStage, number[]>;
  startedAt: number;
}

const g: MetricsState = {
  counters: {
    interactionsStarted: 0,
    interactionsCompleted: 0,
    providerFallbacks: 0,
    interrupts: 0,
    connectionFailures: 0,
    errors: 0,
  },
  latency: {
    stt: [], aiFirstToken: [], aiTotal: [], ttsFirstAudio: [], avatarFirstFrame: [], total: [],
  },
  startedAt: Date.now(),
};

function pushSample(arr: number[], v: number): void {
  arr.push(Math.round(v));
  if (arr.length > MAX_SAMPLES) arr.shift();
}

export function incCounter(name: keyof typeof g.counters, by = 1): void {
  g.counters[name] = (g.counters[name] ?? 0) + by;
}

export function recordLatency(stage: InteractionStage, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  pushSample(g.latency[stage], ms);
}

function stats(samples: number[]): { count: number; p50: number | null; p95: number | null; last: number | null } {
  if (samples.length === 0) return { count: 0, p50: null, p95: null, last: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { count: sorted.length, p50: pick(0.5), p95: pick(0.95), last: sorted[sorted.length - 1] };
}

export function interactionMetricsSnapshot() {
  return {
    counters: { ...g.counters },
    latencyMs: {
      stt: stats(g.latency.stt),
      aiFirstToken: stats(g.latency.aiFirstToken),
      aiTotal: stats(g.latency.aiTotal),
      ttsFirstAudio: stats(g.latency.ttsFirstAudio),
      avatarFirstFrame: stats(g.latency.avatarFirstFrame),
      total: stats(g.latency.total),
    },
    uptimeSeconds: Math.round((Date.now() - g.startedAt) / 1000),
  };
}

export function resetInteractionMetrics(): void {
  for (const k of Object.keys(g.counters)) g.counters[k] = 0;
  for (const k of Object.keys(g.latency) as InteractionStage[]) g.latency[k] = [];
  g.startedAt = Date.now();
}
