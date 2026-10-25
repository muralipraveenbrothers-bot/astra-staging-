#!/usr/bin/env node
/**
 * ASTRA Stable — candidate deployment gate (§21, §34, §36)
 * =======================================================
 * The replacement for "change files -> pm2 restart all -> hope".
 *
 * Sequence:
 *   1. record the current git commit (rollback point)
 *   2. preflight            -> must pass, or nothing starts
 *   3. stack contract tests -> must pass, or the change is not deployable
 *   4. restart ONLY the named service
 *   5. verify its health
 *   6. on failure: report the rollback command (or roll back with --rollback)
 *
 * Nothing here can touch another service. `--service all` is refused by design.
 *
 * Usage:
 *   node scripts/deploy-candidate.mjs --service AstraAPI
 *   node scripts/deploy-candidate.mjs --service Voicebox --rollback
 *   node scripts/deploy-candidate.mjs --service LiteLLM --dry-run
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = new Set(["all", "*", "everything"]);

const argv = process.argv.slice(2);
function arg(name) {
  const flag = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!flag) return undefined;
  return flag.includes("=") ? flag.split("=")[1] : argv[argv.indexOf(flag) + 1];
}
const hasFlag = (name) => argv.includes(`--${name}`);

const service = arg("service");
const healthUrl = arg("health");
const rollback = hasFlag("rollback");
const dryRun = hasFlag("dry-run");
const tries = Number(arg("tries") ?? 6);

function run(cmd, args, opts = {}) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: "utf8", timeout: 180000, ...opts }) };
  } catch (err) {
    return {
      ok: false,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? ""}`.trim(),
    };
  }
}

function step(label) {
  console.log(`\n▶ ${label}`);
}

if (!service) {
  console.error("Usage: node scripts/deploy-candidate.mjs --service <pm2-name> [--rollback] [--dry-run]");
  process.exit(1);
}
if (FORBIDDEN.has(service.trim().toLowerCase())) {
  console.error(
    `Refusing to deploy "${service}". Deployment is scoped to ONE service; the supervisor handles per-service recovery.`,
  );
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "ports.json"), "utf8"));
const entry = Object.values(registry.services).find((s) => s.pm2 === service);
const probeUrl = healthUrl ?? (entry ? `http://${entry.host}:${entry.port}${entry.healthPath ?? "/"}` : null);
if (!probeUrl) {
  console.error(
    `No probe target for "${service}". Pass --health <url> or add it to config/ports.json with a healthPath.`,
  );
  process.exit(1);
}

step("1/5 rollback point");
const head = run("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT });
if (head.ok) {
  console.log(`   current commit: ${head.out.trim()}`);
} else {
  console.log("   ⚠ no git commit exists yet — establish the baseline before real deployments");
  console.log("     (git add -A && git commit -m \"astra stable baseline\" && git tag astra-stable-v1)");
}
const rollbackRef = head.ok ? head.out.trim() : null;

step("2/5 preflight");
const preflight = run(process.execPath, [path.join(ROOT, "scripts", "stack-preflight.mjs"), "--quiet"], {
  cwd: ROOT,
});
if (!preflight.ok) {
  console.error("   ✗ preflight failed — deployment cancelled, the running stack is untouched.");
  console.error(preflight.out);
  process.exit(1);
}
console.log("   ✓ preflight OK");

step("3/5 stack contract tests");
const contract = run("npx", ["vitest", "run", "server/astra/supervisor"], { cwd: ROOT });
if (!contract.ok) {
  console.error("   ✗ contract tests failed — deployment cancelled, the running stack is untouched.");
  console.error(contract.out.split("\n").slice(-12).join("\n"));
  process.exit(1);
}
console.log("   ✓ stack contract satisfied");

step(`4/5 restart only "${service}"`);
if (dryRun) {
  console.log("   --dry-run: stopping before the restart. Nothing was changed.");
  process.exit(0);
}
const restart = run("pm2", ["restart", service], { cwd: ROOT });
if (!restart.ok) {
  console.error(`   ✗ pm2 restart ${service} failed:`);
  console.error(restart.out);
  process.exit(1);
}
console.log(`   ✓ ${service} restarted (no other service was touched)`);

step("5/5 health verification");
let healthy = false;
for (let attempt = 1; attempt <= tries; attempt += 1) {
  try {
    const res = await fetch(probeUrl, { signal: AbortSignal.timeout(4000), redirect: "manual" });
    console.log(`   attempt ${attempt}/${tries}: HTTP ${res.status} from ${probeUrl}`);
    // Any HTTP answer means the service is up and speaking — a 401/404 is not
    // an outage, only silence is.
    healthy = true;
    break;
  } catch (err) {
    console.log(`   attempt ${attempt}/${tries}: unreachable (${err.cause?.code ?? err.name})`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

if (healthy) {
  console.log(`\n✓ ${service} deployed and healthy. Other services were never restarted.`);
  process.exit(0);
}

console.error(`\n✗ ${service} did not answer after ${tries} attempts.`);
if (rollback && rollbackRef) {
  console.error(`Rolling back to ${rollbackRef} and restarting only ${service}...`);
  run("git", ["checkout", rollbackRef], { cwd: ROOT });
  run("pm2", ["restart", service], { cwd: ROOT });
  console.error("Rollback issued. Verify manually with scripts/verify-stack.mjs");
} else {
  console.error("The running stack is otherwise untouched. Manual rollback:");
  if (rollbackRef) console.error(`  git checkout ${rollbackRef}`);
  console.error(`  pm2 restart ${service}`);
  console.error(`  node scripts/verify-stack.mjs --only ${(entry?.id ?? "")}`);
}
process.exit(1);
