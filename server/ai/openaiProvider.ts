/**
 * ASTRA AI — OpenAI-compatible provider adapter
 * Wraps the EXISTING server/ai/openaiCompatible.ts helper into AIProvider.
 * Used for FreeLLMAPI (primary), OmniRoute (fallback), and Ollama (local).
 * Legacy gatewayAdapter.ts chain is preserved and still used by /v1.
 */
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIProviderHealth,
} from "./types";
import { openaiChatCompletions, openaiGetModels } from "./openaiCompatible";
import { aiGatewayConfig } from "./config";
import { maskSecret } from "./loadEnv";

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly configured: boolean;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly modelFallback: string;
  private readonly timeoutMs: number;

  constructor(opts: { id: string; name: string; baseUrl: string; apiKey?: string; modelFallback?: string; timeoutMs?: number }) {
    this.id = opts.id;
    this.name = opts.name;
    this.baseUrl = opts.baseUrl;
    this.apiKey = opts.apiKey;
    this.modelFallback = opts.modelFallback ?? "";
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.configured = Boolean(opts.baseUrl);
  }

  async chat(req: AIRequest): Promise<AIResponse> {
    const model = req.model && req.model !== "auto" ? req.model : this.modelFallback || "auto";
    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
    };
    const t0 = Date.now();
    const r = await openaiChatCompletions({
      baseURL: this.baseUrl,
      apiKey: this.apiKey,
      body,
      timeoutMs: req.timeoutMs ?? this.timeoutMs,
      requestId: req.requestId ?? "",
      signal: req.signal,
    });
    if (!r.ok) {
      const err = new Error(`${this.name} HTTP ${r.status}: ${r.error ?? ""}`);
      (err as { code?: string; providerId?: string }).providerId = this.id;
      (err as { code?: string }).code = r.status === 429 ? "AIProviderRateLimited" : r.status === 0 ? "AIProviderUnavailable" : "AIProviderUnavailable";
      throw err;
    }
    const json = r.json as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | null;
    const content = typeof json?.choices?.[0]?.message?.content === "string"
      ? json.choices[0].message.content as string
      : r.text;
    return {
      providerId: this.id,
      model,
      text: content ?? "",
      json: r.json,
      usage: json?.usage
        ? { inputTokens: json.usage.prompt_tokens, outputTokens: json.usage.completion_tokens, totalTokens: json.usage.total_tokens }
        : undefined,
      latencyMs: r.latencyMs ?? Date.now() - t0,
      status: r.status,
      requestId: req.requestId ?? "",
    };
  }

  async *stream(req: AIRequest): AsyncGenerator<AIStreamChunk> {
    const model = req.model && req.model !== "auto" ? req.model : this.modelFallback || "auto";
    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      ...(req.max_tokens ? { max_tokens: req.max_tokens } : {}),
      stream: true,
    };
    const r = await openaiChatCompletions({
      baseURL: this.baseUrl,
      apiKey: this.apiKey,
      body,
      timeoutMs: req.timeoutMs ?? this.timeoutMs,
      requestId: req.requestId ?? "",
      signal: req.signal,
    });
    if (r.response && r.ok) {
      yield* streamOpenAiSse(r.response, this.id, model);
      return;
    }
    const json = r.json as { choices?: { message?: { content?: unknown } }[] } | null;
    const content = typeof json?.choices?.[0]?.message?.content === "string"
      ? json.choices[0].message.content as string
      : r.text;
    if (content) yield { providerId: this.id, model, delta: content, done: false };
    yield { providerId: this.id, model, done: true };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const checkedAt = new Date().toISOString();
    const t0 = Date.now();
    // OmniRoute desktop app (:20128): /v1/models can take 15–35s cold (3627-model
    // catalog). Health must be fast + honest, so probe the cheap root instead.
    if (this.id === "omniroute") {
      const origin = this.baseUrl.replace(/\/v1\/?$/, "");
      try {
        const r = await fetch(origin, { signal: AbortSignal.timeout(8000) });
        const latencyMs = Date.now() - t0;
        const ok = r.status > 0 && r.status < 500;
        return {
          id: this.id,
          provider: this.name,
          status: ok ? "healthy" : "unavailable",
          latencyMs,
          keyConfigured: maskSecret(this.apiKey ?? "") === "set",
          checkedAt,
          detail: ok ? undefined : `HTTP ${r.status}`,
        };
      } catch (e) {
        return {
          id: this.id,
          provider: this.name,
          status: "unavailable",
          latencyMs: Date.now() - t0,
          keyConfigured: maskSecret(this.apiKey ?? "") === "set",
          checkedAt,
          detail: e instanceof Error ? e.message.slice(0, 160) : "unreachable",
        };
      }
    }
    try {
      const models = await openaiGetModels(this.baseUrl, this.apiKey, 4000);
      return {
        id: this.id,
        provider: this.name,
        status: models.ok ? "healthy" : models.status === 401 || models.status === 403 ? "degraded" : "unavailable",
        latencyMs: models.latencyMs ?? Date.now() - t0,
        keyConfigured: maskSecret(this.apiKey ?? "") === "set",
        checkedAt,
        detail: models.ok ? undefined : models.error,
      };
    } catch (e) {
      return {
        id: this.id,
        provider: this.name,
        status: "unavailable",
        latencyMs: Date.now() - t0,
        keyConfigured: maskSecret(this.apiKey ?? "") === "set",
        checkedAt,
        detail: e instanceof Error ? e.message.slice(0, 160) : "unreachable",
      };
    }
  }
}

async function* streamOpenAiSse(res: Response, providerId: string, model: string): AsyncGenerator<AIStreamChunk> {
  if (!res.body) {
    yield { providerId, model, done: true };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const s = t.slice(5).trim();
        if (s === "[DONE]" || s === "") continue;
        try {
          const j = JSON.parse(s);
          const delta = j?.choices?.[0]?.delta?.content;
          const usage = j?.usage;
          if (delta) {
            yield {
              providerId,
              model,
              delta: String(delta),
              done: false,
              ...(usage ? { usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } } : {}),
            };
          }
        } catch {
          /* ignore malformed SSE line */
        }
      }
    }
    yield { providerId, model, done: true };
  } finally {
    reader.releaseLock();
  }
}

/** Build the three OpenAI-compatible providers from existing Astra config. */
export function buildOpenAIProviders(): OpenAICompatibleProvider[] {
  const cfg = aiGatewayConfig();
  const timeoutMs = Number(process.env.FREELLMAPI_TIMEOUT_MS ?? 60_000);
  const freeModel = (process.env.FREELLMAPI_MODEL ?? "auto").trim() || "auto";
  return [
    new OpenAICompatibleProvider({
      id: cfg.primary.id,
      name: cfg.primary.name,
      baseUrl: cfg.primary.baseUrl,
      apiKey: cfg.primary.apiKey,
      modelFallback: freeModel,
      timeoutMs,
    }),
    new OpenAICompatibleProvider({
      id: cfg.fallback.id,
      name: cfg.fallback.name,
      baseUrl: cfg.fallback.baseUrl,
      apiKey: cfg.fallback.apiKey,
      modelFallback: "auto",
      timeoutMs,
    }),
    new OpenAICompatibleProvider({
      id: cfg.local.id,
      name: cfg.local.name,
      baseUrl: cfg.local.baseUrl,
      apiKey: cfg.local.apiKey,
      modelFallback: process.env.OLLAMA_MODEL?.trim() || "auto",
      timeoutMs,
    }),
  ];
}
