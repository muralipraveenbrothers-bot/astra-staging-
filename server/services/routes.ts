/**
 * Astra AI — Internal Service Manager :: HTTP API
 * ===============================================
 * Real-state endpoints backing Plugin Center / System Health / plugin pages.
 * All mutating operations are ADMIN-only and audit-logged (§31).
 * Secret values never cross this API — presence metadata only (§18).
 */

import { Router, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { authenticate, requireRole } from "../rbac";
import { Role } from "../types";
import { db } from "../db";
import { ALL_SERVICE_IDS, SERVICE_DEFS } from "./serviceDefs";
import { internalServiceManager } from "./serviceManager";
import { detectNodeRuntimes } from "./runtimeDetect";
import { listSecretPresence, setSecret, deleteSecret, getSecret } from "./secrets";
import { logInstall } from "./installLogger";
import { inspectExecutable } from "./artifactInspector";
import { serviceDirs } from "./env";

// Dynamic module export verification test for secrets (Phase 7)
import("./secrets").then((m) => {
  console.log("[Secrets] Dynamic verify export keys:", Object.keys(m));
}).catch((err) => {
  console.error("[Secrets] Dynamic import failed:", err);
});

const router = Router();
const ADMIN: Role[] = ["admin", "ceo"];

/**
 * Phase 8: separate INSTALL_PERMISSION from PREMIUM_FEATURE_ACCESS.
 * These open-source, MIT-licensed services must be installable by any
 * authenticated ASTRA administrator. There is NO premium/license check in
 * this path — the requirement is a real, verified admin session only.
 */
function requireAdminInstall(req: Request, res: Response, next: NextFunction): void {
  // Phase 8 fix: reject NO-token requests with a clear 401 challenge instead
  // of falling through to rbac's synthetic default-doctor session (which
  // produces a misleading synthetic 403). A real admin token → admin.
  const authHeader = req.headers.authorization;
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) :
    (req.headers["x-astra-token"] as string | undefined);
  if (!token) {
    res.status(401).json({
      error: "UNAUTHENTICATED",
      message: "Authentication required. Provide a valid ASTRA admin session token (admin/ceo).",
      requiredRoles: ["admin", "ceo"],
    });
    return;
  }
  requireRole(ADMIN)(req, res, next as NextFunction);
}

function isServiceId(v: string): v is typeof ALL_SERVICE_IDS[number] {
  return (ALL_SERVICE_IDS as string[]).includes(v);
}

function audit(req: Request, action: string, status: "SUCCESS" | "FAILED" | "DENIED", details: string): void {
  const user = (req as any).user;
  db.logAudit({
    actorId: user?.userId ?? "unknown",
    actorName: user?.name ?? "unknown",
    actorRole: user?.role ?? "unknown",
    action,
    category: "Internal Services",
    status,
    details,
  });
}

/** All managed services (snapshot list) — feed for System Health (§29). */
router.get("/", authenticate, async (_req: Request, res: Response) => {
  const services = await internalServiceManager.allSnapshots();
  res.json({ services, timestamp: new Date().toISOString() });
});

/** Service Registry snapshot for all managed services (§11). */
router.get("/registry", authenticate, async (_req: Request, res: Response) => {
  const snapshots = await internalServiceManager.allSnapshots();
  const registry: Record<string, unknown> = {};
  for (const s of snapshots) {
    registry[s.id] = {
      managed: s.managed,
      version: s.installedVersion ?? s.requestedVersion,
      endpoint: s.endpoint,
      status: s.state,
      requestedVersion: s.requestedVersion,
      verifiedCommit: s.verifiedCommit,
      upstreamRef: s.upstreamRef,
      upstreamLicense: s.upstreamLicense,
      process: s.process,
      health: s.health,
      metrics: s.metrics,
      runtime: s.runtime,
      installProgress: s.installProgress,
      lastError: s.lastError,
      disabledReason: s.disabledReason,
    };
  }
  res.json({ registry, timestamp: new Date().toISOString() });
});

/** Full snapshot of one service. */
router.get("/:id/status", authenticate, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  res.json(await internalServiceManager.snapshot(id));
});

/** Live log tail collected by the supervisor. */
router.get("/:id/logs", authenticate, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  const lines = Math.min(Number(req.query.lines ?? 200), 1000);
  res.json({ id, lines: internalServiceManager.logs(id, lines) });
});

