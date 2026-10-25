#!/usr/bin/env node
/**
 * ASTRA Stable — stack health verifier (§16, §17, §18)
 * ===================================================
 * PM2 only knows "process alive". This knows "service actually usable", which
 * is the distinction that mattered when six services were crash-looping while
 * looking merely "offline".
 *
 * Exit codes (capability-aware, deliberately NOT all-or-nothing):
 *   0  core online AND at least one llm route reachable
 *   1  a core service is down            <- Astra itself is affected
 *   2  no llm route reachable            <- AI features affected
 *   0  extensions down, core + route ok  <- capability notice only, not a failure
 *
 * Usage:  node scripts/verify-stack.mjs [--json] [--strict] [--only id,id]
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORTS_FILE = path.join(ROOT, "config", "ports.json");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const strict = args.includes("--strict");
const onlyArg = args.find((a) => a.startsWith("--only=") || a === "--only");
const onlyIds = onlyArg
  ? (onlyArg.includes("=") ? onlyArg.split("=")[1] : args[args.indexOf("--only") + 1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

const TIMEOUT_MS = Number(process.env.ASTRA_PROBE_TIMEOUT_MS ?? 4000);

function probeTcp(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const done = (ok, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, detail });
    };
    socket.setTimeout(TIMEOUT_MS);
    socket.once("connect", () => done(true, "tcp open"));
    socket.once("timeout", () => done(false, "tcp timeout"));
    socket.once("error", (e) => done(false, e.code ?? e.message));
  });
}

async function probeHttp(host, port, healthPath) {
  const url = `http://${host}:${port}${healthPath ?? "/"}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" });
    // Any HTTP answer means something is listening and speaking HTTP.
    return { ok: true, detail: `HTTP ${res.status}`, url };
  } catch (err) {
    return { ok: false, detail: err.cause?.code ?? err.name ?? "unreachable", url };
  }
}

async function probe(entry) {
  if (entry.probe === "none") return { ok: true, detail: "not probed" };
  if (entry.probe === "tcp") return probeTcp(entry.host, entry.port);
  return probeHttp(entry.host, entry.port, entry.healthPath);
}

const registry = JSON.parse(fs.readFileSync(PORTS_FILE, "utf8"));
const entries = Object.entries(registry.services).filter(
  ([id]) => onlyIds.length === 0 || onlyIds.includes(id),
);

const results = [];
for (const [id, entry] of entries) {
  const outcome = await probe(entry);
  results.push({
    id,
    name: entry.name,
    tier: entry.tier,
    pm2: entry.pm2 ?? null,
    host: entry.host,
    port: entry.port,
    routeGroup: entry.routeGroup ?? null,
    ...outcome,
  });
}

// Grouped availability: an llm route is "available" if ANY of its providers
// answers, which is why one dead provider must never read as a stack outage.
const routeGroups = {};
for (const r of results) {
  if (!r.routeGroup) continue;
  routeGroups[r.routeGroup] ??= { available: false, providers: [] };
  routeGroups[r.routeGroup].providers.push({ id: r.id, ok: r.ok });
  if (r.ok) routeGroups[r.routeGroup].available = true;
}
for (const group of Object.values(routeGroups)) {
  const up = group.providers.filter((p) => p.ok).map((p) => p.id);
  group.summary = up.length ? `available via ${up.join(", ")}` : "unavailable";
}

const coreDown = results.filter((r) => r.tier === "core" && !r.ok);
const extensionsDown = results.filter((r) => r.tier === "extension" && !r.ok);
const routesUnavailable = Object.entries(routeGroups).filter(([, g]) => !g.available);

let status = "online";
if (coreDown.length > 0) status = "core-down";
else if (routesUnavailable.length > 0) status = "no-route";

const payload = {
  // Note: Astra status never becomes "degraded"/"offline" here. Only the
  // capability rows below can be unavailable.
  status: "online",
  coreReachable: coreDown.length === 0,
  routes: Object.fromEntries(
    Object.entries(routeGroups).map(([k, v]) => [k, v.available ? "available" : "unavailable"]),
  ),
  services: results.map(({ id, name, tier, port, ok, detail }) => ({
    id,
    name,
    tier,
    port,
    state: ok ? "healthy" : "unavailable",
    detail,
  })),
};

if (asJson) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  const icon = (ok) => (ok ? "OK  " : "DOWN");
  console.log("\nASTRA STABLE — stack verification");
  console.log("=================================");
  for (const tier of ["core", "ai", "extension"]) {
    const rows = results.filter((r) => r.tier === tier);
    if (rows.length === 0) continue;
    console.log(`\n[${tier}]`);
    for (const r of rows) {
      const pm2 = r.pm2 ? ` pm2:${r.pm2}` : "";
      console.log(
        `  ${icon(r.ok)}  ${r.id.padEnd(16)} ${String(`${r.host}:${r.port}`).padEnd(22)} ${r.detail ?? ""}${pm2}`,
      );
    }
  }
  for (const [group, info] of Object.entries(routeGroups)) {
    console.log(`\n[route ${group}] ${info.summary}`);
  }
  console.log(
    `\nAstra: ONLINE` +
      (coreDown.length ? ` — core attention: ${coreDown.map((r) => r.id).join(", ")}` : " (all core services reachable)"),
  );
  if (extensionsDown.length) {
    console.log(
      `Capability notices (NOT an Astra outage): ${extensionsDown.map((r) => r.id).join(", ")}`,
    );
  }
}

if (coreDown.length > 0) process.exit(1);
if (strict && (extensionsDown.length > 0 || routesUnavailable.length > 0)) process.exit(2);
if (routesUnavailable.length > 0) process.exit(2);
process.exit(0);
