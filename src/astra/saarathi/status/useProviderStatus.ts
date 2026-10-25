/**
 * ASTRA SAARATHI — Truthful provider status (repair prompt §J / §K / §19).
 * =======================================================================
 * One hook, ONE rule: every label on screen must come from a real probe or a
 * real turn that already happened.
 *
 * Sources (all REAL):
 *   GET /api/voice/providers/status  → voicebox / gemini / stt (server probes)
 *   GET /api/health/ai               → brain chain (FreeLLMAPI, OmniRoute, Ollama,
 *                                      Gemini, Hermes, LangGraph, n8n, …)
 *   ttsPriority.lastVoiceProviders   → which speaker actually produced audio
 *   sttPriority.lastSttProvider      → which ear actually produced the transcript
 *
 * A 10 s poll (plus an immediate probe on mount and on visibility change) means a
 * service that comes back up is detected automatically — Voicebox is never left
 * marked OFFLINE just because it was down when the page first mounted (§K).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderState, ProviderStatus } from "@/astra/voice/providers/voiceContracts";
import { lastVoiceProviders } from "@/astra/voice/providers/ttsPriority";
import { lastSttProvider } from "@/astra/voice/providers/sttPriority";

export interface BrainProviderStatus {
  id: string;
  state: ProviderState;
  detail?: string;
  latencyMs?: number;
}

export interface SaarathiProviderStatus {
  checkedAt: number;
  checking: boolean;
  /** Reasoning chain, in preference order. */
  brain: BrainProviderStatus[];
  /** Speaker chain, in preference order. */
  tts: ProviderStatus[];
  /** Listener chain, in preference order. */
  stt: ProviderStatus[];
  lastAnswerProvider?: string;
  lastTtsProvider?: string;
  lastSttProvider?: string;
  /** Aggregated one-liners used by the local intent brain's status answers. */
  voiceSummary: string;
  systemSummary: string;
  error?: string;
}

interface ServerVoiceStatus {
  checkedAt: number;
  tts: { order: string[]; providers: Array<{ id: string; label: string; role: string; state: string; detail: string; latencyMs?: number }> };
  stt: { order: string[]; providers: Array<{ id: string; label: string; role: string; state: string; detail: string; latencyMs?: number }> };
  brain: Array<{ id: string; state: string; detail?: string; latencyMs?: number }>;
  error?: string;
}

interface AiHealth {
  services?: Record<string, {
    reachable?: boolean;
    authenticated?: boolean | null;
    latencyMs?: number;
    error?: string;
    keyConfigured?: boolean;
  }>;
  primary?: string;
  fallback?: string;
  local?: string;
}

const KNOWN_STATES = new Set(["OFF", "CHECKING", "READY", "ACTIVE", "DEGRADED", "DISABLED", "NOT_CONFIGURED", "ERROR"]);

function toProviderState(value: string | undefined): ProviderState {
  const upper = String(value ?? "").toUpperCase().replace(/\s+/g, "_");
  return KNOWN_STATES.has(upper) ? (upper as ProviderState) : "CHECKING";
}

function rowToProvider(row: { id: string; label: string; role: string; state: string; detail: string; latencyMs?: number }): ProviderStatus {
  return {
    id: row.id,
    label: row.label,
    role: row.role,
    state: toProviderState(row.state),
    detail: row.detail,
    latencyMs: row.latencyMs,
    checkedAt: Date.now(),
  };
}

const EMPTY: SaarathiProviderStatus = {
  checkedAt: 0,
  checking: true,
  brain: [],
  tts: [],
  stt: [],
  voiceSummary: "voice status is still being checked",
  systemSummary: "system status is still being checked",
};

export function useProviderStatus(intervalMs = 10_000): SaarathiProviderStatus {
  const [status, setStatus] = useState<SaarathiProviderStatus>(EMPTY);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [voiceRes, aiRes] = await Promise.all([
        fetch("/api/voice/providers/status", { signal: AbortSignal.timeout(12_000) }),
        fetch("/api/health/ai", { signal: AbortSignal.timeout(12_000) }).catch(() => null),
      ]);

      const voice: ServerVoiceStatus = voiceRes.ok
        ? await voiceRes.json()
        : {
            checkedAt: Date.now(),
            tts: { order: [], providers: [] },
            stt: { order: [], providers: [] },
            brain: [],
            error: `voice status HTTP ${voiceRes.status}`,
          };

      const ai: AiHealth = aiRes && aiRes.ok ? await aiRes.json() : {};
      const services = ai.services ?? {};

      // ---- BRAIN: real per-provider state ------------------------------
      const order = [ai.primary, ai.fallback, ai.local].filter((x): x is string => Boolean(x));
      const seen = new Set<string>();
      const brain: BrainProviderStatus[] = [];
      for (const id of [...order, ...Object.keys(services)]) {
        if (id === "astra" || seen.has(id)) continue;
        seen.add(id);
        const svc = services[id];
        if (!svc) continue;
        // READY only when the probe really reached it AND it was not rejected for
        // credentials. Merely being listed is not evidence of anything.
        const state: ProviderState = svc.reachable
          ? svc.authenticated === false
            ? "DEGRADED"
            : "READY"
          : svc.keyConfigured
            ? "DEGRADED"
            : "NOT_CONFIGURED";
        brain.push({
          id,
          state,
          detail: svc.reachable ? undefined : svc.error ?? "unreachable",
          latencyMs: svc.latencyMs,
        });
      }
      for (const b of voice.brain ?? []) {
        if (!brain.some((x) => x.id === b.id)) {
          brain.push({ id: b.id, state: toProviderState(b.state), detail: b.detail, latencyMs: b.latencyMs });
        }
      }

      const tts = (voice.tts?.providers ?? []).map(rowToProvider);
      const stt = (voice.stt?.providers ?? []).map(rowToProvider);

      const readyCount = brain.filter((b) => b.state === "READY").length;
      const voicebox = tts.find((p) => p.id === "voicebox");
      const voiceSummary = voicebox
        ? `Voicebox ${voicebox.state.toLowerCase()}${voicebox.latencyMs ? ` (${voicebox.latencyMs} ms)` : ""}; ${readyCount} of ${brain.length} reasoning providers ready`
        : `${readyCount} of ${brain.length} reasoning providers ready`;

      setStatus({
        checkedAt: Date.now(),
        checking: false,
        brain,
        tts,
        stt,
        lastAnswerProvider: lastVoiceProviders.tts,
        lastTtsProvider: lastVoiceProviders.tts,
        lastSttProvider: lastSttProvider.value,
        voiceSummary,
        systemSummary: `${readyCount} of ${brain.length} reasoning providers ready`,
        error: voice.error,
      });
    } catch (e) {
      setStatus((prev) => ({
        ...prev,
        checking: false,
        checkedAt: Date.now(),
        error: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    }, intervalMs);
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);

  return status;
}