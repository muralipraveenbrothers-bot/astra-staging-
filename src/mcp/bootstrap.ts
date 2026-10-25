// ASTRA AI — MCP SERVER BOOTSTRAP
// Registers all 7 domain MCP servers. Call once at startup.

import { registerMCPHospitalServer } from "./servers/MCPHospitalServer";
import { registerMCPLaboratoryServer } from "./servers/MCPLaboratoryServer";
import { registerMCPRadiologyServer } from "./servers/MCPRadiologyServer";
import { registerMCPPharmacyServer } from "./servers/MCPPharmacyServer";
import { registerMCPKnowledgeServer } from "./servers/MCPKnowledgeServer";
import { registerMCPImageServer } from "./servers/MCPImageServer";
import { registerMCPVoiceServer } from "./servers/MCPVoiceServer";

export function registerAllMCPServers(): string[] {
  return [
    registerMCPHospitalServer().serverName,
    registerMCPLaboratoryServer().serverName,
    registerMCPRadiologyServer().serverName,
    registerMCPPharmacyServer().serverName,
    registerMCPKnowledgeServer().serverName,
    registerMCPImageServer().serverName,
    registerMCPVoiceServer().serverName,
  ];
}

export { registerMCPHospitalServer } from "./servers/MCPHospitalServer";
export { registerMCPLaboratoryServer } from "./servers/MCPLaboratoryServer";
export { registerMCPRadiologyServer } from "./servers/MCPRadiologyServer";
export { registerMCPPharmacyServer } from "./servers/MCPPharmacyServer";
export { registerMCPKnowledgeServer } from "./servers/MCPKnowledgeServer";
export { registerMCPImageServer } from "./servers/MCPImageServer";
export { registerMCPVoiceServer } from "./servers/MCPVoiceServer";