/**
 * ASTRA AI — Google Gemini Provider Adapter
 * =====================================================
 * Real server-side adapter to the Generative Language REST API.
 *   POST /v1beta/models/{model}:generateContent
 *   POST /v1beta/models/{model}:streamGenerateContent?alt=sse
 * Key: GEMINI_API_KEY / GOOGLE_API_KEY / secret-store "gemini.API_KEY"
 * (server env only — NEVER sent to the browser, never read as VITE_*).
 *
 * Existing client-side Gemini (src/astra/agents/* with VITE_GEMINI_API_KEY)
 * is preserved. This adapter is additive for the server gateway.
 *
 * Health is honest: no key → unavailable; probe fail → unavailable/degraded.
 */
import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIProviderHealth,
  AIUsage,
} from "./types";
import { getSecret } from "../services/secrets";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim() && !n.startsWith("VITE_")) return v.trim();
  }
  return undefined;
}

function resolveGeminiKey(explicit?: string): string | undefined {
  if (explicit && explicit.trim()) return explicit.trim();
  const fromEnv = env("GEMINI_API_KEY", "GOOGLE_API_KEY");
  if (fromEnv) return fromEnv;
  try {
    return getSecret("gemini.API_KEY") ?? getSecret("gemini.GEMINI_API_KEY");
  } catch {
    return undefined;
  }
}

function composeSignals(signals: AbortSignal[]): AbortSignal {
  const ac = new AbortController();
  for (const s of signals) {
    if (s?.aborted) {
      ac.abort();
      break;
    }
    s?.addEventListener("abort", () => ac.abort(), { once: true });
  }
  return ac.signal;
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly name = "Google Gemini";
  readonly configured: boolean;
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts?: { apiKey?: string; model?: string; timeoutMs?: number }) {
    this.apiKey = resolveGeminiKey(opts?.apiKey);
    this.model = (opts?.model ?? env("GEMINI_MODEL") ?? "gemini-2.0-flash").trim();
    this.timeoutMs = opts?.timeoutMs ?? Number(env("GEMINI_TIMEOUT_MS") ?? 30000);
    this.configured = Boolean(this.apiKey);
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": this.apiKey as string,
    };
  }

  private toPayload(req: AIRequest) {
    const systemParts: string[] = [];
    const contents: { role: string; parts: { text: string }[] }[] = [];
    for (const m of req.messages) {
      const text =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join("\n")
            : String(m.content ?? "");
      if (m.role === "system") {
        systemParts.push(text);
        continue;
      }
      if (m.role === "assistant") contents.push({ role: "model", parts: [{ text }] });
      else contents.push({ role: "user", parts: [{ text }] });
    }
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        ...(req.max_tokens ? { maxOutputTokens: req.max_tokens } : {}),
      },
    };
    if (systemParts.length) {
      body.systemInstruction = { parts: systemParts.map((t) => ({ text: t })) };
    }
    return body;
  }

  private parseText(json: unknown): string {
    try {
      const parts = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts;
      if (!parts) return "";
      return parts.map((p) => p.text ?? "").join("");
    } catch {
      return "";
    }
  }

  async chat(req: AIRequest): Promise<AIResponse> {
    const t0 = Date.now();
    const requestId = req.requestId ?? "";
    if (!this.apiKey) {
      throw Object.assign(new Error("GEMINI_API_KEY not configured on server"), { code: "AIProviderUnavailable", providerId: this.id });
    }
    const timeout = req.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const composed = req.signal ? composeSignals([req.signal, controller.signal]) : controller.signal;
    try {
      const res = await fetch(`${GEMINI_BASE}/models/${this.model}:generateContent`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.toPayload(req)),
        signal: composed,
      });
      const latencyMs = Date.now() - t0;
      const raw = await res.text();
      let json: unknown = null;
      try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
      if (!res.ok) {
        const detail = (typeof json === "object" && json ? JSON.stringify(json) : raw).slice(0, 200);
        const err = new Error(`Gemini API HTTP ${res.status}`);
        (err as { code?: string; providerId?: string }).providerId = this.id;
        (err as { code?: string }).code = res.status === 429 ? "AIProviderRateLimited" : res.status === 401 || res.status === 403 ? "AIProviderUnavailable" : "AIProviderUnavailable";
        err.message = `Gemini API HTTP ${res.status}: ${detail}`;
        throw err;
      }
      const usage = (json as { usageMetadata?: Record<string, unknown> })?.usageMetadata;
      return {
        providerId: this.id,
        model: this.model,
        text: this.parseText(json),
        json,
        usage: toUsage(usage),
        latencyMs,
        status: res.status,
        requestId,
      };
    } catch (e) {
      if (e instanceof Error && (e.name === "AbortError" || /timeout|aborted/i.test(e.message))) {
        throw Object.assign(new Error(`Gemini request timed out after ${timeout}ms`), { code: "AIProviderTimeout", providerId: this.id });
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(req: AIRequest): AsyncGenerator<AIStreamChunk> {
    if (!this.apiKey) {
      throw Object.assign(new Error("GEMINI_API_KEY not configured on server"), { code: "AIProviderUnavailable", providerId: this.id });
    }
    const timeout = req.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const composed = req.signal ? composeSignals([req.signal, controller.signal]) : controller.signal;
    try {
      const res = await fetch(`${GEMINI_BASE}/models/${this.model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.toPayload(req)),
        signal: composed,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gemini stream HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!res.body) throw new Error("Gemini stream returned no body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            const t = line.trim();
            if (!t || !t.startsWith("data:")) continue;
            const jsonStr = t.slice(5).trim();
            let parsed: unknown;
            try { parsed = JSON.parse(jsonStr); } catch { continue; }
            const textDelta = this.parseText(parsed);
            if (textDelta) yield { providerId: this.id, model: this.model, delta: textDelta, done: false };
          }
        }
        yield { providerId: this.id, model: this.model, done: true };
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.apiKey) {
      return { id: this.id, provider: this.name, status: "unavailable", latencyMs: 0, keyConfigured: false, checkedAt, model: this.model, detail: "GEMINI_API_KEY not configured" };
    }
    const t0 = Date.now();
    try {
      const res = await fetch(`${GEMINI_BASE}/models/${this.model}`, {
        method: "GET",
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - t0;
      if (res.ok) {
        return { id: this.id, provider: this.name, status: "healthy", latencyMs, keyConfigured: true, checkedAt, model: this.model };
      }
      if (res.status === 401 || res.status === 403) {
        return { id: this.id, provider: this.name, status: "degraded", latencyMs, keyConfigured: true, checkedAt, model: this.model, detail: `auth rejected (${res.status})` };
      }
      return { id: this.id, provider: this.name, status: "unavailable", latencyMs, keyConfigured: true, checkedAt, model: this.model, detail: `HTTP ${res.status}` };
    } catch (e) {
      return {
        id: this.id,
        provider: this.name,
        status: "unavailable",
        latencyMs: Date.now() - t0,
        keyConfigured: true,
        checkedAt,
        model: this.model,
        detail: e instanceof Error ? e.message.slice(0, 160) : "unreachable",
      };
    }
  }
}

function toUsage(u?: Record<string, unknown> | null): AIUsage | undefined {
  if (!u) return undefined;
  const n = (k: string): number | undefined => {
    const v = u[k];
    return typeof v === "number" ? v : undefined;
  };
  return { inputTokens: n("promptTokenCount"), outputTokens: n("candidatesTokenCount"), totalTokens: n("totalTokenCount") };
}
