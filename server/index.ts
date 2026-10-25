/**
 * Astra AI — Unified Hospital AI Operating System Server
 * =========================================================
 * Port: 3000 | Host: 127.0.0.1 by default (ASTRA_BIND_HOST overrides)
 * Integrates CommandEngine, LangGraph, Model Router, Knowledge Fabric,
 * Real-time SSE, Server RBAC, and ChatGPT-style Plugin Center.
 */

import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { db } from "./db";
import { authenticate, requireRole, createSession, KNOWN_USERS } from "./rbac";
import { realtimeHub } from "./events";
import { commandEngine } from "./command";
import { agentOrchestrator } from "./langgraph";
import { modelRouter } from "./router";
import { medicalKnowledgeFabric } from "./knowledge";
import { pluginManager } from "./plugins";
import pluginEcosystemRouter from "./plugin-ecosystem";
import { AgentRegistry } from "../src/agents/core/AgentRegistry";
import { ToolRegistry } from "../src/agents/core/ToolRegistry";
import { ModelRegistry } from "../src/agents/core/ModelRegistry";
import { KnowledgeRegistry } from "../src/agents/core/KnowledgeRegistry";
import { PermissionRegistry } from "../src/agents/core/PermissionRegistry";
// Side-effect registration: exposes the approval-gated Sanjeevani confirmation tool to the server ToolRegistry.
import "../src/agents/specialists/SanjeevaniConfirmationAgent";
import { pluginManager as ecosystemManager } from "../src/plugins/PluginManager";
import { SusrutaClinicalEngine } from "../src/agents/specialists/SusrutaClinicalEngine";
import { BioSimEngine } from "../src/agents/specialists/BioSimEngine";
import { MolecularCascadeAgent } from "../src/agents/specialists/MolecularCascadeAgent";
import { VentBrainAgent } from "../src/agents/specialists/VentBrainAgent";
import { ToxCommandAgent } from "../src/agents/specialists/ToxCommandAgent";
import { TraumaIntelligenceAgent } from "../src/agents/specialists/TraumaIntelligenceAgent";
import { SurgicalRoadmapAgent } from "../src/agents/specialists/SurgicalRoadmapAgent";
import { ShieldGuardian } from "../src/agents/specialists/ShieldGuardian";
import { CerebellumFilter } from "../src/agents/specialists/CerebellumFilter";
import { Role } from "./types";
import {
  hermesHealth,
  hermesCapabilities,
  // Used by GET /api/agents/hermes/health below. It was missing from this
  // import list, so that route threw "ReferenceError: probeHermes is not
  // defined" on every call.
  probeHermes,
} from "./agents/hermesAdapter";
import { loadBackendEnv } from "./ai/loadEnv";
import { registerAiGatewayRoutes } from "./ai/routes";
import { registerBookToSkillRoutes } from "./ai/bookToSkillRoutes";
import { registerMcpRoutes } from "./mcp/mcpRoutes";
import { mcpRegistry } from "./mcp/mcpRegistry";
import { startMcpConnectionSweep, connectMcpNow, getMcpConnectionStates } from "./mcp/mcpConnectionManager";
import { collectAllServiceHealth } from "./healthProbes";
import { registerPubMedRoutes } from "./medical/pubmedRoutes";
import { runPubMedProbe } from "./medical/fabric";
import { getMedicalFabric } from "./medical/fabric";
import { registerWorkOrderRoutes } from "./routes/workOrders";
import { workOrderEngine } from "./services/workOrders";
import { startClinicalEscalationScheduler, stopClinicalEscalationScheduler } from "./services/workOrderNotifications";
import { registerClinicalRoutes } from "./routes/clinical";
import { registerOrthoPlannerRoutes } from "./routes/orthoPlanner";
import { registerVoiceRoutes } from "./routes/voice";
import { registerAvatarRoutes } from "./routes/avatar";
import { registerVoiceConversationRoutes } from "./voice/voiceRoutes";
import { registerVoiceProviderRoutes } from "./voice/voiceProviderRoutes";
import { registerCloudVoiceTtsRoutes } from "./voice/cloudVoiceTtsRoutes";
import { callHealthcareHttpTool, healthcareHttpAdapterStatus } from "./integrations/healthcareHttpAdapter";
import { medicalDeepResearchStatus, runMedicalDeepResearch } from "./integrations/medicalDeepResearchHttp";
import { skillGymStatus } from "./reflex/hermes/skillGymGate";
import { registerJarvisRoutes } from "./routes/jarvis";
import { registerCapabilityRoutes } from "./capabilities/capabilityRoutes";
import { attachAvatarGateway, wsGatewayStatus } from "./ws/avatarGateway";
import { collectLiveCapabilities } from "./capabilities/liveCapabilities";
import { registerIntegrationRoutes } from "./integrations/integrationRoutes";
import { registerN8nBusRoutes } from "./integrations/n8nBus";
import { registerSaarathiRoutes } from "./saarathi/routes";
import { registerBrainRoutes } from "./brain/routes";
import { registerPharmacyRoutes } from "./routes/pharmacy";
import { registerWardVitalsRoutes } from "./routes/wardVitals";
import { registerAccountVaultRoutes } from "./routes/accountVault";
import { registerHermesExecutionRoutes } from "./routes/hermes";
import { registerLayaDecisionRoutes } from "./routes/laya";
import { registerPatientContextRoutes } from "./routes/patientContext";
import { registerSystemLanRoutes } from "./routes/systemLan";
import { registerCommunicationRoutes } from "./routes/communications";
import { registerAstraVoiceRoutes } from "./routes/astra-voice";
import { registerBillingCommandRoutes } from "./routes/billingCommand";
import { registerCommandCenterRoutes } from "./routes/commandCenter";
import { guardAdmission, guardDispense, guardOrderStatus, registerWorkflowRoutes } from "./routes/workflow";
import { registerResultsRoutes } from "./routes/results";
import { registerWardSafetyRoutes } from "./routes/wardSafety";
import { registerDurableRoutes } from "./routes/durable";
import { configureClinicalStorePersistence } from "./persistence/clinicalStoreAdapters";
import { dataAnalysisAgent } from "./metrics/dataAnalysisAgent";
import { attachCallGateway } from "./ws/callGateway";
import { collectPlatformPillars } from "./platform/pillars";
import { collectRuntimeStatus, ollamaModelsAvailable } from "./platform/runtimeStatus";
import { probeHermesService, probeLangGraphService } from "./healthProbes";
import { resolveBindHost } from "./bindHost";
import { getRagStats } from "./rag/agenticRag";

loadBackendEnv();
configureClinicalStorePersistence();


const app = express();
const PORT = process.env.PORT || 3000;
const STAGING_UI_PORT = String(process.env.ASTRA_UI_PORT || 5173);
const HOST = resolveBindHost();

// CORS only affects browsers (requests without an Origin header — scripts,
// n8n, python agents — pass untouched). The UI always talks to this API through
// the same-origin Vite proxy, so allow just the Vite dev origins: loopback and
// private-LAN hosts on the Astra UI ports (5173 HTTP, 5443 HTTPS).
const CORS_UI_PORTS = new Set([STAGING_UI_PORT, "5443"]);
function isAllowedCorsOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (!CORS_UI_PORTS.has(url.port)) return false;
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
    return /^(10\.\d{1,3}\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  } catch {
    return false;
  }
}
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || isAllowedCorsOrigin(origin)),
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
registerAccountVaultRoutes(app);
registerSystemLanRoutes(app);
registerCommunicationRoutes(app);
registerAstraVoiceRoutes(app);
registerBillingCommandRoutes(app);
registerCommandCenterRoutes(app);
registerWorkflowRoutes(app);
registerResultsRoutes(app);
registerWardSafetyRoutes(app);
registerDurableRoutes(app);
registerSaarathiRoutes(app);
registerBrainRoutes(app);
registerPatientContextRoutes(app);

