/**
 * Astra AI — Internal Service Manager :: Runtime & Port Detection
 * ===============================================================
 * Before installing anything, detect what this machine already has:
 * Node.js versions (primary + alternates such as nvm installs), npm,
 * disk space, and whether candidate service ports are occupied.
 *
 * Rules: never blindly install duplicate runtimes; if a compatible runtime
 * exists, reuse it; report honestly when none is compatible.
 */

import { execFile } from "child_process";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface NodeRuntimeCandidate {
  nodeBin: string;
  version?: string;
  source: "PATH" | "nvm" | "nvm-windows" | "override" | "program-files";
}

function parseVersion(v?: string): [number, number, number] | undefined {
  if (!v) return undefined;
  const m = v.match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return undefined;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Minimal semver range check for the comparator forms we need.
 * Clauses may be separated by "||", e.g. [">=22.22.2 <23 || >=24 <27"].
 */
export function versionSatisfies(version: string | undefined, ranges: string[]): boolean {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  const clauses = ranges.join(" || ").split("||");
  return clauses.some((clause) => {
    const comparators = clause.trim().split(/\s+/).filter(Boolean);
    return comparators.every((c) => {
      const m = c.match(/^(>=|<=|<|>|=)\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
      if (!m) return true; // unknown comparator → don't fail the clause
      const [, op, Mj, Mi = "0", Pt = "0"] = m;
      const target: [number, number, number] = [Number(Mj), Number(Mi), Number(Pt)];
      const cmp =
        parsed[0] !== target[0]
          ? parsed[0] - target[0]
          : parsed[1] !== target[1]
            ? parsed[1] - target[1]
            : parsed[2] - target[2];
      switch (op) {
        case ">=": return cmp >= 0;
        case "<=": return cmp <= 0;
        case ">": return cmp > 0;
        case "<": return cmp < 0;
        default:  return cmp === 0;
      }
    });
  });
}

async function probeNodeVersion(nodeBin: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(nodeBin, ["--version"], {
      timeout: 10_000,
    });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

async function locateOnPath(binary: string): Promise<string | undefined> {
  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(whichCmd, [binary], {
      timeout: 5_000,
      shell: process.platform === "win32",
    });
    const first = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return first || undefined;
  } catch {
    return undefined;
  }
}


/** Pick the newest runtime satisfying any of the given clause sets. */
export async function selectCompatibleRuntime(
  requiredRangeClauses: string[],
  overrideBin?: string,
): Promise<{ runtime?: NodeRuntimeCandidate & { version?: string }; reason?: string }> {
  const all = await detectNodeRuntimes(overrideBin);
  const compatible = all.filter((c) =>
    requiredRangeClauses.some((clauseSet) =>
      versionSatisfies(c.version, clauseSet.split("||").map((s) => s.trim())),
    ),
  );
  if (compatible.length === 0) {
    const found = all.map((c) => `${c.nodeBin} (${c.version}, ${c.source})`).join("; ") || "none found";
    return {
      reason:
        `No Node.js runtime satisfies requirement "${requiredRangeClauses.join(" || ")}". ` +
        `Detected: ${found}. Install a compatible Node or set ASTRA_SERVICES_NODE_OVERRIDE.`,
    };
  }
  compatible.sort((a, b) => (parseVersion(b.version!)![0] !== parseVersion(a.version!)![0]
    ? parseVersion(b.version!)![0] - parseVersion(a.version!)![0]
    : parseVersion(b.version!)![1] - parseVersion(a.version!)![1]));
  return { runtime: compatible[0] };
}

export interface DiskFacts { freeMB?: number }

/** Best-effort free disk space for the volume hosting dir. */
export async function diskFree(dir: string): Promise<DiskFacts> {
  try {
    const statfs = (fs as any).statfsSync;
    if (typeof statfs === "function") {
      const s = statfs(dir);
      return { freeMB: Math.round((s.bavail * s.bsize) / (1024 * 1024)) };
    }
  } catch { /* unavailable */ }
  return {};
}

// ---------------------------------------------------------------------------
// Port utilities — never display or persist a fake port.
// ---------------------------------------------------------------------------

/** True when a TCP connection to host:port succeeds (something is listening). */
export function isPortResponding(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result: boolean) => { socket.destroy(); resolve(result); };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

/** Bind test on 127.0.0.1 to check whether a port is free. */
export function isPortBindable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Resolve the real port for a service. The manager calls this only when
 * ASTRA's own child is NOT running, so a port currently held by a foreign /
 * external process (e.g. an external FreeLLMAPI/OmniRoute desktop instance in
 * a dual-run validation, §24) is a genuine conflict — never adopt it:
 *   1. configured port bindable → keep it;
 *   2. otherwise select the first free port above it and report the conflict
 *      so callers update the internal registry with the REAL endpoint.
 */
export async function resolveServicePort(
  host: string,
  configuredPort: number,
  maxScan = 50,
): Promise<{ port: number; conflict: boolean }> {
  if (await isPortBindable(configuredPort)) return { port: configuredPort, conflict: false };
  for (let p = configuredPort + 1; p <= configuredPort + maxScan; p++) {
    if (await isPortBindable(p)) return { port: p, conflict: true };
  }
  throw new Error(`No free port found near ${configuredPort} (host ${host})`);
}

export async function detectNodeRuntimes(overrideBin?: string): Promise<NodeRuntimeCandidate[]> {
  const candidates: Array<NodeRuntimeCandidate & { version?: string }> = [];
  const seen = new Set<string>();
  const push = async (bin: string, source: NodeRuntimeCandidate["source"]) => {
    const key = path.resolve(bin).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (!fs.existsSync(bin)) return;
    const version = await probeNodeVersion(bin);
    if (version && !candidates.some((c) => c.version === version)) {
      candidates.push({ nodeBin: bin, source, version });
    }
  };

  if (overrideBin) await push(overrideBin, "override");
  await push(process.execPath, "PATH"); // the Node running ASTRA itself
  const pathNode = await locateOnPath(process.platform === "win32" ? "node.exe" : "node");
  if (pathNode) await push(pathNode, "PATH");

  if (process.platform === "win32") {
    // nvm-windows keeps runtimes under %APPDATA%\nvm\<ver>\
    const nvmRoot = process.env.NVM_HOME || path.join(os.homedir(), "AppData", "Roaming", "nvm");
    try {
      for (const entry of fs.readdirSync(nvmRoot)) {
        if (/^v?\d+\.\d+\.\d+$/.test(entry)) {
          await push(path.join(nvmRoot, entry, "node.exe"), "nvm-windows");
        }
      }
    } catch { /* no nvm */ }
    await push(path.join("C:", "Program Files", "nodejs", "node.exe"), "program-files");
    // Local patched LTS copies used by Astra start scripts (not always on PATH).
    const toolsRoot = "D:\\tools";
    try {
      for (const entry of fs.readdirSync(toolsRoot)) {
        if (/^node-v\d+\.\d+\.\d+-win-x64$/.test(entry)) {
          await push(path.join(toolsRoot, entry, "node.exe"), "override");
        }
      }
    } catch { /* no D:\tools */ }
  } else {
    const nvmDir = path.join(os.homedir(), ".nvm", "versions", "node");
    try {
      for (const entry of fs.readdirSync(nvmDir)) {
        await push(path.join(nvmDir, entry, "bin", "node"), "nvm");
      }
    } catch { /* no nvm */ }
  }
  return candidates;
}
