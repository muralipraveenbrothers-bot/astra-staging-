/**
 * ASTRA AI — PLUGIN LIFECYCLE STATE MACHINE (9.3)
 * ============================================================================
 * DISCOVERED -> INSTALLING -> INSTALLED -> CONNECTING -> READY -> ACTIVE
 *                                          v           v
 *                                       DEGRADED    FAILED
 *                                          v
 *                                      DISABLED
 * Plus CONFIG_REQUIRED (missing secrets) and INSTALL_BLOCKED (dependency).
 */

import { PluginStatus, PluginRuntimeState } from "./PluginTypes";

const VALID_TRANSITIONS: Record<string, string[]> = {
  DISCOVERED: ["INSTALLING", "DISABLED", "INSTALL_BLOCKED", "CONFIG_REQUIRED"],
  INSTALLING: ["INSTALLED", "FAILED", "INSTALL_BLOCKED"],
  INSTALLED: ["CONNECTING", "FAILED", "DISABLED"],
  CONNECTING: ["READY", "DEGRADED", "FAILED", "CONFIG_REQUIRED"],
  READY: ["ACTIVE", "DEGRADED", "FAILED", "DISABLED"],
  ACTIVE: ["DEGRADED", "FAILED", "DISABLED", "CONFIG_REQUIRED"],
  DEGRADED: ["ACTIVE", "FAILED", "DISABLED", "CONFIG_REQUIRED"],
  FAILED: ["INSTALLING", "DISABLED", "CONFIG_REQUIRED", "READY"],
  DISABLED: ["INSTALLING", "ACTIVE", "CONFIG_REQUIRED"],
  CONFIG_REQUIRED: ["CONNECTING", "ACTIVE", "DEGRADED", "DISABLED"],
  INSTALL_BLOCKED: ["INSTALLING", "DISABLED"],
};

export class PluginLifecycle {
  public static canTransition(from: PluginStatus, to: PluginStatus): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return !!allowed && allowed.includes(to);
  }

  public static transition(state: PluginRuntimeState, to: PluginStatus, log: (msg: string) => void = () => {}): boolean {
    const from = state.status;
    if (from === to) return true;
    if (!this.canTransition(from, to)) {
      log(`Lifecycle violation: ${state.pluginId} cannot move ${from} -> ${to} (audited, rejected)`);
      return false;
    }
    state.status = to;
    log(`${state.pluginId}: ${from} -> ${to}`);
    return true;
  }

  public static describe(status: PluginStatus): string {
    switch (status) {
      case "DISCOVERED": return "Manifest present, not installed";
      case "INSTALLING": return "Installation cascade in progress";
      case "INSTALLED": return "Files, migrations, and registrations complete";
      case "CONNECTING": return "Auto-wiring services and connectivity checks";
      case "READY": return "Wired and healthy, awaiting activation";
      case "ACTIVE": return "All critical health checks passing, fully operational";
      case "DEGRADED": return "Operational with degraded optional features";
      case "FAILED": return "Critical health check failed — rollback available";
      case "DISABLED": return "Manually disabled by administrator";
      case "CONFIG_REQUIRED": return "Missing required configuration/secrets";
      case "INSTALL_BLOCKED": return "Required dependency unsatisfied";
    }
  }
}

export const pluginLifecycle = new PluginLifecycle();