import type { Express, Request, Response, NextFunction } from "express";
import { AllGatewaysFailedError, testPrimaryThenFallback } from "./gatewayAdapter";
import { authenticate, requireRole } from "../rbac";
import { collectAiHealth } from "./health";
import { recentAiLogs } from "./log";
import { adapterApiKey, aiGatewayConfig, publicServiceView } from "./config";
import { applyFreeLlmUnifiedKey, readFreeLlmUnifiedKey, maskSecret } from "./loadEnv";
import { connectProviderKey, gatewayLinkStatus } from "./gatewayLink";
import { setSecret } from "../services/secrets";
import { centralAiChat, chatText } from "./centralCore";
import { doctorOrderChat } from "./modelGateway";
import { getAiProvidersHealth } from "./providerRegistry";
import { astraOrchestrator } from "../orchestrator";
import { routeIntent } from "./taskRouter";
import { loadModelCatalog } from "./modelCatalog";
import { applyAdapterBindings, describeBindings } from "./agentBindings";
import { WORKERS, dispatchWorker, distributeHospitalWork } from "./workerDispatch";
import { routeAndDispatch } from "./routingBridge";
import {
  listPublicServices,
  getCanonicalService,
  publicServiceView as publicCanonicalView,
  CANONICAL_SERVICES,
} from "../services/canonicalRegistry";

import { internalServiceManager } from "../services/serviceManager";
// NOTE: the root-level `astra/` directory contains ONLY `intelligence_extensions/`
// (see the imports below, which are correct). The runtime services live under
// `src/astra/runtime/`, so `../../astra/runtime/internalServices` never resolved.
// This is a type-only import, so nothing broke at runtime — but the types were
// silently `any`, which defeated the checks on the enrich cache below.
import type { ServiceSnapshot, ServiceState } from "../../src/astra/runtime/internalServices";
import { listCapabilities, getCapabilityFact } from "./capabilityRegistry";
import { mcpRegistry } from "../mcp/mcpRegistry";
import { testAllServices } from "./testAll";
import { saveCentralState } from "./stateStore";
import { runClinicalWorkflow } from "./clinicalWorkflow";
import { runSyntheticEval } from "./evalHarness";
import { runAgenticRag, ingestDocument, getRagStats } from "../rag/agenticRag";
import { probeHermesService, probeLangGraphService } from "../healthProbes";
import { getMiniMindConfig } from "../../astra/intelligence_extensions/minimind/config";
import { listSkills as listScientificSkills } from "../../astra/intelligence_extensions/scientific_skills/registry";
import { callAstraMicro } from "../../astra/intelligence_extensions/minimind/adapter";
import { routeIntelligence } from "../../astra/intelligence_extensions/routing/intelligenceRouter";
import { layaStatus } from "../services/layaService";
import { getScientificSkillsWorker } from "../../astra/intelligence_extensions/scientific_skills/worker";
import { deidentifyForScientificQuery } from "../../astra/intelligence_extensions/safety/phiGuard";
import { db } from "../db";

function adapterAuth(req: Request, res: Response, next: NextFunction): void {
  const key = adapterApiKey();
  if (!key) {
    next();
    return;
  }
  const hdr = String(req.headers.authorization ?? "");
  const token = hdr.replace(/^Bearer\s+/i, "").trim();
  if (token && token === key) {
    next();
    return;
  }
  res.status(401).json({
    error: { message: "Authentication required", type: "invalid_api_key", code: "invalid_api_key" },
  });
}

