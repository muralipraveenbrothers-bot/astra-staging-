/**
 * ASTRA 7D — CLOUD VOICE TTS ROUTE TESTS (Sarvam + OpenAI Live)
 * ============================================================================
 * Proven here, against a REAL express app and a local stub upstream:
 *
 *   1. No key → health says NOT configured; /tts 503s with a reason and NEVER
 *      calls the upstream provider. The client can therefore fail over honestly.
 *   2. With a key → audio is proxied and the upstream receives the right auth
 *      header, language code and model (Sarvam legacy-shape retry included).
 *   3. The Cloud Privacy Gate refuses identifiable clinical text (403) unless
 *      phiApproved is set — and the upstream is never contacted.
 *   4. Upstream failures surface the REAL status with honest retryability.
 *   5. The browser-side provider class speaks end-to-end through these routes,
 *      proving the client contract (probe → speak → real audio bytes).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";

interface UpstreamHit {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

type StubMode = "sarvam-ok" | "sarvam-legacy" | "openai-ok" | "fail-502" | "empty-audio";

let stub: http.Server;
let stubBase = "";
let mode: StubMode = "sarvam-ok";
let hits: UpstreamHit[] = [];

const SARVAM_AUDIO = Buffer.from("SARVAM-AUDIO-BYTES");
const OPENAI_AUDIO = Buffer.from("OPENAI-AUDIO-BYTES");

beforeAll(async () => {
  stub = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: Record<string, unknown> = {};
      try { body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}; } catch { body = { raw }; }
      hits.push({
        url: req.url ?? "",
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : String(v ?? "")]),
        ),
        body,
      });

      if (mode === "fail-502") {
        res.statusCode = 502;
        res.end("upstream melted");
        return;
      }
      if (mode === "empty-audio") {
        res.setHeader("Content-Type", "audio/mpeg");
        res.end();
        return;
      }
      if (mode === "sarvam-legacy") {
        if (Array.isArray(body.inputs)) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ audios: [SARVAM_AUDIO.toString("base64")] }));
          return;
        }
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "inputs: field required" }));
        return;
      }
      if (mode === "openai-ok") {
        res.setHeader("Content-Type", "audio/mpeg");
        res.end(OPENAI_AUDIO);
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ audios: [SARVAM_AUDIO.toString("base64")] }));
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  stubBase = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()));
});

const KEY_VARS = ["SARVAM_API_KEY", "SARVAM_AI_API_KEY", "OPENAI_API_KEY", "ASTRA_OPENAI_API_KEY"];

/** Re-import the route module with a controlled environment (module reads env once). */
async function loadRoutes(env: Record<string, string> = {}) {
  for (const k of KEY_VARS) delete process.env[k];
  Object.assign(process.env, env);
  process.env.SARVAM_TTS_URL = `${stubBase}/sarvam-tts`;
  process.env.ASTRA_OPENAI_SPEECH_URL = `${stubBase}/openai-speech`;
  hits = [];

  vi.resetModules();
  const { registerCloudVoiceTtsRoutes } = await import("./cloudVoiceTtsRoutes");
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerCloudVoiceTtsRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function postJson(url: string, payload: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

describe("cloud voice routes — unconfigured honesty", () => {
  it("health reports NOT configured for both tiers (and never claims READY)", async () => {
    const app = await loadRoutes();
    try {
      const sarvam = await (await fetch(`${app.base}/api/voice/sarvam/health`)).json() as Record<string, unknown>;
      const openai = await (await fetch(`${app.base}/api/voice/openai-live/health`)).json() as Record<string, unknown>;
      expect(sarvam.ok).toBe(true);
      expect(sarvam.configured).toBe(false);
      expect(String(sarvam.detail)).toContain("NOT configured");
      expect(openai.configured).toBe(false);
      expect(String(openai.detail)).toContain("NOT configured");
    } finally {
      await app.close();
    }
  });

  it("tts 503s with a NOT configured reason and contacts no upstream", async () => {
    const app = await loadRoutes();
    try {
      const sarvam = await postJson(`${app.base}/api/voice/sarvam/tts`, { text: "hello" });
      expect(sarvam.status).toBe(503);
      expect(String(sarvam.body.reason)).toContain("NOT configured");
      expect(sarvam.body.retryable).toBe(false);

      const openai = await postJson(`${app.base}/api/voice/openai-live/tts`, { text: "hello" });
      expect(openai.status).toBe(503);
      expect(String(openai.body.reason)).toContain("NOT configured");

      expect(hits).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});

describe("cloud voice routes — configured synthesis", () => {
  it("proxies Sarvam audio and forwards key, model and language code", async () => {
    mode = "sarvam-ok";
    const app = await loadRoutes({ SARVAM_API_KEY: "test-sarvam-key" });
    try {
      const { status, body } = await postJson(`${app.base}/api/voice/sarvam/tts`, {
        text: "namaste doctor",
        language: "te-IN",
      });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.mimeType).toBe("audio/wav");
      expect(Buffer.from(String(body.audioBase64), "base64")).toEqual(SARVAM_AUDIO);

      expect(hits).toHaveLength(1);
      expect(hits[0].headers["api-subscription-key"]).toBe("test-sarvam-key");
      expect(hits[0].body.language_code).toBe("te-IN");
      expect(hits[0].body.model).toBe("bulbul:v2");
      expect(hits[0].body.text).toBe("namaste doctor");
    } finally {
      await app.close();
    }
  });

  it("retries once with the legacy Sarvam shape instead of reporting a false failure", async () => {
    mode = "sarvam-legacy";
    const app = await loadRoutes({ SARVAM_API_KEY: "test-sarvam-key" });
    try {
      const { status, body } = await postJson(`${app.base}/api/voice/sarvam/tts`, { text: "namaste" });
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      expect(hits).toHaveLength(2);
      expect(hits[1].body.target_language_code).toBe("en-IN");
      expect(Array.isArray(hits[1].body.inputs)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("proxies OpenAI audio with a bearer key", async () => {
    mode = "openai-ok";
    const app = await loadRoutes({ OPENAI_API_KEY: "test-openai-key" });
    try {
      const { status, body } = await postJson(`${app.base}/api/voice/openai-live/tts`, {
        text: "opening laboratory",
        language: "hi-IN",
      });
      expect(status).toBe(200);
      expect(body.mimeType).toBe("audio/mpeg");
      expect(Buffer.from(String(body.audioBase64), "base64")).toEqual(OPENAI_AUDIO);
      expect(hits[0].headers.authorization).toBe("Bearer test-openai-key");
      expect(hits[0].body.response_format).toBe("mp3");
      expect(hits[0].body.instructions).toBe("Speak in hi-IN.");
    } finally {
      await app.close();
    }
  });

  it("an empty upstream audio body is a 503, never a 'spoken' success", async () => {
    mode = "empty-audio";
    const app = await loadRoutes({ OPENAI_API_KEY: "test-openai-key" });
    try {
      const { status, body } = await postJson(`${app.base}/api/voice/openai-live/tts`, { text: "hello" });
      expect(status).toBe(503);
      expect(String(body.reason)).toContain("empty audio");
      expect(body.retryable).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("surfaces the real upstream failure status", async () => {
    mode = "fail-502";
    const app = await loadRoutes({ SARVAM_API_KEY: "test-sarvam-key" });
    try {
      const { status, body } = await postJson(`${app.base}/api/voice/sarvam/tts`, { text: "hello" });
      expect(status).toBe(503);
      expect(String(body.reason)).toMatch(/502|melted|rejected/);
      expect(body.retryable).toBe(true);
    } finally {
      await app.close();
    }
  });
});

describe("cloud voice routes — Cloud Privacy Gate (defence in depth)", () => {
  it("refuses identifiable clinical text with 403 and never contacts the provider", async () => {
    mode = "sarvam-ok";
    const app = await loadRoutes({ SARVAM_API_KEY: "test-sarvam-key" });
    try {
      const { status, body } = await postJson(`${app.base}/api/voice/sarvam/tts`, {
        text: "shift the patient in bed 12 to the ICU",
      });
      expect(status).toBe(403);
      expect(String(body.reason)).toContain("CLOUD_PRIVACY_GATE_BLOCKED");
      expect(body.retryable).toBe(false);
      expect(hits).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("allows the same turn once disclosure is explicitly approved", async () => {
    mode = "sarvam-ok";
    const app = await loadRoutes({ SARVAM_API_KEY: "test-sarvam-key" });
    try {
      const { status } = await postJson(`${app.base}/api/voice/sarvam/tts`, {
        text: "shift the patient in bed 12 to the ICU",
        containsPhi: true,
        phiApproved: true,
      });
      expect(status).toBe(200);
      expect(hits).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it("rejects empty text and over-long text without calling the provider", async () => {
    const app = await loadRoutes({ SARVAM_API_KEY: "test-sarvam-key" });
    try {
      const empty = await postJson(`${app.base}/api/voice/sarvam/tts`, { text: "   " });
      expect(empty.status).toBe(400);
      expect(empty.body.reason).toBe("MISSING_TEXT");

      const huge = await postJson(`${app.base}/api/voice/sarvam/tts`, { text: "a".repeat(1600) });
      expect(huge.status).toBe(400);
      expect(String(huge.body.reason)).toContain("TEXT_TOO_LONG");

      expect(hits).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});

describe("cloud voice routes — browser provider end-to-end", () => {
  /** Point the client's relative routes at the ephemeral test server. */
  function clientFetch(base: string): typeof fetch {
    return ((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(typeof input === "string" ? `${base}${input}` : input, init)) as typeof fetch;
  }

  it("SarvamProvider probes READY and speaks real bytes through the route", async () => {
    mode = "sarvam-ok";
    const app = await loadRoutes({ SARVAM_API_KEY: "test-sarvam-key" });
    try {
      const { SarvamProvider } = await import("../../src/features/mayin/voice/CloudVoiceProviders");
      const played: Blob[] = [];
      const provider = new SarvamProvider({
        fetchImpl: clientFetch(app.base),
        playClip: async (blob) => { played.push(blob); },
      });

      expect(await provider.probe()).toBe(true);
      await provider.speak("opening laboratory", { language: "en-IN" });
      expect(played).toHaveLength(1);
      expect(played[0].size).toBe(SARVAM_AUDIO.length);
      expect(provider.getStatus().lastVoiceOutput).not.toBeNull();
    } finally {
      await app.close();
    }
  });

  it("SarvamProvider stays NOT configured when the server holds no key", async () => {
    const app = await loadRoutes();
    try {
      const { SarvamProvider } = await import("../../src/features/mayin/voice/CloudVoiceProviders");
      const provider = new SarvamProvider({
        fetchImpl: clientFetch(app.base),
        playClip: async () => undefined,
      });

      expect(await provider.probe()).toBe(false);
      expect(provider.getDetail()).toContain("NOT configured");
      await expect(provider.speak("hello")).rejects.toThrow(/NOT configured/);
    } finally {
      await app.close();
    }
  });
});
