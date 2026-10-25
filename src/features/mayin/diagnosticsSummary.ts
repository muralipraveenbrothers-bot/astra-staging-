/**
 * MAYIN RUNTIME DIAGNOSTICS → display rows (pure, synchronous)
 * =============================================================
 * Single source of truth for how MayinRuntimeDiagnostics is rendered.
 * Kept free of React and of runtime imports (type-only) so it is trivially
 * unit-testable and safe to import from specs without a DOM.
 *
 * Tones carry meaning, not decoration:
 *   ok      — live observation says this subsystem answered/works
 *   warn    — degraded but usable (or never exercised yet)
 *   error   — observation says this subsystem is failing RIGHT NOW
 *   neutral — informational; no health claim
 * No row may claim "ok" without a real observation (§ types.ts NO FAKE STATUS).
 */

import type { MayinRuntimeDiagnostics } from "./runtime/MayinRuntime";

export interface DiagnosticRow {
  label: string;
  value: string;
  tone: "ok" | "warn" | "error" | "neutral";
}

function clip(s: string, n = 140): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** language is typed `unknown` on the runtime — render it without lying. */
function fmtLanguage(lang: unknown): string {
  if (typeof lang === "string") return lang;
  if (lang && typeof lang === "object") {
    const o = lang as Record<string, unknown>;
    if (typeof o.primaryLanguage === "string") return o.primaryLanguage;
    try {
      return clip(JSON.stringify(o), 60);
    } catch {
      return "[unprintable]";
    }
  }
  if (lang == null) return "unknown";
  return String(lang);
}

export function summarizeDiagnostics(d: MayinRuntimeDiagnostics): DiagnosticRow[] {
  const rows: DiagnosticRow[] = [];

  rows.push({
    label: "Runtime",
    value: d.started ? "started" : "not started (passive observation)",
    tone: "neutral",
  });
  rows.push({ label: "Visual state", value: d.visualState, tone: "neutral" });
  rows.push({ label: "Conversation", value: d.conversationState, tone: "neutral" });
  rows.push({ label: "Language", value: fmtLanguage(d.language), tone: "neutral" });

  // Voice — permission is an OS-level fact; denied is an error, prompt/unknown is not.
  rows.push({
    label: "Voice — microphone",
    value: `permission=${d.voice.microphonePermission} active=${d.voice.microphoneActive}`,
    tone:
      d.voice.microphonePermission === "granted"
        ? "ok"
        : d.voice.microphonePermission === "denied"
          ? "error"
          : "warn",
  });
  rows.push({
    label: "Voice — provider",
    value: `${d.voice.provider} connected=${d.voice.voiceProviderConnected} (${d.voice.conversationState})`,
    tone: d.voice.voiceProviderConnected ? "ok" : "warn",
  });
  rows.push({
    label: "Voice — round trip",
    value: d.voice.roundTripLatency == null ? "not measured" : `${d.voice.roundTripLatency}ms`,
    tone: d.voice.roundTripLatency == null ? "neutral" : d.voice.roundTripLatency <= 1500 ? "ok" : "warn",
  });

  // Voice — tier chain. Only a real manager has tiers; a single provider says so.
  if (!d.voiceTiers) {
    rows.push({
      label: "Voice — tiers",
      value: "single provider (no tier chain)",
      tone: "neutral",
    });
  } else {
    const reasons = d.voiceTiers.outcomes.map((o) =>
      o.skipped ? `${o.id}: skipped (${o.skipped})` : `${o.id}: ${o.error ?? "unknown error"}`,
    );
    rows.push({
      label: "Voice — tiers",
      value: d.voiceTiers.lastSpokenBy
        ? `spoke via ${d.voiceTiers.lastSpokenBy}`
        : d.voiceTiers.outcomes.length === 0
          ? "no speak() attempt yet"
          : clip(`no tier could speak — ${reasons.join("; ")}`),
      tone: d.voiceTiers.lastSpokenBy
        ? "ok"
        : d.voiceTiers.outcomes.length === 0
          ? "neutral"
          : "error",
    });
  }

  // Memory (Cognee behind AstraMemoryGateway) — honest reachability only.
  rows.push({
    label: "Memory — service",
    value: d.memory.memoryServiceReachable ? "reachable" : "unreachable (writes queue, recalls return [])",
    tone: d.memory.memoryServiceReachable ? "ok" : "error",
  });
  rows.push({
    label: "Memory — database",
    value: d.memory.databaseReachable ? "reachable" : "unreachable",
    tone: d.memory.databaseReachable ? "ok" : "error",
  });
  rows.push({
    label: "Memory — queue",
    value: `${d.memory.queueDepth} pending`,
    tone: d.memory.queueDepth === 0 ? "ok" : "warn",
  });
  rows.push({
    label: "Memory — last recall",
    value:
      d.memory.recallLatencyMs == null
        ? (d.memory.lastRecall ?? "never")
        : `${d.memory.lastRecall} · ${d.memory.recallLatencyMs}ms`,
    tone: "neutral",
  });

  // Laya (System-1) — reachable only after a REAL probe/decide observation.
  if (!d.laya.enabled) {
    rows.push({ label: "Laya — reachability", value: "disabled by configuration", tone: "neutral" });
  } else {
    rows.push({
      label: "Laya — reachability",
      value: d.laya.reachable ? `reachable · ${d.laya.baseUrl}` : "not reachable (reflex falls back to rules)",
      tone: d.laya.reachable ? "ok" : "error",
    });
  }
  rows.push({
    label: "Laya — calls",
    value: `${d.laya.calls} calls · ${d.laya.degradedCalls} degraded · ${d.laya.consecutiveFailures} consecutive failures`,
    tone:
      d.laya.calls === 0 ? "neutral" : d.laya.degradedCalls === 0 ? "ok" : "warn",
  });
  rows.push({
    label: "Laya — model",
    value: d.laya.modelLoaded
      ? `loaded · ${d.laya.device ?? "device unknown"}`
      : "not loaded (first /v1/health loads checkpoints)",
    tone: d.laya.modelLoaded ? "ok" : "neutral",
  });
  rows.push({
    label: "Laya — last error",
    value: d.laya.lastError ? clip(d.laya.lastError) : "none",
    tone: d.laya.lastError ? "error" : "neutral",
  });

  // Gesture — null means the optional browser-native engine was never attached.
  if (!d.gesture) {
    rows.push({ label: "Gesture", value: "not attached (optional subsystem)", tone: "neutral" });
  } else {
    rows.push({
      label: "Gesture",
      value: `${d.gesture.state} · camera=${d.gesture.cameraActive} · ${d.gesture.inferenceHz.toFixed(1)} Hz · ${d.gesture.framesProcessed} frames${
        d.gesture.lastError ? ` · ${clip(d.gesture.lastError, 80)}` : ""
      }`,
      tone:
        d.gesture.state === "running"
          ? "ok"
          : d.gesture.state === "unavailable"
            ? "warn"
            : "neutral",
    });
  }

  rows.push({
    label: "Unresolved voice turns",
    value: String(d.unresolvedVoiceTurns),
    tone: d.unresolvedVoiceTurns === 0 ? "ok" : "warn",
  });

  return rows;
}
