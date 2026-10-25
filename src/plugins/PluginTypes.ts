/**
 * ASTRA AI — PLUGIN ECOSYSTEM CANONICAL TYPES
 * ============================================================================
 * Canonical schema for the Plugin Ecosystem (master directive v2026.08.14-PLUGIN-v1).
 * Every plugin is a self-contained organ declared by config/plugins/{pluginId}/manifest.json.
 */

export type PluginTier = "P0" | "P1" | "P2" | "P2.5" | "P3" | "P4";

export type PluginCategory =
  | "CORE"
  | "ORCHESTRATION"
  | "HOSPITAL"
  | "SECURITY"
  | "KNOWLEDGE"
  | "VOICE"
  | "INTEGRATION"
  | "MODEL"
  | "MEDICAL"
  | "VISION"
  | "ANALYTICS"
  | "QUALITY"
  | "AGENT"
  | "AUTOMATION"
  | "ADDON";

export type PluginStatus =
  | "DISCOVERED"
  | "INSTALLING"
  | "INSTALLED"
  | "CONNECTING"
  | "READY"
  | "ACTIVE"
  | "DEGRADED"
  | "FAILED"
  | "DISABLED"
  | "CONFIG_REQUIRED"
  | "INSTALL_BLOCKED";

export type HealthState = "HEALTHY" | "DEGRADED" | "OFFLINE";

export type RiskLevel = "INFO" | "LOW" | "REVERSIBLE" | "IMPORTANT" | "HIGH" | "CRITICAL";

export interface PluginService {
  serviceId: string;
  type: string;
  endpoint: string;
  healthEndpoint?: string;
}

export interface PluginAgent {
  agentId: string;
  name: string;
  level: string;
  autoRegister: boolean;
  parentAgent?: string;
  configSchema?: Record<string, string>;
}

export interface PluginTool {
  toolId: string;
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  riskLevel: RiskLevel;
  readOrWrite: "READ" | "WRITE";
}

export interface PluginModel {
  modelRouteId: string;
  provider: string;
  modelType: string;
  fallbackRouteId?: string;
}

export interface PluginKnowledgeSource {
  sourceId: string;
  type: string;
  accessScope: string;
  autoIndex: boolean;
}

export interface PluginPermissionGrant {
  role: string;
  claims: string[];
}

export interface PluginUIRoute {
  path: string;
  component: string;
  roles: string[];
}

export interface PluginUIComponent {
  name: string;
  slot: string;
}

export interface PluginHealthCheck {
  name: string;
  endpoint: string;
  timeoutMs: number;
  critical: boolean;
}

export interface PluginEventBinding {
  publishes: string[];
  subscribes: string[];
}

export interface PluginManifest {
  pluginId: string;
  name: string;
  version: string;
  tier: PluginTier;
  category: PluginCategory;
  description: string;
  license: string;
  provider: string;
  runtime: string;
  minAstraVersion: string;
  maxAstraVersion: string;
  dependencies: { required: string[]; optional: string[] };
  services: PluginService[];
  agents: PluginAgent[];
  tools: PluginTool[];
  models: PluginModel[];
  knowledge: PluginKnowledgeSource[];
  permissions: PluginPermissionGrant[];
  ui: { routes: PluginUIRoute[]; components: PluginUIComponent[]; icons: string[] };
  database: { migrations: string[]; seeds: string[] };
  events: PluginEventBinding;
  healthChecks: PluginHealthCheck[];
  configurationSchema: {
    properties: Record<string, { type: string; required?: boolean; default?: any; enum?: string[] }>;
    secrets: string[];
  };
  startupScript?: string;
  shutdownScript?: string;
  riskLevel: RiskLevel;
  checksum: string;
  statusRule?: string;
  notes?: string;
}

export interface PluginRuntimeState {
  pluginId: string;
  status: PluginStatus;
  health: HealthState;
  installedAt: string | null;
  lastHealthCheckAt: string | null;
  degradationReasons: string[];
  configuration: Record<string, string>;
  missingSecrets: string[];
  wired: {
    services: boolean;
    agents: number;
    tools: number;
    models: number;
    knowledge: number;
    permissions: number;
    ui: number;
  };
  healthCheckResults: Record<string, HealthCheckResult>;
  providerHealth: Record<string, "HEALTHY" | "DEGRADED" | "OFFLINE" | "CONFIG_REQUIRED">;
  resolvedOptionalDeps: string[];
  unresolvedOptionalDeps: string[];
  version?: string;
}

export interface HealthCheckResult {
  name: string;
  endpoint: string;
  passed: boolean;
  critical: boolean;
  latencyMs: number;
  detail: string;
  checkedAt: string;
}

export interface DependencyResolutionResult {
  pluginId: string;
  ok: boolean;
  blockedBy: string[];
  optionalMissing: string[];
  optionalResolved: string[];
  installOrder: string[];
  conflictDetected: string[];
  error?: string;
}

export interface InstallResult {
  pluginId: string;
  success: boolean;
  status: PluginStatus;
  steps: Array<{ step: string; ok: boolean; detail: string }>;
  resolution?: DependencyResolutionResult;
  healthChecks: HealthCheckResult[];
  error?: string;
}