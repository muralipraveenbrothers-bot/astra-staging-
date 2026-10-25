/**
 * ASTRA ModelGateway — one OpenAI-compatible front door.
 *
 * FreeLLMAPI is the only non-local route. If it is unavailable, the request
 * fails clearly rather than silently moving through a deprecated gateway.
 * PHI / HIGH_RISK_CLINICAL never leave the explicit local allowlist.
 * "auto" is never a PHI model. A missing local model fails closed
 * (LOCAL_MODEL_UNAVAILABLE) — it is never silently sent to a remote provider.
 *
 * Keys are read from the existing env layer (config/ai-gateway.env via
 * loadBackendEnv). This module never logs a key or patient text.
 */
import { aiGatewayConfig } from "./config";
import { openaiChatCompletions, openaiGetModels, shouldFailover, type OpenAICallResult } from "./openaiCompatible";
import { nextRequestId, recordAiLog } from "./log";
import { canAttempt, recordFailure, recordSuccess, breakerSnapshot, resetBreakers } from "./circuitBreaker";
import { classifyData } from "./policy";
import { collectExistingAgentDrafts, type ExistingAgentDraft } from "../../src/agents/existingAgentDrafts";

export type ModelDataClass = "PUBLIC" | "INTERNAL" | "PHI" | "HIGH_RISK_CLINICAL";
export type GatewayRouteId = "freellmapi" | "ollama";

export class LocalModelUnavailableError extends Error {
  readonly code = "LOCAL_MODEL_UNAVAILABLE" as const;
  readonly requestId: string;
  constructor(requestId: string, detail: string) {
    super(`LOCAL_MODEL_UNAVAILABLE: ${detail}`);
    this.name = "LocalModelUnavailableError";
    this.requestId = requestId;
  }
}

