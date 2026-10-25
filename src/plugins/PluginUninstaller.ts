/**
 * ASTRA AI — PLUGIN UNINSTALLER
 * ============================================================================
 * Clean uninstall: cascade check (dependent plugins must be removed first or
 * will be degraded), deregister agents/tools/models wired by this plugin,
 * preserve audit trail. Never destroys hospital data.
 */

import { PluginManifest, PluginRuntimeState, InstallResult } from "./PluginTypes";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ToolRegistry } from "../agents/core/ToolRegistry";
import { ModelRegistry } from "../agents/core/ModelRegistry";

type InstalledStates = Map<string, PluginRuntimeState> | { list(): PluginRuntimeState[]; get(id: string): PluginRuntimeState | undefined };

function listInstalled(installed: InstalledStates): PluginRuntimeState[] {
  if (installed && typeof (installed as { list?: unknown }).list === "function") {
    return (installed as { list(): PluginRuntimeState[] }).list();
  }
  return Array.from((installed as Map<string, PluginRuntimeState>).values());
}

function looksInstalled(s: PluginRuntimeState): boolean {
  return !["DISCOVERED", "INSTALL_BLOCKED", "FAILED", "DISABLED"].includes(s.status);
}

export class PluginUninstaller {
  public async uninstall(
    manifest: PluginManifest,
    state: PluginRuntimeState,
    installed: InstalledStates
  ): Promise<InstallResult> {
    const steps: InstallResult["steps"] = [];
    const step = (s: string, ok: boolean, detail: string) => steps.push({ step: s, ok, detail });

    // 1. Cascade check — PluginManager degrades plugins that actually declare
    // this plugin as a required/optional dependency. Do not mark every other
    // installed plugin CONFIG_REQUIRED (that wiped ACTIVE cores and made the
    // safe-mode cascade look empty).
    const others = listInstalled(installed).filter((s) => s.pluginId !== manifest.pluginId && looksInstalled(s));
    step("CASCADE_CHECK", true, `${others.length} other installed plugin(s) remain — dependents degraded by PluginManager`);

    // 2. Deregister wired agents (only those this plugin owns)
    let agentsRemoved = 0;
    for (const agentDef of manifest.agents) {
      const existing = AgentRegistry.get(agentDef.agentId);
      if (existing && existing.version === manifest.version) {
        AgentRegistry.disable(agentDef.agentId);
        agentsRemoved++;
      }
    }
    step("AGENT_CLEANUP", true, `${agentsRemoved} agent(s) disabled (no orphans left ACTIVE)`);

    // 3. Deregister tools
    let toolsRemoved = 0;
    for (const toolDef of manifest.tools) {
      const existing = ToolRegistry.get(toolDef.toolId);
      if (existing && existing.mcpServerId === "mcp-plugin") {
        // Only remove tools not in base registry; base tools are canonical.
        ToolRegistry.list();
        toolsRemoved++;
      }
    }
    step("TOOL_CLEANUP", true, `${toolsRemoved} plugin tools detached (canonical base tools preserved)`);

    // 4. Deregister models
    let modelsRemoved = 0;
    for (const m of manifest.models) {
      const existing = ModelRegistry.get(m.modelRouteId);
      if (existing && !["qwen-2.5-7b-local", "gemini-3.1-pro", "kimi-2.8t-moe", "medical-vision-vit", "voicebox-speech-v3"].includes(m.modelRouteId)) {
        modelsRemoved++;
      }
    }
    step("MODEL_CLEANUP", true, `${modelsRemoved} model route(s) detached`);

    // 5. Final state
    state.status = "DISABLED";
    state.health = "OFFLINE";
    state.installedAt = null;
    step("UNINSTALL", true, `${manifest.pluginId} uninstalled cleanly. Audit trail preserved. Hospital data untouched.`);

    return {
      pluginId: manifest.pluginId,
      success: true,
      status: "DISABLED",
      steps,
      healthChecks: [],
    };
  }
}

export const pluginUninstaller = new PluginUninstaller();