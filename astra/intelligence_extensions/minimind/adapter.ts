/**
 * ASTRA AI — Intelligence Extensions: MiniMind Adapter
 * ============================================================================
 * Calls astra-micro through the EXISTING Central AI Adapter (LiteLLM→Ollama).
 * No MiniMind-specific API wiring in application logic — the gateway remains
 * the single OpenAI-compatible entrance.
 *
 * Extension, not replacement: callAi() in server/ai/gatewayAdapter.ts still
 * owns the provider chain. This adapter is a thin, config-driven wrapper.
 */
import { getMiniMindConfig } from "./config";
import { callAi, GatewayChatBody, GatewayChatResult } from "../../../server/ai/gatewayAdapter";

export interface AstraMicroCall {
  instruction: string;
  userMessage: string;
  /** Force JSON-only output (structured commands). */
  jsonMode?: boolean;
  /** Department hint to inject into the system prompt. */
  departmentHint?: string;
}

export interface AstraMicroResult {
  ok: boolean;
  text: string;
  parsed?: any;
  error?: string;
  service: string;
  model: string;
  latencyMs: number;
}

/**
 * Run a single astra-mini turn through the existing gateway.
 * Routes via LiteLLM→Ollama automatically when model="astra-micro".
 */
export async function callAstraMicro(req: AstraMicroCall): Promise<AstraMicroResult> {
  const cfg = getMiniMindConfig();
  if (!cfg.enabled) {
    return { ok: false, text: "", error: "MINIMIND_ENABLED is false", service: "astra-micro", model: cfg.model, latencyMs: 0 };
  }

  const systemText = cfg.systemPrompt + (req.departmentHint ? `\n\nActive department context: ${req.departmentHint}` : "");
  const userText = (req.jsonMode ? "Return JSON only. No prose.\n\n" : "") + req.userMessage;

  const body: GatewayChatBody = {
    model: cfg.model,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: userText },
    ],
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
  };

  try {
    const r: GatewayChatResult = await callAi(body);
    const text = (typeof r.text === "string" && r.text.trim()) ? r.text.trim() : "";
    let parsed: any;
    if (req.jsonMode && text) {
      try { parsed = JSON.parse(text); } catch { /* leave raw */ }
    }
    return { ok: true, text, parsed, service: r.service, model: r.model, latencyMs: r.latencyMs };
  } catch (err) {
    return { ok: false, text: "", error: err instanceof Error ? err.message : String(err), service: "astra-micro", model: cfg.model, latencyMs: 0 };
  }
}

export { getMiniMindConfig };