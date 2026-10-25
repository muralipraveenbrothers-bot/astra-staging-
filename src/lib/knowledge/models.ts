// Astra ModelRegistry — models actually configured in this build.
//
// Parameter counts are the OFFICIAL published values, kept strictly separate
// from knowledge corpus size. "availableNow" is measured at runtime.

import type { ModelInfo } from "./types";

/** Live availability of each backend, measured at runtime by the UI. */
export interface BackendProbe {
  ollamaModels: number;
  freellmApiReachable: boolean;
  freellmApiKeyValid: boolean;
  voiceboxOnline: boolean;
  paperclipOnline: boolean;
}

export function buildModelRegistry(probe: BackendProbe): ModelInfo[] {
  const ollamaDown = probe.ollamaModels === 0;
  return [
    {
      id: "ollama-llama32",
      name: "llama3.2:3b",
      provider: "Ollama (127.0.0.1:11434)",
      paramsBillions: 3.2,
      contextWindow: "128K",
      quantization: "GGUF Q4 (typical)",
      local: true,
      availableNow: !ollamaDown,
      availabilityNote: ollamaDown
        ? "Ollama responded but returned 0 models — not pulled locally"
        : "Configured model, reachable",
      usedBy: ["AI Command Chat", "Agents config (mock)"],
      purpose: "General hospital ops chat (lightweight)",
      configured: true,
    },
    {
      id: "ollama-qwen3-14b",
      name: "qwen3:14b",
      provider: "Ollama (127.0.0.1:11434)",
      paramsBillions: 14,
      contextWindow: "131K",
      quantization: "GGUF Q4 (typical)",
      local: true,
      availableNow: !ollamaDown,
      availabilityNote: ollamaDown
        ? "Ollama responded but returned 0 models — not pulled locally"
        : "Configured model, reachable",
      usedBy: ["AI Command Chat", "Clinical Decision Support (agents config)"],
      purpose: "Heavier reasoning / CDS",
      configured: true,
    },
    {
      id: "freellmapi-auto",
      name: "auto (router)",
      provider: "FreeLLMAPI (canonical port registry)",
      paramsBillions: null,
      contextWindow: "provider-dependent",
      quantization: "provider-dependent",
      local: true,
      availableNow: probe.freellmApiReachable && probe.freellmApiKeyValid,
      availabilityNote: probe.freellmApiReachable
        ? probe.freellmApiKeyValid
          ? "Router reachable with valid key"
          : "Router reachable but API key rejected (HTTP 401) — catalog NOT MEASURABLE"
        : "Router unreachable",
      usedBy: ["AI Command Chat (default model)"],
      purpose: "Unified provider routing — parameter count belongs to the routed provider, not this app",
      configured: true,
    },
    {
      id: "freellmapi-fusion",
      name: "fusion (multi-model)",
      provider: "FreeLLMAPI (canonical port registry)",
      paramsBillions: null,
      contextWindow: "provider-dependent",
      quantization: "provider-dependent",
      local: true,
      availableNow: probe.freellmApiReachable && probe.freellmApiKeyValid,
      availabilityNote: "Requires valid Unified API Key like `auto`",
      usedBy: ["AI Command Chat (fusion mode)"],
      purpose: "Multi-model synthesis over router catalog",
      configured: true,
    },
    {
      id: "voicebox-qwen3tts-whisper",
      name: "Qwen3-TTS + Whisper (Voicebox)",
      provider: "Voicebox (127.0.0.1:17493)",
      paramsBillions: null,
      contextWindow: "n/a",
      quantization: "unknown",
      local: true,
      availableNow: probe.voiceboxOnline,
      availabilityNote: probe.voiceboxOnline
        ? "Voice runtime online"
        : "Voice runtime not running — browser speech fallback active",
      usedBy: ["Voice Registration", "AI Command voice"],
      purpose: "Local STT (Whisper) + TTS (Qwen3-TTS) for en/hi/te",
      configured: true,
    },
    {
      id: "paperclip-runtime",
      name: "Paperclip agent runtime",
      provider: "Paperclip (127.0.0.1:3100)",
      paramsBillions: null,
      contextWindow: "n/a",
      quantization: "n/a",
      local: true,
      availableNow: probe.paperclipOnline,
      availabilityNote: probe.paperclipOnline
        ? "Agent dashboard online"
        : "Not running — agent nodes in the Agents module are configuration, not live agents",
      usedBy: ["Agents module (config only)"],
      purpose: "Org-chart agent runtime (not installed)",
      configured: false,
    },
  ];
}

export const MODEL_CAPACITY_NOTE =
  "Model parameters are model architecture capacity. They are NOT knowledge facts. " +
  "Total configured local parameters: 17.2B (llama3.2 3.2B + qwen3 14B). Nothing in Astra is a trillion-parameter model.";
