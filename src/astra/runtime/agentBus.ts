/**
 * ASTRA AI — AGENT BUS
 * ============================================================================
 * Central publish/subscribe and tool-invocation bus.
 * Every activated plugin registers its capabilities here.
 * The Central Command brain and LangGraph Orchestrator invoke tools through this bus.
 */

export interface ToolInvocationResult {
  ok: boolean;
  pluginId: string;
  toolName: string;
  result?: any;
  error?: string;
  durationMs: number;
}

export type ToolHandler = (args: any, context?: any) => Promise<any> | any;

export interface RegisteredTool {
  pluginId: string;
  toolName: string;
  description?: string;
  handler: ToolHandler;
  registeredAt: string;
}

class AgentBus {
  private tools = new Map<string, RegisteredTool>();
  private listeners = new Set<(event: { type: string; payload: any }) => void>();

  /**
   * Register a capability tool from an activated plugin.
   */
  public registerTool(pluginId: string, toolName: string, handler: ToolHandler, description?: string): void {
    const key = `${pluginId}:${toolName}`;
    this.tools.set(key, {
      pluginId,
      toolName,
      description,
      handler,
      registeredAt: new Date().toISOString(),
    });
    // Also map by bare toolName if unique or primary
    if (!this.tools.has(toolName)) {
      this.tools.set(toolName, {
        pluginId,
        toolName,
        description,
        handler,
        registeredAt: new Date().toISOString(),
      });
    }
    this.emit('tool_registered', { pluginId, toolName });
  }

  /**
   * Unregister all tools belonging to a plugin when it is deactivated or degraded.
   */
  public unregisterPluginTools(pluginId: string): void {
    const toDelete: string[] = [];
    for (const [key, tool] of this.tools.entries()) {
      if (tool.pluginId === pluginId) {
        toDelete.push(key);
      }
    }
    for (const k of toDelete) {
      this.tools.delete(k);
    }
    this.emit('plugin_tools_unregistered', { pluginId });
  }

  /**
   * Invoke a tool by name (e.g., "search_pubmed", "check_interaction", "run_hope_engine").
   */
  public async invoke(toolName: string, args: any = {}, context?: any): Promise<ToolInvocationResult> {
    const start = Date.now();
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        ok: false,
        pluginId: 'unknown',
        toolName,
        error: `Tool '${toolName}' is not registered on the agent bus (plugin may be OFFLINE or DEGRADED).`,
        durationMs: Date.now() - start,
      };
    }

    try {
      const result = await tool.handler(args, context);
      return {
        ok: true,
        pluginId: tool.pluginId,
        toolName,
        result,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        ok: false,
        pluginId: tool.pluginId,
        toolName,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Check if a tool is registered and active.
   */
  public hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * List all registered tools with plugin attribution.
   */
  public listTools(): Array<{ pluginId: string; toolName: string; description?: string }> {
    const seen = new Set<string>();
    const out: Array<{ pluginId: string; toolName: string; description?: string }> = [];

    for (const tool of this.tools.values()) {
      const key = `${tool.pluginId}:${tool.toolName}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          pluginId: tool.pluginId,
          toolName: tool.toolName,
          description: tool.description,
        });
      }
    }
    return out;
  }

  /**
   * Get all tools registered by a specific plugin.
   */
  public getToolsForPlugin(pluginId: string): string[] {
    const list: string[] = [];
    for (const tool of this.tools.values()) {
      if (tool.pluginId === pluginId && !list.includes(tool.toolName)) {
        list.push(tool.toolName);
      }
    }
    return list;
  }

  /**
   * Event listener subscription.
   */
  public subscribe(listener: (event: { type: string; payload: any }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Publish a domain event to all bus subscribers (patient/lab/voice/task…).
   * The Dr. Mayin visual state engine maps these to real visual states.
   */
  public publish(type: string, payload: any = {}): void {
    this.emit(type, payload);
  }

  public emit(type: string, payload: any): void {
    for (const listener of this.listeners) {
      try {
        listener({ type, payload });
      } catch (err) {
        console.warn('AgentBus listener error:', err);
      }
    }
  }
}

export const agentBus = new AgentBus();
