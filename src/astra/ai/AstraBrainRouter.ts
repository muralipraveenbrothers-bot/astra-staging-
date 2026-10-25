/**
 * ASTRA SAARATHI — Astra Brain Router (repair prompt §E / §F / §G / §H / §I).
 * ===========================================================================
 * Saarathi does not talk to one model. It asks the Astra gateway, which is the
 * ONLY sanctioned fan-out and already implements the real chain:
 *
 *   FreeLLMAPI  →  OmniRoute  →  Ollama (local)  →  Gemini
 *
 * with per-provider timeouts, retries and circuit breakers
 * (`server/ai/providerRegistry.ts`). No endpoint here is invented: both tiers
 * below are existing Astra routes.
 *
 * THE BUG THIS REPLACES
 * ---------------------
 * A single fetch whose `reply || answer || response` was accepted as-is, so an
 * upstream returning HTTP 200 with an empty body produced the user-facing
 * "Astra returned an empty answer". Now:
 *   1. `response.ok` is checked BEFORE `.json()` (§I);
 *   2. text is validated with `extractModelText` — metadata is not an answer (§H);
 *   3. an empty answer is an internal diagnostic and the router moves on (§F/§G);
 *   4. only when EVERY tier fails does the user hear the honest line;
 *   5. nothing clinical is ever fabricated as a network-error fallback.
 */

import { describeEmptyResponse, extractModelText } from "./modelText";

export interface BrainAttempt {
  /** "astra-gateway" | "astra-openai-adapter" — the TIER that was tried. */
  tier: string;
  ok: boolean;
  latencyMs: number;
  /** Names of the providers the gateway itself reported as failing. */
  failedProviders?: string[];
  error?: string;
}

export interface BrainAnswer {
  ok: boolean;
  text: string;
  /** Which provider actually produced the answer (from the gateway envelope). */
  provider: string;
  model?: string;
  requestId?: string;
  latencyMs: number;
  attempts: BrainAttempt[];
  /** true only when every tier failed — the caller must NOT claim an answer. */
  allProvidersFailed: boolean;
  error?: string;
}

/** Honest final message. The user is never told the request was answered. */
export const BRAIN_UNAVAILABLE_MESSAGE =
  "Saarathi's reasoning services are temporarily unavailable. Hospital controls remain operational.";

export interface AskAstraBrainOptions {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  clinical?: boolean;
  /** Compiled Saarathi policy slice (never one giant prompt). */
  memory?: string;
  language?: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 45_000;

interface TierDef {
  name: string;
  url: string;
  headers?: Record<string, string>;
}

/** Both tiers are EXISTING Astra routes — see server/ai/routes.ts. */
const TIERS: TierDef[] = [
  { name: "astra-gateway", url: "/api/ai/chat" },
  { name: "astra-openai-adapter", url: "/v1/chat/completions" },
];

function gatewayEnvelope(body: any): { provider?: string; model?: string; requestId?: string } {
  const astra = body?.astra ?? {};
  return {
    provider: astra.service ?? astra.agent,
    model: body?.model,
    requestId: astra.requestId,
  };
}

/** Providers the gateway reported as failing, parsed from its own details blob. */
function failedProvidersFrom(body: any): string[] | undefined {
  const details = body?.details ?? body?.astra?.details;
  if (!details) return undefined;
  if (Array.isArray(details)) {
    return details
      .map((d) => (typeof d === "string" ? d : d?.provider ?? d?.id))
      .filter((v): v is string => typeof v === "string");
  }
  if (typeof details === "object") return Object.keys(details);
  return undefined;
}

async function tryTier(
  tier: TierDef,
  options: AskAstraBrainOptions,
  timeoutMs: number
): Promise<{ answer?: BrainAnswer; attempt: BrainAttempt }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onOuterAbort, { once: true });

  const attempt: BrainAttempt = { tier: tier.name, ok: false, latencyMs: 0 };

  try {
    const res = await fetch(tier.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(tier.headers ?? {}) },
      body: JSON.stringify({
        messages: options.messages,
        stream: false,
        agent: "astra",
        clinical: options.clinical !== false,
        memory: options.memory,
        language: options.language,
        model: options.model,
        temperature: options.temperature,
      }),
      signal: controller.signal,
    });

    // ---- §I: HTTP status is checked BEFORE the body is trusted ------------
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      attempt.latencyMs = Date.now() - started;
      attempt.failedProviders = failedProvidersFrom(body);
      const message = (body as any)?.message ?? (body as any)?.error ?? `HTTP ${res.status}`;
      attempt.error = typeof message === "string" ? message.slice(0, 300) : `HTTP ${res.status}`;
      return { attempt };
    }

    // ---- §H: transport success is NOT answer success ----------------------
    const text = extractModelText(body);
    if (!text) {
      attempt.latencyMs = Date.now() - started;
      attempt.error = `empty answer (${describeEmptyResponse(body)})`;
      attempt.failedProviders = failedProvidersFrom(body);
      return { attempt };
    }

    attempt.ok = true;
    attempt.latencyMs = Date.now() - started;
    const envelope = gatewayEnvelope(body);
    return {
      attempt,
      answer: {
        ok: true,
        text: text.trim(),
        provider: envelope.provider ?? tier.name,
        model: envelope.model,
        requestId: envelope.requestId,
        latencyMs: Date.now() - started,
        attempts: [attempt],
        allProvidersFailed: false,
      },
    };
  } catch (e) {
    attempt.latencyMs = Date.now() - started;
    attempt.error =
      (e as { name?: string })?.name === "AbortError"
        ? "timed out"
        : e instanceof Error
          ? e.message.slice(0, 300)
          : String(e);
    return { attempt };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * Ask Astra. Walks the tiers in order; an empty answer or a transport failure is
 * an INTERNAL event and immediately moves to the next tier.
 * ALWAYS resolves — never throws into the UI.
 */
export async function askAstraBrain(options: AskAstraBrainOptions): Promise<BrainAnswer> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts: BrainAttempt[] = [];

  for (const tier of TIERS) {
    const { answer, attempt } = await tryTier(tier, options, timeoutMs);
    attempts.push(attempt);
    if (answer) {
      return { ...answer, attempts };
    }
    // Internal diagnostics only — the user must never see "empty answer".
    console.warn(
      `[Saarathi brain] ${tier.name} did not produce an answer: ${attempt.error}` +
        (attempt.failedProviders?.length ? ` (failed providers: ${attempt.failedProviders.join(", ")})` : "")
    );
  }

  return {
    ok: false,
    text: "",
    provider: "none",
    latencyMs: attempts.reduce((sum, a) => sum + a.latencyMs, 0),
    attempts,
    allProvidersFailed: true,
    error: BRAIN_UNAVAILABLE_MESSAGE,
  };
}

/** Convenience: a single-turn question with a system prompt. */
export async function askAstraBrainOnce(
  system: string,
  user: string,
  options: Omit<AskAstraBrainOptions, "messages"> = {}
): Promise<BrainAnswer> {
  return askAstraBrain({
    ...options,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
}