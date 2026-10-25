/**
 * Astra AI — Real Installation Integration Test
 * Run: npx tsx scripts/test-real-install.ts [freellmapi|omniroute|both]
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Dynamic imports to avoid ESM issues with tsx
const { installService, isInstalled } = await import("../server/services/installer.js");
const { serviceDirs, readManifest } = await import("../server/services/env.js");

const __dirnameHere = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirnameHere, "..");

const G = "\x1b[32m", R = "\x1b[31m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m";
const pass = (m: string) => console.log(`${G}  ✓${X} ${m}`);
const fail = (m: string) => { console.log(`${R}  ✗${X} ${m}`); process.exitCode = 1; };
const info = (m: string) => console.log(`${C}  ℹ${X} ${m}`);
const hdr  = (m: string) => console.log(`\n${B}${m}${X}`);

function preFlightCheck(id: string): boolean {
  const zipName = id === "freellmapi" ? "freellmapi-0.9.0.zip" : "OmniRoute-3.8.50.zip";
  const dirs = serviceDirs(id);
  const localZip = `C:\\Users\\mural\\Downloads\\${zipName}`;
  const artifactZip = path.join(dirs.artifacts, zipName);
  if (fs.existsSync(artifactZip)) { info(`ZIP in artifacts: ${artifactZip}`); return true; }
  if (fs.existsSync(localZip))    { info(`ZIP in Downloads: ${localZip}`);    return true; }
  fail(`ZIP not found for ${id}. Checked:\n    ${artifactZip}\n    ${localZip}`);
  return false;
}

async function runInstall(id: string) {
  hdr(`━━━ Installing ${id.toUpperCase()} ━━━`);
  if (!preFlightCheck(id)) return;
  const dirs = serviceDirs(id);
  let events = 0;
  let lastProg: any = null;
  try {
    await installService(id as any, {
      onProgress(p: any) {
        events++;
        lastProg = p;
        const cur = p.steps?.find((s: any) => s.status === "RUNNING");
        if (cur) info(`[${cur.step}]...`);
      },
    });

    const manifest = readManifest(id);
    if (manifest?.installedAt) pass(`manifest.installedAt = ${manifest.installedAt}`);
    else fail("manifest.installedAt not set");

    if (manifest?.verifiedCommit)
      pass(`verifiedCommit = ${String(manifest.verifiedCommit).slice(0, 16)}...`);

    const pkgPath = path.join(dirs.source, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      pass(`package.json: ${pkg.name ?? "?"} v${pkg.version ?? "?"}`);
    } else {
      fail(`package.json MISSING at ${pkgPath}`);
    }

    if (id === "freellmapi") {
      if (fs.existsSync(path.join(dirs.source, "server", "dist", "index.js")))
        pass("Build: server/dist/index.js present");
      else
        fail("Build: server/dist/index.js MISSING (tsc may have failed)");
      if (fs.existsSync(path.join(dirs.config, ".env")))
        pass("Config .env generated");
      else
        fail("Config .env MISSING");
    } else {
      if (fs.existsSync(path.join(dirs.source, "bin", "omniroute.mjs")))
        pass("Launch: bin/omniroute.mjs present");
      else
        fail("Launch: bin/omniroute.mjs MISSING");
    }

    if (events >= 1) pass(`Progress events: ${events}`);
    else             fail(`Too few progress events: ${events}`);

    pass(`${id} installation COMPLETE`);
  } catch (err: any) {
    fail(`installService(${id}) THREW: ${err?.message ?? err}`);
    const bad = lastProg?.steps?.find((s: any) => s.status === "FAILED");
    if (bad) info(`Failed step: [${bad.step}] → ${bad.detail ?? "(no detail)"}`);
  }
}

async function verifyPostInstall(id: string) {
  hdr(`━━━ Post-Install Verification: ${id.toUpperCase()} ━━━`);
  const dirs = serviceDirs(id);
  const manifest = readManifest(id);

  for (const d of ["app","runtime","data","config","logs","backups","artifacts"]) {
    if (fs.existsSync(path.join(dirs.root, d)))
      pass(`Dir: modules/${id}/${d}/`);
    else
      fail(`Dir MISSING: modules/${id}/${d}/`);
  }

  if (isInstalled(id as any)) pass(`isInstalled(${id}) = true`);
  else                        fail(`isInstalled(${id}) = false`);

  for (const f of ["id","installedAt","verifiedCommit","launch","network","runtime"]) {
    if (manifest?.[f]) pass(`manifest.${f}`);
    else               fail(`manifest.${f} MISSING`);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────
const target = process.argv[2] ?? "both";
const ids = target === "freellmapi" ? ["freellmapi"]
  : target === "omniroute"          ? ["omniroute"]
  : ["freellmapi", "omniroute"];

console.log(`\n${B}Astra AI — Real Install Integration Test${X}`);
console.log(`Targets: ${ids.join(", ")}`);
console.log(`Repo: ${REPO_ROOT}\n`);

for (const id of ids) {
  await runInstall(id);
  await verifyPostInstall(id);
}

const ec = process.exitCode ?? 0;
console.log(`\n${ec === 0 ? G + "ALL CHECKS PASSED" : R + "SOME CHECKS FAILED"}${X}\n`);
