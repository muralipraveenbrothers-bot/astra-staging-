import type { Express, Request, Response } from "express";
import { db } from "../db";
import { decideBatch, type FabricDecisionResult } from "../reflex/decisionFabric";
import { authenticate, requireRole } from "../rbac";

const LAYA_ROUTE_SCHEMAS = ["urgency_classification", "department_routing", "intent_routing"] as const;
const MAX_BOUNDED_INPUT_LENGTH = 600;
export function isLayaEnabled(): boolean {
  return process.env.ASTRA_LAYA_ENABLED?.trim() !== "0";
}

function sessionUser(req: Request): { userId: string; name: string; role: string } {
  const user = (req as Request & { user?: { userId: string; name: string; role: string } }).user;
  if (!user) throw new Error("authenticated Laya route missing session user");
  return user;
}

function routeDecision(result: FabricDecisionResult) {
  return {
    task: result.schemaId,
    answer: result.answer,
    confidence: result.confidence,
    abstained: result.abstained,
    source: result.source === "laya" ? "LAYA" : "FALLBACK",
  };
}

/**
 * Bounded, doctor-only Laya gateway. It is deliberately not a diagnostic API:
 * Laya may supply routing signals only; uncertainty remains explicit.
 */
export function registerLayaDecisionRoutes(app: Express): void {
  app.post("/api/agents/laya/decision", authenticate, requireRole(["doctor"]), async (req: Request, res: Response) => {
    const input = typeof req.body?.input === "string" ? req.body.input.trim() : "";
    if (!input || input.length > MAX_BOUNDED_INPUT_LENGTH) {
      res.status(400).json({ error: "VALIDATION", message: `input is required and must be at most ${MAX_BOUNDED_INPUT_LENGTH} characters` });
      return;
    }

    const user = sessionUser(req);
    const startedAt = Date.now();
    if (!isLayaEnabled()) {
      db.logAudit({
        actorId: user.userId,
        actorName: user.name,
        actorRole: user.role,
        action: "LAYA_BOUNDED_DECISION",
        category: "clinical-routing",
        status: "FAILED",
        details: JSON.stringify({ source: "NONE", reason: "LAYA_DISABLED", durationMs: Date.now() - startedAt }),
      });
      res.status(503).json({ error: "LAYA_DISABLED", message: "Laya disabled" });
      return;
    }
    try {
      const results = await decideBatch({ schemaIds: [...LAYA_ROUTE_SCHEMAS], input, timeoutMs: 8_000 });
      // A calibrated runtime abstention is still an answer from Laya. It must
      // not be relabelled as a deterministic fallback, because that would hide
      // the true provenance from the doctor.
      const runtimeAnswered = results.some((result) => result.source === "laya");
      const routingAvailable = results.some((result) => result.source === "laya" && !result.abstained);
      const source = runtimeAnswered ? "LAYA" : "FALLBACK";
      const durationMs = Date.now() - startedAt;
      db.logAudit({
        actorId: user.userId,
        actorName: user.name,
        actorRole: user.role,
        action: "LAYA_BOUNDED_DECISION",
        category: "clinical-routing",
        status: runtimeAnswered ? "SUCCESS" : "FAILED",
        details: JSON.stringify({ source, routingAvailable, tasks: LAYA_ROUTE_SCHEMAS, durationMs, resultCount: results.length }),
      });
      res.json({
        source,
        routingAvailable,
        /** @deprecated Use routingAvailable. Retained for one release. */
        usableDecision: routingAvailable,
        routingOnly: true,
        note: "Routing signal only, not clinical advice",
        decisions: results.map(routeDecision),
        limitations: "Laya returns bounded routing signals only; it does not diagnose, estimate disease probability, or make treatment decisions.",
        uncertainty: routingAvailable
          ? "Scores are routing confidence, not clinical probability. A doctor must review all clinical decisions."
          : runtimeAnswered
            ? "Laya answered with calibrated abstention or human-review routing. No clinical conclusion may be inferred; a doctor must review."
          : "Laya did not provide a usable runtime decision; deterministic fallback signals are shown and require doctor review.",
      });
    } catch {
      const durationMs = Date.now() - startedAt;
      db.logAudit({
        actorId: user.userId,
        actorName: user.name,
        actorRole: user.role,
        action: "LAYA_BOUNDED_DECISION",
        category: "clinical-routing",
        status: "FAILED",
        details: JSON.stringify({ source: "ERROR", tasks: LAYA_ROUTE_SCHEMAS, durationMs }),
      });
      res.status(502).json({
        error: "LAYA_UNAVAILABLE",
        source: "FALLBACK",
        limitations: "Laya is unavailable. No diagnosis or treatment recommendation was produced.",
        uncertainty: "A doctor must assess the clinical information without this bounded routing signal.",
      });
    }
  });
}
