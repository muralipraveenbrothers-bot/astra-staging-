/**
 * ASTRA AI — Avatar WebSocket Gateway (Phase 2 §11 / §12 / §14 / §15 / §17)
 * ========================================================================
 * One live, stateful patient conversation per socket:
 *
 *   Browser mic/keyboard ──WS──▶ Astra Avatar Gateway ──▶ Astra Clinical Brain
 *                                                        (AI Gateway providers)
 *        ▲                              │
 *        └── audio chunks + avatar events ◀── TTS router ──▶ A2F (real blendshapes)
 *
 * - Barge-in (§12): `interrupt` / `stop` abort the active TTS chain immediately;
 *   late audio chunks are dropped by sequence guard so old audio never overlaps
 *   the patient.
 * - States (§15) derive from real pipeline events — never faked READY.
 * - Only `speakableText` reaches TTS/A2F (§17); no JSON/traces are spoken.
 * - Production requires a valid session token on the upgrade request.
 */
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { astraOrchestrator, type AvatarMode } from "../orchestrator";
import { validateSessionToken } from "../rbac";
import type { UserSession } from "../types";
import { streamSpeech, normalizeLanguage, type TtsLanguage } from "../voice/ttsRouter";
import { a2fStatus } from "../avatar/a2fClient";
import { renderAvatar } from "../avatar/avatarRouter";
import type { PatientFacingResponse } from "../avatar/types";
import { incCounter, recordLatency } from "../metrics/interactionMetrics";

const WS_PATH = "/ws/avatar";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

let attached = false;
let connectionCount = 0;
const sessionsByUser = new Map<string, Set<Session>>();

export function wsGatewayStatus() {
  return {
    configured: true,
    running: attached,
    path: WS_PATH,
    connections: connectionCount,
  };
}
export function clearAvatarVoiceContext(userId: string): number {
  const sessions = sessionsByUser.get(userId);
  if (!sessions) return 0;
  for (const session of sessions) session.patientContext = undefined;
  return sessions.size;
}

// ─── Wire protocol ───────────────────────────────────────────────────────────

type ClientMessage =
  | { type: "start"; language?: string; mode?: string }
  | { type: "text"; text: string; language?: string }
  | { type: "audio"; data: string; mimeType?: string; language?: string }
  | { type: "interrupt" }
  | { type: "stop" }
  | { type: "ping" };

type ServerMessage =
  | { type: "state"; value: string; detail?: string }
  | { type: "transcript"; text: string }
  | { type: "response"; requestId: string; answer: string; speakableText: string; language: string; urgency: string; redFlags?: string[]; uncertainty?: string; provider?: string; clinical?: unknown }
  | { type: "audio"; seq: number; format: string; data: string; final: boolean }
    | { type: "avatar"; providerId?: string; status: string; broadcastId?: string; frameCount?: number; error?: string; detail?: string }
  | { type: "notice"; notice: string; detail?: string }
  | { type: "error"; message: string }
  | { type: "pong" };

interface Session {
  id: string;
  state: string;
  language: TtsLanguage;
  mode: AvatarMode;
  user: UserSession | null;
  patientContext?: { uhid?: string; name?: string; summary?: string };
  abort: AbortController | null;
  speechEpoch: number;
  startedAt: number;
}

// ─── Speakable text shaping (§17: never speak JSON/traces) ──────────────────

