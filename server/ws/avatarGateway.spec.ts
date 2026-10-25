/**
 * ASTRA AI — Avatar WebSocket gateway tests (Phase 2 §11 / §12 / §36)
 * ==================================================================
 * Real HTTP server + real ws client driving the /ws/avatar gateway.
 * The avatar probe is REAL (against a local stub A2F controller) so the
 * gateway's READY state derives from a genuine probe; only the orchestrator
 * and TTS router are mocked for speed/determinism. Verifies connect/state,
 * text interaction, barge-in/interrupt, stop, and production auth.
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";

vi.mock("../orchestrator", () => ({
  astraOrchestrator: {
    handle: vi.fn(async (req: { query: string; language?: string; mode?: string }) => ({
      requestId: "orchestrated-1",
      task: "general_assistant",
      text: "Hello from the clinical brain.",
      provider: "freellmapi",
      language: req.language ?? "en-IN",
      mode: req.mode ?? "doctor",
      safetyFlags: [],
      providerUsed: ["freellmapi"],
      fallbackUsed: false,
      clinical: { uncertainty: "none", redFlags: [] },
    })),
  },
}));

vi.mock("../voice/ttsRouter", () => ({
  streamSpeech: vi.fn(async (_text: string, _lang: string, opts: { signal: AbortSignal; onAudio: (c: { seq: number; audio: Buffer; providerId: string }) => void | Promise<void> }) => {
    if (opts.signal.aborted) return { spoken: false, providerId: null, chunks: 0 };
    await opts.onAudio({ seq: 0, audio: Buffer.from("fake-wav-bytes"), providerId: "voicebox" });
    return { spoken: true, providerId: "voicebox", chunks: 1 };
  }),
  normalizeLanguage: (l?: string) => l ?? "en-IN",
}));

import { attachAvatarGateway } from "./avatarGateway";
import { astraOrchestrator } from "../orchestrator";
import { streamSpeech } from "../voice/ttsRouter";

let server: http.Server;
let port = 0;
let wss: WebSocket;
let a2fStub: http.Server;
let a2fPort = 0;

beforeAll(async () => {
  a2fStub = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ engine: "NVIDIA_AUDIO2FACE_3D", status: "READY", voiceboxReachable: true }));
  });
  await new Promise<void>((resolve) => a2fStub.listen(0, "127.0.0.1", resolve));
  a2fPort = (a2fStub.address() as AddressInfo).port;
  process.env.A2F_CONTROLLER_URL = `http://127.0.0.1:${a2fPort}`;

  server = http.createServer((_req, res) => { res.end("ok"); });
  attachAvatarGateway(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  wss?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => a2fStub.close(() => resolve()));
});

beforeEach(() => {
  vi.mocked(astraOrchestrator.handle).mockClear();
  vi.mocked(streamSpeech).mockClear();
  process.env.NODE_ENV = "development";
});
function openClient(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/avatar`);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function waitFor(ws: WebSocket, predicate: (m: Record<string, unknown>) => boolean, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off("message", onMsg); reject(new Error("timeout waiting for message")); }, timeoutMs);
    function onMsg(raw: WebSocket.RawData) {
      const m = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (predicate(m)) { clearTimeout(timer); ws.off("message", onMsg); resolve(m); }
    }
    ws.on("message", onMsg);
  });
}

describe("avatar websocket gateway lifecycle", () => {
  it("connects and reports READY from the REAL A2F probe (stub controller)", async () => {
    wss = await openClient();
    const st = await waitFor(wss, (m) => m.type === "state" && (m.value === "READY" || m.value === "OFFLINE" || m.value === "DEGRADED"));
    expect(st.value).toBe("READY");
    wss.close();
  });

  it("handles a text utterance: response event + SPEAKING state", async () => {
    wss = await openClient();
    await waitFor(wss, (m) => m.type === "state");
    wss.send(JSON.stringify({ type: "text", text: "Explain this report in simple terms", language: "en-IN" }));
    const resp = await waitFor(wss, (m) => m.type === "response");
    expect(resp.answer).toContain("clinical brain");
    expect(resp.urgency).toBe("routine");
    expect(vi.mocked(astraOrchestrator.handle)).toHaveBeenCalled();
    wss.close();
  });

  it("barge-in: interrupt aborts the TTS chain and emits INTERRUPTED", async () => {
    wss = await openClient();
    await waitFor(wss, (m) => m.type === "state");
    wss.send(JSON.stringify({ type: "text", text: "Say your full clinical summary now" }));
    await waitFor(wss, (m) => m.type === "response");
    wss.send(JSON.stringify({ type: "interrupt" }));
    const interrupted = await waitFor(wss, (m) => m.type === "state" && String(m.value).startsWith("INTERRUPTED"), 3000).catch(() => null);
    expect(interrupted).not.toBeNull();
    wss.close();
  });

  it("stop suppresses further speech and returns to READY", async () => {
    wss = await openClient();
    await waitFor(wss, (m) => m.type === "state");
    wss.send(JSON.stringify({ type: "text", text: "Short." }));
    await waitFor(wss, (m) => m.type === "response");
    wss.send(JSON.stringify({ type: "stop" }));
    const final = await waitFor(wss, (m) => m.type === "state" && m.value === "READY", 3000).catch(() => null);
    expect(final).not.toBeNull();
    wss.close();
  });
});

describe("avatar websocket production auth", () => {
  it("rejects a tokenless upgrade in production (401)", async () => {
    process.env.NODE_ENV = "production";
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/avatar`);
      ws.once("unexpected-response", (_req, res) => {
        expect(res.statusCode).toBe(401);
        res.resume();
        if (ws.readyState === WebSocket.OPEN) ws.close();
        resolve();
      });
      ws.once("open", () => { ws.close(); reject(new Error("should not connect without a token in production")); });
      setTimeout(() => reject(new Error("no rejection observed")), 3000);
    });
  });
});