import type { Express, Request, Response } from "express";
import { authenticate, requireRole } from "../rbac";
import { list, get } from "../reflex/schema/registry";
import "../reflex/schema/builtin";
import { recordedDecisions, createDecisionRecorder } from "../reflex/decisionRecorder";
import { setReflexRecorder } from "../reflex/decisionFabric";
import { recordOutcome } from "../reflex/outcomes";
import { expectedCalibrationError, fitTemperature, topConfusions } from "../reflex/calibration";
import { listConnectors, changeConnectorStage, type ConnectorStage } from "../reflex/connectorMaturity";
import { setSchemaMode, modeFor } from "../reflex/confidencePolicy";
import { promoteSchema, type ShadowSample } from "../reflex/shadow";
import { controlPlanRun, getPlanRun } from "../reflex/hermes/hermesPlanner";
import { getBrowserRun, runBrowserLoop } from "../reflex/browser/browserLoop";
import "../reflex/clinical/questionMatrix";

setReflexRecorder(createDecisionRecorder());

function user(req: Request): { role?: string; userId?: string } | undefined {
  return (req as Request & { user?: { role?: string; userId?: string } }).user;
}

export function registerReflexRoutes(app: Express): void {

  const decideHits = new Map<string, { n: number; at: number }>();
  app.post("/api/reflex/decide", authenticate, async (req, res) => {
    const actor = user(req);
    const role = actor?.role ?? "";
    const pack = String(req.body?.pack ?? "");
    if (pack.startsWith("clinical") && role === "reception") return res.status(403).json({ ok: false, error: "pack forbidden" });
    const key = actor?.userId || role || "anon";
    const now = Date.now();
    const bucket = decideHits.get(key);
    if (!bucket || now - bucket.at > 60_000) decideHits.set(key, { n: 1, at: now });
    else if (bucket.n >= 60) return res.status(429).json({ ok: false, error: "rate limit" });
    else bucket.n += 1;
    const schemaId = String(req.body?.schemaId ?? "");
    if (!schemaId) return res.status(400).json({ ok: false, error: "schemaId required" });
    const { decideBatch } = await import("../reflex/decisionFabric");
    const [result] = await decideBatch({ schemaIds: [schemaId], input: String(req.body?.text ?? ""), timeoutMs: 1500 });
    res.json({
      ok: result?.source !== "abstain",
      answers: { [schemaId]: { choice: result?.answer, score: result?.confidence, probabilities: result?.scores } },
      scoreMeaning: result?.scoreMeaning,
      model: result?.trace.checkpoint,
      source: result?.source,
    });
  });

  app.post("/api/reflex/clinical/mesh", authenticate, requireRole(["doctor", "ward"]), async (req, res) => {
    const actor = user(req);
    const role = actor?.role ?? "";
    const patientId = String(req.body?.patientId ?? "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patientId required" });
    try {
      const { runClinicalMesh, patientExists } = await import("../reflex/clinical/mesh");
      if (!patientExists(patientId)) return res.status(404).json({ ok: false, error: "patient not found" });
      const preview = req.body?.shadowPreview === true || process.env.ASTRA_REFLEX_SHADOW_PREVIEW_DOCTORS === "1";
      const result = await runClinicalMesh({ patientId, shadowPreview: preview });
      if (role === "ward") {
        const redFlags = result.redFlags.filter((item) => item.kind === "red_flag");
        return res.json({ ok: true, redFlags, board: { items: redFlags, ddxGraph: [] }, contradictions: [] });
      }
      const anyAssist = Object.values(result.modes).some((mode) => mode !== "SHADOW");
      if (!preview && !anyAssist) return res.json({ ok: true, ...result, hidden: true, board: { items: [], ddxGraph: [] }, contradictions: [] });
      return res.json({ ok: true, ...result, hidden: false });
    } catch (error) {
      return res.status(503).json({ ok: false, error: error instanceof Error ? error.message : "clinical mesh unavailable" });
    }
  });
  app.get("/api/reflex/schemas", authenticate, (_req, res) => {
    res.json({ ok: true, schemas: list().map((schema) => ({ id: schema.id, version: schema.version, domain: schema.domain, defaultMode: schema.defaultMode, mode: modeFor(schema.id, schema.defaultMode) })) });
  });

  app.get("/api/reflex/decisions", authenticate, requireRole(["admin"]), (req, res) => {
    const schemaId = typeof req.query.schemaId === "string" ? req.query.schemaId : undefined;
    const limit = Math.min(200, Number(req.query.limit ?? 50) || 50);
    const rows = recordedDecisions()
      .filter((row) => !schemaId || row.schemaId === schemaId)
      .slice(-limit)
      .map((row) => {
        const safe = { ...row };
        delete safe.text;
        delete safe.state;
        delete safe.input;
        delete safe.patientId;
        return safe;
      });
    res.json({ ok: true, decisions: rows });
  });

  app.post("/api/reflex/outcome", authenticate, (req, res) => {
    const role = user(req)?.role ?? "";
    const body = req.body ?? {};
    if (!body.decisionId || !body.truth) return res.status(400).json({ ok: false, error: "decisionId and truth are required" });
    const row = recordOutcome(String(body.decisionId), { truth: String(body.truth), source: body.source ?? "manual_label", at: new Date().toISOString() });
    res.json({ ok: true, outcome: row, role });
  });

  app.get("/api/reflex/calibration/:schemaId", authenticate, requireRole(["admin"]), (req: Request<{ schemaId: string }>, res: Response) => {
    const samples = Array.isArray(req.query.samples) ? [] : [];
    res.json({ ok: true, schemaId: req.params.schemaId, ece: expectedCalibrationError(samples), temperature: fitTemperature(samples), topConfusions: topConfusions(samples, 5) });
  });

  app.get("/api/reflex/shadow", authenticate, requireRole(["admin"]), (_req, res) => {
    res.json({ ok: true, schemas: list().map((schema) => ({ id: schema.id, mode: modeFor(schema.id, schema.defaultMode), topConfusions: [] })) });
  });

  app.get("/api/reflex/connectors", authenticate, requireRole(["admin"]), (_req, res) => {
    res.json({ ok: true, connectors: listConnectors() });
  });

  app.post("/api/reflex/connectors/:id/stage", authenticate, requireRole(["admin"]), (req: Request<{ id: string }>, res: Response) => {
    const actor = user(req);
    const result = changeConnectorStage({ id: req.params.id, stage: req.body?.stage as ConnectorStage, role: actor?.role ?? "", reason: req.body?.reason });
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/api/reflex/schemas/:id/mode", authenticate, requireRole(["admin"]), (req: Request<{ id: string }>, res: Response) => {
    const schema = get(req.params.id);
    if (!schema) return res.status(404).json({ ok: false, error: "unknown schema" });
    const mode = req.body?.mode;
    if (mode !== "SHADOW" && mode !== "ASSIST" && mode !== "AUTO") return res.status(400).json({ ok: false, error: "mode must be SHADOW, ASSIST or AUTO" });
    if ((schema.domain === "clinical" || schema.id.startsWith("clinical.")) && mode === "AUTO") {
      return res.status(400).json({ ok: false, error: "Clinical schemas are capped at ASSIST and cannot be set to AUTO." });
    }
    const actor = user(req);
    if (mode === "SHADOW") {
      setSchemaMode(schema, "SHADOW");
      return res.json({ ok: true, mode });
    }
    const rows = (req.body?.outcomes ?? []) as ShadowSample[];
    const result = promoteSchema(schema, rows, { role: actor?.role, reason: req.body?.reason });
    if (!result.ok) return res.status(409).json({ ok: false, reasons: result.reasons });
    res.json({ ok: true, mode: result.mode });
  });

  app.post("/api/reflex/plan/:runId/control", authenticate, requireRole(["admin", "doctor", "supervisor"]), (req: Request<{ runId: string }>, res: Response) => {
    const action = req.body?.action;
    if (action !== "PAUSE" && action !== "RESUME" && action !== "CANCEL" && action !== "STEER") {
      return res.status(400).json({ ok: false, error: "action must be PAUSE, RESUME, CANCEL or STEER" });
    }
    const run = controlPlanRun(req.params.runId, { action, constraint: typeof req.body?.constraint === "string" ? req.body.constraint : undefined });
    if (!run) return res.status(404).json({ ok: false, error: "plan run not found" });
    res.json({ ok: true, run });
  });

  app.get("/api/reflex/plan/:runId", authenticate, requireRole(["admin", "doctor", "supervisor"]), (req: Request<{ runId: string }>, res: Response) => {
    const run = getPlanRun(req.params.runId);
    if (!run) return res.status(404).json({ ok: false, error: "plan run not found" });
    res.json({ ok: true, run });
  });

  const browserRoles = ["admin", "doctor", "supervisor", "reception", "lab", "radiology", "ward", "pharmacy", "billing", "ot", "accounts", "insurance"] as const;
  app.post("/api/reflex/browser/run", authenticate, requireRole([...browserRoles]), async (req, res) => {
    if (process.env.ASTRA_REFLEX_BROWSER !== "1") return res.status(404).json({ ok: false, error: "reflex browser disabled" });
    const goal = String(req.body?.goal ?? "").trim();
    if (!goal) return res.status(400).json({ ok: false, error: "goal required" });
    try {
      const run = await runBrowserLoop({
        goal,
        startUrl: typeof req.body?.startUrl === "string" ? req.body.startUrl : undefined,
        typedText: typeof req.body?.typedText === "string" ? req.body.typedText : undefined,
        role: user(req)?.role ?? "staff",
      });
      res.json({ ok: run.status !== "failed", run });
    } catch (error) {
      res.status(503).json({ ok: false, error: error instanceof Error ? error.message : "browser unavailable" });
    }
  });

  app.get("/api/reflex/browser/:runId", authenticate, requireRole([...browserRoles]), (req: Request<{ runId: string }>, res: Response) => {
    if (process.env.ASTRA_REFLEX_BROWSER !== "1") return res.status(404).json({ ok: false, error: "reflex browser disabled" });
    const run = getBrowserRun(req.params.runId);
    if (!run) return res.status(404).json({ ok: false, error: "browser run not found" });
    res.json({ ok: true, run });
  });
  app.post("/api/reflex/clinical/hypercube", authenticate, requireRole(["doctor", "ward"]), async (req, res) => {
    const actor = user(req);
    const role = actor?.role ?? "";
    const patientId = String(req.body?.patientId ?? "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patientId required" });
    try {
      const { patientExists } = await import("../reflex/clinical/mesh");
      if (!patientExists(patientId)) return res.status(404).json({ ok: false, error: "patient not found" });
      const { runHypercube } = await import("../reflex/clinical/hypercube/run");
      const preview = req.body?.shadowPreview === true || process.env.ASTRA_REFLEX_SHADOW_PREVIEW_DOCTORS === "1";
      const result = runHypercube({ patientId, shadowPreview: preview });
      if (role === "ward") {
        return res.json({ ok: true, redFlags: result.redFlags });
      }
      const anyAssist = Object.values(result.modes).some((mode) => mode !== "SHADOW");
      if (!preview && !anyAssist) {
        return res.json({ ok: true, hidden: true, redFlags: result.redFlags, vectors: [], organEdges: [], treatments: [], passes: { ddxOrder: [] } });
      }
      const organEdges = (result.organEdges ?? []).filter((edge: { reviewStatus?: string }) => edge.reviewStatus === "approved");
      return res.json({ ok: true, hidden: false, ...result, organEdges });
    } catch (error) {
      return res.status(503).json({ ok: false, error: error instanceof Error ? error.message : "hypercube unavailable" });
    }
  });
}

export function _seedDecisionForTest(event: Record<string, unknown>): void {
  createDecisionRecorder().record(event);
}
