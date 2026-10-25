/**
 * ASTRA AI — Optional integrations routes (Phase 2 §8 / §9)
 * ========================================================
 *   GET /api/integrations            → adapter list + attribution
 *   GET /api/integrations/linly      → Linly-Talker health/capabilities
 *   POST /api/integrations/linly/tts → proxy to Linly /tts_response/
 *   GET  /api/integrations/live-avatar → live-avatar health/capabilities
 */
import type { Express, Request, Response } from "express";
import { linlyHealth, linlyCapabilities, linlyTts } from "./linly-talker/adapter";
import { liveAvatarHealth, liveAvatarCapabilities } from "./live-avatar/adapter";

export function registerIntegrationRoutes(app: Express): void {
  app.get("/api/integrations", async (_req: Request, res: Response) => {
    const [linly, liveAvatar] = await Promise.all([linlyCapabilities(), liveAvatarCapabilities()]);
    res.json({ integrations: [linly, liveAvatar] });
  });

  app.get("/api/integrations/linly", async (_req: Request, res: Response) => {
    res.json(await linlyCapabilities());
  });

  app.post("/api/integrations/linly/tts", async (req: Request, res: Response) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "MISSING_TEXT" });
      return;
    }
    const lang = typeof req.body?.lang === "string" ? req.body.lang : "en-IN";
    const result = await linlyTts({ text, lang, voice: typeof req.body?.voice === "string" ? req.body.voice : undefined, method: typeof req.body?.method === "string" ? req.body.method : undefined });
    if (!result.ok) {
      res.status(502).json({ error: "LINLY_TTS_FAILED", detail: result.error });
      return;
    }
    res.setHeader("Content-Type", result.contentType || "audio/wav");
    res.setHeader("X-Linly-Method", result.method);
    res.send(result.audio ?? Buffer.alloc(0));
  });

  app.get("/api/integrations/live-avatar", async (_req: Request, res: Response) => {
    res.json(await liveAvatarCapabilities());
  });

  app.get("/api/integrations/live-avatar/health", async (_req: Request, res: Response) => {
    res.json(await liveAvatarHealth());
  });
}