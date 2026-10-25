/**
 * Facade matching the suggested `server/services/ai/` layout.
 * Canonical implementation lives in `server/ai/` (existing architecture).
 * Do not add a second provider chain here.
 */
export * from "../../ai/types";
export { GeminiProvider } from "../../ai/gemini";
export { OpenAICompatibleProvider, buildOpenAIProviders } from "../../ai/openaiProvider";
export { buildAiProviders, getAiProviders, aiGatewayChat, getAiProvidersHealth } from "../../ai/providerRegistry";
export { routeIntent, orderedProvidersForTask, selectProviderForTask, SUPPORTED_LANGUAGES } from "../../ai/taskRouter";
export { collectAiHealth } from "../../ai/health";
export { openaiChatCompletions, openaiGetModels } from "../../ai/openaiCompatible";
