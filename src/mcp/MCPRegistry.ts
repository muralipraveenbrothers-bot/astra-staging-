// ASTRA AI — MCP REGISTRY
// Registers and exposes all in-process domain MCP servers.

import { MCPServer } from "./MCPServer";

export class MCPRegistryService {
  private servers = new Map<string, MCPServer>();

  register(server: MCPServer): void {
    this.servers.set(server.serverName, server);
  }

  get(name: string): MCPServer | undefined {
    return this.servers.get(name);
  }

  has(name: string): boolean {
    return this.servers.has(name);
  }

  list(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  names(): string[] {
    return Array.from(this.servers.keys());
  }

  unregister(name: string): boolean {
    return this.servers.delete(name);
  }
}

export const MCPRegistry = new MCPRegistryService();