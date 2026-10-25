/**
 * Astra AI — Internal Service Manager :: Installer Logging (Phase 2)
 * =================================================================
 * Writes a structured, append-only trail of every installation attempt to:
 *   logs/installer/freellmapi-install.log
 *   logs/installer/omniroute-install.log
 *
 * Raw secret values (API keys, ENCRYPTION_KEY) are NEVER written — only
 * booleans describing their presence. The log intentionally mirrors the
 * exact request chain so a 403 can be traced to its precise source.
 */

import fs from "fs";
import path from "path";
import { astraDataRoot } from "./env";

export interface InstallLogEntry {
  timestamp: string;
  /** frontend action / backend operation */
  action: string;
  /** ASTRA-local endpoint hit (e.g. /api/services/freellmapi/install) */
  endpoint?: string;
  method?: string;
  /** authenticated role (never a raw token) */
  actorRole?: string;
  /** auth middleware outcome */
  auth?: "OK" | "DENIED" | "UNAUTHENTICATED";
  /** github/api external URL requested */
  url?: string;
  /** redirect chain */
  redirects?: string[];
  /** final download / fetch URL */
  finalUrl?: string;
  status?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  /** shell command executed by installer */
  command?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  /** true when a secret was PRESENT (value never logged) */
  secretPresent?: boolean;
  error?: string;
}

function logDir(): string {
  const dir = process.env.ASTRA_INSTALLER_LOGS_DIR || path.join(astraDataRoot(), "..", "logs", "installer");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Append one JSON line to the per-service installer log.
 *
 * `timestamp` is stamped here rather than required from the caller: the three
 * call sites in server/services/routes.ts all omitted it (TS2345), which means
 * every one of those log lines was written with no time at all. Owning the
 * clock in the logger makes that impossible going forward.
 */
export function logInstall(id: string, entry: Omit<InstallLogEntry, "timestamp">): void {
  try {
    const file = path.join(logDir(), `${id}-install.log`);
    const stamped: InstallLogEntry = { timestamp: new Date().toISOString(), ...entry };
    const line = Object.entries(stamped)
      .filter(([, v]) => v !== undefined)
      .reduce<Record<string, unknown>>((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, {});
    fs.appendFileSync(file, `${JSON.stringify({ server: "astra", ...line })}\n`, "utf-8");
  } catch {
    // logging must never break installation
  }
}