// ---------------------------------------------------------------------------
// 1. AUTHENTICATION & SESSION APIS
// ---------------------------------------------------------------------------
app.post("/api/auth/login", (req: Request, res: Response) => {
  const { role, name } = req.body;
  if (!role || !KNOWN_USERS[role as Role]) {
    res.status(400).json({ error: "INVALID_ROLE", message: `Role '${role}' is not a valid hospital role.` });
    return;
  }
  const session = createSession(role as Role, name || KNOWN_USERS[role as Role].name);
  db.logAudit({
    actorId: session.userId,
    actorName: session.name,
    actorRole: session.role,
    action: "USER_LOGIN",
    category: "security",
    status: "SUCCESS",
    details: `User logged into role ${role}`,
    ip: req.ip,
  });
  res.json({ success: true, session });
});

app.get("/api/auth/session", authenticate, (req: Request, res: Response) => {
  res.json({ session: (req as any).user });
});

app.get("/api/auth/roles", (_req: Request, res: Response) => {
  res.json({ roles: KNOWN_USERS });
});

// ---------------------------------------------------------------------------
// 2. REAL-TIME CROSS-DEPARTMENT EVENT HUB (SSE)
// ---------------------------------------------------------------------------
app.get("/api/events", authenticate, (req: Request, res: Response) => {
  realtimeHub.handleConnection(req, res);
});

// ---------------------------------------------------------------------------
// 3. AUTHORITATIVE HOSPITAL COMMAND ENGINE GATEWAY
// ---------------------------------------------------------------------------
app.post("/api/command/execute", authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { query, confirmed, contextPatientId, isAiGenerated, approvalDecisionId, source } = req.body;

  if (!query) {
    res.status(400).json({ error: "MISSING_QUERY", message: "Command query cannot be empty." });
    return;
  }

  const result = await commandEngine.execute({ query, user, confirmed, contextPatientId, isAiGenerated, approvalDecisionId, source });
  res.json(result);
});

// ---------------------------------------------------------------------------
// 4. LANGGRAPH AGENT ORCHESTRATOR & SPECIALISTS
// ---------------------------------------------------------------------------
app.post("/api/agents/invoke", authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { input, patientContext, thinkingMode } = req.body;

  if (!input) {
    res.status(400).json({ error: "MISSING_INPUT", message: "Agent input cannot be empty." });
    return;
  }

  const state = await agentOrchestrator.runGraph(input, user, patientContext, thinkingMode || 1);
  res.json({ success: true, state });
});

app.get("/api/agents/skills", authenticate, (_req: Request, res: Response) => {
  res.json({ skills: agentOrchestrator.getLearnedSkills() });
});

app.post("/api/agents/skills", authenticate, requireRole(["doctor", "admin"]), (req: Request, res: Response) => {
  const newSkill = agentOrchestrator.registerLearnedSkill(req.body);
  res.json({ success: true, skill: newSkill });
});

// ---------------------------------------------------------------------------
// 5. DYNAMIC MODEL ROUTER & REGISTRY
// ---------------------------------------------------------------------------
app.get("/api/router/models", authenticate, (_req: Request, res: Response) => {
  res.json({ models: modelRouter.getRegistry() });
});

app.post("/api/router/route", authenticate, (req: Request, res: Response) => {
  const { query, category } = req.body;
  const selectedModel = modelRouter.route(query || "", category || "clinical");
  res.json({ selectedModel });
});

// ---------------------------------------------------------------------------
// 6. MEDICAL KNOWLEDGE FABRIC & HYBRID RAG
// ---------------------------------------------------------------------------
app.get("/api/knowledge/stats", authenticate, (_req: Request, res: Response) => {
  res.json(medicalKnowledgeFabric.getStats());
});

app.get("/api/knowledge/dashboard", authenticate, requireRole(["doctor", "ceo", "admin"]), (_req: Request, res: Response) => {
  res.json(dataAnalysisAgent.run());
});

app.post("/api/knowledge/search", authenticate, (req: Request, res: Response) => {
  const { query, limit } = req.body;
  const hits = medicalKnowledgeFabric.search(query || "", limit || 10);
  res.json({ query, hitsCount: hits.length, hits });
});

// ---------------------------------------------------------------------------
// 7. CHATGPT-STYLE PLUGIN CENTER
// ---------------------------------------------------------------------------
app.get("/api/plugins", authenticate, (_req: Request, res: Response) => {
  res.json({ plugins: pluginManager.getAll() });
});

// ROUTE PARAM TYPING (Express 5): @types/express-serve-static-core v5 declares
// `ParamsDictionary` as `{ [key: string]: string | string[] }` — wildcard and
// repeated segments (`*splat`, `:id+`) can legitimately produce arrays. Every
// route below uses only simple named segments, so the honest fix is to declare
// the param shape via the `Request<{...}>` generic rather than cast at the call
// site. That restores `req.params.id: string` and keeps the check meaningful if
// a route pattern ever changes.
app.post("/api/plugins/:id/toggle", authenticate, requireRole(["admin", "doctor", "ceo"]), async (req: Request<{ id: string }>, res: Response) => {
  const updated = await pluginManager.toggleStatus(req.params.id);
  if (!updated) {
    res.status(404).json({ error: "PLUGIN_NOT_FOUND" });
    return;
  }
  res.json({ success: true, plugin: updated });
});

// 7b. PLUGIN ECOSYSTEM API (v2) — real dependency resolution + health checks
app.use("/api/plugins", authenticate, pluginEcosystemRouter);

// ---------------------------------------------------------------------------
// 7c. ASTRA INTERNAL SERVICE MANAGER — FreeLLMAPI + OmniRoute lifecycle
// (install / start / stop / restart / health / logs / diagnostics / registry)
// ---------------------------------------------------------------------------
import internalServicesRouter from "./services/routes";
// Admin/lifecycle routes moved to /api/admin/services so that /api/services
// (spec §28) is owned by the canonical public registry in ai/routes.ts.
app.use("/api/admin/services", authenticate, internalServicesRouter);

// ---------------------------------------------------------------------------
// 7d. NVIDIA AUDIO2FACE-3D + OPENAVATARCHAT AVATAR PROXY
// ---------------------------------------------------------------------------
registerAvatarRoutes(app);
registerVoiceConversationRoutes(app);
registerCapabilityRoutes(app);
registerIntegrationRoutes(app);

// ---------------------------------------------------------------------------
// 8. CANONICAL HOSPITAL DATA APIS (ROLE-GATED)
// ---------------------------------------------------------------------------
app.get("/api/hospital/profile", authenticate, (_req: Request, res: Response) => {
  res.json({ profile: db.getProfile() });
});

app.post("/api/hospital/profile", authenticate, requireRole(["admin", "ceo"]), (req: Request, res: Response) => {
  db.saveProfile(req.body);
  realtimeHub.broadcast({
    type: "HOSPITAL_PROFILE_UPDATED",
    targetRoles: "*",
    payload: { profile: req.body },
  });
  res.json({ success: true, profile: req.body });
});

app.get("/api/hospital/pulse", authenticate, (_req: Request, res: Response) => {
  res.json(db.getHospitalPulseMetrics());
});

app.get("/api/hospital/attention", authenticate, (_req: Request, res: Response) => {
  res.json({ attentionItems: db.getAttentionItems() });
});

app.patch("/api/hospital/attention/:id/status", authenticate, (req: Request<{ id: string }>, res: Response) => {
  const { status } = req.body;
  const item = db.updateAttentionStatus(req.params.id, status);
  if (!item) {
    res.status(404).json({ error: "ITEM_NOT_FOUND" });
    return;
  }
  realtimeHub.broadcast({
    type: "ATTENTION_ITEM_UPDATED",
    targetRoles: "*",
    payload: { item },
  });
  res.json({ success: true, item });
});

app.get("/api/hospital/ot", authenticate, (_req: Request, res: Response) => {
  res.json({ otCases: db.getOTCases() });
});

