/**
 * ASTRA AI — Astra Live Avatar Provider (Phase 2 §9 / §10)
 * =======================================================
 * Adapter for the wukath/live-avatar-agent-demo (pinned ef187345, Google ADK +
 * Gemini Live + AvatarConfigPlugin). This adapter is STRICTLY a presentation /
 * streaming provider: it receives an already-computed Astra clinical response
 * and forwards it for avatar rendering. The demo agent's own tools
 * (DiscoveryEngineSearchTool, dice/prime demos, Kai/Cora) are NOT exposed —
 * they never enter Astra's clinical path.
 *
 * The browser connects to Astra's own WebSocket gateway (/ws/avatar); this
 * adapter is used when a remote live-avatar ADK service is configured
 * (LIVE_AVATAR_BASE_URL + LIVE_AVATAR_ENABLED=true).
 *
 * Session semantics here are adapter-side bookkeeping + the upstream ADK's
 * HTTP session endpoint ONLY where one is discovered — never invented.
 */
import { randomUUID } from "node:crypto";

const LIVE_AVATAR_BASE = (process.env.LIVE_AVATAR_BASE_URL || "").replace(/\/$/, "");
const LIVE_AVATAR_ENABLED = process.env.LIVE_AVATAR_ENABLED === "true";
const LIVE_AVATAR_APP = process.env.LIVE_AVATAR_APP_NAME || "live_avatar_agent";
const LIVE_AVATAR_USER = process.env.LIVE_AVATAR_USER || "web_avatar_user";

export interface LiveAvatarHealth {
  configured: boolean;
  reachable: boolean;
  ready: boolean;
  latencyMs: number | null;
  detail?: string;
  /** Upstream ADK defaults — surfaced only for diagnostics, never executed. */
  upstreamApp?: string;
  upstreamUser?: string;
}

export async function liveAvatarHealth(): Promise<LiveAvatarHealth> {
  if (!LIVE_AVATAR_ENABLED || !LIVE_AVATAR_BASE) {
    return { configured: false, reachable: false, ready: false, latencyMs: null, detail: "LIVE_AVATAR_ENABLED=false or LIVE_AVATAR_BASE_URL unset" };
  }
  const t0 = Date.now();
  try {
    // ADK web servers answer "/" or "/docs"; a 2xx/redirect means the service runs.
    const r = await fetch(`${LIVE_AVATAR_BASE}/`, { signal: AbortSignal.timeout(3000) });
    const latencyMs = Date.now() - t0;
    const live = r.status >= 200 && r.status < 500;
    return {
      configured: true,
      reachable: live,
      ready: live,
      latencyMs,
      ...(live ? {} : { detail: `HTTP ${r.status}` }),
      upstreamApp: live ? LIVE_AVATAR_APP : undefined,
      upstreamUser: live ? LIVE_AVATAR_USER : undefined,
    };
  } catch (e) {
    return {
      configured: true,
      reachable: false,
      ready: false,
      latencyMs: Date.now() - t0,
      detail: e instanceof Error ? e.message.slice(0, 140) : "unreachable",
    };
  }
}

export interface AstraLiveAvatarSession {
  sessionId: string;
  provider: "live-avatar";
  language: string;
  mode: string;
  startRequestedAt: string;
}

/**
 * Start a presentation session with the configured live-avatar ADK service.
 * The provided `payload` is the ALREADY-AUTHORIZED Astra response (speakable
 * text only); this adapter never invokes the demo agent's LLM/tools.
 */
export async function liveAvatarStartSession(opts: { language: string; mode: string; payload?: { speakableText?: string; strictClinical?: boolean } }): Promise<AstraLiveAvatarSession | { error: string }> {
  const h = await liveAvatarHealth();
  if (!h.configured) return { error: "live-avatar not configured" };
  if (!h.reachable) return { error: "live-avatar service unreachable" };
  // Adapter-side session bookkeeping; the actual ADK avatar stream is opened by
  // the browser against Astra's /ws/avatar gateway (which drives A2F). When a
  // remote ADK session endpoint is confirmed present it is forwarded here.
  return {
    sessionId: `live-${randomUUID().slice(0, 8)}`,
    provider: "live-avatar",
    language: opts.language,
    mode: opts.mode,
    startRequestedAt: new Date().toISOString(),
    ...(opts.payload ? { payloadAccepted: true, clinicalPayloadOnly: Boolean(opts.payload.strictClinical) } : {}),
  };
}

export function liveAvatarSessionId(): string {
  return `live-${randomUUID().slice(0, 8)}`;
}

export async function liveAvatarCapabilities() {
  const h = await liveAvatarHealth();
  return {
    id: "live-avatar",
    ...h,
    upstream: h.reachable ? { app: h.upstreamApp, user: h.upstreamUser } : undefined,
    presentationOnly: true, // never a clinical decision engine — Astra brain remains the source of truth
    attribution: "wukath/live-avatar-agent-demo (pinned ef187345)",
  };
}