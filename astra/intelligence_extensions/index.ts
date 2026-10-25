/**
 * ASTRA AI — Intelligence Extensions
 * ============================================================================
 * Non-destructive extension layer for:
 *   1. MiniMind as "astra-micro" (lightweight local operational brain)
 *   2. K-Dense Scientific Agent Skills (on-demand research skills)
 *
 * This module extends the existing server/ai gateway and routing layers.
 * It does NOT replace Hermes, LangGraph, LiteLLM, FreeLLMAPI, OmniRoute,
 * or any existing Astra component.
 *
 * Import from server code via relative path: ../astra/intelligence_extensions
 * Import from app code via alias: @ie/*
 */
export * from "./minimind/config";
export * from "./minimind/adapter";
export * from "./minimind/systemPrompt";
export * from "./scientific_skills/types";
export * from "./scientific_skills/registry";
export * from "./scientific_skills/worker";
export * from "./routing/intelligenceRouter";
export * from "./safety/phiGuard";
export * from "./provenance/ledger";
export { firstEnv } from "./_internal";