/**
 * ASTRA Stable — Port registry loader (safety wall: layer 2)
 * =========================================================
 * config/ports.json is the ONE place a port may be declared. Anything that
 * needs a port asks here, so a new integration cannot invent its own value or
 * silently reassign a busy port (§24 "no silent port reassignment").
 */
import portsJson from "../../../config/ports.json";
import type { PortEntry, ServiceDefinition, ServiceTier } from "./types";

interface PortsFile {
  version: number;
  description?: string;
  services: Record<string, PortEntry>;
}

const file = portsJson as unknown as PortsFile;

/** Raw entries exactly as authored (used by preflight + contract tests). */
export function portEntries(): Record<string, PortEntry> {
  return file.services;
}

export function canonicalPort(id: string): number {
  const entry = file.services[id];
  if (!entry) throw new Error(`portRegistry: unknown service "${id}"`);
  return entry.port;
}

export function serviceIds(): string[] {
  return Object.keys(file.services);
}

/** Ports that used to be used for a service and must never come back. */
export function legacyPorts(): { id: string; port: number }[] {
  const out: { id: string; port: number }[] = [];
  for (const [id, entry] of Object.entries(file.services)) {
    for (const alias of entry.aliases ?? []) out.push({ id, port: alias });
  }
  return out;
}

/** Duplicate live port detection — the guard against a 31415/3001 style split. */
export function duplicatePorts(): { port: number; ids: string[] }[] {
  const byPort = new Map<number, string[]>();
  for (const [id, entry] of Object.entries(file.services)) {
    if (entry.probe === "none") continue;
    const list = byPort.get(entry.port) ?? [];
    list.push(id);
    byPort.set(entry.port, list);
  }
  return [...byPort.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([port, ids]) => ({ port, ids }));
}

/** A service whose live port is another service's retired port = drift. */
export function aliasCollisions(): { id: string; port: number; belongsTo: string }[] {
  const out: { id: string; port: number; belongsTo: string }[] = [];
  const entries = Object.entries(file.services);
  for (const [id, entry] of entries) {
    for (const [otherId, other] of entries) {
      if (otherId === id) continue;
      if ((other.aliases ?? []).includes(entry.port)) {
        out.push({ id, port: entry.port, belongsTo: otherId });
      }
    }
  }
  return out;
}

function normalizeUrl(host: string, port: number, path = ""): string {
  const base = `http://${host}:${port}`;
  return path ? `${base}${path}` : base;
}

export function toDefinition(id: string, entry: PortEntry): ServiceDefinition {
  return {
    id,
    name: entry.name,
    tier: entry.tier,
    host: entry.host,
    port: entry.port,
    probe: entry.probe,
    healthPath: entry.healthPath,
    pm2Name: entry.pm2,
    launcher: entry.launcher,
    routeGroup: entry.routeGroup,
    optional: entry.tier !== "core",
    url: normalizeUrl(entry.host, entry.port, entry.healthPath),
  };
}

export function allDefinitions(): ServiceDefinition[] {
  // Retired services (e.g. LiteLLM) stay in config/ports.json as history but
  // are not supervised, probed, restarted or counted in route groups.
  return Object.entries(file.services)
    .filter(([, entry]) => !entry.retired)
    .map(([id, entry]) => toDefinition(id, entry));
}

export function definitionsByTier(tier: ServiceTier): ServiceDefinition[] {
  return allDefinitions().filter((d) => d.tier === tier);
}

/** Services PM2 is allowed to supervise. */
export function supervisedServices(): ServiceDefinition[] {
  return allDefinitions().filter((d) => Boolean(d.pm2Name));
}

/** Grouped-alternative availability, e.g. "at least one LLM route is usable". */
export function routeGroups(): Record<string, ServiceDefinition[]> {
  const out: Record<string, ServiceDefinition[]> = {};
  for (const def of allDefinitions()) {
    if (!def.routeGroup) continue;
    (out[def.routeGroup] ??= []).push(def);
  }
  return out;
}