async function handleChat(req: Request, res: Response, agentHint?: string): Promise<void> {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "MISSING_MESSAGES", message: "messages[] is required" });
    return;
  }
  const stream = Boolean(req.body?.stream);
  const agentRaw = agentHint ?? req.header("x-astra-agent") ?? req.body?.agent ?? "astra";
  const agent =
    agentRaw === "hermes" || agentRaw === "langgraph" || agentRaw === "openclaw" || agentRaw === "paperclip" || agentRaw === "n8n"
      ? agentRaw
      : "astra";
  try {
    const result = await centralAiChat({
      model: req.body?.model,
      messages,
      temperature: req.body?.temperature,
      max_tokens: req.body?.max_tokens,
      stream,
      agent,
      clinical: req.body?.clinical !== false,
      memory: typeof req.body?.memory === "string" ? req.body.memory : undefined,
    });

    res.setHeader("X-Request-ID", result.requestId);
    res.setHeader("X-Astra-Service", result.service);
    res.setHeader("X-Astra-Agent", result.agent);
    if (result.routedVia) res.setHeader("X-Routed-Via", result.routedVia);

    if (stream && result.stream?.body) {
      res.status(result.status);
      res.setHeader("Content-Type", result.stream.headers.get("content-type") || "text/event-stream");
      const reader = result.stream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(value);
      }
      res.end();
      return;
    }

    if (result.json !== null) {
      res.status(result.status).json({
        ...((typeof result.json === "object" && result.json) || {}),
        astra: {
          requestId: result.requestId,
          service: result.service,
          agent: result.agent,
          fallbackAttempts: result.fallbackAttempts,
          latencyMs: result.latencyMs,
        },
      });
      return;
    }
    res.status(result.status).send(result.text);
  } catch (e) {
    if (e instanceof AllGatewaysFailedError) {
      res.status(502).json({
        error: "ALL_GATEWAYS_FAILED",
        requestId: e.requestId,
        details: e.details,
        message: e.message,
      });
      return;
    }
    res.status(500).json({ error: "AI_CHAT_FAILED", message: e instanceof Error ? e.message : String(e) });
  }
}