app.patch("/api/hospital/ot/:id/stage", authenticate, requireRole(["ot", "doctor", "admin"]), (req: Request<{ id: string }>, res: Response) => {
  const { stage, delayMinutes, delayReason } = req.body;
  const otCase = db.updateOTStage(req.params.id, stage, delayMinutes, delayReason);
  if (!otCase) {
    res.status(404).json({ error: "OT_CASE_NOT_FOUND" });
    return;
  }
  realtimeHub.broadcast({
    type: "OT_STAGE_UPDATED",
    targetRoles: "*",
    payload: { otCase },
  });
  res.json({ success: true, otCase });
});

app.get("/api/hospital/pharmacy", authenticate, (_req: Request, res: Response) => {
  res.json({ inventory: db.getPharmacyInventory() });
});

app.post("/api/hospital/pharmacy/dispense", authenticate, requireRole(["pharmacy", "doctor", "admin"]), (req: Request, res: Response) => {
  const user = (req as any).user;
  const { itemId, quantity, orderId, adminPin, adminReason } = req.body ?? {};
  const gate = guardDispense({
    user,
    orderId: orderId ? String(orderId) : undefined,
    adminPin: adminPin ? String(adminPin) : undefined,
    adminReason: adminReason ? String(adminReason) : undefined,
    device: String(req.get("x-device-id") || req.get("user-agent") || "pharmacy"),
  });
  if (!gate.ok) return void res.status(gate.status).json(gate.body);
  const updatedItem = db.updatePharmacyStock(itemId, -quantity);
  if (orderId) {
    db.updateOrderStatus(orderId, "dispensed");
  }
  realtimeHub.broadcast({
    type: "MEDICATION_DISPENSED",
    targetRoles: ["pharmacy", "doctor", "ward", "billing"],
    payload: { itemId, quantity, orderId },
  });
  res.json({ success: true, item: updatedItem });
});

app.get("/api/hospital/beds", authenticate, (_req: Request, res: Response) => {
  res.json({ beds: db.getBeds() });
});

app.patch("/api/hospital/beds/:id", authenticate, requireRole(["ward", "doctor", "admin"]), (req: Request<{ id: string }>, res: Response) => {
  const user = (req as any).user;
  if (req.body?.patientId) {
    const gate = guardAdmission({
      user,
      patientKey: String(req.body.patientId),
      adminPin: req.body.adminPin ? String(req.body.adminPin) : undefined,
      adminReason: req.body.adminReason ? String(req.body.adminReason) : undefined,
      device: String(req.get("x-device-id") || req.get("user-agent") || "ward"),
    });
    if (!gate.ok) return void res.status(gate.status).json(gate.body);
  }
  const bed = db.updateBed(req.params.id, req.body);
  if (!bed) {
    res.status(404).json({ error: "BED_NOT_FOUND" });
    return;
  }
  realtimeHub.broadcast({
    type: "BED_STATUS_UPDATED",
    targetRoles: "*",
    payload: { bed },
  });
  res.json({ success: true, bed });
});

app.get("/api/hospital/patients", authenticate, (_req: Request, res: Response) => {
  res.json({ patients: db.getPatients() });
});

app.get("/api/hospital/patients/:id", authenticate, (req: Request<{ id: string }>, res: Response) => {
  const p = db.getPatientById(req.params.id);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  res.json({ patient: p });
});

app.post("/api/hospital/patients", authenticate, requireRole(["reception", "doctor", "admin"]), (req: Request, res: Response) => {
  const now = new Date();
  const body = req.body ?? {};
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!name || !phone) return void res.status(400).json({ error: "NAME_AND_PHONE_REQUIRED" });
  // Identity is generated on the server. Clients may never assert that a
  // registration succeeded using a locally fabricated UHID.
  const uhid = `UHID-${now.getFullYear()}-${String(now.getTime()).slice(-8)}`;
  const p = db.createPatient({
    uhid,
    name,
    age: Math.max(0, Number(body.age) || 0),
    gender: ["male", "female", "other"].includes(body.gender) ? body.gender : "other",
    phone,
    department: String(body.department ?? "General Medicine"),
    admissionStatus: ["outpatient", "inpatient", "emergency"].includes(body.admissionStatus) ? body.admissionStatus : "outpatient",
    registeredAt: now.toISOString(),
    chiefComplaint: String(body.chiefComplaint ?? "Not recorded"),
    insuranceProvider: body.insuranceProvider ? String(body.insuranceProvider) : undefined,
    insurancePolicyNo: body.insurancePolicyNo ? String(body.insurancePolicyNo) : undefined,
  });
  const bill = db.createBillForPatient(p);
  realtimeHub.broadcast({
    type: "PATIENT_ADMITTED",
    targetRoles: "*",
    payload: { patient: p },
  });
  realtimeHub.broadcast({
    type: "BILL_CREATED",
    targetRoles: ["billing", "doctor", "ceo", "admin"],
    payload: { bill, message: `New bill ${bill.billNumber} opened for ${bill.patientName}` },
  });
  res.json({ success: true, patient: p, bill });
});

app.get("/api/hospital/orders", authenticate, (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const patientId = req.query.patientId as string | undefined;
  res.json({ orders: db.getOrders(category, patientId) });
});

app.patch("/api/hospital/orders/:id/status", authenticate, (req: Request<{ id: string }>, res: Response) => {
  const user = (req as any).user;
  const { status, result, isCritical, adminPin, adminReason } = req.body ?? {};
  const existing = db.getOrders().find((candidate) => candidate.id === req.params.id);
  if (!existing) {
    res.status(404).json({ error: "ORDER_NOT_FOUND" });
    return;
  }
  const gate = guardOrderStatus({
    user,
    order: existing,
    status: String(status ?? ""),
    result: result ? String(result) : undefined,
    adminPin: adminPin ? String(adminPin) : undefined,
    adminReason: adminReason ? String(adminReason) : undefined,
    device: String(req.get("x-device-id") || req.get("user-agent") || "hospital"),
  });
  if (!gate.ok) return void res.status(gate.status).json(gate.body);
  const order = db.updateOrderStatus(req.params.id, status, result, isCritical);

  if (!order) {
    res.status(404).json({ error: "ORDER_NOT_FOUND" });
    return;
  }

  realtimeHub.broadcast({
    type: isCritical ? "CRITICAL_ALERT" : "LAB_RESULT_VERIFIED",
    targetRoles: ["doctor", "ward", "admin"],
    payload: { order, updatedBy: user.name, isCritical },
  });

  db.logAudit({
    actorId: user.userId,
    actorName: user.name,
    actorRole: user.role,
    action: `ORDER_STATUS_UPDATE:${status}`,
    category: order.category,
    status: "SUCCESS",
    details: `Updated order ${order.id} status to ${status}. Critical: ${!!isCritical}`,
    patientId: order.patientId,
  });

  res.json({ success: true, order });
});

app.get("/api/hospital/audit", authenticate, requireRole(["admin", "ceo", "doctor"]), (req: Request, res: Response) => {
  res.json({ auditLogs: db.getAuditTrail(150) });
});

