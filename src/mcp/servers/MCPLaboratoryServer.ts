// ASTRA AI — MCP LABORATORY SERVER

import { MCPServer } from "../MCPServer";
import { MCPRegistry } from "../MCPRegistry";

export function registerMCPLaboratoryServer(): MCPServer {
  const server = new MCPServer({
    serverName: "laboratory",
    description: "Laboratory: lab queue, lab results, lab orders.",
    toolIds: ["getLabQueue", "getLabResult", "createLabOrder"],
  });
  MCPRegistry.register(server);
  return server;
}