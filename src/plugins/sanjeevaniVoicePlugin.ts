import { agentBus } from "@/astra/runtime/agentBus";
import { ToolRegistry } from "@/agents/core/ToolRegistry";
import { getVoiceboxEngine } from "@/voice/VoiceboxEngine"; // adjust import as needed

/**
 * Register Sanjeevani voice tools with the global ToolRegistry.
 * This file is imported at application start (e.g., via a side‑effect import in main entry).
 */
function registerVoiceTools() {
  // Start a Voicebox session – returns session info
  ToolRegistry.register({
    toolId: "startVoiceSession",
    name: "Start Voice Session",
    description: "Create a new Voicebox session for a user role.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string" },
        role: { type: "string" },
      },
      required: ["userId", "role"],
    },
    outputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
    },
    readOrWrite: "WRITE",
    riskLevel: "INFO",
    requiredPermissions: ["ai:voice_command"],
    patientScope: false,
    confirmationRequired: false,
    auditRequired: false,
    latencyMs: 10,
    healthStatus: "HEALTHY",
    execute: async ({ userId, role }) => {
      const engine = getVoiceboxEngine();
      const session = engine.startSession(userId, role);
      return { sessionId: session.id };
    },
  });

  // End a Voicebox session
  ToolRegistry.register({
    toolId: "endVoiceSession",
    name: "End Voice Session",
    description: "Terminate a Voicebox session.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    readOrWrite: "WRITE",
    riskLevel: "INFO",
    requiredPermissions: ["ai:voice_command"],
    patientScope: false,
    confirmationRequired: false,
    auditRequired: false,
    latencyMs: 10,
    healthStatus: "HEALTHY",
    execute: async ({ sessionId }) => {
      const engine = getVoiceboxEngine();
      engine.endSession(sessionId);
      return { success: true };
    },
  });

  // Transcribe audio buffer (placeholder – real implementation streams via VAD)
  ToolRegistry.register({
    toolId: "transcribeVoice",
    name: "Transcribe Voice",
    description: "Convert an audio buffer to text using Voicebox STT.",
    inputSchema: {
      type: "object",
      properties: {
        audioBase64: { type: "string" },
        language: { type: "string" },
        sessionId: { type: "string" },
      },
      required: ["audioBase64", "sessionId"],
    },
    outputSchema: {
      type: "object",
      properties: { transcript: { type: "string" }, confidence: { type: "number" } },
    },
    readOrWrite: "READ",
    riskLevel: "INFO",
    requiredPermissions: ["ai:voice_command"],
    patientScope: false,
    confirmationRequired: false,
    auditRequired: false,
    latencyMs: 150,
    healthStatus: "HEALTHY",
    execute: async ({ audioBase64, language, sessionId }) => {
      const engine = getVoiceboxEngine();
      // In real code, we would feed the audio to the session; here we simulate.
      const result = await engine.transcribe(Buffer.from(audioBase64, "base64"), { language });
      return { transcript: result.text, confidence: result.confidence };
    },
  });

  // Speak text via TTS
  ToolRegistry.register({
    toolId: "speakVoice",
    name: "Speak Voice",
    description: "Generate TTS audio for given text using a selected persona.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        voicePersona: { type: "string", enum: ["DR_ARJUN", "DR_PRIYA", "RECEPTION_GUIDE"] },
        language: { type: "string" },
      },
      required: ["text"],
    },
    outputSchema: {
      type: "object",
      properties: { audioBase64: { type: "string" }, durationMs: { type: "number" } },
    },
    readOrWrite: "READ",
    riskLevel: "INFO",
    requiredPermissions: ["ai:voice_command"],
    patientScope: false,
    confirmationRequired: false,
    auditRequired: false,
    latencyMs: 140,
    healthStatus: "HEALTHY",
    execute: async ({ text, voicePersona, language }) => {
      const engine = getVoiceboxEngine();
      const result = await engine.synthesize(text, { persona: voicePersona, language });
      // Return audio as base64 (placeholder)
      const audioBase64 = Buffer.from(result.audioContent as any).toString("base64");
      return { audioBase64, durationMs: result.durationMs };
    },
  });
}

// Register on module load
registerVoiceTools();

export default {
  pluginId: "plugin-sanjeevani-voice",
  name: "Sanjeevani Voice Plugin",
  version: "2026.09.21",
  category: "VOICE",
  description: "Provides voice session management, STT, and TTS tools for Sanjeevani AI.",
  status: "ACTIVE" as const,
};