export class ModelGatewayError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly status: number;
  constructor(code: string, requestId: string, message: string, status = 0) {
    super(`${code}: ${message}`);
    this.name = "ModelGatewayError";
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

export interface ModelGatewayMessage {
  role: string;
  content: unknown;
}

export interface ModelGatewayRequest {
  model?: string;
  messages: ModelGatewayMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** Explicit class. When omitted, text is classified and clinical/PHI stays local. */
  dataClass?: ModelDataClass;
  /** Optional caller correlation id. A new one is minted when absent. */
  requestId?: string;
  /** Ordered model ids to try on the chosen route after `model`. */
  modelFallback?: string[];
  signal?: AbortSignal;
}

export interface ModelGatewayResult {
  requestId: string;
  route: GatewayRouteId;
  model: string;
  status: number;
  latencyMs: number;
  attempts: number;
  text: string;
  json: unknown;
  /** Which gateway answered. Always set. Never a key, never patient text. */
  answeredBy: GatewayRouteId;
  dataClass: ModelDataClass;
}

export interface GatewayMetrics {
  requests: number;
  successes: number;
  failures: number;
  blockedDeprecatedFallbacks: number;
  phiLocalOnly: number;
  localUnavailable: number;
  byRoute: Record<GatewayRouteId, { attempts: number; successes: number; failures: number }>;
  circuits: ReturnType<typeof breakerSnapshot>;
}

interface GatewayEnv {
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  localModel: string;
  localAllowlist: string[];
  timeoutMs: number;
  maxRetries: number;
  ollamaBaseUrl: string;
}

const metrics: GatewayMetrics = {
  requests: 0,
  successes: 0,
  failures: 0,
  blockedDeprecatedFallbacks: 0,
  phiLocalOnly: 0,
  localUnavailable: 0,
  byRoute: {
    freellmapi: { attempts: 0, successes: 0, failures: 0 },
    ollama: { attempts: 0, successes: 0, failures: 0 },
  },
  circuits: {},
};

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function listEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** One env layer. No deprecated gateway credentials are read by this path. */
export function readModelGatewayEnv(): GatewayEnv {
  const cfg = aiGatewayConfig();
  const localAllowlist = listEnv("ASTRA_LLM_LOCAL_ALLOWLIST");
  const localModel =
    (process.env.ASTRA_LLM_LOCAL_MODEL || process.env.OLLAMA_MODEL || "").trim() ||
    localAllowlist[0] ||
    "";
  return {
    baseUrl: (process.env.ASTRA_LLM_BASE_URL || cfg.primary.baseUrl).replace(/\/+$/, ""),
    apiKey: process.env.ASTRA_LLM_API_KEY || cfg.primary.apiKey,
    defaultModel: (process.env.ASTRA_LLM_DEFAULT_MODEL || process.env.FREELLMAPI_MODEL || "auto").trim(),
    localModel,
    localAllowlist: localAllowlist.length ? localAllowlist : localModel ? [localModel] : [],
    timeoutMs: intEnv("ASTRA_LLM_TIMEOUT_MS", intEnv("FREELLMAPI_TIMEOUT_MS", 60_000)),
    maxRetries: intEnv("ASTRA_LLM_MAX_RETRIES", 2),
    ollamaBaseUrl: cfg.ollama.baseUrl.replace(/\/+$/, ""),
  };
}

export function toModelDataClass(input: { dataClass?: ModelDataClass; text: string }): ModelDataClass {
  if (input.dataClass) return input.dataClass;
  const klass = classifyData(input.text);
  if (klass === "HIGHLY_SENSITIVE") return "PHI";
  if (klass === "CLINICAL" || klass === "SENSITIVE") return "HIGH_RISK_CLINICAL";
  if (/\b(uhid|patient|diagnosis|medication|lab)\b/i.test(input.text)) return "PHI";
  return "INTERNAL";
}

export function isRestrictedClass(klass: ModelDataClass): boolean {
  return klass === "PHI" || klass === "HIGH_RISK_CLINICAL";
}

function messageText(messages: ModelGatewayMessage[]): string {
  return messages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chatText(result: OpenAICallResult): string {
  const json = result.json as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

async function probeReady(baseUrl: string, apiKey: string | undefined, timeoutMs: number): Promise<boolean> {
  const origin = baseUrl.replace(/\/v1\/?$/, "");
  const probes = [`${origin}/api/ping`, `${origin}/readyz`, `${baseUrl}/models?ready=true`];
  for (const url of probes) {
    try {
      const res = await fetch(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(Math.min(timeoutMs, 4000)),
      });
      if (res.ok) return true;
    } catch {
      /* next probe in the required order */
    }
  }
  return false;
}

/** Ready chat models from GET /v1/models?ready=true, then GET /v1/models. */
export async function discoverReadyModels(): Promise<string[]> {
  const env = readModelGatewayEnv();
  const ready = await openaiGetModels(`${env.baseUrl}?ready=true`, env.apiKey, 4000);
  const listed = ready.ok ? ready : await openaiGetModels(env.baseUrl, env.apiKey, 4000);
  const data = (listed.json as { data?: { id?: string; available?: boolean }[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((m) => m && m.available !== false && typeof m.id === "string" && m.id !== "auto")
    .map((m) => m.id as string);
}

async function callRoute(opts: {
  route: GatewayRouteId;
  baseUrl: string;
  apiKey?: string;
  model: string;
  body: Record<string, unknown>;
  requestId: string;
  timeoutMs: number;
  maxRetries: number;
  signal?: AbortSignal;
}): Promise<OpenAICallResult> {
  let last: OpenAICallResult = { ok: false, status: 0, latencyMs: 0, text: "", json: null, error: "not attempted" };
  const tries = Math.max(1, opts.maxRetries + 1);
  for (let attempt = 0; attempt < tries; attempt++) {
    if (!canAttempt(opts.route)) {
      last = { ok: false, status: 0, latencyMs: 0, text: "", json: null, error: "circuit open" };
      break;
    }
    metrics.byRoute[opts.route].attempts += 1;
    last = await openaiChatCompletions({
      baseURL: opts.baseUrl,
      apiKey: opts.apiKey,
      body: { ...opts.body, model: opts.model },
      timeoutMs: opts.timeoutMs,
      requestId: opts.requestId,
      signal: opts.signal,
    });
    recordAiLog({
      requestId: opts.requestId,
      timestamp: new Date().toISOString(),
      service: opts.route,
      model: opts.model,
      latencyMs: last.latencyMs,
      status: last.status,
      fallbackAttempts: attempt,
      error: last.ok ? undefined : last.error,
      routedVia: opts.route,
    });
    if (last.ok) {
      recordSuccess(opts.route);
      metrics.byRoute[opts.route].successes += 1;
      return last;
    }
    recordFailure(opts.route);
    metrics.byRoute[opts.route].failures += 1;
    if (!shouldFailover(last.status, last.error) || attempt === tries - 1) break;
    await sleep(Math.min(2000, 150 * 2 ** attempt));
  }
  return last;
}

/**
 * Chat through FreeLLMAPI only. Restricted classes never reach a remote route.
 */
export async function modelGatewayChat(req: ModelGatewayRequest): Promise<ModelGatewayResult> {
  const env = readModelGatewayEnv();
  const requestId = req.requestId?.trim() || nextRequestId();
  const dataClass = toModelDataClass({ dataClass: req.dataClass, text: messageText(req.messages) });
  const restricted = isRestrictedClass(dataClass);
  metrics.requests += 1;

  const body: Record<string, unknown> = {
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    stream: false,
  };

  if (restricted) {
    metrics.phiLocalOnly += 1;
    const requested = (req.model || "").trim();
    if (!requested || requested === "auto") {
      metrics.localUnavailable += 1;
      metrics.failures += 1;
      throw new LocalModelUnavailableError(
        requestId,
        "PHI and HIGH_RISK_CLINICAL cannot use model \"auto\". Set ASTRA_LLM_LOCAL_MODEL to an allowlisted local model.",
      );
    }
    if (env.localAllowlist.length > 0 && !env.localAllowlist.includes(requested) && requested !== env.localModel) {
      metrics.localUnavailable += 1;
      metrics.failures += 1;
      throw new LocalModelUnavailableError(requestId, `model \"${requested}\" is not on the local PHI allowlist`);
    }
    const local = await callRoute({
      route: "ollama",
      baseUrl: env.ollamaBaseUrl,
      model: requested,
      body,
      requestId,
      timeoutMs: env.timeoutMs,
      maxRetries: 0,
      signal: req.signal,
    });
    if (!local.ok) {
      metrics.localUnavailable += 1;
      metrics.failures += 1;
      throw new LocalModelUnavailableError(
        requestId,
        "local model did not respond; remote fallback is refused for PHI",
      );
    }
    metrics.successes += 1;
    return {
      requestId,
      route: "ollama",
      model: requested,
      status: local.status,
      latencyMs: local.latencyMs,
      attempts: 1,
      text: chatText(local),
      json: local.json,
      answeredBy: "ollama",
      dataClass,
    };
  }

  const primaryModel = (req.model || env.defaultModel || "auto").trim() || "auto";
  const models = [primaryModel, ...(req.modelFallback ?? [])].filter((m, i, all) => m && all.indexOf(m) === i);
  let attempts = 0;
  let lastError = "FreeLLMAPI did not respond";

  if (canAttempt("freellmapi")) {
    for (const model of models) {
      attempts += 1;
      const primary = await callRoute({
        route: "freellmapi",
        baseUrl: env.baseUrl,
        apiKey: env.apiKey,
        model,
        body,
        requestId,
        timeoutMs: env.timeoutMs,
        maxRetries: env.maxRetries,
        signal: req.signal,
      });
      if (primary.ok) {
        metrics.successes += 1;
        console.log(`[model-gateway] ${requestId} answeredBy=freellmapi model=${model}`);
        return {
          requestId,
          route: "freellmapi",
          model,
          status: primary.status,
          latencyMs: primary.latencyMs,
          attempts,
          text: chatText(primary),
          json: primary.json,
          answeredBy: "freellmapi",
          dataClass,
        };
      }
      lastError = primary.error ?? `HTTP ${primary.status}`;
      if (!shouldFailover(primary.status, primary.error)) break;
    }
  } else {
    lastError = "FreeLLMAPI circuit open";
  }

  metrics.failures += 1;
  metrics.blockedDeprecatedFallbacks += 1;
  throw new ModelGatewayError("FREELLMAPI_UNAVAILABLE", requestId, `FreeLLMAPI failed; no deprecated gateway fallback is permitted: ${lastError}`);
}

export function doctorOrderStaysLocal(input: {
  text: string;
  patientName?: string;
  uhid?: string;
  note?: string;
  diagnosis?: string;
}): boolean {
  if ([input.patientName, input.uhid, input.note, input.diagnosis].some((v) => typeof v === "string" && v.trim().length > 0)) {
    return true;
  }
  if (isRestrictedClass(toModelDataClass({ text: input.text }))) return true;
  return /\b(uhid|mrn|patient name|diagnos\w*|clinical note|progress note)\b/i.test(input.text);
}

async function discoverOllamaChatModel(baseUrl: string): Promise<string> {
  const origin = baseUrl.replace(/\/v1\/?$/, "");
  try {
    const res = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return "";
    const body = (await res.json()) as { models?: { name?: string }[] };
    const names = (body.models ?? []).map((m) => m.name).filter((n): n is string => typeof n === "string" && n.length > 0);
    return names.find((n) => !/embed|bge|nomic/i.test(n)) ?? "";
  } catch {
    return "";
  }
}

export interface DoctorOrderRequest {
  text: string;
  patientName?: string;
  uhid?: string;
  note?: string;
  diagnosis?: string;
  requestId?: string;
}

export interface DoctorOrderTrace {
  privacy: "local" | "not-local";
  answeredBy: GatewayRouteId | "none";
  model: string;
  /** Drafts that actually ran. Patient text is not copied into this object. */
  drafts: ExistingAgentDraft[];
}

export interface DoctorOrderResult {
  ok: boolean;
  answeredBy: GatewayRouteId | "none";
  text: string;
  model: string;
  requestId: string;
  localOnly: boolean;
  error?: string;
  /** Existing local agents that were not otherwise called. Labeled draft. Not a diagnosis. */
  drafts?: ExistingAgentDraft[];
  /** Privacy decision, answering model, and the drafts that ran. No patient text. */
  trace?: DoctorOrderTrace;
}

/**
 * One doctor order.
 * Patient name, UHID, note, or diagnosis stays on local Ollama and is never sent to FreeLLMAPI.
 * Non-patient text: FreeLLMAPI first, then explicit local Ollama fallback.
 * ChatGPT, Grok, Kimi, Gemini, and Sarvam are not called.
 */
export async function doctorOrderChat(req: DoctorOrderRequest): Promise<DoctorOrderResult> {
  const env = readModelGatewayEnv();
  const requestId = req.requestId?.trim() || nextRequestId();
  const text = (req.text ?? "").trim();
  if (!text) {
    return { ok: false, answeredBy: "none", text: "", model: "", requestId, localOnly: false, error: "MISSING_TEXT" };
  }
  const localOnly = doctorOrderStaysLocal(req);
  const draftTask = collectExistingAgentDrafts(text, { allowExternalEvidence: !localOnly }).catch(() => [] as ExistingAgentDraft[]);
  const pack = async (result: Omit<DoctorOrderResult, "drafts" | "trace">): Promise<DoctorOrderResult> => {
    const drafts = await draftTask;
    return {
      ...result,
      drafts,
      trace: {
        privacy: result.localOnly ? "local" : "not-local",
        answeredBy: result.answeredBy,
        model: result.model,
        drafts,
      },
    };
  };
  const userContent = localOnly
    ? [req.patientName ? `Patient name: ${req.patientName}` : "", req.uhid ? `UHID: ${req.uhid}` : "", req.diagnosis ? `Diagnosis: ${req.diagnosis}` : "", req.note ? `Note: ${req.note}` : "", text].filter(Boolean).join("\n")
    : text;
  const body: Record<string, unknown> = {
    messages: [
      {
        role: "system",
        content: localOnly
          ? "You are Astra on the local hospital model. Decision support only. Do not invent results. Be brief."
          : "You are Astra. Answer this non-patient prompt briefly. Do not request patient identifiers.",
      },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_tokens: 400,
    stream: false,
  };
  metrics.requests += 1;

  if (localOnly) {
    metrics.phiLocalOnly += 1;
    let model = env.localModel || (await discoverOllamaChatModel(env.ollamaBaseUrl));
    if (!model) {
      metrics.localUnavailable += 1;
      metrics.failures += 1;
      return pack({ ok: false, answeredBy: "none", text: "", model: "", requestId, localOnly: true, error: "local model unavailable; remote fallback refused" });
    }
    if (env.localAllowlist.length > 0 && !env.localAllowlist.includes(model)) {
      model = env.localAllowlist[0] ?? "";
    }
    if (!model) {
      metrics.localUnavailable += 1;
      metrics.failures += 1;
      return pack({ ok: false, answeredBy: "none", text: "", model: "", requestId, localOnly: true, error: "local model is not on the PHI allowlist" });
    }
    const local = await callRoute({
      route: "ollama",
      baseUrl: env.ollamaBaseUrl,
      model,
      body,
      requestId,
      timeoutMs: Math.min(env.timeoutMs, 25_000),
      maxRetries: 0,
    });
    if (!local.ok) {
      metrics.localUnavailable += 1;
      metrics.failures += 1;
      return pack({ ok: false, answeredBy: "none", text: "", model, requestId, localOnly: true, error: "local model did not respond; remote fallback is refused for PHI" });
    }
    metrics.successes += 1;
    return pack({ ok: true, answeredBy: "ollama", text: chatText(local), model, requestId, localOnly: true });
  }

  const model = (env.defaultModel || "auto").trim() || "auto";
  const freellmUp = await probeReady(env.baseUrl, env.apiKey, 2500);
  if (freellmUp) {
    const primary = await callRoute({
      route: "freellmapi",
      baseUrl: env.baseUrl,
      apiKey: env.apiKey,
      model,
      body,
      requestId,
      timeoutMs: env.timeoutMs,
      maxRetries: 0,
    });
    if (primary.ok) {
      metrics.successes += 1;
      return pack({ ok: true, answeredBy: "freellmapi", text: chatText(primary), model, requestId, localOnly: false });
    }
  }

  const localModel = env.localModel || (await discoverOllamaChatModel(env.ollamaBaseUrl));
  if (localModel) {
    const local = await callRoute({
      route: "ollama",
      baseUrl: env.ollamaBaseUrl,
      model: localModel,
      body,
      requestId,
      timeoutMs: Math.min(env.timeoutMs, 25_000),
      maxRetries: 0,
    });
    if (local.ok) {
      metrics.successes += 1;
      return pack({ ok: true, answeredBy: "ollama", text: chatText(local), model: localModel, requestId, localOnly: false });
    }
  }

  metrics.failures += 1;
  return pack({
    ok: false,
    answeredBy: "none",
    text: "",
    model: "",
    requestId,
    localOnly: false,
    error: "FreeLLMAPI and Ollama did not answer",
  });
}

export async function modelGatewayHealth(): Promise<{
  freellmapi: boolean;
  order: string[];
}> {
  const env = readModelGatewayEnv();
  const freellmapi = await probeReady(env.baseUrl, env.apiKey, env.timeoutMs);
  return { freellmapi, order: ["GET /api/ping", "GET /readyz", "GET /v1/models?ready=true"] };
}

export function modelGatewayMetrics(): GatewayMetrics {
  return { ...metrics, byRoute: structuredClone(metrics.byRoute), circuits: breakerSnapshot() };
}

export function resetModelGatewayMetrics(): void {
  metrics.requests = 0;
  metrics.successes = 0;
  metrics.failures = 0;
  metrics.blockedDeprecatedFallbacks = 0;
  metrics.phiLocalOnly = 0;
  metrics.localUnavailable = 0;
  for (const id of ["freellmapi", "ollama"] as const) {
    metrics.byRoute[id] = { attempts: 0, successes: 0, failures: 0 };
  }
  resetBreakers();
}

/** Central ModelGateway class required by prompt 03. */
export class ModelGateway {
  static chat = modelGatewayChat;
  static health = modelGatewayHealth;
  static metrics = modelGatewayMetrics;
  static resetMetrics = resetModelGatewayMetrics;
  static discoverReadyModels = discoverReadyModels;
  static readEnv = readModelGatewayEnv;

  chat(req: ModelGatewayRequest): Promise<ModelGatewayResult> {
    return modelGatewayChat(req);
  }
  health(): Promise<{ freellmapi: boolean; order: string[] }> {
    return modelGatewayHealth();
  }
  metrics(): GatewayMetrics {
    return modelGatewayMetrics();
  }
  resetMetrics(): void {
    resetModelGatewayMetrics();
  }
}

export const __test = { probeReady };



