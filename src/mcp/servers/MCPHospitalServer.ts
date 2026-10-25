// ASTRA AI — MCP DOMAIN SERVERS
// One server per hospital domain; each wraps existing ToolRegistry tools.
// Registration is idempotent (register() overwrites on re-register).

import { MCPServer } from "../MCPServer";
import { MCPRegistry } from "../MCPRegistry";

export function registerMCPHospitalServer(): MCPServer {
  const server = new MCPServer({
    serverName: "hospital",
    description: "Hospital operations: census, patients, beds, billing, OT status.",
    toolIds: [
      "getHospitalCensus",
      "getIPPatients",
      "getOPPatients",
      "getICUPatients",
      "getWardPatients",
      "getPatient",
      "getPatientTimeline",
      "getVitals",
      "getActiveMedications",
      "getOTStatus",
      "getBillingSummary",
      "createTask",
    ],
  });
  MCPRegistry.register(server);
  return server;
}