// ======================================================
// ASTRA AI - Unified AI Router
// FreeLLMAPI (PRIMARY) → OmniRoute (SECONDARY/FALLBACK)
// → clear error if both are offline
//
// All routing, failover, recovery and timeout handling lives in the
// ONE GatewayManager (src/services/gatewayManager.ts). This module is a
// thin compatibility layer preserving Astra AI's existing public API —
// every caller (Doctor, Reception, Avatar, plugins, hospital modules)
// keeps working unchanged.
// Keys & gateway addresses live in src/config/aiKeys.ts
// ======================================================

import { gatewayChat, AllGatewaysFailedError } from "./gatewayManager";

/** OpenAI-compatible chat message */
export interface AstraChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** OpenAI-compatible chat completion response shape used by Astra */
export interface AstraChatResponse {
  model?: string;
  choices?: Array<{
    message?: { role: string; content: string };
    delta?: { content?: string };
  }>;
  [key: string]: unknown;
}

export interface AstraAIChatOptions {
  messages?: AstraChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  systemPrompt?: string | null;
  stream?: boolean;
}

/**
 * Main AI call - used by Doctor + Reception + Avatar.
 * FreeLLMAPI (PRIMARY) is attempted first; OmniRoute is fallback ONLY.
 */
export async function astraAIChat({
  messages = [],
  model = "auto",
  temperature = 0.6,
  max_tokens = 2048,
  systemPrompt = null,
  stream = false
}: AstraAIChatOptions): Promise<AstraChatResponse> {
  const finalMessages: AstraChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const { response } = await gatewayChat({
    body: { model, messages: finalMessages, temperature, max_tokens, stream },
  });

  return (await response.json()) as AstraChatResponse;
}

export interface AstraAIStreamOptions {
  messages: AstraChatMessage[];
  model?: string;
  systemPrompt?: string | null;
  onChunk?: (text: string) => void;
}

/**
 * Streaming version (for Avatar + Voice Reply).
 * FreeLLMAPI (PRIMARY) streams first. If it fails BEFORE streaming begins,
 * OmniRoute (fallback) streams instead. An already-started successful
 * stream is never interrupted.
 */
export async function astraAIChatStream({
  messages,
  model = "auto",
  systemPrompt = null,
  onChunk = () => {}
}: AstraAIStreamOptions): Promise<string> {
  const finalMessages: AstraChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  let response: Response;
  try {
    ({ response } = await gatewayChat({
      body: {
        model,
        messages: finalMessages,
        temperature: 0.6,
        max_tokens: 2048,
        stream: true,
      },
    }));
  } catch (e) {
    if (e instanceof AllGatewaysFailedError) {
      throw new Error(
        "Both gateways unavailable for streaming: FreeLLMAPI (primary) and OmniRoute (fallback) are offline.",
      );
    }
    throw e;
  }

  if (!response.ok || !response.body) {
    throw new Error("Gateway returned an invalid streaming response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as AstraChatResponse;
          const content = parsed.choices?.[0]?.delta?.content || "";
          if (content) {
            full += content;
            onChunk(content);
          }
        } catch {}
      }
    }
  }

  return full;
}

/** Helper for simple text generation */
export async function astraGenerate(
  prompt: string,
  options: Partial<Omit<AstraAIChatOptions, "messages">> = {}
): Promise<string> {
  const res = await astraAIChat({
    messages: [{ role: "user", content: prompt }],
    ...options
  });
  return res.choices?.[0]?.message?.content ?? "";
}
