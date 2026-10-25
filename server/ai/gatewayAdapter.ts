import { aiGatewayConfig, type AiServiceConfig } from "./config";
import { openaiChatCompletions, shouldFailover } from "./openaiCompatible";
import { nextRequestId, recordAiLog, type AiRequestLog } from "./log";

export class AllGatewaysFailedError extends Error {
  constructor(public readonly details: string[], public readonly requestId: string) {
    super(
      `All approved routes failed. FreeLLMAPI (primary) and Ollama (local fallback) are unavailable.\n${details.join("\n")}`,
    );
    this.name = "AllGatewaysFailedError";
  }
}

export interface GatewayChatBody {
  model?: string;
  messages: Array<{ role: string; content: unknown }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface GatewayChatResult {
  requestId: string;
  service: "freellmapi" | "ollama";
  model: string;
  status: number;
  latencyMs: number;
  fallbackAttempts: number;
  json: unknown;
  text: string;
  stream?: Response;
  routedVia?: string | null;
}

const circuit: Record<string, { fails: number; openUntil: number }> = {};

function circuitOpen(id: string): boolean {
  const c = circuit[id];
  return Boolean(c && c.openUntil > Date.now());
}
function circuitFail(id: string): void {
  const c = circuit[id] ?? { fails: 0, openUntil: 0 };
  c.fails += 1;
  if (c.fails >= 3) c.openUntil = Date.now() + 30_000;
  circuit[id] = c;
}
function circuitOk(id: string): void {
  circuit[id] = { fails: 0, openUntil: 0 };
}

export async function callAi(body: GatewayChatBody): Promise<GatewayChatResult> {
  const cfg = aiGatewayConfig();
  const requestId = nextRequestId();
  const model = typeof body.model === "string" && body.model.trim() ? body.model : "auto";
  const errors: string[] = [];
  let fallbackAttempts = 0;

  const tryOne = async (svc: AiServiceConfig, payloadModel: string): Promise<GatewayChatResult | null> => {
    const payload = { ...body, model: payloadModel };
    const result = await openaiChatCompletions({
      baseURL: svc.baseUrl,
      apiKey: svc.apiKey,
      body: payload,
      requestId,
    });
    const log: AiRequestLog = {
      requestId,
      timestamp: new Date().toISOString(),
      service: svc.id,
      model: payloadModel,
      latencyMs: result.latencyMs,
      status: result.status,
      fallbackAttempts,
      error: result.error,
      routedVia: result.routedVia,
    };
    recordAiLog(log);

    if (result.ok) {
      circuitOk(svc.id);
      return {
        requestId,
        service: svc.id as "freellmapi" | "ollama",
        model: payloadModel,
        status: result.status,
        latencyMs: result.latencyMs,
        fallbackAttempts,
        json: result.json,
        text: result.text,
        stream: payload.stream ? result.response : undefined,
        routedVia: result.routedVia,
      };
    }

    circuitFail(svc.id);
    errors.push(`${svc.name}: ${result.error ?? `HTTP ${result.status}`}`);
    if (!shouldFailover(result.status, result.error)) {
      errors.push(`${svc.name}: non-transient ${result.status} — failover suppressed`);
    }
    return null;
  };

  // --- astra-micro fast path: local-only, skip cloud gateways (MiniMind). ---
  // Kept off the FreeLLMAPI chain for offline use, minimal latency
  // and zero external token cost. Model must be pulled into Ollama first.
  if (model === "astra-micro") {
    try {
      const { getMiniMindConfig } = await import("../../astra/intelligence_extensions/minimind/config");
      const mm = getMiniMindConfig();
      if (mm.enabled) {
        const local = await tryOne(
          { id: "astra-micro", name: "Astra Micro (MiniMind)", role: "LOCAL_FALLBACK", baseUrl: mm.ollamaBase + "/v1", dashboardUrl: mm.ollamaBase, apiKey: undefined, keyPresent: false },
          mm.ollamaModel,
        );
        if (local) return { ...local, service: "ollama" as const };
        errors.push(`Astra Micro unavailable at ${mm.ollamaBase} (pull the model and start Ollama)`);
        throw new AllGatewaysFailedError(errors, requestId);
      }
      errors.push("MINIMIND_ENABLED is false");
      throw new AllGatewaysFailedError(errors, requestId);
    } catch (err) {
      if (err instanceof AllGatewaysFailedError) throw err;
      throw new AllGatewaysFailedError([`astra-micro error: ${err instanceof Error ? err.message : String(err)}`], requestId);
    }
  }

  const primary = circuitOpen(cfg.primary.id) ? null : await tryOne(cfg.primary, model);
  if (primary) return primary;
  // Local Ollama — last resort. "auto" is not an Ollama model id.
  fallbackAttempts = 1;
  let localModel = model === "auto" || !model ? "" : model;
  if (!localModel || localModel === "auto") {
    try {
      const { loadModelCatalog, pickLocalChatModel } = await import("./modelCatalog");
      localModel = pickLocalChatModel((await loadModelCatalog()).models) ?? "";
    } catch {
      localModel = "";
    }
  }
  if (localModel) {
    const local = await tryOne(cfg.local, localModel);
    if (local) return local;
  } else {
    errors.push("Ollama: no local chat model discovered (refusing to invent an id)");
  }

  throw new AllGatewaysFailedError(errors, requestId);
}

export async function testPrimaryThenFallback(): Promise<{
  requestId: string;
  primary: { models: unknown; chat: unknown };
  used: "freellmapi" | "none";
  failurePoint?: string;
}> {
  const { openaiGetModels } = await import("./openaiCompatible");
  const cfg = aiGatewayConfig();
  const requestId = nextRequestId();

  const probe = async (svc: AiServiceConfig) => {
    const models = await openaiGetModels(svc.baseUrl, svc.apiKey, 4000);
    const chat = await openaiChatCompletions({
      baseURL: svc.baseUrl,
      apiKey: svc.apiKey,
      requestId,
      timeoutMs: 20_000,
      body: {
        model: "auto",
        messages: [{ role: "user", content: "Reply with exactly: ASTRA_AI_OK" }],
        max_tokens: 32,
        temperature: 0,
      },
    });
    recordAiLog({
      requestId,
      timestamp: new Date().toISOString(),
      service: svc.id,
      model: "auto",
      latencyMs: models.latencyMs + chat.latencyMs,
      status: chat.status || models.status,
      fallbackAttempts: svc.role === "FALLBACK" ? 1 : 0,
      error: chat.error || models.error,
    });
    return {
      endpoint: svc.baseUrl,
      keyConfigured: svc.keyPresent,
      models: {
        ok: models.ok,
        status: models.status,
        latencyMs: models.latencyMs,
        error: models.error,
        count: Array.isArray((models.json as { data?: unknown[] } | null)?.data)
          ? (models.json as { data: unknown[] }).data.length
          : undefined,
      },
      chat: {
        ok: chat.ok,
        status: chat.status,
        latencyMs: chat.latencyMs,
        error: chat.error,
        preview: typeof (chat.json as { choices?: { message?: { content?: string } }[] } | null)?.choices?.[0]?.message?.content === "string"
          ? (chat.json as { choices: { message: { content: string } }[] }).choices[0].message.content.slice(0, 160)
          : undefined,
      },
    };
  };

  const primary = await probe(cfg.primary);
  if (primary.models.ok && primary.chat.ok) {
    return { requestId, primary, used: "freellmapi" };
  }

  const failurePoint = !primary.models.ok
    ? `FreeLLMAPI GET ${cfg.primary.baseUrl}/models → ${primary.models.error ?? primary.models.status}`
    : `FreeLLMAPI POST ${cfg.primary.baseUrl}/chat/completions → ${primary.chat.error ?? primary.chat.status}`;

  return {
    requestId,
    primary,
    used: "none",
    failurePoint: `${failurePoint}; no deprecated gateway fallback is permitted`,
  };
}