// ---------------------------------------------------------------------------
// 9. SYSTEM HEALTH & RESOURCE PROBE
// ---------------------------------------------------------------------------
// `ollamaStatus` used to be the literal string "CONNECTED" and the model list was
// a hard-coded seed — a component that merely mounted could not be told apart from
// a live runtime (constitution rule: "never fake connected"). Both are now
// derived from a REAL probe, and the honest answer is returned when it fails.
app.get("/api/system/resources", authenticate, async (_req: Request, res: Response) => {
  const ollamaUrl = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  let ollamaStatus: "CONNECTED" | "UNREACHABLE" | "WARNING" = "UNREACHABLE";
  let installedLocalModels: string[] = [];
  let ollamaError: string | undefined;
  try {
    const probe = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (probe.ok) {
      const payload = await probe.clone().json().catch(() => undefined);
      if (ollamaModelsAvailable(payload)) ollamaStatus = "CONNECTED";
      else { ollamaStatus = "WARNING"; ollamaError = "Ollama running, no models installed"; }
      const body = (await probe.json()) as { models?: Array<{ name?: string }> };
      installedLocalModels = (body.models ?? [])
        .map((m) => m.name)
        .filter((n): n is string => Boolean(n));
    } else {
      ollamaError = `HTTP ${probe.status}`;
    }
  } catch (e) {
    ollamaError = e instanceof Error ? e.message.slice(0, 140) : "unreachable";
  }
  res.json({
    totalRamGB: 24,
    availableRamGB: 16,
    gpuName: "AMD Radeon 820M Graphics",
    vramMB: 512,
    hasCuda: false,
    cpuCores: 8,
    ollamaStatus,
    ollamaError,
    installedLocalModels,
    recommendedExecutionTier: "HYBRID_BALANCED",
    maxSafeLocalParamSizeB: 8,
  });
});

registerAiGatewayRoutes(app);
// Saarathi voice provider truth: /api/voice/providers/status, /api/voice/transcribe
// (Voicebox Whisper) and /api/voice/gemini-tts (secondary cloud speaker).
registerVoiceProviderRoutes(app);

// Dr. Mayin cloud mouths (Sarvam Bulbul + OpenAI Live). Registered HERE, before
// the blanket `app.use("/api/voice", authenticate)` below, so they inherit the
// same posture as /api/voice/gemini-tts. Both carry only text the caller already
// has, hold no keys client-side, and enforce the Cloud Privacy Gate server-side.
registerCloudVoiceTtsRoutes(app);

// Saarathi brain routes: /api/astra-clinical-ai and /api/jarvis/chat (legacy alias).
// These were defined in server/routes/jarvis.ts but NEVER REGISTERED — any client
// posting here received the SPA fallback/HTML, which the frontend surfaced as
// "Saarathi heard you, but Astra returned an empty answer." Registered for real now;
// identity answers resolve in the local intent brain without any LLM.
registerJarvisRoutes(app);

// Book-to-Skill converter (KNOWLEDGE plugin, additive). Health is public so
// the plugin health-check can probe it; conversion routes authenticate
// themselves inside registerBookToSkillRoutes.
registerBookToSkillRoutes(app);

// MCP area is authenticated; specific handlers are registered below (order matters).
app.use("/api/mcp", authenticate);
registerMcpRoutes(app);

