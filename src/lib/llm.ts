/**
 * Real backend client for FreeLLMAPI + Ollama.
 *
 * All browser calls go through the Vite dev-server proxy mounts
 * (see vite.config.ts) so CORS never blocks localhost-to-localhost calls:
 *
 *   /proxy/freellmapi/**  → canonical FreeLLMAPI registry endpoint
 *   /proxy/ollama/**      → http://127.0.0.1:11434/**
 *
 * The proxy TARGET is fixed (fixed mounts), but the PATH is derived from the
 * user-configured base URL at runtime: if the user sets the FreeLLMAPI base
 * URL to the canonical FreeLLMAPI endpoint, the pathname `/v1`
 * is what gets appended to the proxy mount.
 *
 * Chat uses the OpenAI-compatible streaming endpoint for BOTH providers:
 *   FreeLLMAPI: {base}/v1/chat/completions (unified router, SSE)
 *   Ollama:     http://127.0.0.1:11434/v1/chat/completions
 *               (Ollama has natively supported the OpenAI-compatible API
 *               since v0.1.24 — same SSE `data:` line format, so one parser
 *               serves both providers.)
 */

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  modelCount?: number;
  models?: string[];
  error?: string;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamChatOpts {
  provider: "freellmapi" | "ollama";
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: ChatTurn[];
  onToken: (token: string) => void;
  signal?: AbortSignal;
  /** UI language — when "te"/"hi", the system prompt is suffixed with a reply-in-that-language instruction. Optional; existing callers are unaffected. */
  language?: "en" | "te" | "hi";
}

export interface StreamChatResult {
  /** ms from request start to first streamed token */
  firstTokenMs: number;
  /** ms for the full stream */
  totalMs: number;
  tokenCount: number;
}

const PROXY_MOUNT: Record<"freellmapi" | "ollama", string> = {
  freellmapi: "/proxy/freellmapi",
  ollama: "/proxy/ollama",
};

/** Pathname of the configured base URL ("" when unparseable or "/"). */
function basePathOf(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return u.pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * OpenAI API root for a base URL, tolerant of a missing `/v1` suffix:
 *   canonical FreeLLMAPI `/v1` endpoint → /v1
 *   canonical FreeLLMAPI origin         → /v1
 *   http://host/api/v1               → /api/v1
 *   http://127.0.0.1:11434           → /v1   (Ollama OpenAI-compat root)
 */
function openAiRoot(baseUrl: string): string {
  const p = basePathOf(baseUrl);
  return p.endsWith("/v1") ? p : `${p}/v1`;
}

function proxiedUrl(kind: "freellmapi" | "ollama", path: string): string {
  return `${PROXY_MOUNT[kind]}${path}`;
}

function friendlyHttpError(status: number, body: string, serviceName: string): string {
  // the Vite dev proxy emits 500 (not 502) when the upstream refuses connection
  if (status === 500 || status === 502 || status === 503 || status === 504)
    return `HTTP ${status} — upstream refused connection (ECONNREFUSED). Is ${serviceName} running?`;
  if (status === 401 || status === 403)
    return `HTTP ${status} — unauthorized. Check the Unified API Key in Settings.`;
  const snippet = body ? ` — ${body.replace(/\s+/g, " ").slice(0, 160)}` : "";
  return `HTTP ${status}${snippet}`;
}

function friendlyNetError(e: unknown, timeoutMs: number): string {
  if (e instanceof DOMException && e.name === "AbortError")
    return `timeout after ${timeoutMs}ms — service not responding`;
  if (e instanceof TypeError)
    return `${e.message} — network/CORS failure. Is the Vite dev proxy up (npm run dev)?`;
  return e instanceof Error ? e.message : String(e);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init.signal ?? ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** GET {base}/models through the FreeLLMAPI proxy. */
export async function testFreellmapi(baseUrl: string, apiKey: string): Promise<TestResult> {
  const url = proxiedUrl("freellmapi", `${openAiRoot(baseUrl)}/models`);
  const t0 = performance.now();
  try {
    const res = await fetchWithTimeout(
      url,
      { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
      5000
    );
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, latencyMs, error: friendlyHttpError(res.status, body, "FreeLLMAPI") };
    }
    const data: unknown = await res.json();
    const list = (data as { data?: { id?: string }[] }).data;
    const models = Array.isArray(list) ? list.map((m) => String(m.id ?? "")).filter(Boolean) : [];
    return { ok: true, latencyMs, modelCount: models.length, models };
  } catch (e) {
    return { ok: false, latencyMs: Math.round(performance.now() - t0), error: friendlyNetError(e, 5000) };
  }
}

/** GET {base}/api/tags through the Ollama proxy. */
export async function testOllama(baseUrl: string): Promise<TestResult> {
  const url = proxiedUrl("ollama", `${basePathOf(baseUrl)}/api/tags`);
  const t0 = performance.now();
  try {
    const res = await fetchWithTimeout(url, {}, 5000);
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, latencyMs, error: friendlyHttpError(res.status, body, "Ollama at 127.0.0.1:11434") };
    }
    const data: unknown = await res.json();
    const list = (data as { models?: { name?: string }[] }).models;
    const models = Array.isArray(list) ? list.map((m) => String(m.name ?? "")).filter(Boolean) : [];
    return { ok: true, latencyMs, modelCount: models.length, models };
  } catch (e) {
    return { ok: false, latencyMs: Math.round(performance.now() - t0), error: friendlyNetError(e, 5000) };
  }
}

