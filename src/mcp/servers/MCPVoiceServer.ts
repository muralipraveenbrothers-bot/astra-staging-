// ASTRA AI — MCP VOICE SERVER

import { MCPServer } from "../MCPServer";
import { MCPRegistry } from "../MCPRegistry";

export function registerMCPVoiceServer(): MCPServer {
  const server = new MCPServer({
    serverName: "voice",
    description: "Voice: transcription and speech synthesis.",
    toolIds: ["transcribeVoice", "speakVoice"],
  });
  MCPRegistry.register(server);
  return server;
}