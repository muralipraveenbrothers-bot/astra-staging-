/**
 * ASTRA AI CORE — single brain in front of the Central AI Adapter.
 *
 * Command / Policy, Clinical Safety, and Memory / Context are applied here.
 * Every agent (Hermes, LangGraph, OpenClaw, Paperclip, n8n, Astra UI) should
 * call this — not FreeLLMAPI / OmniRoute / Ollama directly.
 * External executors (OpenHands, Agent Zero) go through the adapter too.
 */
import { callAi, type GatewayChatBody, type GatewayChatResult } from "./gatewayAdapter";

/**
 * Attribution label for a call into the central AI core.
 *
 * NOTE: this is a *label*, not a routing key — `centralAiChat` only echoes it
 * back on the result for telemetry; the actual request goes to callAi()
 * regardless. The two `rag-*` entries are the RAG pipeline's internal stages
 * (server/rag/agenticRag.ts) and were already being passed as labels before
 * they were declared here, which is why those call sites were TS2322.
 */
export type AdapterAgent =
  | "astra" | "hermes" | "langgraph" | "openclaw" | "paperclip" | "n8n"
  | "rag-evaluator" | "rag-synthesizer";

const POLICY =
  "You are ASTRA AI Hospital OS. Follow hospital command policy and RBAC. " +
  "Do not invent clinical facts, lab values, or orders. If data is missing, say so.";

const CLINICAL_SAFETY =
  "Clinical safety: flag must-not-miss conditions, do not prescribe autonomously, " +
  "and defer diagnosis and treatment decisions to a licensed clinician.";

export interface CentralChatRequest extends GatewayChatBody {
  agent?: AdapterAgent;
  clinical?: boolean;
  memory?: string;
}

export interface CentralChatResult extends GatewayChatResult {
  agent: AdapterAgent;
  policyApplied: boolean;
}

function prependSystem(messages: GatewayChatBody["messages"], content: string) {
  const has = messages.some(
    (m) => m.role === "system" && typeof m.content === "string" && String(m.content).includes(content.slice(0, 40)),
  );
  if (has) return messages;
  return [{ role: "system", content }, ...messages];
}

export async function centralAiChat(req: CentralChatRequest): Promise<CentralChatResult> {
  const agent = req.agent ?? "astra";
  let messages = Array.isArray(req.messages) ? [...req.messages] : [];
  messages = prependSystem(messages, POLICY);
  if (req.clinical !== false) messages = prependSystem(messages, CLINICAL_SAFETY);
  if (req.memory && req.memory.trim()) {
    messages = prependSystem(messages, `Hospital / case context:\n${req.memory.trim()}`);
  }

  const result = await callAi({
    model: req.model,
    messages,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    stream: req.stream,
  });

  return { ...result, agent, policyApplied: true };
}

export function chatText(result: GatewayChatResult): string {
  const json = result.json as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (typeof result.text === "string" && result.text.trim()) return result.text;
  return "";
}