/** Diagnostics: real probe right now + process facts (§14/§15 Diagnostics). */
router.post("/:id/diagnose", authenticate, requireRole(ADMIN), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  try {
    audit(req, `services.${id}.diagnose`, "SUCCESS", "Manual diagnostics run");
    res.json(await internalServiceManager.diagnose(id));
  } catch (err: any) {
    audit(req, `services.${id}.diagnose`, "FAILED", err?.message ?? String(err));
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

/** Start / Stop / Restart — audited admin lifecycle ops. */
async function lifecycle(req: Request, res: Response, op: "start" | "stop" | "restart") {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  try {
    const snapshot =
      op === "start" ? await internalServiceManager.start(id)
      : op === "stop" ? await internalServiceManager.stop(id)
      : await internalServiceManager.restart(id);
    audit(req, `services.${id}.${op}`, "SUCCESS", `${SERVICE_DEFS[id].displayName} ${op} → ${snapshot.state}`);
    res.json(snapshot);
  } catch (err: any) {
    audit(req, `services.${id}.${op}`, "FAILED", err?.message ?? String(err));
    res.status(500).json({ error: err?.message ?? String(err) });
  }
}

router.post("/:id/start", authenticate, requireRole(ADMIN), (req, res) => lifecycle(req, res, "start"));
router.post("/:id/stop", authenticate, requireRole(ADMIN), (req, res) => lifecycle(req, res, "stop"));
router.post("/:id/restart", authenticate, requireRole(ADMIN), (req, res) => lifecycle(req, res, "restart"));

/** Install with live progress pipeline (§33). Long-running; returns final progress. */
router.post("/:id/install", authenticate, requireAdminInstall, async (req: Request, res: Response) => {
  console.error("[SERVICES:INSTALL] handler entered for:", String(req.params.id), "actor:", JSON.stringify((req as any).user?.role));
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  const actor = (req as any).user;
  try {
    // Defensive: secret inspection must never block installation (§31).
    let secretPresent: boolean | undefined;
    try {
      secretPresent = id === "freellmapi"
        ? Boolean(getSecret("freellmapi.ENCRYPTION_KEY"))
        : undefined;
    } catch (secretErr) {
      console.error(`[Services] Secret inspection failed for ${id}:`, secretErr);
      secretPresent = undefined;
    }

    logInstall(id, {
      action: "install",
      endpoint: req.originalUrl,
      method: req.method,
      actorRole: actor?.role,
      auth: "OK",
      url: SERVICE_DEFS[id].repoUrl,
      finalUrl: `https://github.com/${id === "freellmapi" ? "tashfeenahmed/freellmapi" : "diegosouzapw/OmniRoute"}`,
      responseHeaders: { "Content-Type": "application/json" },
      secretPresent,
    });
    audit(req, `services.${id}.install`, "SUCCESS", `Installing ${SERVICE_DEFS[id].upstreamName} ${SERVICE_DEFS[id].requestedVersion}`);
    const progress = await internalServiceManager.install(id, { nodeBin: req.body?.nodeBin });
    logInstall(id, { action: "install", endpoint: req.originalUrl, method: req.method, actorRole: actor?.role, status: 200, responseBody: JSON.stringify({ ok: true }) });
    res.json(progress);
      } catch (err: any) {
    console.error("[SERVICES:INSTALL] ERROR:", err?.constructor?.name, err?.message);
    console.error("[SERVICES:INSTALL] STACK:", err?.stack);
    console.error("[SERVICES:INSTALL] URL:", req.originalUrl, "ACTOR:", actor?.role);
    console.error("[SERVICES:INSTALL] req.user:", JSON.stringify((req as any).user));
    audit(req, `services.${id}.install`, "FAILED", err?.message ?? String(err));
    logInstall(id, {
      action: "install",
      endpoint: req.originalUrl,
      method: req.method,
      actorRole: actor?.role,
      status: 500,
      responseBody: JSON.stringify({ error: err?.message ?? String(err) }),
      error: err?.message ?? String(err),
    });
        res.status(500).json({
      error: err?.message ?? String(err),
      stack: err?.stack ?? undefined,
      progress: internalServiceManager.progress.get(id),
    });
  }
});

/** Installer instrumented log file (Phase 2) — ASTRA/logs/installer/<id>-install.log. */
router.get("/:id/install-log", authenticate, requireRole(ADMIN), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  const { astraDataRoot } = await import("./env");
  const file = path.join(astraDataRoot(), "..", "logs", "installer", `${id}-install.log`);
  try {
    const tail = fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split(/\r?\n/).slice(-200).join("\n") : "";
    res.json({ id, lines: tail });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

/** Models discovered from the actual runtime (§17 unified registry feed). */
router.get("/:id/models", authenticate, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  const models = await internalServiceManager.discoverModels(id);
  res.json({ id, count: models.length, models });
});

/** Unified model registry across all managed services + ASTRA static catalog. */
router.get("/models/unified", authenticate, async (_req: Request, res: Response) => {
  const models = await internalServiceManager.unifiedModelRegistry();
  res.json({ count: models.length, models, timestamp: new Date().toISOString() });
});

/** Upgrade with automatic backup; rollback list + rollback action (§22). */
router.post("/:id/upgrade", authenticate, requireRole(ADMIN), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  try {
    audit(req, `services.${id}.upgrade`, "SUCCESS", "Upgrade started (backup taken first)");
    res.json(await internalServiceManager.upgrade(id));
  } catch (err: any) {
    audit(req, `services.${id}.upgrade`, "FAILED", err?.message ?? String(err));
    res.status(500).json({ error: err?.message ?? String(err), backups: internalServiceManager.listBackups(id) });
  }
});

router.get("/:id/backups", authenticate, (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  res.json({ backups: internalServiceManager.listBackups(id) });
});

router.post("/:id/rollback", authenticate, requireRole(ADMIN), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  const { backup } = req.body ?? {};
  if (!backup) return res.status(400).json({ error: "backup name required" });
  try {
    await internalServiceManager.rollbackToBackup(id, String(backup));
    audit(req, `services.${id}.rollback`, "SUCCESS", `Rolled back to ${backup}`);
    res.json(await internalServiceManager.snapshot(id));
  } catch (err: any) {
    audit(req, `services.${id}.rollback`, "FAILED", err?.message ?? String(err));
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// ------------------------------------------------- External installs / migration ---

/** Detect existing external installations — presence metadata only (§23). */
router.get("/:id/external", authenticate, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  const detection = await internalServiceManager.detectExternalInstallations(id);
  const eligibility = internalServiceManager.decommissionEligibility(id);
  res.json({
    ...detection,
    decommission: eligibility,
    // §25: removal may only be OFFERED after the internal service is healthy.
    removalOfferAllowed: eligibility.eligibleForRemovalOffer,
  });
});

/** Import configuration from a discovered external installation. */
router.post("/:id/import", authenticate, requireRole(ADMIN), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  const { fromDir, files } = req.body ?? {};
  if (!fromDir || !Array.isArray(files)) {
    return res.status(400).json({ error: "fromDir and files[] required" });
  }
  try {
    const result = internalServiceManager.importExternalConfig(id, String(fromDir), files.map(String));
    audit(req, `services.${id}.import`, "SUCCESS", `Imported [${result.imported.join(", ")}]`);
    res.json(result);
  } catch (err: any) {
    audit(req, `services.${id}.import`, "FAILED", err?.message ?? String(err));
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// --------------------------------------------------------- Secrets (admin-only) ---

/** Presence listing only — no values ever returned (§18). */
router.get("/:id/secrets", authenticate, requireRole(ADMIN), (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  res.json({ secrets: listSecretPresence(id) });
});

router.put("/:id/secrets/:key", authenticate, requireRole(ADMIN), (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  const value = req.body?.value;
  if (!value || typeof value !== "string") return res.status(400).json({ error: "value required" });
  try {
    setSecret(`${id}.${req.params.key}`, value);
    audit(req, `services.${id}.secret.set`, "SUCCESS", `Secret "${req.params.key}" updated (value never logged)`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

router.delete("/:id/secrets/:key", authenticate, requireRole(ADMIN), (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  const removed = deleteSecret(`${id}.${req.params.key}`);
  audit(req, `services.${id}.secret.delete`, "SUCCESS", `Secret "${req.params.key}" removed`);
  res.json({ ok: removed });
});

/** Runtime detection facts for the installation UX (§5). */
router.get("/_runtimes/detect", authenticate, async (_req: Request, res: Response) => {
  const runtimes = await detectNodeRuntimes(process.env.ASTRA_SERVICES_NODE_OVERRIDE);
  res.json({
    current: { version: process.version },
    detected: runtimes,
    requirements: Object.fromEntries(
      ALL_SERVICE_IDS.map((id) => [id, SERVICE_DEFS[id].nodeRequirementClauses.join(" || ")]),
    ),
  });
});

/** Static inspection endpoint (Phase 1) */
router.post("/:id/inspect", authenticate, requireRole(ADMIN), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!isServiceId(id)) return res.status(404).json({ error: "Unknown service" });
  
  const downloadsDir = "C:\\Users\\mural\\Downloads";
  const exeName = id === "freellmapi" ? "FreeLLMAPI.Setup.0.9.0.exe" : "OmniRoute.3.8.41.exe";
  const localExePath = path.join(downloadsDir, exeName);
  const artifactExePath = path.join(serviceDirs(id).artifacts, exeName);
  
  const exePath = fs.existsSync(artifactExePath) ? artifactExePath : localExePath;
  
  try {
    const result = inspectExecutable(exePath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

export default router;
