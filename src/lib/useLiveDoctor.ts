/**
 * ASTRA AI — Live Doctor WebSocket client hook (Phase 2 §11 / §14 / §18)
 * =====================================================================
 * Thin typed client for Astra's /ws/avatar gateway. The server owns the real
 * state machine; this hook only reflects server events into React state so it
 * can never fake READY/SPEAKING on its own. Falls back to text-only REST chat
 * when the WebSocket is unavailable (offline path).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type LiveDoctorState =
  | "OFFLINE" | "CONNECTING" | "READY" | "LISTENING" | "TRANSCRIBING"
  | "THINKING" | "SPEAKING" | "INTERRUPTED" | "DEGRADED" | "ERROR";

export interface WsResponseEvent {
  requestId: string;
  answer: string;
  speakableText: string;
  language: string;
  urgency: string;
  redFlags?: string[];
  uncertainty?: string;
  provider?: string;
  clinical?: unknown;
}

export interface CapabilitySnapshot {
  ai?: { id: string; configured: boolean; ready: boolean; reachable: boolean }[];
  voice?: { providers: { id: string; ready: boolean }[]; languages: Record<string, string[]> };
  avatar?: { providers: { id: string; ready: boolean }[] };
  websocket?: { running: boolean; path?: string };
}

const WS_PROTO = window.location.protocol === "https:" ? "wss" : "ws";
export function useLiveDoctor(opts: { token?: string | null; onResponse?: (r: WsResponseEvent) => void }) {
  const [state, setState] = useState<LiveDoctorState>("OFFLINE");
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [provider, setProvider] = useState<string | undefined>();
  const [avatarStatus, setAvatarStatus] = useState<"offline" | "streaming" | undefined>();
  const [caps, setCaps] = useState<CapabilitySnapshot>({});
  const wsRef = useRef<WebSocket | null>(null);
  const epochRef = useRef(0);
  const audioQueueRef = useRef<{ seq: number; data: string }[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const sendFrame = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);
  // Fetch live capabilities on mount (truth-based status indicators).
  useEffect(() => {
    let alive = true;
    void fetch("/api/capabilities/live")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setCaps(j); })
      .catch(() => { if (alive) setCaps({}); });
    return () => { alive = false; };
  }, []);

  const connect = useCallback(() => {
    epochRef.current += 1;
    const token = opts.token ?? "";
    const ws = new WebSocket(`${WS_PROTO}://${window.location.host}/ws/avatar${token ? `?token=${encodeURIComponent(token)}` : ""}`);
    wsRef.current = ws;
    setConnected(false);
    setState("CONNECTING");

    ws.onopen = () => {
      setConnected(true);
      setState("CONNECTING");
      sendFrame({ type: "start", language: "en-IN", mode: "doctor" });
    };
    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      switch (msg.type) {
        case "state":
          setState((msg.value as LiveDoctorState) ?? "ERROR");
          break;
        case "transcript":
          setTranscript(String(msg.text ?? ""));
          break;
        case "response": {
          const r = msg as unknown as WsResponseEvent;
          setProvider(r.provider);
          opts.onResponse?.(r);
          break;
        }
        case "avatar":
          setAvatarStatus(msg.status === "streaming" ? "streaming" : "offline");
          break;
        case "audio": {
          const chunk = msg as unknown as { seq: number; format: string; data: string; final: boolean };
          if (chunk.final) break;
          audioQueueRef.current.push({ seq: chunk.seq, data: chunk.data });
          void playNextAudio();
          break;
        }
        case "error":
          setState("ERROR");
          break;
        default:
          break;
      }
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      setState((s) => (s === "CONNECTING" || s === "OFFLINE" ? s : "OFFLINE"));
    };
    ws.onerror = () => {
      wsRef.current?.close();
      setState("OFFLINE");
    };
  }, [opts.token, sendFrame]);
  const disconnect = useCallback(() => {
    epochRef.current += 1;
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setState("OFFLINE");
    audioQueueRef.current = [];
  }, []);

  const sendText = useCallback((text: string, language = "en-IN") => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendFrame({ type: "text", text, language });
      return;
    }
    // Text-only REST fallback when the live gateway is unavailable.
    void fetch("/api/ai/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: text, language, mode: "doctor" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.text) opts.onResponse?.({ requestId: j.requestId, answer: j.text, speakableText: j.text, language, urgency: "routine", provider: j.provider });
      })
      .catch(() => setState("ERROR"));
  }, [sendFrame, opts]);

  const sendInterrupt = useCallback(() => {
    epochRef.current += 1;
    audioQueueRef.current = [];
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    sendFrame({ type: "interrupt" });
  }, [sendFrame]);

  const sendAudioBase64 = useCallback((data: string, mimeType: string, language = "en-IN") => {
    // Barge-in: speaking while the user starts talking.
    if (state === "SPEAKING") sendFrame({ type: "interrupt" });
    sendFrame({ type: "audio", data, mimeType, language });
  }, [state, sendFrame]);

  async function playNextAudio() {
    const q = audioQueueRef.current;
    if (!q.length || audioCtxRef.current) return;
    const chunk = q.shift()!;
    try {
      const ctx = audioCtxRef.current = new AudioContext();
      const buf = Uint8Array.from(atob(chunk.data), (c) => c.charCodeAt(0));
      const audioBuf = await ctx.decodeAudioData(buf.buffer.slice(0));
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      src.onended = () => {
        audioCtxRef.current = null;
        void playNextAudio();
      };
      src.start();
    } catch {
      audioCtxRef.current = null;
      void playNextAudio();
    }
  }

  useEffect(() => () => { epochRef.current += 1; wsRef.current?.close(); audioCtxRef.current?.close().catch(() => undefined); }, []);

  return { state, connected, transcript, provider, avatarStatus, caps, connect, disconnect, sendText, sendInterrupt, sendAudioBase64 };
}