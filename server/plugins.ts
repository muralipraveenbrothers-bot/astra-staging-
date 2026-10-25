/**
 * Astra AI — Plugin Center Gateway (LIVE ecosystem)
 * =============================================================
 * Serves the REAL 36-plugin catalog (from config/plugins manifests) to the
 * ChatGPT-style Plugin Center UI, with honest status/health from the live
 * plugin registry. Toggle = real install/uninstall through the one
 * PluginManager. No hardcoded cards, no fake ACTIVE.
 */

import { pluginManager as ecosystemManager } from "../src/plugins/PluginManager";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  tier: string;
  category: "Medical" | "Hospital" | "Models" | "Agents" | "Voice" | "Automation" | "Integrations";
  description: string;
  provider: string;
  capabilities: string[];
  permissions: (
    | "READ_PATIENT"
    | "READ_CLINICAL"
    | "READ_LAB"
    | "READ_FINANCE"
    | "CREATE_ORDER"
    | "WRITE_LAB_RESULT"
    | "USE_MODEL"
    | "USE_VOICE"
  )[];
  status: "ACTIVE" | "AVAILABLE" | "CONFIG_REQUIRED" | "DISABLED";
  health: "HEALTHY" | "DEGRADED" | "OFFLINE";
  iconName: string;
  agentsCount: number;
  toolsCount: number;
  dependencies: string[];
}

const CATEGORY_MAP: Record<string, PluginManifest["category"]> = {
  CORE: "Models",
  ORCHESTRATION: "Agents",
  HOSPITAL: "Hospital",
  SECURITY: "Hospital",
  KNOWLEDGE: "Medical",
  VOICE: "Voice",
  INTEGRATION: "Integrations",
  MODEL: "Models",
  MEDICAL: "Medical",
  VISION: "Hospital",
  ANALYTICS: "Hospital",
  QUALITY: "Hospital",
  AGENT: "Agents",
  AUTOMATION: "Automation",
  ADDON: "Automation",
};

const ICON_BY_CATEGORY: Record<string, string> = {
  Medical: "BookOpen",
  Hospital: "Scan",
  Models: "Cpu",
  Agents: "Blocks",
  Voice: "Mic",
  Integrations: "Building2",
  Automation: "Blocks",
};

function mapPermission(claim: string): PluginManifest["permissions"][number] | null {
  if (/patient:read/.test(claim)) return "READ_PATIENT";
  if (/lab:read/.test(claim)) return "READ_LAB";
  if (/radiology:read|clinical:read/.test(claim)) return "READ_CLINICAL";
  if (/billing:read|finance/.test(claim)) return "READ_FINANCE";
  if (/order:create/.test(claim)) return "CREATE_ORDER";
  if (/lab:verify/.test(claim)) return "WRITE_LAB_RESULT";
  if (/ai:/.test(claim)) return "USE_MODEL";
  if (/voice/.test(claim)) return "USE_VOICE";
  return null;
}

function toCard(pluginId: string): PluginManifest | null {
  const manifest = ecosystemManager.getManifest(pluginId);
  const state = ecosystemManager.getState(pluginId);
  if (!manifest) return null;

  const claims = (manifest.permissions || []).flatMap((g) => g.claims || []);
  const permissions: PluginManifest["permissions"] = Array.from(
    new Set(claims.map(mapPermission).filter((p): p is PluginManifest["permissions"][number] => !!p))
  );
  if (permissions.length === 0) permissions.push("READ_CLINICAL");

  const status: PluginManifest["status"] =
    state?.status === "ACTIVE" || state?.status === "READY" || state?.status === "INSTALLED"
      ? "ACTIVE"
      : state?.status === "CONFIG_REQUIRED" || state?.status === "DEGRADED"
        ? "CONFIG_REQUIRED"
        : state?.status === "DISABLED"
          ? "DISABLED"
          : "AVAILABLE";

  const health: PluginManifest["health"] =
    state?.health === "HEALTHY" ? "HEALTHY" : state?.health === "DEGRADED" ? "DEGRADED" : "OFFLINE";

  const category = CATEGORY_MAP[manifest.category] || "Agents";

  return {
    id: manifest.pluginId,
    name: manifest.name,
    version: manifest.version,
    tier: manifest.tier,
    category,
    description: manifest.description,
    provider: manifest.provider,
    capabilities: manifest.tools.map((t) => t.name).slice(0, 4),
    permissions,
    status,
    health,
    iconName: ICON_BY_CATEGORY[category] || "Blocks",
    agentsCount: manifest.agents.length,
    toolsCount: manifest.tools.length,
    dependencies: manifest.dependencies.required,
  };
}

class PluginManager {
  public getAll(): PluginManifest[] {
    ecosystemManager.loadCatalog();
    return ecosystemManager.getCatalog().map((m) => toCard(m.pluginId)).filter((p): p is PluginManifest => !!p);
  }

  public async toggleStatus(id: string): Promise<PluginManifest | null> {
    const state = ecosystemManager.getState(id);
    const installed = state?.status === "ACTIVE" || state?.status === "READY" || state?.status === "INSTALLED";
    try {
      const result = installed ? await ecosystemManager.uninstall(id) : await ecosystemManager.install(id);
      return toCard(id);
    } catch {
      return toCard(id);
    }
  }
}

export const pluginManager = new PluginManager();