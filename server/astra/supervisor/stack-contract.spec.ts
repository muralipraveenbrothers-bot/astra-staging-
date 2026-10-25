/**
 * ASTRA Stable — stack contract (§26)
 * ===================================
 * The architectural rules that keep a new integration from silently taking the
 * stack down. This is the file that makes "next time a code change breaks it"
 * structurally impossible: every rule that the original outage violated is
 * asserted here against the REAL repository files.
 *
 * All checks are offline and structural — no PM2, no network, no ports opened.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  allDefinitions,
  canonicalPort,
  duplicatePorts,
  legacyPorts,
  portEntries,
} from "./portRegistry";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const requireModule = createRequire(path.join(ROOT, "package.json"));

const CANDIDATE_CONFIGS = [
  "ecosystem.recovery.config.cjs",
  "ecosystem.config.next.cjs",
  "ecosystem.extensions.config.cjs",
  "ecosystem.ui.config.cjs",
];

/** Legacy values that must never come back as live configuration. */
const RETIRED_FREELLMAPI_PORT = 3001;

function loadApps(cfg: string): Record<string, unknown>[] {
  const file = path.join(ROOT, cfg);
  if (!fs.existsSync(file)) return [];
  return ((requireModule(file) as { apps?: unknown[] }).apps ?? []) as Record<string, unknown>[];
}

