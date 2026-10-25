/**
 * ASTRA AI — PLUGIN ECOSYSTEM API (v2)
 * ============================================================================
 * Real plugin manager endpoints: catalog, ecosystem summary, dependency graph,
 * install/uninstall/repair/configure, and live health checks.
 * Keeps the legacy /api/plugins chat-style center untouched.
 */

import { Router, Request, Response } from "express";
import { pluginManager } from "../src/plugins/PluginManager";

const router = Router();

// Load the plugin catalog from config/plugins on module init
// so /api/plugins/ecosystem and related endpoints see real manifests.
pluginManager.loadCatalog();

// Every route wrapped by `safe` below is mounted at "/:id", so declare that
// param shape once here instead of letting `req.params.id` stay
// `string | string[]` (Express 5 types) at all five call sites.
function safe(fn: (req: Request<{ id: string }>) => Promise<any> | any) {
  return async (req: Request<{ id: string }>, res: Response) => {
    try {
      const result = await fn(req);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message ?? String(err) });
    }
  };
}

function catalogEntry(pluginId: string) {
  const manifest = pluginManager.getManifest(pluginId);
  const state = pluginManager.getState(pluginId);
  if (!manifest) return null;
  return {
    pluginId: manifest.pluginId,
    name: manifest.name,
    version: manifest.version,
    tier: manifest.tier,
    category: manifest.category,
    description: manifest.description,
    riskLevel: manifest.riskLevel,
    dependencies: manifest.dependencies,
    healthChecks: manifest.healthChecks,
    configurationSchema: manifest.configurationSchema,
    state: state
      ? {
        status: state.status,
        health: state.health ? { status: state.health } : undefined,
        missingSecrets: state.missingSecrets ?? [],
        installedAt: state.installedAt ?? undefined,
        degradationReasons: state.degradationReasons ?? [],
      }
      : undefined,
  };
}

// GET /api/plugins/ecosystem — summary + catalog + states
router.get("/ecosystem", (_req: Request, res: Response) => {
  const summaryRaw = pluginManager.getEcosystemSummary();
  const states = pluginManager.getAllStates();
  const catalog = pluginManager.getCatalog().map((m) => catalogEntry(m.pluginId));
  const totalDependencies = pluginManager
    .getCatalog()
    .reduce((acc, m) => acc + m.dependencies.required.length, 0);
  const optionalDependencies = pluginManager
    .getCatalog()
    .reduce((acc, m) => acc + m.dependencies.optional.length, 0);
  const totalHealthChecks = pluginManager.getCatalog().reduce((acc, m) => acc + m.healthChecks.length, 0);
  const byStatus = summaryRaw.byStatus ?? {};

  res.json({
    ok: true,
    summary: {
      totalPlugins: summaryRaw.catalogSize,
      totalDependencies,
      optionalDependencies,
      totalHealthChecks,
      installed: summaryRaw.installed,
      active: summaryRaw.active,
      degraded: (byStatus.DEGRADED ?? 0) + (byStatus.CONFIG_REQUIRED ?? 0),
      safeMode: byStatus.SAFE_MODE ?? 0,
      byStatus,
      byHealth: summaryRaw.byHealth ?? {},
      degradedList: summaryRaw.degraded ?? [],
      tiers: summaryRaw.tiers ?? {},
    },
    catalog,
    states: states.map((s) => ({
      pluginId: s.pluginId,
      status: s.status,
      health: s.health,
      missingSecrets: s.missingSecrets ?? [],
      configuration: s.configuration ?? {},
      degradationReasons: s.degradationReasons ?? [],
    })),
    updatedAt: new Date().toISOString(),
  });
});

// GET /api/plugins/graph — dependency DAG edges
router.get("/graph", (_req: Request, res: Response) => {
  res.json({ ok: true, edges: pluginManager.getDependencyGraph() });
});

// POST /api/plugins/:id/install
router.post("/:id/install", safe(async (req: Request<{ id: string }>) => {
  const result = await pluginManager.install(req.params.id, {
    autoInstallOptional: !!req.body?.autoInstallOptional,
    secrets: req.body?.secrets,
  });
  return { ok: result.success, ...result };
}));

// POST /api/plugins/:id/uninstall
router.post("/:id/uninstall", safe(async (req: Request<{ id: string }>) => {
  const result = await pluginManager.uninstall(req.params.id);
  return { ok: result.success, ...result };
}));

// POST /api/plugins/:id/repair
router.post("/:id/repair", safe(async (req: Request<{ id: string }>) => {
  return await pluginManager.repair(req.params.id);
}));

// POST /api/plugins/:id/configure
router.post("/:id/configure", safe((req: Request<{ id: string }>) => {
  const state = pluginManager.configure(req.params.id, req.body?.config ?? {});
  return { ok: true, pluginId: req.params.id, status: state.status, missingSecrets: state.missingSecrets ?? [] };
}));

// GET /api/plugins/:id/health — live health checks
router.get("/:id/health", safe(async (req: Request<{ id: string }>) => {
  const { health, results } = await pluginManager.healthCheck(req.params.id);
  return { ok: true, pluginId: req.params.id, health, results, elapsedMs: results.reduce((a, r) => a + (r.latencyMs ?? 0), 0) };
}));

export default router;