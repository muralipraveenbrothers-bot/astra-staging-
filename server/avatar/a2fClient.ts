/**
 * ASTRA AI — A2F client (Phase 2 §4)
 * ==================================
 * Typed client for the VERIFIED working A2F controller (server/avatar/*.py on
 * :8283). Same endpoints, same env override, same honesty rules as
 * server/routes/avatar.ts — this is a reusable client extracted for the
 * WebSocket gateway and voice pipeline, NOT a replacement of the live path.
 */
import { OPENAVATAR_BASE } from "./types";

function a2fBase(): string {
  return (process.env.A2F_CONTROLLER_URL || "http://127.0.0.1:8283").replace(/\/$/, "");
}

export interface A2FStatus {
  reachable: boolean;
  ready: boolean;
  engine?: string;
  status?: string;
  voiceboxReachable?: boolean;
  error?: string;
}

export interface A2FBroadcastResult {
  success: boolean;
  frameCount: number;
  broadcastId?: string;
  raw?: unknown;
  error?: string;
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: unknown; error?: string }> {
  try {
    const r = await fetch(url, init);
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("json") ? await r.json().catch(() => ({})) : {};
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    // Surface the undici cause (ECONNREFUSED / ECONNRESET / timeout) — a bare
    // "fetch failed" hides the actual network reason and breaks diagnostics.
    const c0 = (e as { cause?: { code?: string; message?: string; cause?: { code?: string; message?: string; errno?: number; syscall?: string } } })?.cause;
    const detail = e instanceof Error ? e.message : "unreachable";
    const parts = [c0?.code, c0?.message, c0?.cause?.code, c0?.cause?.message ? `deep:${c0.cause.message}` : null, c0?.cause?.syscall ? `syscall:${c0.cause.syscall}` : null].filter(Boolean);
    return { ok: false, status: 0, body: {}, error: `${detail}${parts.length ? ` [${parts.join(" | ")}]` : ""}`.slice(0, 200) };
  }
}

/** Probe the A2F controller status. Never fakes readiness. */
export async function a2fStatus(timeoutMs = 2500): Promise<A2FStatus> {
  const r = await fetchJson(`${a2fBase()}/api/avatar/status`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok && r.status === 0) {
    return { reachable: false, ready: false, error: r.error || "A2F controller unreachable" };
  }
  const b = r.body as { engine?: string; status?: string; voiceboxReachable?: boolean };
  return {
    reachable: true,
    ready: b.status === "READY",
    engine: b.engine,
    status: b.status,
    voiceboxReachable: b.voiceboxReachable,
    ...(b.status !== "READY" ? { error: `controller status ${b.status}` } : {}),
  };
}

/** Push a text broadcast through the real A2F controller (blendshapes out). */
export async function a2fBroadcast(payload: {
  text: string;
  mode?: "voice" | "avatar" | "text";
  language?: string;
  speaker?: string;
}, timeoutMs = Number(process.env.ASTRA_AVATAR_TIMEOUT_MS ?? 8000)): Promise<A2FBroadcastResult> {
  const r = await fetchJson(`${a2fBase()}/api/avatar/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (r.status === 0) {
    return { success: false, frameCount: 0, error: r.error || "A2F unreachable" };
  }
  const b = r.body as { success?: boolean; broadcast?: { id?: string; frameCount?: number }; error?: string };
  return {
    success: Boolean(b.success),
    frameCount: b.broadcast?.frameCount ?? 0,
    broadcastId: b.broadcast?.id,
    raw: r.body,
    ...(b.error ? { error: b.error } : {}),
  };
}

/** Probe OpenAvatarChat/LiteAvatar (secondary presentation provider). */
export async function openAvatarStatus(timeoutMs = 2500): Promise<{ reachable: boolean; status: string; error?: string }> {
  const r = await fetchJson(`${OPENAVATAR_BASE}/`, { signal: AbortSignal.timeout(timeoutMs) });
  const live = r.status > 0 && r.status < 500;
  return {
    reachable: live,
    status: live ? "LIVE" : "OFFLINE",
    ...(live ? {} : { error: r.error || "OpenAvatarChat unreachable" }),
  };
}