function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")   // code blocks
    .replace(/[*_`#>|]/g, " ")         // markdown decorations
    .replace(/\{[\s\S]*?\}/g, " ")     // inline JSON braces
    .replace(/\s+/g, " ")
    .trim();
}

function buildPatientFacingResponse(res: Awaited<ReturnType<typeof astraOrchestrator.handle>>, language: string): PatientFacingResponse {
  const redFlags = res.clinical?.redFlags ?? [];
  const urgency: PatientFacingResponse["urgency"] =
    res.mode === "emergency" || redFlags.some((f) => /emergency|urgent|call (a )?doctor|911|108/i.test(f))
      ? "emergency"
      : redFlags.length > 0 ? "elevated" : "routine";
  const raw = res.text?.trim() || "";
  return {
    answer: raw,
    speakableText: toSpeakable(raw),
    language,
    urgency,
    redFlags: redFlags.length ? redFlags : undefined,
    uncertainty: res.clinical?.uncertainty,
    requestId: res.requestId,
    clinical: res.clinical,
  };
}

// ─── Attach + message routing ────────────────────────────────────────────────

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function setState(ws: WebSocket, s: Session, value: string, detail?: string): void {
  s.state = value;
  send(ws, { type: "state", value, detail });
}

export function attachAvatarGateway(server: HttpServer): void {
  if (attached) return;
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== WS_PATH) return; // let other upgrades pass through
    const isProduction = process.env.NODE_ENV === "production";
    const token = url.searchParams.get("token") ?? undefined;
    const user = validateSessionToken(token);
    if (isProduction && !user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, user);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, user: UserSession | null) => {
    connectionCount += 1;
    const session: Session = {
      id: `avs-${randomUUID().slice(0, 8)}`,
      state: "CONNECTING",
      language: normalizeLanguage("en"),
      mode: "doctor",
      user,
      abort: null,
      speechEpoch: 0,
      startedAt: Date.now(),
    };
    if (user?.userId) {
      const sessions = sessionsByUser.get(user.userId) ?? new Set<Session>();
      sessions.add(session);
      sessionsByUser.set(user.userId, sessions);
    }
    incCounter("interactionsStarted");

    // Ready is only declared after a REAL capability probe of the avatar layer.
    void (async () => {
      const st = await a2fStatus();
      setState(ws, session, st.ready ? "READY" : st.reachable ? "DEGRADED" : "OFFLINE",
        st.ready ? "avatar pipeline ready" : st.error);
    })();

    ws.on("message", async (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString("utf8")) as ClientMessage;
      } catch {
        send(ws, { type: "error", message: "invalid JSON frame" });
        return;
      }
      try {
        switch (msg.type) {
          case "ping":
            send(ws, { type: "pong" });
            break;
          case "start":
            session.language = normalizeLanguage(msg.language);
            session.mode = (["doctor", "receptionist", "patient_educator", "clinical_copilot", "emergency"].includes(String(msg.mode)) ? msg.mode : session.mode) as AvatarMode;
            setState(ws, session, session.state === "OFFLINE" ? "CONNECTING" : session.state, `session ${session.id} started (${session.mode}/${session.language})`);
            break;
          case "text": {
            const text = String(msg.text || "").trim();
            if (!text) { send(ws, { type: "error", message: "empty text" }); break; }
            if (msg.language) session.language = normalizeLanguage(msg.language);
            if (session.state === "SPEAKING") doInterrupt(ws, session);
            await handleUtterance(ws, session, text);
            break;
          }
          case "audio": {
            const buf = Buffer.from(String(msg.data || ""), "base64");
            if (!buf.length) { send(ws, { type: "error", message: "empty audio" }); break; }
            if (buf.length > MAX_AUDIO_BYTES) { send(ws, { type: "error", message: "audio payload too large" }); break; }
            if (session.state === "SPEAKING") doInterrupt(ws, session);
            await handleAudioUtterance(ws, session, buf, msg.mimeType || "audio/webm", msg.language);
            break;
          }
          case "interrupt":
            doInterrupt(ws, session);
            break;
          case "stop":
            doInterrupt(ws, session, true);
            break;
          default:
            send(ws, { type: "error", message: "unknown message type" });
        }
      } catch (e) {
        incCounter("errors");
        setState(ws, session, "ERROR", e instanceof Error ? e.message.slice(0, 140) : "handler failure");
        send(ws, { type: "error", message: e instanceof Error ? e.message.slice(0, 160) : "handler failure" });
      }
    });

    ws.on("close", () => {
      connectionCount = Math.max(0, connectionCount - 1);
      session.abort?.abort(); // no leaked streams
      if (user?.userId) { const sessions = sessionsByUser.get(user.userId); sessions?.delete(session); if (sessions?.size === 0) sessionsByUser.delete(user.userId); }
    });
    ws.on("error", () => {
      connectionCount = Math.max(0, connectionCount - 1);
      session.abort?.abort();
      if (user?.userId) { const sessions = sessionsByUser.get(user.userId); sessions?.delete(session); if (sessions?.size === 0) sessionsByUser.delete(user.userId); }
    });
  });

  attached = true;
}

// ─── Barge-in (§12) ─────────────────────────────────────────────────────────

function doInterrupt(ws: WebSocket, s: Session, final = false): void {
  if (s.abort) {
    s.abort.abort();
    s.abort = null;
  }
  s.speechEpoch += 1; // late chunks from the old epoch are dropped
  incCounter("interrupts");
  setState(ws, s, "INTERRUPTED", final ? "stopped by user" : "barge-in — patient speaking");
  setState(ws, s, final ? "READY" : "LISTENING");
}

// ─── Conversation pipeline ──────────────────────────────────────────────────

async function handleUtterance(ws: WebSocket, s: Session, text: string): Promise<void> {
  const t0 = Date.now();
  const requestId = `WS-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const epoch = s.speechEpoch;
  setState(ws, s, "THINKING");

  const res = await astraOrchestrator.handle({
    query: text,
    user: s.user ?? ({ userId: "ws-anon", name: "Avatar Session", role: "doctor" } as unknown as UserSession),
    patientContext: s.patientContext,
    language: s.language,
    mode: s.mode,
  });
  recordLatency("aiTotal", Date.now() - t0);
  if (epoch !== s.speechEpoch) return; // interrupted while thinking

  const pfr = buildPatientFacingResponse(res, s.language);
  send(ws, {
    type: "response",
    requestId: pfr.requestId ?? requestId,
    answer: pfr.answer,
    speakableText: pfr.speakableText,
    language: pfr.language,
    urgency: pfr.urgency,
    redFlags: pfr.redFlags,
    uncertainty: pfr.uncertainty,
    provider: res.provider,
    clinical: res.clinical,
  });

  if (!pfr.speakableText) {
    setState(ws, s, "READY", "empty response");
    return;
  }

  // Speech + avatar presentation — cancellable, epoch-guarded.
  s.abort = new AbortController();
  const signal = s.abort.signal;
  setState(ws, s, "SPEAKING", `provider=${res.provider}`);

  const spoken = await streamSpeech(pfr.speakableText, s.language, {
    signal,
    onAudio: async (chunk) => {
      if (epoch !== s.speechEpoch) return;
      send(ws, {
        type: "audio",
        seq: chunk.seq,
        format: "audio/wav",
        data: chunk.audio.toString("base64"),
        final: false,
      });
            // Drive avatar rendering via the fallback chain (A2F → Live Avatar →
      // Linly → voice-only) on first audio. Clinical answer already delivered.
      if (chunk.seq === 0) {
        const b = await renderAvatar({
          text: pfr.speakableText,
          language: s.language,
          mode: s.mode,
          speaker: s.mode === "receptionist" ? "Reception Desk" : "Doctor (White Coat)",
        });
        recordLatency("avatarFirstFrame", Date.now() - t0);
        if (epoch !== s.speechEpoch) return;
        send(ws, {
          type: "avatar",
          status: b.status,
          providerId: b.providerId,
          broadcastId: b.broadcastId,
          frameCount: b.frameCount,
          ...(b.error ? { error: b.error } : {}),
          ...(b.detail ? { detail: b.detail } : {}),
        });
      }
    },
    onNotice: (n) => send(ws, { type: "notice", notice: n.type, detail: n.detail }),
  });

  if (epoch !== s.speechEpoch) return;
  send(ws, { type: "audio", seq: spoken.chunks, format: "audio/wav", data: "", final: true });
  recordLatency("total", Date.now() - t0);
  incCounter("interactionsCompleted");
  setState(ws, s, "READY", spoken.spoken ? `spoken via ${spoken.providerId} (${spoken.chunks} chunks)` : "text-only response");
}

async function handleAudioUtterance(ws: WebSocket, s: Session, audio: Buffer, mimeType: string, language?: string): Promise<void> {
  const t0 = Date.now();
  setState(ws, s, "TRANSCRIBING");
  // Privacy (§20): audio is forwarded for transcription and never persisted.
  try {
    const r = await fetch(`${process.env.VOICEBOX_URL || "http://127.0.0.1:17493"}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": mimeType, "Content-Length": String(audio.length) },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(Number(process.env.ASTRA_STT_TIMEOUT_MS ?? 60_000)),
    });
    recordLatency("stt", Date.now() - t0);
    if (!r.ok) {
      send(ws, { type: "error", message: `STT failed (${r.status})` });
      setState(ws, s, "ERROR", "stt failed");
      return;
    }
    const j = (await r.json()) as { text?: string };
    const text = String(j.text || "").trim();
    if (!text) {
      send(ws, { type: "notice", notice: "empty_transcript" });
      setState(ws, s, "LISTENING");
      return;
    }
    send(ws, { type: "transcript", text });
    if (language) s.language = normalizeLanguage(language);
    await handleUtterance(ws, s, text);
  } catch (e) {
    incCounter("connectionFailures");
    send(ws, { type: "error", message: `STT unavailable: ${e instanceof Error ? e.message.slice(0, 120) : "unreachable"}` });
    setState(ws, s, "DEGRADED", "stt unreachable — use text input");
  }
}


