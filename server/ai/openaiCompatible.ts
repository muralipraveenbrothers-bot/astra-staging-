/** OpenAI-compatible client. baseURL must end at /v1 — this appends /chat/completions. */

export interface OpenAICallResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  text: string;
  json: unknown;
  error?: string;
  routedVia?: string | null;
  upstreamRequestId?: string | null;
  response?: Response;
}

function authHeaders(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (apiKey && !apiKey.includes("xxxx")) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

export async function openaiGetModels(
  baseURL: string,
  apiKey: string | undefined,
  timeoutMs = 4000,
): Promise<OpenAICallResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - t0,
      text,
      json,
      error: res.ok ? undefined : `HTTP ${res.status}`,
      routedVia: res.headers.get("x-routed-via"),
      upstreamRequestId: res.headers.get("x-request-id"),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - t0,
      text: "",
      json: null,
      error: msg.includes("abort") || msg.includes("Timeout") ? "timeout" : msg,
    };
  }
}

export async function openaiChatCompletions(opts: {
  baseURL: string;
  apiKey?: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
  requestId: string;
  signal?: AbortSignal;
}): Promise<OpenAICallResult> {
  const t0 = Date.now();
  const stream = Boolean(opts.body.stream);
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = opts.signal
    ? AbortSignal.any
      ? AbortSignal.any([opts.signal, timeout])
      : timeout
    : timeout;
  try {
    const res = await fetch(`${opts.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        ...authHeaders(opts.apiKey),
        "Content-Type": "application/json",
        "X-Request-ID": opts.requestId,
      },
      body: JSON.stringify(opts.body),
      signal,
    });

    if (stream) {
      return {
        ok: res.ok,
        status: res.status,
        latencyMs: Date.now() - t0,
        text: "",
        json: null,
        error: res.ok ? undefined : `HTTP ${res.status}`,
        routedVia: res.headers.get("x-routed-via"),
        upstreamRequestId: res.headers.get("x-request-id"),
        response: res,
      };
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - t0,
      text,
      json,
      error: res.ok ? undefined : `HTTP ${res.status}`,
      routedVia: res.headers.get("x-routed-via"),
      upstreamRequestId: res.headers.get("x-request-id"),
      response: res,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - t0,
      text: "",
      json: null,
      error: msg.includes("abort") || msg.includes("Timeout") ? "timeout" : msg,
    };
  }
}

export function shouldFailover(status: number, error?: string): boolean {
  if (status === 0) return true;
  if (status === 408 || status === 429 || status === 404) return true;
  if (status >= 500) return true;
  if (error === "timeout") return true;
  return false;
}