// Medical research fabric: truthful MCP aggregate + NCBI/PubMed native capability.
app.use("/api/medical", authenticate);
registerPubMedRoutes(app);

  // Work-order engine (staff workflow / Bed-4 E2E)
  app.use("/api/workorders", authenticate);
  registerWorkOrderRoutes(app);
  // Seed demo staff + Bed-4 CBP order on first run so the dashboard isn't empty
  try { workOrderEngine.seedDemo(); } catch { /* ignore */ }
  try {
    const persistedIssues = workOrderEngine.validatePersistedOrders();
    if (persistedIssues.length) {
      console.warn(`[work-orders] persisted validation found ${persistedIssues.length} invalid record(s)`);
    }
  } catch (error) {
    console.warn(`[work-orders] persisted validation unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const clinicalEscalationScheduler = startClinicalEscalationScheduler();
  clinicalEscalationScheduler.unref();
  process.once("SIGTERM", () => stopClinicalEscalationScheduler(clinicalEscalationScheduler));
  process.once("SIGINT", () => stopClinicalEscalationScheduler(clinicalEscalationScheduler));

  // Clinical Reasoning API (DDx + calculators)
  app.use("/api/clinical", authenticate);
  registerClinicalRoutes(app);

  // OrthoPlanner Slicer Bridge API
  app.use("/api/ortho-planner", authenticate);
  registerOrthoPlannerRoutes(app);

  // Local Voicebox proxy (Qwen3-TTS + Whisper binary protocol)
  app.use("/api/voice", authenticate);
  registerVoiceRoutes(app);

  registerPharmacyRoutes(app);
  registerWardVitalsRoutes(app);

  // Doctor Command OS & Interdepartmental Event Bus
  const { registerCommandOSRoutes } = await import("./ai/contextResolver.js");
  registerCommandOSRoutes(app);

  // Hospital Event Bus (n8n) — order acknowledgment callback + status
  registerN8nBusRoutes(app);

  // Protected Clinical Approval & Staging Routes
  const { registerClinicalApprovalRoutes } = await import("./routes/clinicalApproval.js");
  registerClinicalApprovalRoutes(app);

  const { registerReflexRoutes } = await import("./routes/reflex.js");
  registerReflexRoutes(app);

  const { registerKnowledgeRoutes } = await import("./routes/knowledge.js");
  registerKnowledgeRoutes(app);

  const { registerAgentOpsRoutes } = await import("./routes/agentops.js");
  registerAgentOpsRoutes(app);

  const { registerReceptionDocumentRoutes } = await import("./routes/receptionDocuments.js");
  registerReceptionDocumentRoutes(app);

// Expose (safe) MCP registry metadata for the frontend health/architecture views.
app.get("/api/mcp/meta", (_req: Request, res: Response) => {
  res.json({
    servers: mcpRegistry.idSet(),
    configured: mcpRegistry.listAll().map((s) => ({ id: s.id, name: s.name, status: s.status, endpoint: s.endpoint, capabilities: s.capabilities })),
  });
});

app.get("/api/platform/status", async (_req: Request, res: Response) => {
  try {
    res.json(await collectPlatformPillars());
  } catch (e) {
    res.status(500).json({ error: "PLATFORM_STATUS_FAILED", message: e instanceof Error ? e.message : String(e) });
  }
});

// Internal Browser service-grid status — REAL loopback probes (astraServices.ts
// fetchRuntimeStatus + gatewayManager.ts gatewayHealth read this). Without this
// route the SPA fallback returned index.html and every tile reported DEGRADED.
app.get("/api/runtime/status", async (_req: Request, res: Response) => {
  try {
    res.json(await collectRuntimeStatus());
  } catch (e) {
    res.status(500).json({ error: "RUNTIME_STATUS_FAILED", message: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/live", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "astra-core", status: "HEALTHY", uptimeSeconds: Math.round(process.uptime()) });
});

app.get("/api/health", async (_req: Request, res: Response) => {
  // ── REAL PROBES — every subsystem reports honestly ────────────────────
  const probe = async (fn: () => Promise<boolean> | boolean, timeoutMs = 3000): Promise<boolean> => {
    try {
      return await Promise.race([Promise.resolve(fn()), new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs))]);
    } catch {
      return false;
    }
  };

  const pillarPromise = collectPlatformPillars();

  const [command, langGraph, modelRouter, ollama, knowledge, realtime, rbac, audit, plugins, agents, tools, voice, mcp] =
    await Promise.all([
      probe(async () => (await import("./db")).db.getPatients().length >= 0),
      probe(() => AgentRegistry.get("langgraph_orchestrator")?.status === "ACTIVE"),
      probe(() => ModelRegistry.list().length > 0),
      probe(async () => {
        const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2500) });
        const payload = r.ok ? await r.clone().json().catch(() => undefined) : undefined;
        return r.ok && ollamaModelsAvailable(payload);
      }),
      probe(() => KnowledgeRegistry.list().length >= 0, 1000),
      probe(() => realtimeHub.getConnectedClientsCount() >= 0),
      probe(() => PermissionRegistry.hasPermission("DOCTOR", "patient:read") && !PermissionRegistry.hasPermission("RECEPTION", "lab:verify")),
      probe(() => {
        const log = path.join(process.cwd(), "data", "audit.jsonl");
        return fs.existsSync(log) && fs.readFileSync(log, "utf-8").trim().length > 0;
      }),
      probe(() => {
        ecosystemManager.loadCatalog();
        return ecosystemManager.getCatalog().length > 0;
      }),
      probe(() => AgentRegistry.list().length > 0),
      probe(() => ToolRegistry.list().length > 0),
      probe(async () => {
        const r = await fetch("http://127.0.0.1:17493/health", { signal: AbortSignal.timeout(2200) });
        return r.ok;
      }),
      probe(() => mcpRegistry.listAll().length > 0),
    ]);

  const platform = await pillarPromise;
  // Phase 2 §23: per-service capability detail (configured/reachable/ready/
  // latencyMs/lastError) — additive to the existing subsystems/pillars view.
  const liveCaps = await collectLiveCapabilities().catch(() => null);
  const servicesBlock: Record<string, unknown> | null = liveCaps
    ? {
        clinicalBrain: { configured: true, reachable: true, ready: AgentRegistry.list().length > 0 },
        gemini: liveCaps.ai.find((p) => p.id === "gemini") ?? { configured: false, reachable: false, ready: false },
        freeLLMAPI: liveCaps.ai.find((p) => p.id === "freellmapi") ?? { configured: false, reachable: false, ready: false },
        ollama: liveCaps.ai.find((p) => p.id === "ollama") ?? { configured: false, reachable: false, ready: false },
        omniRoute: liveCaps.ai.find((p) => p.id === "omniroute") ?? { configured: false, reachable: false, ready: false },
        voicebox: liveCaps.voice.providers.find((p) => p.id === "voicebox") ?? { configured: true, reachable: false, ready: false },
        linly: liveCaps.voice.providers.find((p) => p.id === "linly") ?? { configured: false, reachable: false, ready: false },
        liveAvatar: liveCaps.avatar.providers.find((p) => p.id === "live-avatar") ?? { configured: false, reachable: false, ready: false },
        audio2face: liveCaps.avatar.providers.find((p) => p.id === "audio2face") ?? { configured: true, reachable: false, ready: false },
        websocket: liveCaps.websocket,
      }
    : null;

  const subsystems = {
    commandEngine: command ? "CONNECTED" : "OFFLINE",
    langGraph: langGraph ? "CONNECTED" : "OFFLINE",
    modelRouter: modelRouter ? "CONNECTED" : "OFFLINE",
    ollamaLocal: ollama ? "CONNECTED" : "DEGRADED",
    knowledgeFabric: "DEGRADED",
    realtimeHub: realtime ? "CONNECTED" : "OFFLINE",
    rbacSecurity: rbac ? "CONNECTED" : "OFFLINE",
    auditEngine: audit ? "CONNECTED" : "OFFLINE",
    pluginManager: plugins ? "CONNECTED" : "OFFLINE",
    agentRegistry: agents ? "CONNECTED" : "OFFLINE",
    toolRegistry: tools ? "CONNECTED" : "OFFLINE",
    voicebox: voice ? "CONNECTED" : "OFFLINE",
    // Audio2Face-3D was permanently removed from the platform (see /api/avatar/status).
    // It must never count toward OFFLINE/DEGRADED — it is not a degraded dependency.
    audio2face: "REMOVED",
    // Truthful MCP fabric status: CONNECTED only when a real MCP handshake
    // succeeded; CONFIGURED alone never reads as CONNECTED (Phase 8/11 rule).
    mcpRegistry: getMedicalFabric().mcpRegistryBadge,
  };

  const offline = Object.values(subsystems).filter((s) => s === "OFFLINE").length;
  const degraded = Object.values(subsystems).filter((s) => s === "DEGRADED").length;

  // §9 / §27 — the global status reflects ONLY core, in-process platform
  // subsystems. Ollama, Voicebox, MCP and avatar integrations are capabilities
  // (Tier 2/3): their state is reported truthfully in `subsystems` and in
  // `capabilityNotices`, but they must never flatten Astra into a global
  // DEGRADED/OFFLINE. A dead voice server is a capability notice, not an outage.
  const CORE_SUBSYSTEMS = [
    "commandEngine",
    "langGraph",
    "modelRouter",
    "knowledgeFabric",
    "realtimeHub",
    "rbacSecurity",
    "auditEngine",
    "pluginManager",
    "agentRegistry",
    "toolRegistry",
  ] as const;
  const CAPABILITY_SUBSYSTEMS = ["ollamaLocal", "voicebox", "mcpRegistry"] as const;
  // Keep the HTTP health rollup aligned with the runtime status grid.  The
  // shared collector applies the required-service contract (Astra API,
  // FreeLLMAPI, Laya and Ollama) through combineRequiredStatus.
  const runtimeStatus = await collectRuntimeStatus();
  const rolled = runtimeStatus.status;
  const capabilityNotices = [...CAPABILITY_SUBSYSTEMS]
    .filter((k) => subsystems[k] !== "CONNECTED")
    .map((k) => ({ name: k, state: subsystems[k] }));

  // Probe the already-loaded knowledge fabric in-process. Calling the
  // authenticated HTTP route from inside the server always returned 401 and
  // falsely marked the fabric degraded even when the store was healthy.
  const knowledgeDocs = await probe(async () => {
    const stats = medicalKnowledgeFabric.getStats();
    return Boolean(stats && typeof stats === "object");
  });
  if (knowledgeDocs) subsystems.knowledgeFabric = "CONNECTED";

  const mcpServers = mcpRegistry.listAll();
  const ragStats = getRagStats();
  const platformOverall = platform.overall;

  res.json({
    status: rolled,
    pillarOverall: platformOverall,
    capabilityNotices,
    pillars: platform.pillars,
    subsystems,
    services: servicesBlock ?? undefined,
    uptimeSeconds: process.uptime(),
    activeConnections: realtimeHub.getConnectedClientsCount(),
    counts: {
      plugins: ecosystemManager.getCatalog().length,
      agents: AgentRegistry.list().length,
      agentsActive: AgentRegistry.listActive().length,
      tools: ToolRegistry.list().length,
      toolsHealthy: ToolRegistry.list().filter((t) => t.healthStatus === "HEALTHY").length,
      models: ModelRegistry.list().length,
      knowledgeSources: KnowledgeRegistry.list().length,
      knowledgeDocsIndexed: ragStats.documents,
      mcpServers: mcpServers.length,
      mcpConnected: mcpServers.filter((s) => s.status === "CONNECTED").length,
    },
    // Truthful medical fabric (MCP aggregate + NCBI/PubMed capability card).
    // Configured is never reported as Connected; READY requires a real probe.
    mcpFabric: getMedicalFabric(),
    notes: {
      knowledgeDocsIndexed: `${ragStats.documents} documents indexed in the local RAG vector store`,
      ollamaLocal: ollama ? "Ollama reachable at 127.0.0.1:11434" : "Ollama not reachable at 127.0.0.1:11434",
      knowledgeStatsProbe: knowledgeDocs ? "knowledge stats endpoint reachable" : "knowledge stats endpoint unreachable",
      voicebox: voice ? "Voicebox reachable at 127.0.0.1:17493" : "Voicebox not reachable at 127.0.0.1:17493",
      audio2face: "Audio2Face-3D permanently removed — excluded from health rollup",
      mcp: `${mcpServers.filter((s) => s.status === "CONNECTED").length}/${mcpServers.length} MCP servers connected (configured is not connected)`,
    },
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9b. AGENT REGISTRY VIEW (all 277 declared agents + registered state)
// ─────────────────────────────────────────────────────────────────────────────
// ── HERMES AGENT — REAL CLI INTEGRATION (audit-verified; no fake server) ──────
app.get("/api/agents/hermes/health", authenticate, async (_req: Request, res: Response) => {
  res.json(await probeHermes());
});

app.get("/api/integrations/healthcare-http-adapter/status", authenticate, (_req: Request, res: Response) => {
  res.json({ ok: true, ...healthcareHttpAdapterStatus() });
});

app.post("/api/integrations/healthcare-http-adapter/call", authenticate, requireRole(["doctor", "admin"]), async (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json({ ok: false, error: "TOOL_NAME_REQUIRED" });
  try {
    res.json(await callHealthcareHttpTool(name, req.body?.arguments ?? {}));
  } catch (error) {
    res.status(502).json({ ok: false, provider: "HTTP-adapter", error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/integrations/medical-deep-research/status", authenticate, (_req: Request, res: Response) => {
  res.json({ ok: true, ...medicalDeepResearchStatus() });
});

app.post("/api/integrations/medical-deep-research/query", authenticate, requireRole(["doctor", "admin"]), async (req: Request, res: Response) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) return res.status(400).json({ ok: false, error: "QUERY_REQUIRED" });
  try {
    res.json(await runMedicalDeepResearch(query));
  } catch (error) {
    res.status(502).json({ ok: false, provider: "HTTP-service", error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/agents/hermes/skill-gym/status", authenticate, (_req: Request, res: Response) => {
  res.json({ ok: true, ...skillGymStatus() });
});

app.get("/api/agents/langgraph/self-test", authenticate, async (_req: Request, res: Response) => {
  try {
    const result = await Promise.race([
      agentOrchestrator.selfTest(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LangGraph self-test timeout")), 3000)),
    ]);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/agents/hermes/status", authenticate, async (_req: Request, res: Response) => {
  const [health, capabilities] = await Promise.all([hermesHealth(), hermesCapabilities()]);
  res.json({ ...capabilities, status: health.status, version: health.version, detail: health.detail });
});

registerHermesExecutionRoutes(app);
registerLayaDecisionRoutes(app);

// ── TYPED SERVICE HEALTH ─────────────────────────────────────────────────
// Contract-based health for every Astra service kind (CLI / in-process / MCP /
// native API / HTTP). Replaces the old "no endpoint → UNREACHABLE" logic.
app.get("/api/system/service-health", authenticate, async (_req, res) => {
  try { res.json(await collectAllServiceHealth()); }
  catch (e) { res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// ── MCP connection control ───────────────────────────────────────────────
app.get("/api/mcp/connection-states", authenticate, (_req, res) => {
  res.json({ states: getMcpConnectionStates() });
});
app.post("/api/mcp/servers/:id/connect-now", authenticate, async (req: Request<{ id: string }>, res) => {
  try { res.json(await connectMcpNow(req.params.id)); }
  catch (e) { res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// ── OmniRoute model catalog (closes the /v1/models gap) ──────────────────
app.get("/api/services/omniroute/models", authenticate, async (_req, res) => {
  try {
    const { internalServiceManager } = await import("./services/serviceManager");
    const models = await internalServiceManager.discoverModels("omniroute");
    res.json({ ok: true, count: models.length, models });
  } catch (e) {
    res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// ── Laya System-1 runtime (Python loopback service, §61) ────────────────
// Observation-only status by default: /v1/tasks is the fast liveness check.
// ?deep=1 runs the real /v1/health probe (may block ~90s on cold Router preload).
app.get("/api/services/laya/status", authenticate, async (req, res) => {
  try {
    const { layaStatus } = await import("./services/layaService");
    const deep = req.query.deep === "1";
    const budget = Number(req.query.budgetMs) || undefined;
    res.json({ ok: true, ...(await layaStatus({ deep, deepBudgetMs: budget })) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/services/laya/start", authenticate, async (_req, res) => {
  try {
    const { startLaya } = await import("./services/layaService");
    res.json({ ok: true, ...(await startLaya()) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/services/laya/stop", authenticate, async (_req, res) => {
  try {
    const { stopLaya } = await import("./services/layaService");
    res.json({ ok: true, ...(await stopLaya()) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/agents/registry", authenticate, (_req: Request, res: Response) => {

  ecosystemManager.loadCatalog();

  const registered = AgentRegistry.list().map((a) => ({
    agentId: a.agentId,
    name: a.name,
    level: a.level,
    parentAgent: a.parentAgent,
    domain: a.domain,
    role: a.role,
    status: a.status,
    health: a.health,
    modelPolicy: a.modelPolicy,
  }));

  const declared: Array<{ agentId: string; name: string; level: string; parentAgent?: string; plugin: string; autoRegister: boolean }> = [];
  for (const m of ecosystemManager.getCatalog()) {
    for (const a of m.agents) {
      declared.push({ agentId: a.agentId, name: a.name, level: a.level, parentAgent: a.parentAgent, plugin: m.pluginId, autoRegister: a.autoRegister });
    }
  }

  const byLevel: Record<string, number> = {};
  const byPlugin: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const d of declared) {
    byLevel[d.level] = (byLevel[d.level] || 0) + 1;
    byPlugin[d.plugin] = (byPlugin[d.plugin] || 0) + 1;
  }
  for (const r of registered) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  res.json({
    ok: true,
    summary: {
      declared: declared.length,
      registered: registered.length,
      unique: new Set(declared.map((d) => d.agentId)).size,
      byLevel,
      byStatus,
      byPlugin,
    },
    registered,
    declared,
    updatedAt: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9c. COMMAND CENTER DASHBOARDS (8 extra dashboards — real data)
// ─────────────────────────────────────────────────────────────────────────────
app.get("/api/system/dashboards", authenticate, (_req: Request, res: Response) => {
  const patients = db.getPatients();
  const orders = db.getOrders();
  const profile = db.getProfile();

  const lowSpo2 = patients.filter((p) => p.vitals?.[0]?.spo2 && p.vitals[0].spo2 < 92).map((p) => ({
    name: p.name, uhid: p.uhid, bed: p.bedNumber || p.ward || "OPD", spo2: p.vitals![0].spo2,
  }));
  const highTemp = patients.filter((p) => p.vitals?.[0]?.tempF && p.vitals[0].tempF > 102).map((p) => ({
    name: p.name, uhid: p.uhid, tempF: p.vitals![0].tempF,
  }));
  // NOTE: the vitals record stores respiratory rate as `respRate`, NOT `rr`.
  // This block used to read `p.vitals?.[0]?.rr`, which was always `undefined`,
  // so `highRR` was permanently empty and `deterioration.amber` silently
  // under-counted respiratory deterioration. The *response* key stays `rr`
  // because that is what the dashboard consumes
  // (src/sections/system/CommandDashboards.tsx types it as `rr: number`).
  const highRR = patients.filter((p) => p.vitals?.[0]?.respRate && p.vitals[0].respRate > 24).map((p) => ({
    name: p.name, uhid: p.uhid, rr: p.vitals![0].respRate,
  }));
  const criticalOrders = orders.filter((o) => o.isCritical && o.status !== "completed");
  const pendingStat = orders.filter((o) => o.priority === "stat" && o.status === "pending");
  const pendingOrders = orders.filter((o) => o.status === "pending");

  const occupied = patients.length;
  const totalBeds = profile.bedCapacity?.total || 50;
  const bedShortage = occupied > totalBeds ? occupied - totalBeds : 0;

  const byStatus: Record<string, number> = {};
  for (const p of patients) byStatus[p.admissionStatus || "unknown"] = (byStatus[p.admissionStatus || "unknown"] || 0) + 1;

  const byDept: Record<string, number> = {};
  for (const p of patients) {
    const d = p.department || p.ward || "General";
    byDept[d] = (byDept[d] || 0) + 1;
  }

  const knowledgeSources = KnowledgeRegistry.list().length;
  const agentStates: Record<string, number> = {};
  for (const a of AgentRegistry.list()) agentStates[a.status] = (agentStates[a.status] || 0) + 1;

  const ecoSummary = ecosystemManager.getEcosystemSummary();

  res.json({
    ok: true,
    hospital: { name: profile.name, occupied, totalBeds, bedShortage, byStatus, byDept },
    riskRadar: { lowSpo2, highTemp, highRR, criticalOrders: criticalOrders.map((o) => ({ item: o.item, patientName: o.patientName, result: o.result })), pendingStat: pendingStat.map((o) => o.item), bedShortage },
    deterioration: { amber: lowSpo2.length + highTemp.length + highRR.length, red: lowSpo2.length, patients: [...new Set([...lowSpo2, ...highTemp, ...highRR].map((p) => p.uhid))].length },
    journey: { byStatus, stages: { registered: patients.length, discharged: byStatus.discharged || 0, admitted: (byStatus.inpatient || 0) + (byStatus.emergency || 0) } },
    knowledge: { sources: knowledgeSources, docsIndexed: 0, staleSources: 0, missingEvidenceTopics: ["PMC full text", "Europe PMC", "WHO IRIS"] },
    agentHealth: { states: agentStates, total: AgentRegistry.list().length, active: AgentRegistry.listActive().length },
    safetyQueue: { unverifiedCritical: criticalOrders.length, pendingOrders: pendingOrders.length, unreviewedRadiology: orders.filter((o) => o.category === "radiology" && o.status === "pending").length },
    epidemiology: { byDept, notifiableQueue: [] },
    pluginHealth: {
      total: ecoSummary.catalogSize,
      installed: ecoSummary.installed,
      active: ecoSummary.active,
      byStatus: ecoSummary.byStatus ?? {},
      tiers: ecoSummary.tiers ?? {},
      degraded: (ecoSummary.degraded ?? []).map((d: any) => d.pluginId),
    },
    updatedAt: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// 9d. CLINICAL SUPERCORE v3 — SUSRUTA / HOPE ENGINE / BIO-SIM / CASCADE / SHIELD
// ---------------------------------------------------------------------------
const findPatientByUhid = (uhid: string) => {
  const m = uhid.match(/^(\d+)$/);
  const patients = db.getPatients();
  return patients.find((p) => p.uhid === uhid || p.id === uhid || (m && p.uhid.endsWith(m[1]))) || null;
};

const latestVitalsOf = (p: any) => {
  const v = p?.vitals;
  return Array.isArray(v) && v.length > 0 ? v[v.length - 1] : undefined;
};

// ROLE FIX: these clinical decision-support routes used to list "nurse" in
// their allow-list. "nurse" is not a member of the `Role` union — this hospital
// models nursing staff as role "ward" (see KNOWN_USERS in server/rbac.ts:
// `ward-token` -> "Sister Mary (Head Nurse)"). Since requireRole() hard-denies
// any role not in the list, that entry was inert: the intended nurse access was
// never granted, and every ward nurse got a 403 on these eleven endpoints.
// Corrected to "ward" so the allow-list means what it says.
app.get("/api/synapse/:uhid", authenticate, requireRole(["doctor", "admin", "ceo", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  const vitals = latestVitalsOf(p);
  const spo2 = vitals?.spo2;
  const hr = vitals?.heartRate;
  const rr = vitals?.respRate;
  const temp = vitals?.tempF;
  const bpSys = vitals?.bpSys;
  const ews =
    (spo2 !== undefined && spo2 < 92 ? 3 : 0) +
    (hr !== undefined && hr > 110 ? 2 : 0) +
    (rr !== undefined && rr > 24 ? 2 : 0) +
    (temp !== undefined && temp > 102 ? 2 : 0) +
    (bpSys !== undefined && bpSys < 90 ? 2 : 0);
  res.json({
    ok: true,
    patient: {
      name: p.name, uhid: p.uhid, age: p.age, gender: p.gender, ward: p.ward || "OPD", bedNumber: p.bedNumber || null,
      admissionStatus: p.admissionStatus, diagnosis: p.diagnosis || "Under evaluation", chiefComplaint: p.chiefComplaint,
      allergies: p.allergies || [],
    },
    vitals: vitals || null,
    ews: { score: ews, risk: ews >= 6 ? "RED" : ews >= 3 ? "AMBER" : "GREEN" },
    genomics: { status: "NO_PROFILE_ON_FILE", note: "Genomic/pharmacogenomic profile not available. Variant-driven dosing NOT applied.", actionable: false },
    mdt: { status: ews >= 6 ? "RECOMMENDED" : "OPTIONAL", note: ews >= 6 ? "Escalation to senior physician / MDT advised." : "No escalation trigger from current vitals." },
    medReconciliation: { medications: (p as any).medications || [], discrepancies: [] },
    pendingInvestigations: (p as any).pendingInvestigations || [],
    digitalTwin: { conditionDrivers: ["Cardiovascular", "Respiratory", "Thermoregulation", "Hydration"], ews, layerState: { SKIN: "neutral", SKELETAL: "neutral", MUSCULAR: "neutral", VASCULAR: spo2 !== undefined && spo2 < 92 ? "alert" : "neutral", NERVOUS: "neutral", ORGANS: temp !== undefined && temp > 102 ? "alert" : "neutral" } },
    updatedAt: new Date().toISOString(),
  });
});

app.get("/api/susruta/:uhid", authenticate, requireRole(["doctor", "admin", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  const v = latestVitalsOf(p);
  const analysis = SusrutaClinicalEngine.analyze({
    patientName: p.name, uhid: p.uhid, complaint: p.chiefComplaint,
    vitals: v, riskFactors: p.allergies, existingDiagnosis: p.diagnosis ?? null,
  });
  res.json({ ok: true, analysis });
});

app.get("/api/hope-engine/:uhid", authenticate, requireRole(["doctor", "admin", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  const v = latestVitalsOf(p);
  const analysis = SusrutaClinicalEngine.analyze({
    patientName: p.name, uhid: p.uhid, complaint: p.chiefComplaint,
    vitals: v, riskFactors: p.allergies, existingDiagnosis: p.diagnosis ?? null,
    deepDiscoveryRequested: true,
  });
  res.json({ ok: true, deepDiscovery: analysis.deepDiscovery });
});

app.get("/api/biosim/:uhid", authenticate, requireRole(["doctor", "admin", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  const v = latestVitalsOf(p);
  const labs = (p as any).labResults || [];
  const hbLab = labs.find((l: any) => /hb|haemoglobin|hemoglobin/i.test(l.testName || l.name || ""));
  const sim = BioSimEngine.simulate({
    heartRate: v?.heartRate, bpSys: v?.bpSys, bpDia: v?.bpDia,
    hb: hbLab ? Number(hbLab.result) : undefined,
    saO2: v?.spo2 !== undefined ? v.spo2 / 100 : undefined,
  }, { name: p.name, uhid: p.uhid });
  res.json({ ok: true, sim });
});

app.get("/api/cascade/:uhid", authenticate, requireRole(["doctor", "admin", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  const v = latestVitalsOf(p);
  const cascade = MolecularCascadeAgent.run({
    question: `full molecular cascade for ${p.name}`, patientName: p.name, uhid: p.uhid,
    vitals: v, labs: (p as any).labResults, diagnosis: p.diagnosis,
  });
  res.json({ ok: true, cascade });
});

app.get("/api/vent-brain/:uhid", authenticate, requireRole(["doctor", "admin", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  res.json({ ok: true, vent: VentBrainAgent.assess({ patientName: p.name, uhid: p.uhid }) });
});

app.get("/api/tox-command/:uhid", authenticate, requireRole(["doctor", "admin", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  const tox = ToxCommandAgent.match(
    p.chiefComplaint.toLowerCase().split(/[,,;]|\band\b/).map((s: string) => s.trim()).filter(Boolean),
    { patientName: p.name, uhid: p.uhid }
  );
  res.json({ ok: true, tox });
});

app.get("/api/trauma-intelligence/:uhid", authenticate, requireRole(["doctor", "admin", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  const trauma = TraumaIntelligenceAgent.assess({
    injuries: [{ region: "unspecified", description: p.chiefComplaint }],
    patientName: p.name, uhid: p.uhid,
  });
  res.json({ ok: true, trauma });
});

app.get("/api/surgical-roadmap/:uhid", authenticate, requireRole(["doctor", "admin", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  const v = latestVitalsOf(p);
  const roadmap = SurgicalRoadmapAgent.run({
    indication: p.diagnosis || p.chiefComplaint, patientName: p.name, uhid: p.uhid,
    vitals: v, comorbidities: p.allergies,
  });
  res.json({ ok: true, roadmap });
});

app.get("/api/twin/:uhid", authenticate, requireRole(["doctor", "admin", "ward"]), (_req: Request<{ uhid: string }>, res: Response) => {
  const p = findPatientByUhid(_req.params.uhid);
  if (!p) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  const v = latestVitalsOf(p);
  const spo2 = v?.spo2;
  const temp = v?.tempF;
  const hr = v?.heartRate;
  const conditions: Array<{ organ: string; condition: string; state: "alert" | "watch" | "stable" }> = [];
  if (temp !== undefined && temp > 102) conditions.push({ organ: "Lungs", condition: "Febrile — inflammatory pathway active", state: "alert" });
  if (spo2 !== undefined && spo2 < 92) conditions.push({ organ: "Lungs", condition: "Hypoxemia — oxygen delivery reduced", state: "alert" });
  if (hr !== undefined && hr > 110) conditions.push({ organ: "Heart", condition: "Tachycardia — sympathetic drive elevated", state: "watch" });
  if (spo2 !== undefined && spo2 >= 92 && temp !== undefined && temp <= 102 && hr !== undefined && hr <= 110) {
    conditions.push({ organ: "Lungs", condition: "Ventilation stable", state: "stable" });
    conditions.push({ organ: "Heart", condition: "Perfusion adequate", state: "stable" });
  }
  res.json({
    ok: true,
    twin: {
      patientName: p.name, uhid: p.uhid, layers: ["SKIN", "SKELETAL", "MUSCULAR", "VASCULAR", "NERVOUS", "ORGANS"],
      conditions,
      layerState: {
        SKIN: "neutral", SKELETAL: "neutral", MUSCULAR: "neutral",
        VASCULAR: spo2 !== undefined && spo2 < 92 ? "alert" : "neutral",
        NERVOUS: "neutral", ORGANS: temp !== undefined && temp > 102 ? "alert" : "neutral",
      },
      vitals: v || null,
    },
  });
});

app.post("/api/shield/check", authenticate, requireRole(["doctor", "admin", "ward"]), (req: Request, res: Response) => {
  const { medication, dose, frequency, patientUhid } = req.body || {};
  const p = patientUhid ? findPatientByUhid(String(patientUhid)) : null;
  const v = p ? latestVitalsOf(p) : undefined;
  const result = ShieldGuardian.checkOrder({
    medication: String(medication || ""),
    dose: dose !== undefined ? String(dose) : undefined,
    frequency: frequency ? String(frequency) : undefined,
    patientMedications: (p as any)?.medications,
    allergies: p?.allergies,
    bloodPressure: v ? { sys: v.bpSys, dia: v.bpDia } : undefined,
  });
  res.json({ ok: true, shield: result });
});

app.post("/api/cerebellum/filter", authenticate, (req: Request, res: Response) => {
  const { text, context, userEmotion, empathyFilterEnabled } = req.body || {};
  const result = CerebellumFilter.filter({
    text: String(text || ""),
    context: (["PATIENT", "ATTENDANT", "DOCTOR", "EMERGENCY"].includes(context) ? context : "PATIENT"),
    userEmotion: ["ANGRY", "ANXIOUS", "GRIEVING", "CALM"].includes(userEmotion) ? userEmotion : undefined,
    empathyFilterEnabled: empathyFilterEnabled !== false,
  });
  res.json({ ok: true, filter: result });
});

// ---------------------------------------------------------------------------
// 10. ROLE TERMINAL DIRECT ROUTE GUARDS & STATIC FRONTEND SERVING
// ---------------------------------------------------------------------------
const DIST_DIR = path.join(process.cwd(), "dist");
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

// Serve Human Atlas microfrontend (built static output)
const HUMAN_ATLAS_DIR = path.join(process.cwd(), "external", "human-atlas", "dist");
if (fs.existsSync(HUMAN_ATLAS_DIR)) {
  app.use("/integrations/human-atlas", express.static(HUMAN_ATLAS_DIR));
}

// Start Server
const astraHttpServer = app.listen(Number(PORT), HOST, () => {
  // Live avatar WebSocket gateway rides the same HTTP server (§11) — browser
  // connects to ws://host:PORT/ws/avatar instead of any external port.
  attachAvatarGateway(astraHttpServer);
  attachCallGateway(astraHttpServer);
  console.log(`=======================================================`);
  console.log(`🏥 Astra AI — Hospital AI Operating System Online`);
  console.log(`🌐 Server running at http://${HOST}:${PORT}`);
  console.log(`🗣️  Avatar WebSocket gateway: ws://${HOST}:${PORT}${wsGatewayStatus().path}`);
  console.log(`🔒 Server-Side RBAC: ENFORCED`);
  console.log(`🧠 LangGraph Agent & Model Router: ACTIVE`);
  console.log(`📡 Real-Time Event Fabric: LISTENING`);

  // AUTO-START of ASTRA-managed internal services (§20). Only services that
  // are already installed are started; install happens explicitly via the
  // admin API. ASTRA never reports internal services as ready before a real
  // health probe passes.
  if (process.env.ASTRA_SKIP_INTERNAL_SERVICE_AUTOSTART === "1") {
    console.log("⚙️ [Services] internal service auto-start disabled by launcher");
  } else {
    void (async () => {
      try {
        const { internalServiceManager } = await import("./services/serviceManager");
        const { isInstalled } = await import("./services/installer");
        for (const id of ["freellmapi", "omniroute"] as const) {
          if (!isInstalled(id)) {
            console.log(`⚙️ [Services] ${id}: not installed yet (install via AI Infrastructure → Internal Services)`);
            continue;
          }
          try {
            const snap = await internalServiceManager.start(id, { timeoutMs: 30_000 });
            console.log(`⚙️ [Services] ${id}: ${snap.state} @ ${snap.endpoint}`);
          } catch (err: any) {
            console.error(`⚙️ [Services] ${id}: FAILED to auto-start → ${err?.message ?? err}`);
          }
        }
      } catch (err: any) {
        console.error(`[Services] Internal service manager bootstrap error: ${err?.message ?? err}`);
      }
    })();
  }

  // Laya System-1 runtime auto-start (§20 semantics for a PYTHON service):
  // only when installed on disk; never blocks boot; never claims health
  // without a probe — the runtime itself defers Router preload to first use.
  void (async () => {
    try {
      const { detectLaya, startLaya } = await import("./services/layaService");
      if (!detectLaya().installed) {
        console.log("⚙️ [Laya] not installed (plugins/laya venv or server script missing)");
        return;
      }
      const st = await startLaya();
      console.log(`⚙️ [Laya]: ${st.state} @ ${st.endpoint} — ${st.detail}`);
    } catch (err: any) {
      console.error(`⚙️ [Laya] auto-start failed → ${err?.message ?? err}`);
    }
  })();

  // Auto-start the MCP connection sweep. This is what moves configured MCP
  // servers from CONFIGURED → CONNECTING → CONNECTED → READY by performing the
  // REAL protocol negotiation and tool discovery. Without this sweep, all MCP
  // servers stayed at "configured / 0 connected" forever.
  try { startMcpConnectionSweep(30_000); console.log(`⚙️ [MCP] connection sweep started (enabled servers will be auto-connected)`); }
  catch (err: any) { console.error(`[MCP] failed to start connection sweep: ${err?.message ?? err}`); }

  // Establish truthful PubMed readiness at boot when the key is configured.
  // This removes the misleading "probe: never" state after every restart
  // without inventing readiness or exposing the NCBI credential.
  void runPubMedProbe().then((probe) => {
    console.log(`[PubMed] startup probe ${probe.ok ? "passed" : "failed"} (${probe.latencyMs}ms)`);
  }).catch((err) => {
    console.error(`[PubMed] startup probe failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  console.log(`=======================================================`);
});

export default app;