export function registerAiGatewayRoutes(app: Express): void {
  app.get("/api/health/ai", async (_req: Request, res: Response) => {
    try {
      const health = await collectAiHealth();
      res.json(health);
    } catch (e) {
      res.status(500).json({ error: "HEALTH_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/ai/config", (_req: Request, res: Response) => {
    const cfg = aiGatewayConfig();
    res.json({
      adapter: { endpoint: cfg.adapter.publicUrl, keyConfigured: cfg.adapter.keyPresent },
      primary: publicServiceView(cfg.primary),
      fallback: publicServiceView(cfg.fallback),
      local: publicServiceView(cfg.local),
      gemini: { id: "gemini", keyConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY), note: "Server-side only. VITE_GEMINI_API_KEY is a separate client path and is not read here." },
      orchestration: {
        hermes: publicServiceView(cfg.hermes),
        langgraph: publicServiceView(cfg.langgraph),
        paperclip: publicServiceView(cfg.paperclip),
        openclaw: publicServiceView(cfg.openclaw),
        n8n: publicServiceView(cfg.n8n),
      },
      note: "Agents call Astra /v1. Keys never leave the Astra backend.",
    });
  });

  app.get("/api/ai/providers", async (_req: Request, res: Response) => {
    try {
      const providers = await getAiProvidersHealth();
      res.json({ providers, note: "healthy requires a live probe. configured ≠ connected." });
    } catch (e) {
      res.status(500).json({ error: "PROVIDERS_HEALTH_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/ai/orchestrate", authenticate, async (req: Request, res: Response) => {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query) {
      res.status(400).json({ error: "MISSING_QUERY" });
      return;
    }
    const user = (req as { user?: { userId: string; name: string; role: string } }).user ?? {
      userId: "anon",
      name: "anon",
      role: "doctor",
      email: "",
      department: "",
      sessionToken: "",
      expiresAt: 0,
    };
    try {
      const result = await astraOrchestrator.handle({
        query,
        user: user as never,
        patientContext: req.body?.patientContext,
        language: typeof req.body?.language === "string" ? req.body.language : "en",
        mode: req.body?.mode,
        clinical: req.body?.clinical,
        memory: typeof req.body?.memory === "string" ? req.body.memory : undefined,
      });
      res.setHeader("X-Request-ID", result.requestId);
      res.setHeader("X-Astra-Task", String(result.task));
      res.setHeader("X-Astra-Provider", result.provider);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "ORCHESTRATE_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/ai/tasks/route", (req: Request, res: Response) => {
    const q = String(req.query.q ?? req.query.query ?? "");
    res.json({ query: q, task: routeIntent(q, String(req.query.category ?? "")) });
  });

  // Enriches the bare canonical view with REAL live state + endpoint so the
  // SystemHealth "ASTRA Internal Managed Services" panel shows honest data
  // (endpoint, state, process, health) instead of blank placeholders.
  // Probes are concurrent + cached so this never blocks the event loop.
  let enrichCache: { at: number; services: ServiceSnapshot[] } | null = null;
  const ENRICH_TTL_MS = 12000;

  async function enrichPublicServices(): Promise<ServiceSnapshot[]> {
    if (enrichCache && Date.now() - enrichCache.at < ENRICH_TTL_MS) {
      return enrichCache.services;
    }

    const managed = new Map<string, ServiceSnapshot>();
    try {
      for (const s of await internalServiceManager.allSnapshots()) managed.set(s.id, s);
    } catch {
      /* service manager unavailable — fall back to canonical-only probing */
    }

    const probe = (url: string, timeoutMs = 2200): Promise<{ ok: boolean; latencyMs: number }> => {
      if (!url) return Promise.resolve({ ok: false, latencyMs: 0 });
      const t0 = Date.now();
      return fetch(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs) })
        .then((r) => ({ ok: r.ok, latencyMs: Date.now() - t0 }))
        .catch(() => ({ ok: false, latencyMs: Date.now() - t0 }));
    };

    // Hermes is a CLI adapter and LangGraph runs in-process. Probe them using
    // their native contracts instead of treating an empty URL as unreachable.
    const [hermesHealth, langGraphHealth] = await Promise.all([
      probeHermesService(),
      probeLangGraphService(),
    ]);
    const typedHealth = new Map([
      ["hermes", hermesHealth],
      ["langgraph", langGraphHealth],
    ]);

    // Concurrently probe every remaining canonical service's health URL.
    const canonical = CANONICAL_SERVICES.filter((c) => !managed.has(c.id));
    const probes = await Promise.all(canonical.map((c) =>
      typedHealth.has(c.id) ? Promise.resolve({ ok: false, latencyMs: 0 }) : probe(c.healthUrl || c.apiUrl),
    ));
    const probeById = new Map(canonical.map((c, i) => [c.id, probes[i]])!);

    // Managed services: keep supervisor snapshot, but if the supervisor thinks
    // it is DISABLED/STOPPED while the port actually answers, report HEALTHY.
    const result: ServiceSnapshot[] = [];
    for (const [id, m] of managed) {
      if (id === "freellmapi") {
        const external = (await collectAiHealth()).services.freellmapi;
        const healthy = external.reachable && external.authenticated === true && external.models === true;
        result.push({ ...m, managed: false, endpoint: external.endpoint, port: Number(new URL(external.endpoint).port),
          state: healthy ? "HEALTHY" : "DEGRADED", installedVersion: undefined,
          health: { latencyMs: external.latencyMs, consecutiveFailures: healthy ? 0 : 1, detail: "External desktop gateway: authenticated model-catalog probe" },
          lastError: healthy ? undefined : external.error ?? "External gateway authentication or model probe failed" });
        continue;
      }
      const liveStates: ServiceState[] = ["DISABLED", "STOPPED", "DEGRADED", "NOT_INSTALLED"];
      if (liveStates.includes(m.state) && m.endpoint) {
        const p = await probe(m.endpoint, 1800);
        if (p.ok) {
          // `consecutiveFailures` is required on ServiceSnapshot.health; the
          // spread of m.health alone left it optional. A service that just
          // answered a live probe has zero consecutive failures by definition.
          result.push({ ...m, state: "HEALTHY", health: { ...(m.health || {}), latencyMs: p.latencyMs, consecutiveFailures: 0, detail: "reachable" } });
          continue;
        }
      }
      result.push(m);
    }

    for (const c of canonical) {
      const typed = typedHealth.get(c.id);
      if (typed) {
        const healthy = typed.status === "HEALTHY" || typed.status === "READY" || typed.status === "CONNECTED";
        result.push({
          id: c.id,
          displayName: c.name,
          managed: false,
          upstreamName: c.upstream?.name ?? c.name,
          upstreamRepo: c.upstream?.url ?? "",
          upstreamRef: c.upstream?.name ?? "",
          upstreamLicense: "—",
          requestedVersion: "—",
          installedVersion: typed.version,
          verifiedCommit: undefined,
          state: healthy ? "HEALTHY" : "DEGRADED",
          endpoint: typed.endpoint,
          host: "127.0.0.1",
          port: undefined,
          process: undefined,
          // `lastProbeAt` is not part of ServiceSnapshot.health (TS2353). The
          // probe timestamp is already surfaced via `typed.lastCheckedAt`
          // elsewhere in this payload, so it is simply dropped here.
          health: { latencyMs: typed.latencyMs, consecutiveFailures: healthy ? 0 : 1, detail: typed.message },
          metrics: { requests: 0, errors: 0 },
          runtime: { nodeRequired: "—", nodeCompatible: healthy },
          lastError: healthy ? undefined : typed.message,
        });
        continue;
      }
      const p = probeById.get(c.id)!;
      const state: ServiceState = p.ok ? "HEALTHY" : "DEGRADED";
      result.push({
        id: c.id,
        displayName: c.name,
        managed: false,
        upstreamName: c.upstream?.name ?? c.name,
        upstreamRepo: c.upstream?.url ?? "",
        upstreamRef: c.upstream?.name ?? "",
        upstreamLicense: "—",
        requestedVersion: "—",
        installedVersion: undefined,
        verifiedCommit: undefined,
        state,
        endpoint: c.apiUrl || undefined,
        host: "127.0.0.1",
        port: undefined,
        process: undefined,
        health: { latencyMs: p.latencyMs, consecutiveFailures: p.ok ? 0 : 1, detail: p.ok ? "reachable" : "unreachable" },
        metrics: { requests: 0, errors: 0 },
        runtime: { nodeRequired: "—", nodeCompatible: true },
        lastError: p.ok ? undefined : `${c.healthUrl || c.apiUrl} unreachable`,
      });
    }

    enrichCache = { at: Date.now(), services: result };
    return result;
  }

  // Canonical service registry (spec §2, §28): ONE source of truth, public-safe.
  app.get("/api/services", async (_req: Request, res: Response) => {
    try {
      const services = await enrichPublicServices();
      res.json({ services, count: services.length, timestamp: new Date().toISOString() });
    } catch (e) {
      // Never fail the health page — fall back to the bare canonical list.
      res.json({ services: listPublicServices(), count: CANONICAL_SERVICES.length });
    }
  });


  app.get("/api/services/:id", (req: Request, res: Response) => {
    const svc = getCanonicalService(String(req.params.id));
    if (!svc) {
      res.status(404).json({ error: "UNKNOWN_SERVICE", id: req.params.id });
      return;
    }
    res.json(publicCanonicalView(svc));
  });

  app.get("/api/ai/architecture", async (_req: Request, res: Response) => {
    const cfg = aiGatewayConfig();
    const bindings = await describeBindings();
    res.json({
      name: "ASTRA AI HOSPITAL OS",
      commandCenter: "Astra is the command center. Connected systems are workers.",
      core: {
        commandPolicy: true,
        clinicalSafety: true,
        memoryContext: true,
      },
      adapter: {
        endpoint: cfg.adapter.publicUrl,
        openaiCompatible: ["GET /v1/models", "POST /v1/chat/completions"],
        chain: [
          { role: "PRIMARY LLM GATEWAY", id: "freellmapi", endpoint: cfg.primary.baseUrl },
          { role: "SECONDARY/FALLBACK", id: "omniroute", endpoint: cfg.fallback.baseUrl },
          { role: "LOCAL/PRIVATE FALLBACK", id: "ollama", endpoint: cfg.local.baseUrl },
        ],
      },
      workers: WORKERS,
      mcp: {
        servers: mcpRegistry.listAll().map((s) => ({
          id: s.id, name: s.name, status: s.status, endpoint: s.endpoint,
          capabilities: s.capabilities, tools: s.tools.length, resources: s.resources.length, prompts: s.prompts.length,
        })),
        note: "MCP is the capability/integration layer (tools/resources/prompts). Model inference stays on the Central AI Adapter (FreeLLMAPI → OmniRoute → Ollama).",
      },
      hospitalMutations: "Unchanged: POST /api/command/execute (HospitalCommandEngine). Workers cannot mutate.",
      agents: bindings.agents,
      antiPattern: "Do not give Hermes, Paperclip, OpenClaw, n8n, LangGraph, and Astra each their own model.",
      hermes: {
        current: bindings.hermesCurrent,
        recommended: bindings.recommended,
        note: bindings.catalogNote,
      },
    });
  });

  app.get("/api/capabilities", async (_req: Request, res: Response) => {
    try {
      res.json({ services: await listCapabilities() });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/capabilities/:id", async (req: Request<{ id: string }>, res: Response) => {
    const fact = getCapabilityFact(req.params.id);
    if (!fact) {
      res.status(404).json({ error: "UNKNOWN_SERVICE" });
      return;
    }
    const all = await listCapabilities();
    res.json(all.find((s) => s.id === req.params.id));
  });

  app.get("/api/capabilities/:id/health", async (req: Request, res: Response) => {
    const all = await listCapabilities();
    const s = all.find((x) => x.id === req.params.id);
    if (!s) {
      res.status(404).json({ error: "UNKNOWN_SERVICE" });
      return;
    }
    res.json({ id: s.id, status: s.status, latency: s.latency, last_error: s.last_error, dashboard_url: s.dashboard_url, api_url: s.api_url });
  });

  app.get("/api/ai/models", async (_req: Request, res: Response) => {
    try {
      res.json(await loadModelCatalog(Boolean(_req.query.refresh)));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/ai/clinical-workflow", async (req: Request, res: Response) => {
    const input = typeof req.body?.input === "string" ? req.body.input : "";
    if (!input) {
      res.status(400).json({ error: "MISSING_INPUT" });
      return;
    }
    try {
      res.json(await runClinicalWorkflow(input));
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/ai/eval/synthetic", async (_req: Request, res: Response) => {
    try {
      res.json(await runSyntheticEval());
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/ai/catalog", async (_req: Request, res: Response) => {
    try {
      const catalog = await loadModelCatalog(Boolean(_req.query.refresh));
      res.json(catalog);
    } catch (e) {
      res.status(500).json({ error: "CATALOG_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/ai/adapters", async (_req: Request, res: Response) => {
    res.json(await describeBindings());
  });

  app.get("/api/ai/workers", (_req: Request, res: Response) => {
    res.json({
      commandCenter: "ASTRA",
      adapter: "ASTRA AI ADAPTER",
      workers: WORKERS,
      dispatch: "POST /api/ai/dispatch { input, worker? }",
      mutations: "POST /api/command/execute — not this route",
    });
  });

  app.post("/api/ai/distribute", authenticate, async (req: Request, res: Response) => {
    const input = typeof req.body?.input === "string" ? req.body.input : typeof req.body?.query === "string" ? req.body.query : "";
    try {
      const result = await distributeHospitalWork(input);
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/ai/clinical-dispatch", authenticate, async (req: Request, res: Response) => {
    const input = typeof req.body?.input === "string" ? req.body.input : typeof req.body?.query === "string" ? req.body.query : "";
    if (!input) {
      res.status(400).json({ ok: false, refusal: "input is required" });
      return;
    }
    try {
      const result = await routeAndDispatch({
        request: input,
        episodeLock: req.body?.episodeLock,
      });
      const refusal = Boolean(result.refusal);
      res.status(refusal ? 422 : result.ok ? 200 : 503).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/ai/dispatch", authenticate, async (req: Request, res: Response) => {
    const input = typeof req.body?.input === "string" ? req.body.input : typeof req.body?.query === "string" ? req.body.query : "";
    try {
      const result = await dispatchWorker({
        input,
        worker: typeof req.body?.worker === "string" ? req.body.worker : undefined,
        memory: typeof req.body?.memory === "string" ? req.body.memory : undefined,
      });
      const status =
        result.ok || result.error === "NO_INVENTED_TASK_API" || result.error === "NO_INVENTED_GATEWAY_RPC" || result.error === "NO_INVENTED_WORKFLOW"
          ? 200
          : result.error === "MUTATION_REFUSED"
            ? 409
            : 503;
      res.status(status).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/ai/adapters/apply", authenticate, requireRole(["admin"]), async (req: Request, res: Response) => {
    const result = await applyAdapterBindings({
      confirm: Boolean(req.body?.confirm),
      targets: Array.isArray(req.body?.targets) ? req.body.targets : undefined,
    });
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.get("/api/ai/log", (_req: Request, res: Response) => {
    res.json({ entries: recentAiLogs() });
  });

  app.post("/api/ai/sync-freellmapi-key", authenticate, requireRole(["admin"]), (_req: Request, res: Response) => {
    const synced = readFreeLlmUnifiedKey();
    if (!synced.key) {
      res.status(404).json({ ok: false, error: synced.error ?? "NO_UNIFIED_KEY", userId: synced.userId, email: synced.email });
      return;
    }
    applyFreeLlmUnifiedKey(synced.key);
    try {
      setSecret("freellmapi.API_KEY", synced.key);
    } catch {
      /* encrypted store optional */
    }
    res.json({
      ok: true,
      keyConfigured: maskSecret(process.env.FREELLMAPI_API_KEY) === "set",
      source: "FreeLLMAPI Keys tab (local database)",
      userId: synced.userId,
      email: synced.email,
    });
  });

  app.post("/api/ai/test", async (_req: Request, res: Response) => {
    try {
      const result = await testPrimaryThenFallback();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "TEST_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/ai/test-all", async (_req: Request, res: Response) => {
    try {
      const result = await testAllServices();
      res.json({ ok: true, timestamp: new Date().toISOString(), result });
    } catch (e) {
      res.status(500).json({ ok: false, error: "TEST_ALL_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/ai/test-all", async (_req: Request, res: Response) => {
    try {
      const result = await testAllServices();
      res.json({ ok: true, timestamp: new Date().toISOString(), result });
    } catch (e) {
      res.status(500).json({ ok: false, error: "TEST_ALL_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });


app.post("/api/rag/query", authenticate, async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) return res.status(400).json({ error: "MISSING_QUERY" });
  try {
    const result = await runAgenticRag(query);
    const user = (req as any).user as { userId?: string; name?: string; role?: string };
    db.logAudit({ actorId: user.userId ?? "unknown", actorName: user.name ?? "unknown", actorRole: user.role ?? "unknown", action: "RAG_QUERY", category: "knowledge", status: "SUCCESS", details: JSON.stringify({ sourceCount: result.sources.length, abstained: result.sources.length === 0, answeredBy: result.answeredBy }), ip: req.ip });
    res.json(result);
  } catch (e) {
    const user = (req as any).user as { userId?: string; name?: string; role?: string };
    db.logAudit({ actorId: user?.userId ?? "unknown", actorName: user?.name ?? "unknown", actorRole: user?.role ?? "unknown", action: "RAG_QUERY", category: "knowledge", status: "FAILED", details: JSON.stringify({ sourceCount: 0, abstained: true, answeredBy: "none" }), ip: req.ip });
    res.status(500).json({ error: "RAG_FAILED", message: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/rag/stats", authenticate, (_req, res) => {
  res.json(getRagStats());
});

app.post("/api/rag/ingest", authenticate, (req, res) => {
  const doc = req.body ?? {};
  if (!doc.text || !doc.source) return res.status(400).json({ error: "MISSING_TEXT_OR_SOURCE" });
  try {
    ingestDocument({
      id: doc.id || `doc-${Date.now()}`,
      text: doc.text,
      source: doc.source,
      category: doc.category || "medical-knowledge",
      specialty: doc.specialty,
      evidenceLevel: doc.evidenceLevel,
      title: doc.title,
      metadata: doc.metadata,
    });
    res.json({ ok: true, stats: getRagStats() });
  } catch (e) {
    res.status(500).json({ error: "INGEST_FAILED", message: e instanceof Error ? e.message : String(e) });
  }
});


  app.post("/api/ai/test-all", async (_req: Request, res: Response) => {
    try {
      res.json(await testAllServices());
    } catch (e) {
      res.status(500).json({ error: "TEST_ALL_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  // Central state DB (system setup, item 3) — agent status, API health,
  // voice settings, avatar presence, video call availability. Persists to
  // data/astra-state.json on every read.
  app.get("/api/ai/state", async (_req: Request, res: Response) => {
    try {
      res.json(await saveCentralState());
    } catch (e) {
      res.status(500).json({ error: "STATE_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/ai/chat", authenticate, (req: Request, res: Response) => {
    void handleChat(req, res);
  });

  app.get("/api/ai/gateway-link", authenticate, async (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, ...(await gatewayLinkStatus()) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "GATEWAY_LINK_FAILED" });
    }
  });

  app.post("/api/ai/gateway-provider", authenticate, async (req: Request, res: Response) => {
    const result = await connectProviderKey({
      platform: req.body?.platform,
      apiKey: req.body?.apiKey,
      freellm: req.body?.freellm,
      omniroute: req.body?.omniroute,
    });
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/api/ai/doctor-order", authenticate, async (req: Request, res: Response) => {
    const text = typeof req.body?.text === "string" ? req.body.text : typeof req.body?.message === "string" ? req.body.message : "";
    if (!text.trim()) {
      res.status(400).json({ error: "MISSING_TEXT" });
      return;
    }
    const result = await doctorOrderChat({
      text,
      patientName: typeof req.body?.patientName === "string" ? req.body.patientName : undefined,
      uhid: typeof req.body?.uhid === "string" ? req.body.uhid : undefined,
      note: typeof req.body?.note === "string" ? req.body.note : undefined,
      diagnosis: typeof req.body?.diagnosis === "string" ? req.body.diagnosis : undefined,
    });
    res.status(result.ok ? 200 : 503).json(result);
  });


  app.get("/v1/models", adapterAuth, async (_req: Request, res: Response) => {
    try {
      const catalog = await loadModelCatalog();
      const seen = new Set<string>();
      const data = catalog.models
        .filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        })
        .map((m) => ({
          id: m.id,
          object: "model",
          created: 0,
          owned_by: m.source,
          name: m.name,
          context_length: m.contextLength,
          context_window: m.contextLength,
          available: m.available,
        }));
      res.json({ object: "list", data });
    } catch (e) {
      res.status(502).json({ error: { message: e instanceof Error ? e.message : String(e), type: "catalog_error" } });
    }
  });

  app.post("/v1/chat/completions", adapterAuth, (req: Request, res: Response) => {
    void handleChat(req, res);
  });

  // ── ASTRA Intelligence Extensions (non-destructive additions) ────────────────
  // Feature-flagged endpoints for astra-micro (MiniMind) and Scientific Skills.
  // Existing chat/completions + models routes above are untouched.

  const INTELLIGENCE_ENABLED = process.env.INTELLIGENCE_EXTENSIONS_ENABLED !== "false";

  app.get("/api/intelligence/status", async (_req: Request, res: Response) => {
    const cfg = getMiniMindConfig();
    let ollamaReachable = false;
    let installedModels: string[] = [];
    try {
      const r = await fetch(`${cfg.ollamaBase}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        ollamaReachable = true;
        const body = await r.json() as { models?: Array<{ name?: string; model?: string }> };
        installedModels = (body.models ?? []).map((m) => String(m.name ?? m.model ?? "")).filter(Boolean);
      }
    } catch { /* status remains truthful */ }
    const modelInstalled = installedModels.some((m) => m === cfg.ollamaModel || m.startsWith(`${cfg.ollamaModel}:`));
    const skills = listScientificSkills();
    let laya: { state: string; detail?: string } = { state: "UNKNOWN" };
    try {
      const live = await layaStatus();
      laya = { state: live.state, detail: live.detail };
    } catch (e) {
      laya = { state: "UNAVAILABLE", detail: e instanceof Error ? e.message : String(e) };
    }
    res.json({
      enabled: INTELLIGENCE_ENABLED,
      laya,
      sevenD: { status: "READY", covers: "symptom → differential → mechanism → management → monitor" },
      micro: {
        enabled: cfg.enabled,
        status: INTELLIGENCE_ENABLED && cfg.enabled && ollamaReachable && modelInstalled ? "READY" : "DEGRADED",
        service: "astra-micro",
        runtime: "Ollama",
        model: cfg.ollamaModel,
        endpoint: cfg.ollamaBase,
        ollamaReachable,
        modelInstalled,
        contextWindow: cfg.contextWindow,
      },
      scientist: {
        status: INTELLIGENCE_ENABLED ? "READY" : "DISABLED",
        enabledSkills: skills.filter((s) => s.enabled).length,
        totalSkills: skills.length,
        phiGuard: process.env.ASTRA_PHI_GUARD !== "false",
        sandbox: process.env.ASTRA_SCIENTIFIC_SANDBOX !== "false",
        doctorReviewRequired: true,
      },
    });
  });

  app.get("/api/intelligence/skills", (_req: Request, res: Response) => {
    if (!INTELLIGENCE_ENABLED) {
      res.status(503).json({ error: "INTELLIGENCE_EXTENSIONS_DISABLED" }); return;
    }
    try {
      const skills = listScientificSkills().map((s: any) => ({
        name: s.name, description: s.description, category: s.category,
        riskClass: s.riskClass, enabled: s.enabled, triggers: s.triggers,
      }));
      res.json({ scientificSkills: skills, phiGuard: process.env.ASTRA_PHI_GUARD !== "false" });
    } catch (e) {
      res.status(500).json({ error: "SKILLS_LIST_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/intelligence/route", (req: Request, res: Response) => {
    if (!INTELLIGENCE_ENABLED) {
      res.status(503).json({ error: "INTELLIGENCE_EXTENSIONS_DISABLED" }); return;
    }
    try {
      const query: string = String(req.body?.query ?? "");
      const explicit = req.body?.tier;
      res.json({ route: routeIntelligence(query, explicit), query });
    } catch (e) {
      res.status(500).json({ error: "ROUTE_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/intelligence/command", async (req: Request, res: Response) => {
    if (!INTELLIGENCE_ENABLED) {
      res.status(503).json({ error: "INTELLIGENCE_EXTENSIONS_DISABLED" }); return;
    }
    try {
      const result = await callAstraMicro({
        instruction: String(req.body?.instruction ?? "Classify and route the following command."),
        userMessage: String(req.body?.command ?? req.body?.query ?? ""),
        jsonMode: req.body?.jsonMode !== false,
        departmentHint: req.body?.department,
      });
      res.json({ ok: result.ok, text: result.text, parsed: result.parsed ?? null, service: result.service, model: result.model, error: result.error ?? null });
    } catch (e) {
      res.status(500).json({ error: "COMMAND_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/intelligence/scientific", async (req: Request, res: Response) => {
    if (!INTELLIGENCE_ENABLED) {
      res.status(503).json({ error: "INTELLIGENCE_EXTENSIONS_DISABLED" }); return;
    }
    try {
      const rawQuery: string = String(req.body?.query ?? "");
      const privacyMode: boolean = req.body?.privacyMode !== false;
      const deidentified = privacyMode ? deidentifyForScientificQuery(rawQuery) : { deidentified: rawQuery, redactedFields: [], redactionLog: [] };
      const routed = routeIntelligence(rawQuery);
      const allowedSkills = Array.isArray(req.body?.allowedSkills) && req.body.allowedSkills.length
        ? req.body.allowedSkills
        : routed.scientificSkills;
      const result = await getScientificSkillsWorker().run({
        query: rawQuery,
        deidentifiedQuery: deidentified.deidentified,
        allowedSkills,
        privacyMode,
        provenanceRequired: true,
        requestId: req.body?.requestId,
      });
      res.json({ ok: result.ok, skill: result.skill, data: result.data, sources: result.sources, provenance: result.provenance, phiRedactions: deidentified.redactedFields, error: result.error ?? null });
    } catch (e) {
      res.status(500).json({ error: "SCIENTIFIC_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });
}
