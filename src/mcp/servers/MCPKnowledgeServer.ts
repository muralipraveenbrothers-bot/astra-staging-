// ASTRA AI — MCP KNOWLEDGE SERVER

import { MCPServer } from "../MCPServer";
import { MCPRegistry } from "../MCPRegistry";

export function registerMCPKnowledgeServer(): MCPServer {
  const server = new MCPServer({
    serverName: "knowledge",
    description: "Medical knowledge: PubMed search, guideline retrieval.",
    toolIds: ["searchPubMed", "retrieveGuideline"],
  });
  MCPRegistry.register(server);
  return server;
}