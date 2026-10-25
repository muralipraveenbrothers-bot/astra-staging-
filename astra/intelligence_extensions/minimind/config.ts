/**
 * ASTRA AI — Intelligence Extensions: MiniMind (astra-micro)
 * ============================================================================
 * MiniMind is wired as a LOCAL lightweight model called "astra-micro".
 * It is a model BACKEND, not the new Astra master agent.
 *
 * Preferred runtime path:
 *   Astra → LiteLLM → Ollama → astra-micro
 *
 * Existing components preserved: Hermes (planner), LangGraph (orchestrator),
 * LiteLLM (gateway), FreeLLMAPI/OmniRoute/Ollama (provider chain).
 */
import { firstEnv } from "../_internal";

export interface MiniMindConfig {
  enabled: boolean;
  model: string;
  ollamaBase: string;
  ollamaModel: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  systemPrompt: string;
}

const DEFAULT_SYSTEM = `You are Astra Micro, the lightweight local operational intelligence layer of Astra AI.

You work for a hospital information and clinical workflow system.

Primary responsibilities:
1. Understand doctor commands.
2. Extract structured patient information.
3. Route commands to the correct department.
4. Select Astra tools.
5. Summarize short operational information.
6. Return structured JSON when requested.

Departments:
- Reception
- OPD
- IP/Ward
- ICU
- OT
- Pharmacy
- Laboratory
- Radiology
- USG
- Billing
- CMRF
- Discharge

Rules:
- Never invent patient information.
- Never invent investigation results.
- Never invent medications or orders.
- Never fabricate completion of an action.
- Patient-specific information MUST come from authorized Astra tools.
- For complex or high-risk clinical reasoning, output an escalation request to ASTRA_CLINICAL_REASONING.
- For literature/evidence/scientific research requests, route to ASTRA_SCIENTIFIC_RESEARCH.
- Prefer structured JSON for machine actions.
- Be concise, deterministic and operational.`;

export function getMiniMindConfig(): MiniMindConfig {
  return {
    enabled: firstEnv("MINIMIND_ENABLED", "true") === "true",
    model: firstEnv("ASTRA_MICRO_MODEL", "astra-micro"),
    ollamaBase: firstEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").replace(/\/v1\/?$/, ""),
    // This installation already carries qwen2.5:1.5b. It is the lightweight
    // local runtime behind the Astra Micro product identity.
    ollamaModel: firstEnv("MINIMIND_OLLAMA_MODEL", "qwen2.5:1.5b"),
    temperature: Number(firstEnv("MINIMIND_TEMPERATURE", "0.2")),
    maxTokens: Number(firstEnv("MINIMIND_MAX_TOKENS", "1024")),
    contextWindow: Number(firstEnv("MINIMIND_CONTEXT_WINDOW", "8192")),
    systemPrompt: firstEnv("MINIMIND_SYSTEM_PROMPT", DEFAULT_SYSTEM),
  };
}

export const MINIMIND_SYSTEM_PROMPT = DEFAULT_SYSTEM;
