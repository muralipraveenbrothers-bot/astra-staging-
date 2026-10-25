/**
 * ASTRA AI — LOCAL VOICEBOX PROXY (/api/voice)
 * ============================================================================
 * Bridges Astra to the local Voicebox runtime (Qwen3-TTS + Whisper, v0.5.0)
 * at http://127.0.0.1:17493. The runtime streams binary audio for TTS and
 * accepts multipart audio for STT — neither survives a plain JSON proxy, so
 * these routes handle the binary protocol directly.
 *
 *   POST /api/voice/speak  { text, profile?, engine? }   -> audio/wav (binary)
 *   POST /api/voice/transcribe  (multipart audio)         -> { text }
 *   GET  /api/voice/models                              -> model status list
 *   POST /api/voice/models/download  { model_name }      -> trigger download
 *   POST /api/voice/models/load  { model_name }           -> load into memory
 *   POST /api/voice/profiles  { name, language, voice_type? } -> create profile
 *   GET  /api/voice/profiles                            -> list profiles
 *   GET  /api/voice/health                              -> runtime health
 *
 * Binary /speak bypasses the JSON body parser via raw-body capture.
 */
import type { Express, Request, Response } from "express";
import { db } from "../db";
import type { UserSession } from "../types";

const VB = "http://127.0.0.1:17493";

// `authenticate` (server/rbac.ts) attaches `req.user`, but Express's Request
// type does not declare it, so the direct cast was TS2352. Route through
// `unknown` to make the assertion explicit.
function who(req: Request): UserSession { return (req as unknown as { user: UserSession }).user; }

/**
 * `Response` is imported from express at the top of this file, so an
 * unqualified `Response` in a *type* position resolves to Express's response
 * object, not the global fetch response. That made every `.ok` / `.status` /
 * `.json()` / `.text()` / `.arrayBuffer()` access below a type error (14 of
 * them) and forced `as any` casts at the call sites.
 *
 * The runtime was never affected: `vbFetch` returns the genuine object from
 * `fetch()`. Only the annotation was wrong. Alias the global type once here
 * and use it everywhere.
 */
type FetchResponse = globalThis.Response;

function vbFetch(path: string, init?: RequestInit): Promise<FetchResponse> {
  return fetch(`${VB}${path}`, { ...init, signal: AbortSignal.timeout(60_000) });
}

export function registerVoiceRoutes(app: Express): void {

  // ---- Health ----
  app.get("/api/voice/health", async (_req, res) => {
    try {
      const r = await vbFetch("/health");
      res.json(await r.json());
    } catch (e) { res.status(503).json({ ok: false, error: String(e) }); }
  });

  // ---- Models ----
  app.get("/api/voice/models", async (_req, res) => {
    try { const r = await vbFetch("/models/status"); res.json(await r.json()); }
    catch (e) { res.status(503).json({ error: String(e) }); }
  });

  app.post("/api/voice/models/download", async (req, res) => {
    const u = who(req);
    try {
      const r = await vbFetch("/models/download", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_name: req.body?.model_name }),
      });
      db.logAudit({
        actorId: u.userId, actorName: u.name, actorRole: u.role,
        action: "voice.model.download", category: "voice", status: "SUCCESS",
        details: String(req.body?.model_name ?? ""),
      });
      res.json(await r.json());
    } catch (e) { res.status(503).json({ error: String(e) }); }
  });

  app.post("/api/voice/models/load", async (req, res) => {
    try {
      const r = await vbFetch("/models/load", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_name: req.body?.model_name }),
      });
      res.json(await r.json());
    } catch (e) { res.status(503).json({ error: String(e) }); }
  });

  // ---- Profiles ----
  app.get("/api/voice/profiles", async (_req, res) => {
    try { const r = await vbFetch("/profiles"); res.json(await r.json()); }
    catch (e) { res.status(503).json({ error: String(e) }); }
  });

  app.post("/api/voice/profiles", async (req, res) => {
    const u = who(req);
    try {
      const r = await vbFetch("/profiles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body ?? {}),
      });
      db.logAudit({
        actorId: u.userId, actorName: u.name, actorRole: u.role,
        action: "voice.profile.create", category: "voice", status: "SUCCESS",
        details: String(req.body?.name ?? ""),
      });
      res.status(r.ok ? 201 : r.status).json(await r.json());
    } catch (e) { res.status(503).json({ error: String(e) }); }
  });

  // ---- TTS: Speak (async generation -> poll -> binary audio out) ----
  app.post("/api/voice/speak", async (req, res) => {
    try {
      const { text, profile, engine } = req.body ?? {};
      if (!text || typeof text !== "string") return res.status(400).json({ error: "MISSING_TEXT" });
      // 1. Trigger async generation
      const genRes = await vbFetch("/speak", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, profile: profile ?? null, engine: engine ?? null }),
      });
      if (!genRes.ok) return res.status(genRes.status).json({ error: "VOICEBOX_SPEAK_FAILED" });
      const gen = await genRes.json();
      const genId = gen.id;
      if (!genId) return res.status(500).json({ error: "VOICEBOX_NO_GEN_ID" });
      // 2. Poll for completion (max 60s). The status endpoint streams SSE
      //    ("data: {...}\n\n"), so we parse the first JSON payload out of it.
      let status = gen.status || "generating";
      const t0 = Date.now();
      const parseSSE = (txt: string) => {
        for (const line of txt.split("\n")) {
          const t = line.trim();
          if (t.startsWith("data:")) { try { return JSON.parse(t.slice(5).trim()); } catch {} }
        }
        return null;
      };
      while (status === "generating" && Date.now() - t0 < 60000) {
        await new Promise((r) => setTimeout(r, 800));
        const s = await vbFetch(`/generate/${genId}/status`);
        if (s.ok) { const txt = await (s as any).text(); const sj = parseSSE(txt); if (sj) status = sj.status || status; } else break;
      }
      if (status !== "completed") return res.status(500).json({ error: "VOICEBOX_GEN_NOT_COMPLETED", status });
      // 3. Fetch the audio bytes
      const audioRes = await vbFetch(`/audio/${genId}`);
      if (!audioRes.ok) return res.status(audioRes.status).json({ error: "VOICEBOX_AUDIO_FETCH_FAILED" });
      const buf = Buffer.from(await audioRes.arrayBuffer());
      res.set({ "Content-Type": "audio/wav", "Content-Length": buf.length }).send(buf);
    } catch (e) { res.status(503).json({ error: "VOICEBOX_UNREACHABLE: " + String(e) }); }
  });

  // ---- STT: Transcribe (multipart audio in) ----
  app.post("/api/voice/transcribe", async (req, res) => {
    try {
      // Forward the raw multipart body to Voicebox
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks);
      const ct = req.headers["content-type"] || "audio/webm";
      const r = await vbFetch("/transcribe", {
        method: "POST",
        headers: { "Content-Type": ct, "Content-Length": String(raw.length) },
        body: raw,
      });
      if (!r.ok) return res.status(r.status).json({ error: "VOICEBOX_STT_FAILED" });
      res.json(await r.json());
    } catch (e) { res.status(503).json({ error: "VOICEBOX_UNREACHABLE: " + String(e) }); }
  });
}