function readText(rel: string): string | null {
  const file = path.join(ROOT, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function envValue(source: string, key: string): string | undefined {
  const line = source.split(/\r?\n/).find((l) => l.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim() : undefined;
}

describe("Port registry (§24, §25)", () => {
  it("has no duplicate live ports", () => {
    expect(duplicatePorts()).toEqual([]);
  });

  it("keeps the canonical ports frozen", () => {
    expect(canonicalPort("freellmapi")).toBe(31416);
    expect(canonicalPort("ollama")).toBe(11434);
    expect(canonicalPort("voicebox")).toBe(17493);
    expect(canonicalPort("astra-api")).toBe(3000);
  });

  it("records the retired FreeLLMAPI port as an alias, never as the live port", () => {
    expect(canonicalPort("freellmapi")).not.toBe(RETIRED_FREELLMAPI_PORT);
    expect(legacyPorts()).toContainEqual({ id: "freellmapi", port: RETIRED_FREELLMAPI_PORT });
  });

  it("treats every non-core service as optional", () => {
    for (const def of allDefinitions()) {
      if (def.tier === "core") {
        expect(def.optional).toBe(false);
      } else {
        expect(def.optional).toBe(true);
      }
    }
  });

  it("registers no service named gesture (browser-only feature, §12)", () => {
    const ids = Object.keys(portEntries());
    expect(ids).not.toContain("gesture");
    expect(allDefinitions().some((d) => /gesture/i.test(d.id))).toBe(false);
  });
});

describe("PM2 activation candidates (§2, §4, §6)", () => {
  const apps = CANDIDATE_CONFIGS.flatMap(loadApps);
  const nameOf = (a: Record<string, unknown>) => String(a.name ?? "?");

  it("exist and declare at least one app", () => {
    const declared = CANDIDATE_CONFIGS.filter((c) => fs.existsSync(path.join(ROOT, c)));
    expect(declared.length).toBeGreaterThan(0);
    expect(apps.length).toBeGreaterThan(0);
  });

  it("never hands a .ts file to Node directly", () => {
    const offenders = apps.filter((a) => String(a.script ?? "").endsWith(".ts"));
    expect(offenders.map(nameOf)).toEqual([]);
  });

  it("never uses the bare `node` interpreter (system Node 20)", () => {
    const offenders = apps.filter((a) => a.interpreter === "node");
    expect(offenders.map(nameOf)).toEqual([]);
  });

  it("never registers the ts-node hook that produced ERR_UNKNOWN_FILE_EXTENSION", () => {
    const offenders = apps.filter((a) => String(a.interpreter_args ?? "").includes("ts-node"));
    expect(offenders.map(nameOf)).toEqual([]);
  });

  it("never uses the interactive `cmd` interpreter", () => {
    const offenders = apps.filter((a) => a.interpreter === "cmd");
    expect(offenders.map(nameOf)).toEqual([]);
  });

  it("never targets the retired port 3001", () => {
    const offenders = apps.filter((a) => JSON.stringify(a.env ?? {}).includes("3001"));
    expect(offenders.map(nameOf)).toEqual([]);
  });

  it("has no GestureService app", () => {
    const offenders = apps.filter((a) => /gesture/i.test(nameOf(a)));
    expect(offenders.map(nameOf)).toEqual([]);
  });

  it("points every interpreter-driven script at an existing file", () => {
    const offenders = apps
      .filter((a) => a.interpreter !== "none")
      .filter((a) => !fs.existsSync(path.resolve(String(a.cwd ?? ROOT), String(a.script))));
    expect(offenders.map((a) => `${nameOf(a)}: ${a.script}`)).toEqual([]);
  });

  it("bounds restarts so a broken service is isolated instead of looping (§7)", () => {
    for (const app of apps) {
      expect(app.watch).toBe(false);
      expect(Number(app.max_restarts ?? 0)).toBeGreaterThan(0);
      expect(Number(app.max_restarts ?? Infinity)).toBeLessThanOrEqual(10);
    }
  });
});

describe("Launcher hygiene (§6)", () => {
  const launchers = [
    ...new Set(
      Object.values(portEntries())
        .map((e) => e.launcher)
        .filter((l): l is string => Boolean(l)),
    ),
  ];

  it("declares launchers that exist on disk", () => {
    const missing = launchers.filter((l) => !fs.existsSync(path.join(ROOT, l)));
    expect(missing).toEqual([]);
  });

  it("keeps the primary process in the foreground so PM2 owns its PID", () => {
    const offenders: string[] = [];
    for (const rel of launchers) {
      const text = readText(rel);
      if (!text) continue;
      const commands = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("@") && !/^rem\b/i.test(l) && !/^echo[. ]/i.test(l));
      const last = commands[commands.length - 1] ?? "";
      // A trailing `start` detaches the real server: PM2 then supervises a
      // cmd.exe that exits immediately, so a dead service looks online.
      if (/^start\b/i.test(last)) offenders.push(`${rel} ends with: ${last}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("Saarathi Gesture Vision is removed", () => {
  it("does not ship the gesture vision module", () => {
    expect(readText("src/features/saarathi/gesture/mediapipeLoader.ts")).toBeNull();
    expect(readText("src/features/saarathi/gesture/GestureVisionPanel.tsx")).toBeNull();
  });

  it("does not register GestureVision as a PM2 process", () => {
    const raw = readText("config/ports.json");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { processOnly?: string[] };
    expect(parsed.processOnly ?? []).not.toContain("GestureVision");
  });
});

describe("Configuration source of truth (§9, §8)", () => {
  it("declares the canonical gateway base URL", () => {
    const env = readText("config/ai-gateway.env");
    expect(env).not.toBeNull();
    const ports = JSON.parse(readText("config/ports.json") as string) as { services: { freellmapi: { host: string; port: number } } };
    const gateway = ports.services.freellmapi;
    const canonicalBase = `http://${gateway.host}:${gateway.port}/v1`;
    expect(envValue(env as string, "FREELLMAPI_BASE_URL")).toBe(canonicalBase);
  });

  it("uses one gateway key everywhere (no 116f… vs 084e… drift)", () => {
    const env = readText("config/ai-gateway.env") as string;
    const ports = JSON.parse(readText("config/ports.json") as string) as { services: { freellmapi: { host: string; port: number } } };
    const gateway = ports.services.freellmapi;
    const canonicalBase = `http://${gateway.host}:${gateway.port}/v1`;
    const sourceKey = envValue(env, "FREELLMAPI_API_KEY");
    expect(sourceKey).toBeTruthy();
    expect(envValue(env, "ASTRA_ADAPTER_API_KEY")).toBeDefined();
    expect(envValue(env, "ASTRA_ADAPTER_API_KEY")).toBe(sourceKey);
    expect(envValue(env, "FREELLMAPI_BASE_URL")).toBe(canonicalBase);
    expect(env).not.toContain(`:${RETIRED_FREELLMAPI_PORT}/v1`);
  });

  it("matches the Claude client settings when they exist on this machine", () => {
    const claudeSettings = "C:\\Users\\mural\\.claude\\settings.json";
    if (!fs.existsSync(claudeSettings)) return;
    const sourceKey = envValue(readText("config/ai-gateway.env") as string, "FREELLMAPI_API_KEY");
    const ports = JSON.parse(readText("config/ports.json") as string) as { services: { freellmapi: { host: string; port: number } } };
    const gateway = ports.services.freellmapi;
    const parsed = JSON.parse(fs.readFileSync(claudeSettings, "utf8")) as {
      env?: Record<string, string>;
    };
    expect(parsed.env?.ANTHROPIC_BASE_URL).toBe(`http://${gateway.host}:${gateway.port}`);
    expect(parsed.env?.ANTHROPIC_AUTH_TOKEN).toBe(sourceKey);
  });
});

describe("Secrets never live in source code (§9)", () => {
  it("contains no gateway key literal in TypeScript", () => {
    const offenders: string[] = [];
    const skip = new Set(["node_modules", "dist", "build", ".git", "__pycache__"]);
    const scan = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (skip.has(entry.name)) continue;
          scan(full);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")) {
          if (/freellmapi-[0-9a-f]{32,}/.test(fs.readFileSync(full, "utf8"))) {
            offenders.push(path.relative(ROOT, full));
          }
        }
      }
    };
    scan(path.join(ROOT, "server"));
    scan(path.join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});

/**
 * Retired-port firewall (§8, §24)
 * ---------------------------------------------------------------------------
 * WHY THIS IS THE MOST IMPORTANT TEST IN THIS FILE
 *
 * The single most expensive failure in this stack's history: FreeLLMAPI moved
 * from the two-process layout (:3001 Express API + :5170 Vite dashboard) to ONE
 * process on :31415 — but the retired ports survived in five separate places:
 *
 *   1. server/platform/runtimeStatus.ts  → the health probe that paints the
 *      Internal Browser grid (this alone made a LIVE gateway render OFFLINE)
 *   2. src/services/gatewayManager.ts    → the gateway definition that printed
 *      ":5170 UI · :3001 API" on the card and drove the dashboard probe
 *   3. vite.config.ts                    → the /proxy/freellmapi target
 *   4. server/ai/config.ts               → the server-side base-URL default
 *   5. server/ai/loadEnv.ts              → a config WRITER that re-injected
 *      FREELLMAPI_BASE_URL=http://127.0.0.1:3001/v1 on every key save, silently
 *      undoing the migration and reintroducing the outage
 *
 * The service was healthy the entire time. Only the probes were wrong — which
 * is exactly the class of bug that no runtime test catches and no log reveals.
 * This test is the firewall: reintroducing either port in runtime source fails
 * the build BEFORE it can reach the running stack.
 */
describe("Retired FreeLLMAPI ports are firewalled (§8, §24)", () => {
  /**
   * A retired port counts as "used" only in a PORT-LIKE position — directly
   * after a `:`, `,` or `=`. A bare \b3001\b would false-positive on real
   * hospital data ("RAD-3001" radiology record IDs, "30019099" HSN codes in the
   * pharmacy catalogue), and a firewall that cries wolf gets switched off —
   * which is worse than no firewall at all.
   */
  const RETIRED = /(?::|,|=)\s*(3001|5170)\b/;

  /**
   * Third-party / generated / non-runtime trees we do not own and must not police.
   * `modules` and `freellmapi` are vendored upstream checkouts whose own docs and
   * defaults legitimately mention :3001.
   */
  const SKIP_DIRS = new Set([
    "node_modules", "dist", "build", "release", "releases", "backups",
    ".git", "_removed", "__pycache__", "venv", ".venv", ".build",
    "modules", "freellmapi", "public", "logs", "knowledge-data", "graphify-out",
    ".agents", ".vscode", ".uv-cache", ".uv-python", "external", "get-repo",
    "pmb-project", "vendor", "plugins", "reports", "astra-probes",
    // Bootstrap/media trees and generated runtime state — not stack configuration.
    "integrations", "data", "coverage",
    // Quarantined / archived audit material is deliberately NOT runtime
    // configuration. Items parked here are inert by definition, so policing them
    // would report the archive instead of the live stack.
    "_quarantine", "_audit", "_diagnostics",
  ]);

  /**
   * Vendored upstream app checkouts under config/plugins/. Their own unit tests
   * assert their own upstream defaults, which we neither own nor run. The Astra
   * side of every plugin (service-manifest.json) stays fully policed.
   */
  const SKIP_PREFIXES = [
    "config/plugins/freellm-provider/app/",
    "config/plugins/omniroute-gateway/app/",
  ];

  /**
   * The ONLY file allowed to name a retired port: the registry itself, which
   * records 3001 as a retired ALIAS so a stale process holding it can be
   * detected and identified rather than silently ignored.
   */
  const ALLOWED_FILES = new Set(["config/ports.json"]);

  function offendersIn(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        offendersIn(path.join(dir, entry.name), out);
        continue;
      }
      // Launcher scripts are runtime configuration too. The .ts/.json-only
      // filter used to skip scripts/ and *.cmd, which is precisely how the
      // retired port 3001 survived in scripts/start-astra-brain.ps1 (it pointed
      // the brain at a dead gateway) while this contract test reported clean.
      //
      // The SAME filter bug then repeated one layer down, and that is where the
      // live outage actually lived: dotenv files (`*.env`, `.env.local`,
      // `*.env.example`) and Python helpers were not scanned at all, so
      // .env.local kept pinning the API base to the dead :3001 and carried the
      // 116f… key the gateway answers with 401 — while this test reported clean.
      // Dotenv files are the most runtime configuration this repo has, so they
      // are matched by name as well as by extension.
      const isRuntimeConfig =
        /\.(ts|tsx|mjs|cjs|json|ps1|cmd|bat|py)$/.test(entry.name) ||
        /^\.env/.test(entry.name) ||
        /\.env(\.example)?$/.test(entry.name);
      if (!isRuntimeConfig) continue;
      // Specs may assert on legacy error strings (e.g. an ECONNREFUSED message).
      if (entry.name.endsWith(".spec.ts")) continue;
      const rel = path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, "/");
      if (ALLOWED_FILES.has(rel)) continue;
      if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) continue;
      const text = fs.readFileSync(path.join(dir, entry.name), "utf8");
      if (RETIRED.test(text)) out.push(rel);
    }
    return out;
  }

  it("names no retired FreeLLMAPI port anywhere in runtime source", () => {
    expect(offendersIn(ROOT)).toEqual([]);
  });

  it("keeps the health probe pointed at the canonical port", () => {
    const src = readText("server/platform/runtimeStatus.ts") ?? "";
    const gateway = portEntries().freellmapi;
    expect(gateway.port).toBe(31416);
    expect(canonicalPort("freellmapi")).toBe(31416);
    expect(src).toContain('canonicalPort("freellmapi")');
    expect(src).toContain("portEntries().freellmapi.host");
    expect(src).toMatch(/freellmapi.*portEntries\(\).*canonicalPort\("freellmapi"\)/s);
    expect(src).not.toMatch(/\b31415\b/);
    expect(src).not.toMatch(/\b3001\b/);
    expect(src).not.toMatch(/\b5170\b/);
  });

  it("keeps the gateway definition on the canonical port for API and UI", () => {
    const src = readText("src/services/gatewayManager.ts") ?? "";
    const gateway = portEntries().freellmapi;
    expect(gateway.port).toBe(31416);
    expect(canonicalPort("freellmapi")).toBe(31416);
    expect(src).toMatch(/apiBaseUrl:\s*`http:\/\/\$\{FREELLMAPI_HOST\}:\$\{FREELLMAPI_PORT\}\/v1`/);
    expect(src).toMatch(/dashboardUrl:\s*`http:\/\/\$\{FREELLMAPI_HOST\}:\$\{FREELLMAPI_PORT\}\/`/);
    expect(src).toMatch(/dashboardPort:\s*FREELLMAPI_PORT/);
    expect(src).toMatch(/port:\s*FREELLMAPI_PORT/);
    expect(src).not.toMatch(/\b31415\b/);
    expect(src).not.toMatch(/\b3001\b/);
    expect(src).not.toMatch(/\b5170\b/);
  });

  it("keeps the Vite /proxy target on the canonical port", () => {
    const src = readText("vite.config.ts") ?? "";
    const gateway = portEntries().freellmapi;
    expect(gateway.port).toBe(31416);
    expect(canonicalPort("freellmapi")).toBe(31416);
    expect(src).toMatch(/apiProxy\(`http:\/\/\$\{FREELLMAPI_HOST\}:\$\{FREELLMAPI_PORT\}`/);
    expect(src).not.toMatch(/\b31415\b/);
    expect(src).not.toMatch(/\b3001\b/);
    expect(src).not.toMatch(/\b5170\b/);
  });

  it("never lets a config writer hardcode a FreeLLMAPI port (§3)", () => {
    const src = readText("server/ai/loadEnv.ts") ?? "";
    // The value must come from the registry, never from a literal in the writer.
    expect(src).toContain("canonicalFreeLlmPort()");
    expect(src).not.toMatch(/FREELLMAPI_BASE_URL=http:\/\/127\.0\.0\.1:\d+/);
  });
});

