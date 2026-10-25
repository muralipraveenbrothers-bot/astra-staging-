// ASTRA AI — PLUGIN COMMAND DISCOVERY
// Maps plugin commands to slash-command suggestions and tool execution targets.

import { MCPClient } from "../../mcp/MCPClient";
import { MCPRegistry } from "../../mcp/MCPRegistry";

export interface CommandCandidate {
  command: string;
  description: string;
  plugin?: string;
  server?: string;
  toolId?: string;
  confidence: number;
}

const STATIC_COMMANDS: CommandCandidate[] = [
  { command: "/census", description: "Hospital census & bed occupancy", confidence: 1 },
  { command: "/icu", description: "ICU patient list", confidence: 1 },
  { command: "/lab-queue", description: "Pending lab orders", confidence: 1 },
  { command: "/radiology-queue", description: "Pending imaging orders", confidence: 1 },
  { command: "/pharmacy-queue", description: "Pending prescriptions", confidence: 1 },
  { command: "/patient", description: "Patient lookup (usage: /patient <id>)", confidence: 1 },
  { command: "/vitals", description: "Patient vitals", confidence: 1 },
  { command: "/medications", description: "Active medications", confidence: 1 },
  { command: "/ot-status", description: "Operation theatre status", confidence: 1 },
  { command: "/billing", description: "Patient billing summary", confidence: 1 },
  { command: "/pubmed", description: "Search medical literature", confidence: 1 },
  { command: "/guideline", description: "Retrieve clinical guideline", confidence: 1 },
  { command: "/help", description: "Show available commands", confidence: 1 },
];

export class PluginCommandDiscovery {
  discover(input: string): CommandCandidate[] {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed.startsWith("/")) return [];

    const [head] = trimmed.split(/\s+/);
    const scored: Array<{ cand: CommandCandidate; score: number }> = [];

    for (const c of STATIC_COMMANDS) {
      let score = 0;
      if (c.command === head) score = 100;
      else if (c.command.startsWith(head) && head.length > 1) score = 60;
      else if (head.startsWith(c.command) && c.command.length > 1) score = 40;
      if (score > 0) scored.push({ cand: c, score });
    }

    const mcpServers = MCPRegistry.names();
    for (const serverName of mcpServers) {
      for (const tool of MCPClient.listTools(serverName)) {
        const toolHead = "/" + tool.name.toLowerCase().replace(/([A-Z])/g, (m) => "-" + m.toLowerCase()).replace(/^-/, "");
        let score = 0;
        if (toolHead === head) score = 90;
        else if (toolHead.startsWith(head) && head.length > 1) score = 50;
        else if (tool.name.toLowerCase().includes(trimmed.slice(1)) && trimmed.length > 2) score = 20;
        if (score > 0) {
          scored.push({
            cand: {
              command: `/${tool.name}`,
              description: `${tool.description ?? "MCP tool"} (via ${serverName})`,
              plugin: serverName,
              server: serverName,
              toolId: tool.name,
              confidence: score / 100,
            },
            score,
          });
        }
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((s) => s.cand);
  }
}

export const PluginCommands = new PluginCommandDiscovery();