/* ---------------- Setup Wizard — real installation detection ---------------- */

export type ToolId = "ollama" | "freellmapi" | "paperclip";

/**
 * Returns true when the tool responds on its local port (any HTTP response
 * counts — a 401/403 from FreeLLMAPI still proves the router is installed
 * and merely needs a key). Connection refusal / timeout → false.
 */
async function probe(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    await fetchWithTimeout(url, {}, timeoutMs);
    return true; // any HTTP response at all
  } catch {
    return false;
  }
}

/** Ollama installed ⇔ GET /api/tags answers (any status). */
export async function detectOllama(): Promise<boolean> {
  return probe(proxiedUrl("ollama", "/api/tags"));
}

/** FreeLLMAPI installed ⇔ /v1/models answers, even with 401 (key needed). */
export async function detectFreellmapi(): Promise<boolean> {
  return probe(proxiedUrl("freellmapi", "/v1/models"));
}

/** Paperclip installed ⇔ the dashboard port answers anything. */
export async function detectPaperclip(): Promise<boolean> {
  return probe("/proxy/paperclip/");
}

export async function detectTool(id: ToolId): Promise<boolean> {
  if (id === "ollama") return detectOllama();
  if (id === "freellmapi") return detectFreellmapi();
  return detectPaperclip();
}

/* -------------- Router Mesh Health Probes (OmniRoute, LiteLLM, RouteLLM) -------------- */

/** OmniRoute desktop app (:20128) ⇔ /v1/models answers (any status). */
export async function testOmniRoute(): Promise<TestResult> {
  const url = "/proxy/omni/v1/models";
  const t0 = performance.now();
  try {
    const res = await fetchWithTimeout(url, {}, 5000);
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok && res.status !== 401 && res.status !== 403) {
      const body = await res.text().catch(() => "");
      return { ok: false, latencyMs, error: friendlyHttpError(res.status, body, "OmniRoute at 127.0.0.1:20128") };
    }
    // Try to get model list
    let models: string[] = [];
    try {
      const modelsRes = await fetchWithTimeout("/proxy/omni/v1/models", {}, 5000);
      if (modelsRes.ok) {
        const data = await modelsRes.json();
        models = Array.isArray(data?.data) ? data.data.map((m: any) => String(m.id ?? "")).filter(Boolean) : [];
      }
    } catch { /* model listing optional */ }
    return { ok: true, latencyMs, modelCount: models.length, models };
  } catch (e) {
    return { ok: false, latencyMs: Math.round(performance.now() - t0), error: friendlyNetError(e, 5000) };
  }
}

/** LiteLLM is RETIRED — no proxy, no probe. Kept so legacy callers get an honest answer. */
export async function testLiteLLM(): Promise<TestResult> {
  return {
    ok: false,
    latencyMs: 0,
    error: "LiteLLM is retired (port 4000 closed). Astra routes FreeLLMAPI → OmniRoute → Ollama.",
  };
}

/** RouteLLM installed ⇔ /health answers. */
export async function testRouteLLM(): Promise<TestResult> {
  const url = "/proxy/routellm/health";
  const t0 = performance.now();
  try {
    const res = await fetchWithTimeout(url, {}, 5000);
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok && res.status !== 401 && res.status !== 403) {
      const body = await res.text().catch(() => "");
      return { ok: false, latencyMs, error: friendlyHttpError(res.status, body, "RouteLLM at 127.0.0.1:6060") };
    }
    return { ok: true, latencyMs, modelCount: 2, models: ["router-mf", "router-bert"] };
  } catch (e) {
    return { ok: false, latencyMs: Math.round(performance.now() - t0), error: friendlyNetError(e, 5000) };
  }
}

/* -------------- Unified Streaming (via Router Mesh) -------------- */

export interface StreamChatUnifiedOpts {
  /** The proxy URL from the router mesh decision */
  proxyUrl: string;
  /** Headers from the router mesh decision */
  headers: Record<string, string>;
  /** Model from the router mesh decision */
  model: string;
  /** Chat messages */
  messages: ChatTurn[];
  /** Token callback */
  onToken: (token: string) => void;
  /** Abort signal */
  signal?: AbortSignal;
  /** UI language */
  language?: "en" | "te" | "hi";
}

