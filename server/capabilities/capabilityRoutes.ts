/**
 * ASTRA AI — Live capability + metrics routes (Phase 2 §23 / §24 / §29)
 * ====================================================================
 * GET /api/capabilities/live  → dynamic truth-first capability registry
 * GET /api/metrics/interactions → numeric latency/counter metrics (no PHI)
 */
import type { Express, Request, Response } from "express";
import { collectLiveCapabilities } from "./liveCapabilities";
import { interactionMetricsSnapshot } from "../metrics/interactionMetrics";

export function registerCapabilityRoutes(app: Express): void {
  app.get("/api/capabilities/live", async (_req: Request, res: Response) => {
    try {
      res.json(await collectLiveCapabilities());
    } catch (e) {
      res.status(500).json({ error: "CAPABILITIES_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/metrics/interactions", (_req: Request, res: Response) => {
    res.json(interactionMetricsSnapshot());
  });
}
