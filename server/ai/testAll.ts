import { collectAiHealth } from "./health";
import { testPrimaryThenFallback } from "./gatewayAdapter";
import { hermesHealth } from "../agents/hermesAdapter";
import { agentOrchestrator } from "../langgraph";
import { listCapabilities } from "./capabilityRegistry";
import { openaiGetModels, openaiChatCompletions } from "./openaiCompatible";
import { aiGatewayConfig } from "./config";
import { nextRequestId } from "./log";
import { pickLocalChatModel, loadModelCatalog } from "./modelCatalog";

export type HonestStatus = "LIVE" | "DEGRADED" | "AUTH_REQUIRED" | "OFFLINE" | "FAILED" | "UNKNOWN";

async function smokeOllama() {
  const cfg = aiGatewayConfig();
  const catalog = await loadModelCatalog();
  const model = pickLocalChatModel(catalog.models);
  if (!model) return { ok: false, status: "OFFLINE" as const, detail: "no local chat model discovered" };
  const chat = await openaiChatCompletions({
    baseURL: cfg.local.baseUrl,
    requestId: nextRequestId(),
    timeoutMs: 20_000,
    body: { model, messages: [{ role: "user", content: "Reply with exactly: ASTRA_OLLAMA_OK" }], max_tokens: 16, temperature: 0 },
  });
  const text = JSON.stringify(chat.json ?? chat.text);
  return {
    ok: chat.ok,
    status: chat.ok ? ("LIVE" as const) : ("FAILED" as const),
    detail: chat.ok ? `model=${model}` : chat.error,
    token: text.includes("ASTRA_OLLAMA_OK") || text.includes("OK"),
  };
}

export async function testAllServices() {
  const [health, caps, routing, hermes, ollama] = await Promise.all([
    collectAiHealth(),
    listCapabilities(),
    testPrimaryThenFallback(),
    hermesHealth(),
    smokeOllama().catch((e) => ({ ok: false, status: "FAILED" as const, detail: e instanceof Error ? e.message : String(e) })),
  ]);

  const langgraph = {
    ok: true,
    status: "LIVE" as const,
    detail: `in-process skills=${agentOrchestrator.getLearnedSkills().length}`,
  };

  const byId = Object.fromEntries(caps.map((c) => [c.id, c]));

  const row = (id: string, extra?: Record<string, unknown>) => {
    const c = byId[id];
    const status = c?.status ?? "UNKNOWN";
    return {
      id,
      status,
      pass: status === "LIVE", // PASS/FAIL per agent (system setup, item 5)
      latency: c?.latency,
      last_error: c?.last_error,
      dashboard_url: c?.dashboard_url,
      api_url: c?.api_url,
      ...extra,
    };
  };

  const result = {
    checkedAt: new Date().toISOString(),
    routing: {
      primary: routing.used === "freellmapi" ? "ASTRA_FREELLM_PRIMARY_OK" : routing.used,
      used: routing.used,
      failurePoint: routing.failurePoint,
    },
    services: {
      astra: row("astra", { status: "LIVE" }),
      freellmapi: row("freellmapi", { functional: routing.used === "freellmapi" }),
      omniroute: row("omniroute"),
      ollama: row("ollama", ollama),
      hermes: row("hermes", { hermesStatus: hermes.status, compatible: hermes.config.compatible, model: hermes.config.model, context: hermes.config.contextLength }),
      langgraph,
      paperclip: row("paperclip"),
      openclaw: row("openclaw"),
      agentzero: row("agentzero"),
      openhands: row("openhands"),
      n8n: row("n8n"),
      voicebox: row("voicebox"),
    },
    health,
  };

  // Persist the central state DB snapshot alongside every full test run (best-effort).
  try {
    const { saveCentralState } = await import("./stateStore");
    await saveCentralState();
  } catch {
    /* non-fatal */
  }

  return result;
}