/**
 * Stream chat completions through the router mesh.
 * This uses the proxy URL and model selected by UnifiedRouterMesh.routeRequest().
 */
export async function streamChatUnified(opts: StreamChatUnifiedOpts): Promise<StreamChatResult> {
  const { proxyUrl, headers, model, onToken, signal, language } = opts;
  const messages = withLanguage(opts.messages, language);

  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetchWithTimeout(
      proxyUrl,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, stream: true }),
        signal,
      },
      45000
    );
  } catch (e) {
    throw new Error(friendlyNetError(e, 45000));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(friendlyHttpError(res.status, body, `Router mesh (${proxyUrl})`));
  }
  if (!res.body) throw new Error("Response had no body — streaming unsupported.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstTokenMs = -1;
  let tokenCount = 0;
  let done = false;

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") {
      done = true;
      return;
    }
    try {
      const json = JSON.parse(payload) as {
        choices?: { delta?: { content?: string }; message?: { content?: string } }[];
      };
      const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
      if (delta) {
        if (firstTokenMs < 0) firstTokenMs = Math.round(performance.now() - t0);
        tokenCount += 1;
        onToken(delta);
      }
    } catch {
      /* partial JSON chunk — ignored */
    }
  };

  outer: while (true) {
    if (signal?.aborted) {
      void reader.cancel();
      break;
    }
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      handleLine(line);
      if (done) break outer;
    }
  }
  if (buffer) handleLine(buffer);

  return {
    firstTokenMs: firstTokenMs < 0 ? Math.round(performance.now() - t0) : firstTokenMs,
    totalMs: Math.round(performance.now() - t0),
    tokenCount,
  };
}

/**
 * Stream an OpenAI-compatible chat completion via SSE.
 * Works for both FreeLLMAPI (unified router) and Ollama (/v1 compat API).
 * Throws an Error with a user-readable message on failure.
 */
const TE_SUFFIX =
  "Important: the user has selected Telugu (తెలుగు) as the interface language. " +
  "Reply entirely in natural, respectful Telugu suitable for a hospital duty doctor, " +
  "keeping medical and technical terms accurate. Switch back to English only if the user explicitly asks.";

const HI_SUFFIX =
  "Important: the user has selected Hindi (हिन्दी) as the interface language. " +
  "Reply entirely in natural, respectful Hindi suitable for a hospital duty doctor, " +
  "keeping medical and technical terms accurate. Switch back to English only if the user explicitly asks.";

const SUFFIX_FOR: Record<"te" | "hi", string> = { te: TE_SUFFIX, hi: HI_SUFFIX };

/** Append the reply-in-language instruction to the system turn when language is "te"/"hi". */
function withLanguage(messages: ChatTurn[], language?: "en" | "te" | "hi"): ChatTurn[] {
  const suffix = language === "te" || language === "hi" ? SUFFIX_FOR[language] : null;
  if (!suffix) return messages;
  const sysIdx = messages.findIndex((m) => m.role === "system");
  if (sysIdx < 0) return [{ role: "system", content: suffix }, ...messages];
  return messages.map((m, i) => (i === sysIdx ? { ...m, content: `${m.content} ${suffix}` } : m));
}

export async function streamChat(opts: StreamChatOpts): Promise<StreamChatResult> {
  const { provider, baseUrl, apiKey, model, onToken, signal, language } = opts;
  const messages = withLanguage(opts.messages, language);
  const url = proxiedUrl(provider, `${openAiRoot(baseUrl)}/chat/completions`);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "freellmapi" && apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ model, messages, stream: true }),
      },
      30000
    );
  } catch (e) {
    throw new Error(friendlyNetError(e, 30000));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(friendlyHttpError(res.status, body, provider === "freellmapi" ? "FreeLLMAPI" : "Ollama"));
  }
  if (!res.body) throw new Error("Response had no body — streaming unsupported.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstTokenMs = -1;
  let tokenCount = 0;
  let done = false;

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") {
      done = true;
      return;
    }
    try {
      const json = JSON.parse(payload) as {
        choices?: { delta?: { content?: string }; message?: { content?: string } }[];
      };
      const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
      if (delta) {
        if (firstTokenMs < 0) firstTokenMs = Math.round(performance.now() - t0);
        tokenCount += 1;
        onToken(delta);
      }
    } catch {
      /* partial JSON chunk — ignored, next lines carry the rest */
    }
  };

    outer: while (true) {
    if (signal?.aborted) {
      void reader.cancel();
      break;
    }
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      handleLine(line);
      if (done) break outer;
    }
  }
  if (buffer) handleLine(buffer);

  return {
    firstTokenMs: firstTokenMs < 0 ? Math.round(performance.now() - t0) : firstTokenMs,
    totalMs: Math.round(performance.now() - t0),
    tokenCount,
  };
}
