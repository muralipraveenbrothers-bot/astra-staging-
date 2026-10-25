import type { Express, Request, Response } from "express";
import { authenticate, requireRole } from "../rbac";
import { verifyClinicalStorePersistence } from "../persistence/clinicalStoreAdapters";

export function registerDurableRoutes(app: Express): void {
  app.get("/api/durable/verify", authenticate, requireRole(["admin"]), (_req: Request, res: Response) => {
    res.json({ ok: true, streams: verifyClinicalStorePersistence() });
  });
}
