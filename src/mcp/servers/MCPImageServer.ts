// ASTRA AI — MCP IMAGE SERVER

import { MCPServer } from "../MCPServer";
import { MCPRegistry } from "../MCPRegistry";

export function registerMCPImageServer(): MCPServer {
  const server = new MCPServer({
    serverName: "image",
    description: "Medical imaging: image analysis.",
    toolIds: ["analyzeImage"],
  });
  MCPRegistry.register(server);
  return server;
}