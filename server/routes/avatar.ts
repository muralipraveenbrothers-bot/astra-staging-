/**
 * Avatar HTTP surface after NVIDIA Audio2Face-3D and OpenAvatarChat were
 * unavailable. Status endpoints report OFFLINE. Speak still probes
 * Voicebox only (no fake A2F).
 */
import type { Express, Request, Response } from "express";
import { authenticate } from "../rbac";
import { a2fBroadcast, a2fStatus } from "../avatar/a2fClient";
import { normalizeLanguage } from "../voice/ttsRouter";
import { resolveLanguage } from "../voice/langDetector";

const VOICEBOX = process.env.VOICEBOX_URL || "http://127.0.0.1:17493";

async function probe(url: string, timeoutMs = 2500): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export function registerAvatarRoutes(app: Express): void {
  app.get("/api/avatar/status", authenticate, async (_req: Request, res: Response) => {
    const status = await a2fStatus();
    if (!status.reachable) {
      res.json({ status: "OFFLINE", engine: "audio2face", reachable: false, error: status.error || "A2F controller unreachable" });
      return;
    }
    res.json({ status: status.status, engine: status.engine, reachable: true, error: status.error });
  });
  app.get("/api/avatar/openavatar", authenticate, async (_req: Request, res: Response) => {
    const status = await a2fStatus();
    res.json({ status: status.reachable ? status.status : "OFFLINE", reachable: status.reachable, error: status.error });
  });
  app.post("/api/avatar/broadcast", authenticate, async (req: Request, res: Response) => {
    const status = await a2fStatus();
    if (!status.reachable || !status.ready) {
      res.status(503).json({ success: false, status: "OFFLINE", error: status.error || "A2F controller unreachable" });
      return;
    }
    const result = await a2fBroadcast({ text: typeof req.body?.text === "string" ? req.body.text : "" });
    res.status(result.success ? 200 : 503).json(result);
  });
  app.post("/api/avatar/speak", authenticate, async (req: Request, res: Response) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "MISSING_TEXT" });
      return;
    }
    const language = normalizeLanguage(resolveLanguage(typeof req.body?.language === "string" ? req.body.language : undefined, text));
    const vbHealth = await probe(`${VOICEBOX}/health`);
    const voiceLive = vbHealth.ok || vbHealth.status > 0;
    res.status(voiceLive ? 200 : 410).json({
      success: voiceLive,
      status: voiceLive ? "DEGRADED" : "OFFLINE",
      text,
      language,
      audio2face: { live: false, error: "Audio2Face did not speak this turn." },
      voicebox: { live: voiceLive, error: voiceLive ? undefined : vbHealth.error || "Voicebox unreachable" },
      note: "Speech uses Voicebox. Avatar video is separate.",
    });
  });
}
