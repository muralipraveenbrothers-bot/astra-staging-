/**
 * ASTRA AI — Live Capability Registry (Phase 2 §23 / §24)
 * ======================================================
 * Dynamic, truth-first capability reporting for the frontend and operators.
 * Every entry reports configured / reachable / ready from REAL probes — a
 * service that is merely configured is never reported as ready/connected.
 *
 * Language claims carry their source; a provider that is unreachable claims
 * nothing. The frontend consumes this instead of hard-coded assumptions.
 */
import { getAiProvidersHealth } from "../ai/providerRegistry";
import { breakerSnapshot } from "../ai/circuitBreaker";
import { wsGatewayStatus } from "../ws/avatarGateway";
import { isHumanizerAvailable } from "../voice/voiceHumanizer";

export interface ServiceCapability {
  id: string;
  configured: boolean;
  reachable: boolean;
  ready: boolean;
  latencyMs: number | null;
  lastError?: string;
  capabilities?: Record<string, unknown>;
}

export interface VoiceProviderCapability extends ServiceCapability {
  /** Language → supported. Only populated from a reachable provider's own declarations. */
  languages?: Record<string, boolean>;
  /** Where the language claim came from (honest provenance). */
  languageSource?: string;
  languageVerification?: "provider-declared" | "unverified" | "none";
}

const A2F_URL = process.env.A2F_CONTROLLER_URL || "http://127.0.0.1:8283";
const VOICEBOX_URL = process.env.VOICEBOX_URL || "http://127.0.0.1:17493";
const LINLY_URL = process.env.LINLY_BASE_URL || "";
const LINLY_ENABLED = process.env.LINLY_ENABLED === "true";
const LIVE_AVATAR_URL = process.env.LIVE_AVATAR_BASE_URL || "";
const LIVE_AVATAR_ENABLED = process.env.LIVE_AVATAR_ENABLED === "true";

/** Voicebox's own declared language set (server/avatar/astra_voice_core.py LANG_MAP). */
const VOICEBOX_DECLARED_LANGS: Record<string, boolean> = {
  "en-IN": true,
  "hi-IN": true,
  "te-IN": true,
};

async function timedProbe(url: string, timeoutMs: number): Promise<{ reachable: boolean; latencyMs: number; status: number; body?: unknown; error?: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const latencyMs = Date.now() - t0;
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("json") ? await r.json().catch(() => undefined) : undefined;
    return { reachable: true, latencyMs, status: r.status, body };
  } catch (e) {
    return { reachable: false, latencyMs: Date.now() - t0, status: 0, error: e instanceof Error ? e.message.slice(0, 140) : "unreachable" };
  }
}

async function voiceboxCapability(): Promise<VoiceProviderCapability> {
  const p = await timedProbe(`${VOICEBOX_URL}/health`, 2500);
  const base: VoiceProviderCapability = {
    id: "voicebox",
    configured: true,
    reachable: p.reachable,
    ready: p.reachable && Boolean((p.body as { status?: string } | undefined)?.status === "healthy"),
    latencyMs: p.latencyMs,
    ...(p.error ? { lastError: p.error } : {}),
  };
  if (!p.reachable) return base;
  // Language claims: provider-declared, model-load state reported as-is.
  const body = p.body as { model_loaded?: boolean } | undefined;
  return {
    ...base,
    languages: { ...VOICEBOX_DECLARED_LANGS },
    languageSource: "server/avatar/astra_voice_core.py LANG_MAP (en/hi/te)",
    languageVerification: "provider-declared",
        capabilities: {
      streaming: false,
      modelsLoaded: Boolean(body?.model_loaded),
      declaredLanguages: Object.keys(VOICEBOX_DECLARED_LANGS),
      humanizer: isHumanizerAvailable(),
    },
  };
}

async function linlyCapability(): Promise<VoiceProviderCapability> {
  if (!LINLY_ENABLED || !LINLY_URL) {
    return { id: "linly", configured: false, reachable: false, ready: false, latencyMs: null };
  }
  const p = await timedProbe(`${LINLY_URL.replace(/\/$/, "")}/health`, 2500);
  const cap: VoiceProviderCapability = {
    id: "linly",
    configured: true,
    reachable: p.reachable,
    ready: p.reachable && p.status >= 200 && p.status < 500,
    latencyMs: p.latencyMs,
    ...(p.error ? { lastError: p.error } : {}),
  };
  if (p.reachable) {
    // Only claim what the Linly service itself declares in /health.
    const body = (p.body ?? {}) as { capabilities?: Record<string, boolean>; languages?: Record<string, boolean> };
    cap.capabilities = body.capabilities ?? undefined;
    if (body.languages) {
      cap.languages = body.languages;
      cap.languageSource = "linly service /health declaration";
      cap.languageVerification = "provider-declared";
    }
  }
  return cap;
}

async function a2fCapability(): Promise<ServiceCapability> {
  return {
    id: "audio2face",
    configured: false,
    reachable: false,
    ready: false,
    latencyMs: null,
    lastError: "NVIDIA Audio2Face-3D permanently removed",
  };
}

async function liveAvatarCapability(): Promise<ServiceCapability> {
  if (!LIVE_AVATAR_ENABLED || !LIVE_AVATAR_URL) {
    return { id: "live-avatar", configured: false, reachable: false, ready: false, latencyMs: null };
  }
  const p = await timedProbe(`${LIVE_AVATAR_URL.replace(/\/$/, "")}/health`, 2500);
  return {
    id: "live-avatar",
    configured: true,
    reachable: p.reachable,
    ready: p.reachable && p.status >= 200 && p.status < 500,
    latencyMs: p.latencyMs,
    ...(p.error ? { lastError: p.error } : {}),
  };
}

export async function collectLiveCapabilities() {
  const [aiHealth, voicebox, linly, audio2face, liveAvatar] = await Promise.all([
    getAiProvidersHealth().catch(() => []),
    voiceboxCapability(),
    linlyCapability(),
    a2fCapability(),
    liveAvatarCapability(),
  ]);

  const ai: ServiceCapability[] = aiHealth.map((h) => ({
    id: h.id,
    configured: h.keyConfigured || h.status === "healthy",
    reachable: h.status === "healthy" || h.status === "degraded",
    ready: h.status === "healthy",
    latencyMs: h.latencyMs,
    ...(h.detail ? { lastError: h.detail } : {}),
    capabilities: { model: (h as { model?: string }).model },
  }));

  // Language truth matrix: only reachable, language-declaring providers contribute.
  const voiceLanguages: Record<string, string[]> = {};
  for (const v of [voicebox, linly] as VoiceProviderCapability[]) {
    if (!v.reachable || !v.languages) continue;
    for (const [lang, ok] of Object.entries(v.languages)) {
      if (!ok) continue;
      (voiceLanguages[lang] ??= []).push(v.id);
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    ai,
    voice: {
      providers: [voicebox, linly] as ServiceCapability[],
      languages: voiceLanguages,
      textOnlyFallback: true,
    },
    avatar: {
      providers: [audio2face, liveAvatar, linly] as ServiceCapability[],
    },
    websocket: wsGatewayStatus(),
    circuitBreakers: breakerSnapshot(),
  };
}
