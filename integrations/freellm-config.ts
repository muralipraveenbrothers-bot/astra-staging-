/**
 * Unified FreeLLM API & OmniRoute Gateway Configuration
 * Used by all integrated sidecar agents and Astra runtime.
 */

export const FREELLM_PORTS = {
  PRIMARY: 31415,
  // The retired separate FALLBACK port is gone — FreeLLMAPI is ONE process.
  // Kept as an alias of PRIMARY so existing imports keep working.
  FALLBACK: 31415,
  OMNIROUTE: 5171,
  ASTRA_API: 3000,
  ASTRA_UI: 5173,
  AGENT_BRIDGE: 7771,
  BAREHANDS: 8794,
  AI_VISUALIZER: 8790,
} as const;

export const FREELLM_BASE_URL = process.env.FREELLM_BASE_URL || `http://127.0.0.1:${FREELLM_PORTS.PRIMARY}`;
export const FREELLM_FALLBACK_URL = `http://127.0.0.1:${FREELLM_PORTS.FALLBACK}`;
export const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL || `http://127.0.0.1:${FREELLM_PORTS.OMNIROUTE}`;

export interface LLMRequestOptions {
  model?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * Resolves the currently active LLM endpoint (checks primary 31415, then fallback 3001, then OmniRoute 5171)
 */
async function fetchWithRetry(url: string, maxRetries: number = 3, delayMs: number = 500): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 800);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        return res;
      } else {
        console.error(`[LLM] Failed to connect to endpoint: ${url}, status: ${res.status}`);
        throw new Error(`Failed to connect: ${res.status}`);
      }
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        console.error(`[LLM] Attempt ${i + 1} failed for ${url}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

export async function getActiveLLMEndpoint(): Promise<string> {
  const candidates = [
    `${FREELLM_BASE_URL}/v1`,
    `${FREELLM_FALLBACK_URL}/v1`,
    `${OMNIROUTE_BASE_URL}/v1`,
  ];

  for (const candidate of candidates) {
    try {
      const res = await fetchWithRetry(candidate);
      if (res.ok) {
        console.log(`[LLM] Successfully connected to endpoint: ${candidate}`);
        return candidate;
      }
    } catch (error) {
      console.error(`[LLM] Failed to connect to ${candidate}:`, error);
    }
  }

  console.error("[LLM] All endpoints failed. Falling back to default.");
  return `${FREELLM_BASE_URL}/v1`;
}
