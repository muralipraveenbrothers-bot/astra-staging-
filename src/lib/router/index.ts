/**
 * ASTRA AI — UNIFIED ROUTER MESH: BARREL EXPORT
 * 
 * Single import point for the entire router subsystem.
 */

// Types
export type {
  SubRouterId,
  CircuitState,
  SubRouterConfig,
  SubRouterTag,
  AstraRouterConfig,
  RoutingPolicy,
  SubRouterHealth,
  RouterHealthSnapshot,
  RoutingDecision,
  IntentRoute,
  IntentClassification,
  MCPToolDefinition,
  DepartmentId,
  DepartmentNotification,
  RouterPlugin,
  RoutingLogEntry,
} from "./types";

// Configuration
export { DEFAULT_ROUTER_CONFIG, getPolicyForIntent, getSubRouterConfig } from "./routerConfig";

// Layer 1 — Semantic Intent Classifier
export { SemanticIntentClassifier, semanticClassifier } from "./SemanticIntentClassifier";

// Layers 2–5 — Unified Router Mesh
export { routeRequest, getRoutingLog, getRoutingStats } from "./UnifiedRouterMesh";
export type { RouteResult } from "./UnifiedRouterMesh";

// Health Monitor & Circuit Breaker
export {
  checkAllRouters,
  getRouterHealth,
  getHealthSnapshot,
  isRouterAvailable,
  recordRequest,
  recordRateLimit,
  recordFailure,
  startHealthMonitor,
  stopHealthMonitor,
} from "./RouterHealthMonitor";

// Plugin Registry
export { pluginRegistry } from "./PluginRegistry";

// MCP Tool Mesh
export { mcpToolRegistry } from "./MCPToolRegistry";

// Department Dispatch
export { departmentDispatch } from "./DepartmentDispatch";
