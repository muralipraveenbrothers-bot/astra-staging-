/**
 * Astra AI — Internal Service Manager :: Environment & Directory Layout
 * =====================================================================
 * Owns the ASTRA-controlled services directory:
 *
 *   <ASTRA_DATA>/services/
 *     freellmapi/{source,runtime,data,config,logs,backups}/manifest.json
 *     omniroute/{source,runtime,data,config,logs,backups}/manifest.json
 *
 * Nothing is written into Windows Program Files. GitHub access is required
 * only for install/update — everything else runs from this cached layout.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..");

/** Root of the ASTRA-managed persistent data area. */
export function astraDataRoot(): string {
  return process.env.ASTRA_DATA_DIR || path.join(REPO_ROOT, "data");
}

export function servicesRoot(): string {
  return process.env.ASTRA_SERVICES_DIR || path.join(astraDataRoot(), "services");
}

export type ServiceDirKind =
  | "root"
  | "source"
  | "runtime"
  | "data"
  | "config"
  | "logs"
  | "backups"
  | "artifacts";

export function serviceDirs(id: string): Record<ServiceDirKind, string> {
  // Map internal service IDs to their actual plugin folders
  let pluginFolder = id;
  if (id === "freellmapi") pluginFolder = "freellm-provider";
  if (id === "omniroute") pluginFolder = "omniroute-gateway";
  
  const root = path.resolve(REPO_ROOT, "config", "plugins", pluginFolder);
  return {
    root,
    source: path.join(root, "app"),
    runtime: path.join(root, "runtime"),
    data: path.join(root, "data"),
    config: path.join(root, "config"),
    logs: path.join(root, "logs"),
    backups: path.join(root, "backups"),
    artifacts: path.join(root, "artifacts"),
  };
}

/** Create the full directory skeleton idempotently. */
export function ensureServiceDirs(id: string): void {
  const dirs = serviceDirs(id);
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
}

export function manifestPath(id: string): string {
  return path.join(serviceDirs(id).root, "service-manifest.json");
}

export function readManifest(id: string): any | undefined {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(id), "utf-8"));
  } catch {
    return undefined;
  }
}

export function writeManifest(id: string, manifest: unknown): void {
  ensureServiceDirs(id);
  fs.writeFileSync(manifestPath(id), JSON.stringify(manifest, null, 2), "utf-8");
}

export function appendHistory(manifest: any, action: string, result: "OK" | "FAILED", detail?: string): any {
  const m = manifest ?? {};
  m.history = [
    ...(m.history ?? []),
    { at: new Date().toISOString(), action, result, detail },
  ].slice(-100);
  return m;
}
