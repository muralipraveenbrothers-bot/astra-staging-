/**
 * ASTRA AI — PLUGIN REGISTRY
 * 
 * Registry for all router plugins with install detection, health checking,
 * and auto-wiring into the Unified Router Mesh.
 */

import type { RouterPlugin, SubRouterId } from "./types";
import { DEFAULT_ROUTER_CONFIG } from "./routerConfig";
import { FREELLMAPI_PORT } from "../../config/freeLlmEndpoint";

// ─── Plugin Definitions ──────────────────────────────────────────

const PLUGINS: RouterPlugin[] = [
  {
    id: "freellmapi",
    name: "FreeLLMAPI Unified Router",
    version: "1.x",
    type: "ROUTER",
    status: "NOT_DETECTED",
    healthEndpoint: "/proxy/freellmapi/v1/models",
    config: {
      port: FREELLMAPI_PORT,
      description: "343 models, 27 providers, ~4B tokens/mo free tier",
      docUrl: "https://github.com/FreeLLMAPI",
    },
  },
  {
    id: "omniroute",
    name: "OmniRoute Gateway",
    version: "1.x",
    type: "ROUTER",
    status: "NOT_DETECTED",
    healthEndpoint: "/proxy/omni/v1/models",
    config: {
      port: 20128,
      description: "357 providers, desktop app :20128, MCP built-in",
      docUrl: "https://github.com/OmniRoute",
    },
  },
  {
    id: "litellm",
    name: "LiteLLM Enterprise Proxy",
    version: "1.x",
    type: "ROUTER",
    // RETIRED: installed clone exists but the service is not running and adds
    // nothing over FreeLLMAPI → OmniRoute → Ollama. Kept for history only.
    status: "RETIRED",
    healthEndpoint: "/proxy/litellm/health",
    config: {
      port: 4000,
      retired: true,
      description: "RETIRED — port 4000 closed; Astra routes FreeLLMAPI → OmniRoute → Ollama",
      docUrl: "https://docs.litellm.ai",
    },
  },
  {
    id: "routellm",
    name: "RouteLLM Cost-Quality Optimizer",
    version: "1.x",
    type: "ROUTER",
    // RETIRED: cost-quality selection is in-process threshold logic now.
    status: "RETIRED",
    healthEndpoint: "/proxy/routellm/health",
    config: {
      port: 6060,
      retired: true,
      description: "RETIRED — matrix factorization threshold runs in-process (UnifiedRouterMesh)",
      docUrl: "https://github.com/lm-sys/RouteLLM",
    },
  },
  {
    id: "ollama",
    name: "Ollama Local Runtime",
    version: "0.x",
    type: "ROUTER",
    status: "NOT_DETECTED",
    healthEndpoint: "/proxy/ollama/api/tags",
    config: {
      port: 11434,
      description: "Local GPU inference, privacy-safe, offline capable",
      docUrl: "https://ollama.ai",
    },
  },
  {
    id: "semantic-router",
    name: "Semantic Intent Classifier",
    version: "1.0.0",
    type: "CLASSIFIER",
    status: "READY",  // Built-in TypeScript implementation
    config: {
      description: "TF-IDF cosine similarity, 15 intent routes, <10ms",
      builtIn: true,
    },
  },
  {
    id: "mcp-tools",
    name: "MCP Tool Registry",
    version: "1.0.0",
    type: "TOOL_MESH",
    status: "READY",  // Built-in
    config: {
      description: "25+ hospital tools as MCP definitions with RBAC",
      builtIn: true,
    },
  },
  {
    id: "dept-dispatch",
    name: "Department Dispatch System",
    version: "1.0.0",
    type: "DISPATCHER",
    status: "READY",  // Built-in
    config: {
      description: "9 department inboxes with priority notifications",
      builtIn: true,
    },
  },
];

// ─── Plugin Registry ─────────────────────────────────────────────

class PluginRegistryService {
  private plugins: RouterPlugin[] = [...PLUGINS];

  /**
   * Get all registered plugins.
   */
  getAll(): RouterPlugin[] {
    return [...this.plugins];
  }

  /**
   * Get a plugin by ID.
   */
  get(id: string): RouterPlugin | undefined {
    return this.plugins.find((p) => p.id === id);
  }

  /**
   * Get plugins by type.
   */
  getByType(type: RouterPlugin["type"]): RouterPlugin[] {
    return this.plugins.filter((p) => p.type === type);
  }

  /**
   * Auto-detect installed plugins by probing their health endpoints.
   */
  async detectAll(): Promise<void> {
    const probePromises = this.plugins.map(async (plugin) => {
      // Built-in plugins are always READY
      if (plugin.config.builtIn) {
        plugin.status = "READY";
        return;
      }

      // Retired plugins are history: no probe, no red "not detected" alarm.
      if (plugin.config.retired) {
        plugin.status = "RETIRED";
        return;
      }

      if (!plugin.healthEndpoint) return;

      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(plugin.healthEndpoint, { signal: ctrl.signal });
        clearTimeout(timer);

        // Any HTTP response = installed (even 401/403 means it's running)
        plugin.status = "READY";
        plugin.lastHealthCheck = Date.now();
        console.log(`[PluginRegistry] ✓ ${plugin.name} detected (${res.status})`);
      } catch {
        plugin.status = "NOT_DETECTED";
        plugin.lastHealthCheck = Date.now();
        console.log(`[PluginRegistry] ✗ ${plugin.name} not detected`);
      }
    });

    await Promise.allSettled(probePromises);
  }

  /**
   * Get installation instructions for a specific plugin.
   */
  getInstallInstructions(id: string): string {
    const instructions: Record<string, string> = {
      freellmapi: `# FreeLLMAPI Installation (canonical Astra port: ${FREELLMAPI_PORT})
npm install -g freellmapi
freellmapi --port ${FREELLMAPI_PORT}
# Or via Docker:
docker run -p ${FREELLMAPI_PORT}:${FREELLMAPI_PORT} freellmapi/freellmapi`,

      omniroute: `# OmniRoute Installation
pip install omniroute
omniroute serve --port 5171
# Or via Docker:
docker run -p 5171:5171 omniroute/omniroute`,

      litellm: `# LiteLLM Installation
pip install litellm[proxy]
litellm --port 4000 --config litellm_config.yaml
# Or via Docker:
docker run -p 4000:4000 ghcr.io/berriai/litellm`,

      routellm: `# RouteLLM Installation
pip install routellm
python -m routellm.openai_server --port 6060 --routers mf
# Threshold: 0.11593 = 50% strong model calls`,

      ollama: `# Ollama Installation
# Download from https://ollama.ai
ollama serve
ollama pull llama3.1:8b
ollama pull mistral:7b`,
    };

    return instructions[id] ?? "No installation instructions available.";
  }

  /**
   * Get summary statistics.
   */
  getSummary(): {
    total: number;
    ready: number;
    notDetected: number;
    error: number;
  } {
    return {
      total: this.plugins.length,
      ready: this.plugins.filter((p) => p.status === "READY").length,
      notDetected: this.plugins.filter((p) => p.status === "NOT_DETECTED").length,
      error: this.plugins.filter((p) => p.status === "ERROR").length,
    };
  }
}

// ─── Singleton Export ─────────────────────────────────────────────

export const pluginRegistry = new PluginRegistryService();
