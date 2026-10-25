// ASTRA AI — MCP PHARMACY SERVER

import { MCPServer } from "../MCPServer";
import { MCPRegistry } from "../MCPRegistry";

export function registerMCPPharmacyServer(): MCPServer {
  const server = new MCPServer({
    serverName: "pharmacy",
    description: "Pharmacy: queue, prescriptions, drug interactions.",
    toolIds: ["getPharmacyQueue", "createPrescription", "checkDrugInteraction"],
  });
  MCPRegistry.register(server);
  return server;
}