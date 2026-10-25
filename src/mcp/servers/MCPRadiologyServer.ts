// ASTRA AI — MCP RADIOLOGY SERVER

import { MCPServer } from "../MCPServer";
import { MCPRegistry } from "../MCPRegistry";

export function registerMCPRadiologyServer(): MCPServer {
  const server = new MCPServer({
    serverName: "radiology",
    description: "Radiology: imaging queue, imaging orders, radiology reports.",
    toolIds: ["getRadiologyQueue", "createRadiologyOrder", "getRadiologyReport"],
  });
  MCPRegistry.register(server);
  return server;
}