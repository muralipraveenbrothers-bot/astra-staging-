/**
 * ASTRA AI — DEPENDENCY RESOLUTION ENGINE (3)
 * ============================================================================
 * Builds the plugin DAG, detects cycles, topologically sorts installation order,
 * and resolves REQUIRED vs OPTIONAL dependencies per manifest.
 *
 * RULES:
 *  - Missing required dependency  -> INSTALL BLOCKED
 *  - Missing optional dependency  -> DEGRADED but functional
 *  - Cycle in required graph      -> REJECT with error
 *  - Incompatible version         -> BLOCK
 */

import {
  DependencyResolutionResult,
  PluginManifest,
  PluginRuntimeState,
} from "./PluginTypes";

const ASTRA_CORE_VERSION = "1.0.0";

export function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function satisfies(version: string, requirement: string): boolean {
  const v = parseVersion(version);
  if (!v) return false;
  const req = requirement.trim();
  if (req === "*" || req === "latest") return true;
  const range = /^(\^|~|>=|<=|>|<|=)?\s*(\d+)\.(\d+)\.(\d+)/.exec(req);
  if (!range) {
    const exact = parseVersion(req);
    return !!exact && exact.major === v.major && exact.minor === v.minor && exact.patch === v.patch;
  }
  const op = range[1] || "=";
  const r = { major: Number(range[2]), minor: Number(range[3]), patch: Number(range[4]) };
  const cmp = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0);
  const ord = cmp(v.major, r.major) || cmp(v.minor, r.minor) || cmp(v.patch, r.patch);
  switch (op) {
    case "^": return v.major === r.major && ord >= 0;
    case "~": return v.major === r.major && v.minor === r.minor && ord >= 0;
    case ">=": return ord >= 0;
    case ">": return ord > 0;
    case "<=": return ord <= 0;
    case "<": return ord < 0;
    default: return ord === 0;
  }
}

export function isAstraVersionCompatible(manifest: PluginManifest): boolean {
  if (manifest.minAstraVersion && !satisfies(ASTRA_CORE_VERSION, manifest.minAstraVersion)) return false;
  if (manifest.maxAstraVersion) {
    const max = parseVersion(manifest.maxAstraVersion);
    const cur = parseVersion(ASTRA_CORE_VERSION);
    if (max && cur && cur.major > max.major) return false;
  }
  return true;
}

