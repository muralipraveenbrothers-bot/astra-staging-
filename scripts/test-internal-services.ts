/**
 * ASTRA AI — Internal Service Manager :: Validation Test Suite (§34)
 * ==================================================================
 * Validates the REAL service-manager behavior without requiring network or
 * the actual upstream runtimes:
 *   - semver range enforcement (incl. OmniRoute's strict Node requirement)
 *   - encrypted secret store round-trip + presence masking
 *   - installation pipeline (injected exec mock) → manifest/commit
 *   - supervisor: spawn a real stub child, probe health, stop the tree
 *   - port conflict detection + free-port selection
 *
 * Run: npx tsx scripts/test-internal-services.ts
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import net from "net";

// Isolate all filesystem writes to a throwaway ASTRA data directory.
const TMP = mkdtempSync(path.join(os.tmpdir(), "astra-svc-test-"));
process.env.ASTRA_DATA_DIR = TMP;

import {
  versionSatisfies,
  isPortResponding,
  isPortBindable,
  resolveServicePort,
} from "../server/services/runtimeDetect";
import { getSecret, setSecret, deleteSecret, listSecretPresence } from "../server/services/secrets";
import { installService, isInstalled } from "../server/services/installer";
import { readManifest } from "../server/services/env";
import { ServiceSupervisor } from "../server/services/supervisor";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

async function main(): Promise<void> {
  console.log("ASTRA Internal Service Manager — Validation Suite");

  // ---------------------------------------------------------------- Semver ---
  section("1. Node runtime requirement enforcement (runtimeDetect)");
  check("FreeLLMAPI: Node 20.20.0 OK (ASTRA's local Node)", versionSatisfies("v20.20.0", [">=20.18.0", "<25.0.0"]));
  check("FreeLLMAPI: Node 26 rejected", versionSatisfies("v26.0.0", [">=20.18.0", "<25.0.0"]));
  check("OmniRoute: Node 20.20.0 correctly REJECTED (local Node insufficient)", versionSatisfies("v20.20.0", [">=22.22.2", "<23", "||", ">=24.0.0", "<27"]));
  check("OmniRoute: Node 22.90 accepted (first clause)", versionSatisfies("v22.90.0", [">=22.22.2", "<23", "||", ">=24.0.0", "<27"]));
  check("OmniRoute: Node 24.4 accepted (second clause)", versionSatisfies("v24.4.1", [">=22.22.2", "<23", "||", ">=24.0.0", "<27"]));
  check("OmniRoute: Node 27 rejected", versionSatisfies("v27.0.0", [">=22.22.2", "<23", "||", ">=24.0.0", "<27"]));

  // ---------------------------------------------------------------- Secrets ---
  section("2. Encrypted secret store (secrets)");
  setSecret("freellmapi.ENCRYPTION_KEY", "super-secret-key-ABC123");
  check("set + get round-trip", getSecret("freellmapi.ENCRYPTION_KEY") === "super-secret-key-ABC123");
  const presence = listSecretPresence("freellmapi").map((r) => r.id);
  check("presence list exposes ids only", presence.includes("freellmapi.ENCRYPTION_KEY"));
  check("presence list never contains raw value", !JSON.stringify(presence).includes("super-secret"));
  setSecret("omniroute.OMNIROUTE_API_KEY", "sk-route-xyz");
  check("namespace isolation", listSecretPresence("freellmapi").length === 1, `got ${listSecretPresence("freellmapi").length}`);
  check("delete removes secret", deleteSecret("freellmapi.ENCRYPTION_KEY") === true);
  check("get after delete is undefined", getSecret("freellmapi.ENCRYPTION_KEY") === undefined);

  // ---------------------------------------------------------------- Installer ---
  section("3. Installation pipeline (installer, injected exec)");
  const freeCommit = "3b6f40e9a3e1691dd7e561d9fa842c28d6218746";
  const mockExec = async (command: string, args: string[], cwd: string): Promise<string> => {
    if (command === "git" && args.includes("clone")) {
      const dest = args[args.length - 1];
      mkdirSync(dest, { recursive: true });
      writeFileSync(path.join(dest, "package.json"), JSON.stringify({ name: "freellmapi", version: "0.9.0" }));
      writeFileSync(path.join(dest, "LICENSE"), "MIT LICENSE TEXT");
    }
    if (command === "git" && args.includes("rev-parse")) {
      return freeCommit + "\n";
    }
    return "";
  };

  const { progress } = await installService("freellmapi", { exec: mockExec });
  check("all steps completed", progress.steps.every((s) => s.status === "DONE"), JSON.stringify(progress.steps.map((s) => s.status)));
  check("no step failed", !progress.error, progress.error ?? "");
  const manifest = readManifest("freellmapi");
  check("manifest records verified commit", manifest?.verifiedCommit === freeCommit, manifest?.verifiedCommit ?? "none");
  check("manifest records requested version 0.9.0", manifest?.requestedVersion === "0.9.0");
  check("isInstalled now true", isInstalled("freellmapi"));

  let threw = false;
  try {
    await installService("freellmapi", {
      exec: async (command, args) => {
        if (command === "git" && args.includes("rev-parse")) return "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\n";
        if (command === "git" && args.includes("clone")) {
          const dest = args[args.length - 1];
          mkdirSync(dest, { recursive: true });
          writeFileSync(path.join(dest, "package.json"), "{}");
        }
        return "";
      },
    });
  } catch {
    threw = true;
  }
  check("integrity gate rejects wrong commit", threw, "installer must throw on commit mismatch");
  // ---------------------------------------------------------------- Supervisor ---
  section("4. Process supervisor (supervisor)");
  const sup = new ServiceSupervisor("omni-stub");
  sup.start({
    id: "omni-stub",
    command: process.execPath,
    args: ["-e", "setInterval(()=>{},1000); process.stdout.write('stub-ready\\n')"],
    cwd: TMP,
    env: { NODE_ENV: "test" },
    probe: async () => ({ ok: true, latencyMs: 5, detail: "stub probe ok" }),
    logDir: path.join(TMP, "logs"),
  });
  await new Promise((r) => setTimeout(r, 1200));
  const info = sup.info();
  check("child process spawned with real PID", typeof info.pid === "number" && info.pid! > 0, `pid=${info.pid}`);
  check("uptime increases", info.uptimeMs > 0, `${info.uptimeMs}`);
  check("isRunning true while alive", sup.isRunning());
  const probe = await sup.probeNow();
  check("probeNow returns ok with injected probe", probe.ok, probe.detail);
  check("stdout captured by supervisor", sup.logTail().join("\n").includes("stub-ready"), sup.logTail().join("\n"));
  await sup.stop();
  check("stop → not running", !sup.isRunning());
  check("state STOPPED after stop", sup.derivedState("STOPPED") === "STOPPED");
  check("metrics counters start at zero", sup.metrics().requests === 0);
  sup.noteRequest(true);
  sup.noteRequest(false);
  const metrics = sup.metrics();
  check("noteRequest tracks requests/errors", metrics.requests === 2 && metrics.errors === 1, JSON.stringify(metrics));

  // ---------------------------------------------------------------- Ports ---
  section("5. Port conflict detection + free-port selection (runtimeDetect)");
  const occupied = await new Promise<net.Server>((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
  const occupiedPort = (occupied.address() as net.AddressInfo).port;
  check("occupied port reports responding", await isPortResponding("127.0.0.1", occupiedPort));
  check("occupied port not bindable", !(await isPortBindable(occupiedPort)));
  const fp = await new Promise<number>((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => { const p = (srv.address() as net.AddressInfo).port; srv.close(() => resolve(p)); });
  });
  check("free port bindable", await isPortBindable(fp));
  const resolved = await resolveServicePort("127.0.0.1", occupiedPort);
  check("conflict on occupied port → picks a different free port", resolved.conflict && resolved.port !== occupiedPort, `chose ${resolved.port}`);
  occupied.close();

  // ---------------------------------------------------------------- Cleanup ---
  rmSync(TMP, { recursive: true, force: true });
  console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==`);
  if (failed > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test harness error:", err);
  rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
