/**
 * ASTRA AI — Provider Registry & Fallback Gateway (§4 / §5 / §22)
 * ===============================================================
 * Builds the configured provider set and exposes a single
 * `aiGatewayChat` entry point. Copilot uses the Brain chat order:
 *
 *   FreeLLMAPI, then Ollama.
 *
 * Patient name, UHID, note, diagnosis, or other PHI stays on local Ollama
 * and is not sent to Gemini or FreeLLMAPI.
 * Each hop has timeout + retry, structured errors, request tracing, and
 * circuit-breaker courtesy of gatewayAdapter.
 */
import type { AIProvider, AIRequest, AIResponse, AIProviderHealth } from "./types";
import { AITask } from "./types";
import { nextRequestId } from "./log";
import { GeminiProvider } from "./gemini";
import { buildOpenAIProviders } from "./openaiProvider";
import { doctorOrderStaysLocal } from "./modelGateway";
import { canAttempt, recordFailure, recordSuccess } from "./circuitBreaker";

export interface GatewayChatRequest {
  messages: AIRequest["messages"];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  timeoutMs?: number;
  task?: AITask;
  language?: string;
  requestId?: string;
  /** Structured PHI. Together with user text, this keeps the turn on local Ollama. */
  patientName?: string;
  uhid?: string;
  note?: string;
  diagnosis?: string;
}

export interface GatewayChatResult extends AIResponse {
  tried: string[];
  fallbackUsed: boolean;
}

const RETRYABLE = new Set<string>(["AIProviderTimeout", "AIProviderRateLimited", "AIProviderUnavailable"]);

let cached: { providers: AIProvider[]; at: number } | null = null;
const CACHE_MS = 5000;

export function buildAiProviders(): AIProvider[] {
  const openAi = buildOpenAIProviders();
  const gemini = new GeminiProvider();
  // Gemini is always listed so health can report "key not configured" honestly.
  // Unconfigured providers are skipped at call time.
  return [gemini, ...openAi];
}

export function getAiProviders(force = false): AIProvider[] {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.providers;
  cached = { providers: buildAiProviders(), at: Date.now() };
  return cached.providers;
}

function classify(err: unknown): "retryable" | "terminal" {
  const code = (err as any)?.code;
  if (code && RETRYABLE.has(code)) return "retryable";
  const msg = (err as Error)?.message ?? String(err);
  if (/rate.?limit|429|insufficient_quota/i.test(msg)) return "retryable";
  if (/timed out|abort/i.test(msg)) return "retryable";
  return "terminal";
}

async function tryOnce(provider: AIProvider, req: AIRequest, requestId: string, timeoutMs: number, attempt: number): Promise<AIResponse> {
  const signal = req.signal;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let composed = signal;
  if (signal) {
    const outer = signal;
    const inner = controller.signal;
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    outer.addEventListener("abort", onAbort, { once: true });
    inner.addEventListener("abort", onAbort, { once: true });
    composed = ac.signal;
  } else {
    composed = controller.signal;
  }
  try {
    const r = await provider.chat({ ...req, requestId, signal: composed });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

/** Walk the fallback chain for a task. Never fabricates a result. */
export async function aiGatewayChat(req: GatewayChatRequest): Promise<GatewayChatResult> {
  const requestId = req.requestId ?? nextRequestId();
  const providers = getAiProviders(true);
  const task = req.task ?? AITask.GeneralAssistant;
  const userText = req.messages
    .filter((m) => m.role === "user")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");
  const localOnly = doctorOrderStaysLocal({
    text: userText,
    patientName: req.patientName,
    uhid: req.uhid,
    note: req.note,
    diagnosis: req.diagnosis,
  });
  // Same order as Brain chat. Gemini is not in this chain. PHI never leaves Ollama.
  const chain = localOnly
    ? (["ollama"] as const)
    : (["freellmapi", "ollama"] as const);
  const ordered = chain
    .map((id) => providers.find((p) => p.id === id))
    .filter((p): p is AIProvider => Boolean(p));
  const timeoutMs = req.timeoutMs ?? Number(process.env.ASTRA_AI_TIMEOUT_MS ?? 60_000);
  const tried: string[] = [];
  let lastErr: unknown = undefined;

  // FreeLLMAPI, then Ollama. PHI is local Ollama only.
  for (const provider of ordered) {
    if (!provider.configured) continue;
    if (!canAttempt(provider.id)) continue;
    tried.push(provider.id);
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const response = await tryOnce(provider, {
          messages: req.messages,
          model: req.model,
          temperature: req.temperature,
          max_tokens: req.max_tokens,
          stream: false,
          task,
          language: req.language,
          requestId,
        }, requestId, timeoutMs, attempt);
        if (response && (response.text?.trim() || response.json)) {
          recordSuccess(provider.id);
          return { ...response, requestId, tried, fallbackUsed: tried.length > 1 };
        }
        recordFailure(provider.id); // empty completion counts as a provider failure
      } catch (e) {
        lastErr = e;
        recordFailure(provider.id);
        if (attempt >= 2 || classify(e) === "terminal") break;
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }

  // Honest miss: no fabricated completion. Caller (orchestrator) degrades.
  return {
    providerId: tried[tried.length - 1] ?? "none",
    model: "",
    text: "",
    json: null,
    latencyMs: 0,
    status: 0,
    requestId,
    tried,
    fallbackUsed: tried.length > 0,
    error: lastErr instanceof Error ? lastErr.message : tried.length === 0 ? "no configured providers" : String(lastErr ?? "all providers failed"),
  };
}

/** Parallel health check across all configured providers. */
export async function getAiProvidersHealth(): Promise<AIProviderHealth[]> {
  const providers = getAiProviders(true);
  return Promise.all(providers.map((p) => p.healthCheck().catch((e) => ({
    id: p.id, provider: p.name, status: "unavailable" as const, latencyMs: 0,
    keyConfigured: false, checkedAt: new Date().toISOString(), detail: e instanceof Error ? e.message.slice(0, 160) : "unreachable",
  }))));
}