export class DependencyResolver {
  /**
   * Resolve installation for the given plugin against the current ecosystem state.
   */
  public resolve(
    target: PluginManifest,
    available: Map<string, PluginManifest>,
    installed: Map<string, PluginRuntimeState>
  ): DependencyResolutionResult {
    const blockedBy: string[] = [];
    const optionalMissing: string[] = [];
    const optionalResolved: string[] = [];
    const conflictDetected: string[] = [];

    if (!isAstraVersionCompatible(target)) {
      return {
        pluginId: target.pluginId,
        ok: false,
        blockedBy: [`ASTRA core version ${ASTRA_CORE_VERSION} outside ${target.minAstraVersion}..${target.maxAstraVersion}`],
        optionalMissing: [],
        optionalResolved: [],
        installOrder: [],
        conflictDetected: [],
      };
    }

    // 1. Required dependency closure
    const requiredClosure = new Map<string, PluginManifest>();
    const collectRequired = (manifest: PluginManifest, trail: string[]) => {
      for (const depId of manifest.dependencies.required) {
        if (requiredClosure.has(depId) || installed.has(depId)) continue;
        const dep = available.get(depId);
        if (!dep) {
          blockedBy.push(`${manifest.pluginId} requires unavailable plugin '${depId}'`);
          continue;
        }
        requiredClosure.set(depId, dep);
        collectRequired(dep, [...trail, depId]);
      }
    };
    collectRequired(target, [target.pluginId]);

    // 2. Cycle detection over required DAG
    const cycle = this.detectCycle(target, available, installed);
    if (cycle) {
      blockedBy.push(`Dependency cycle detected: ${cycle.join(" -> ")}`);
    }

    // 3. Topological install order (Kahn's algorithm)
    const installOrder: string[] = [];
    if (blockedBy.length === 0) {
      const allNodes = new Map<string, PluginManifest>();
      allNodes.set(target.pluginId, target);
      for (const [id, m] of requiredClosure) allNodes.set(id, m);

      const indegree = new Map<string, number>();
      const adj = new Map<string, string[]>();
      for (const id of allNodes.keys()) {
        indegree.set(id, 0);
        adj.set(id, []);
      }
      for (const [id, m] of allNodes) {
        for (const depId of m.dependencies.required) {
          if (allNodes.has(depId)) {
            adj.get(depId)!.push(id);
            indegree.set(id, (indegree.get(id) || 0) + 1);
          }
        }
      }
      const queue: string[] = [];
      for (const [id, deg] of indegree) if (deg === 0) queue.push(id);
      while (queue.length > 0) {
        const id = queue.shift()!;
        installOrder.push(id);
        for (const child of adj.get(id) || []) {
          indegree.set(child, (indegree.get(child) || 0) - 1);
          if (indegree.get(child) === 0) queue.push(child);
        }
      }
      if (installOrder.length !== allNodes.size) {
        blockedBy.push("Required dependency graph is cyclic or incomplete");
      }
    }

    // 4. Optional dependency detection
    for (const depId of target.dependencies.optional) {
      if (installed.has(depId) || available.has(depId)) {
        optionalResolved.push(depId);
      } else {
        optionalMissing.push(depId);
      }
    }

    // 5. Conflict detection: duplicate memory governors, duplicate command engines, etc.
    const conflicts: Record<string, string[]> = {
      "memory-governor": ["astra-brain-core"],
      "command-engine": ["hospital-command-engine"],
    };
    for (const [cap, owners] of Object.entries(conflicts)) {
      const present = owners.filter((id) => installed.has(id) && id !== target.pluginId);
      if (present.length > 0 && owners.includes(target.pluginId)) {
        conflictDetected.push(`${cap} already provided by ${present.join(", ")}`);
      }
    }

    return {
      pluginId: target.pluginId,
      ok: blockedBy.length === 0,
      blockedBy,
      optionalMissing,
      optionalResolved,
      installOrder: blockedBy.length === 0 ? installOrder : [],
      conflictDetected,
    };
  }

  /**
   * Detect a cycle in the required-dependency graph (DFS with color marking).
   */
  public detectCycle(
    target: PluginManifest,
    available: Map<string, PluginManifest>,
    installed: Map<string, PluginRuntimeState>
  ): string[] | null {
    const color = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    const nodes = new Map<string, PluginManifest>();
    nodes.set(target.pluginId, target);
    const visit = (id: string): string[] | null => {
      const m = nodes.get(id) || available.get(id);
      if (!m) return null;
      for (const depId of m.dependencies.required) {
        if (installed.has(depId) || !available.has(depId)) continue;
        if (!nodes.has(depId)) nodes.set(depId, available.get(depId)!);
        const c = color.get(depId);
        if (c === 1) {
          const idx = stack.indexOf(depId);
          return [...stack.slice(idx), depId];
        }
        if (c === 2) continue;
        color.set(depId, 1);
        stack.push(depId);
        const cyc: string[] | null = visit(depId);
        if (cyc) return cyc;
        stack.pop();
        color.set(depId, 2);
      }
      return null;
    };
    color.set(target.pluginId, 1);
    stack.push(target.pluginId);
    return visit(target.pluginId);
  }

  /**
   * Version check for a dependency requirement (^1.0.0 style).
   */
  public checkVersionCompatibility(requirement: string, installedVersion: string): boolean {
    return satisfies(installedVersion, requirement);
  }
}

export const dependencyResolver = new DependencyResolver();