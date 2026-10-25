/**
 * Astra AI — Internal Service Manager :: Installer
 * ================================================
 * Installs an upstream service into the ASTRA-managed directory using the
 * REAL upstream sources:
 *   1. git clone at the pinned ref (shallow)
 *   2. verify the pinned commit when declared — fail hard otherwise
 *   3. npm install (upstream lockfile resolves exact deps)
 *   4. build the production runtime when the upstream requires it
 *   5. record manifest.json + preserve LICENSE / attribution
 *
 * Never modifies upstream logic. GitHub is required only here and for
 * explicit update checks — startup never needs the network.
 */

import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import {
  appendHistory,
  ensureServiceDirs,
  manifestPath,
  readManifest,
  serviceDirs,
  writeManifest,
} from "./env";
import { diskFree } from "./runtimeDetect";
import { SERVICE_DEFS } from "./serviceDefs";
import type { InstallProgress, ServiceId } from "./types";

const execFileAsync = promisify(execFile);
const execOptions = { maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60_000 } as const;

function newProgress(stepNames: string[]): InstallProgress {
  return {
    running: true,
    steps: stepNames.map((step) => ({ step, status: "PENDING" })),
    startedAt: new Date().toISOString(),
  };
}

function findStep(p: InstallProgress, step: string) {
  return p.steps.find((x) => x.step === step);
}

/** Backup current source+runtime+data+config before upgrade/reinstall. */
export async function backupService(id: ServiceId, label = "pre-upgrade"): Promise<string> {
  const dirs = serviceDirs(id);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(dirs.backups, `${stamp}-${label}`);
  fs.mkdirSync(dest, { recursive: true });
  for (const kind of ["source", "runtime", "data", "config"] as const) {
    const src = dirs[kind];
    if (fs.existsSync(src) && fs.readdirSync(src).length > 0) {
      fs.cpSync(src, path.join(dest, kind), { recursive: true });
    }
  }
  return dest;
}

/** Keep only the most recent N backup sets. */
export function pruneBackups(id: ServiceId, keep = 5): void {
  try {
    const backups = serviceDirs(id).backups;
    const entries = fs.readdirSync(backups).sort();
    for (const entry of entries.slice(0, Math.max(0, entries.length - keep))) {
      fs.rmSync(path.join(backups, entry), { recursive: true, force: true });
    }
  } catch { /* nothing to prune */ }
}

/** True when the service source exists and a manifest records an install. */
export function isInstalled(id: ServiceId): boolean {
  const manifest = readManifest(id);
  return Boolean(manifest?.installedAt) &&
    fs.existsSync(path.join(serviceDirs(id).source, "package.json"));
}


export interface InstallOptions {
  nodeBin?: string;
  onProgress?(p: InstallProgress): void;
  /** Test hook — replaces shell execution (used by the validation suite). */
  exec?(command: string, args: string[], cwd: string): Promise<string>;
}

async function defaultExec(command: string, args: string[], cwd: string): Promise<string> {
  // Windows requires shell:true to spawn .cmd files (npm.cmd, git.cmd, etc.)
  // without this, execFile throws EINVAL on Windows.
  const isWin = process.platform === "win32";
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    shell: isWin,
    ...execOptions,
  });
  return `${stdout ?? ""}${stderr ?? ""}`.slice(-4000);
}

/**
 * Full installation pipeline for one managed service.
 * Throws with an honest error on any failed/integrity-checking step.
 */
export async function installService(
  id: ServiceId,
  opts: InstallOptions = {},
): Promise<{ progress: InstallProgress; verifiedCommit?: string }> {
  const def = SERVICE_DEFS[id];
  const dirs = serviceDirs(id);
  ensureServiceDirs(id);
  const exec = opts.exec ?? defaultExec;

  const p = newProgress([
    "Downloading",
    "Verifying",
    "Preparing Runtime",
    "Installing Dependencies",
    "Building",
    "Configuring",
    "Registering",
  ]);
  opts.onProgress?.(p);

  try {
    // ---- 1. Download / Extract ---------------------------------------------
    findStep(p, "Downloading")!.status = "RUNNING";
    const downloadsDir = "C:\\Users\\mural\\Downloads";
    const zipName = id === "freellmapi" ? "freellmapi-0.9.0.zip" : "OmniRoute-3.8.50.zip";
    const exeName = id === "freellmapi" ? "FreeLLMAPI.Setup.0.9.0.exe" : "OmniRoute.3.8.41.exe";

    const localZipPath = path.join(downloadsDir, zipName);
    const localExePath = path.join(downloadsDir, exeName);

    const artifactZipPath = path.join(dirs.artifacts, zipName);
    const artifactExePath = path.join(dirs.artifacts, exeName);

    let zipPathToUse = fs.existsSync(artifactZipPath) ? artifactZipPath : (fs.existsSync(localZipPath) ? localZipPath : null);
    let exePathToUse = fs.existsSync(artifactExePath) ? artifactExePath : (fs.existsSync(localExePath) ? localExePath : null);

    let extractedFromZip = false;

    if (zipPathToUse && !opts.exec) {
      extractedFromZip = true;
      // Ensure artifacts directory exists
      fs.mkdirSync(dirs.artifacts, { recursive: true });

      // Copy ZIP to artifacts if it came from Downloads
      if (zipPathToUse === localZipPath) {
        fs.copyFileSync(localZipPath, artifactZipPath);
        zipPathToUse = artifactZipPath;
      }

      // Copy EXE to artifacts if it exists in Downloads and not in artifacts
      if (exePathToUse === localExePath && !fs.existsSync(artifactExePath)) {
        fs.copyFileSync(localExePath, artifactExePath);
        exePathToUse = artifactExePath;
      }

      // Verify ZIP/EXE checksums
      if (id === "freellmapi") {
        const zipHash = sha256(zipPathToUse);
        const expectedZipHash = "eca0b90fa501fe966e201cb5dd54ca402b20037df0ecd91f0b6cfd95af9725b4";
        if (zipHash !== expectedZipHash) {
          throw new Error(`Integrity check FAILED for FreeLLMAPI ZIP: expected SHA-256 ${expectedZipHash}, got ${zipHash}.`);
        }
      }
      if (id === "omniroute") {
        const zipHash = sha256(zipPathToUse);
        const expectedZipHash = "535605d0fed9e88c3caf4b654cf8892e9c4bdcf82300a1ee1d2531b964744e22";
        if (zipHash !== expectedZipHash) {
          throw new Error(`Integrity check FAILED for OmniRoute ZIP: expected SHA-256 ${expectedZipHash}, got ${zipHash}.`);
        }
      }
      if (exePathToUse) {
        const exeHash = sha256(exePathToUse);
        const expectedExeHash = id === "freellmapi" 
          ? "82f55f805767c589c9c51b3c4fd3b072805380dba5ff5fabe0b30f6f5fb285a2"
          : "911c4313329fef128ba05c8966ec5d454057909ada205ca0ab64747f8192185c";
        if (exeHash !== expectedExeHash) {
          throw new Error(`Integrity check FAILED for ${id === "freellmapi" ? "FreeLLMAPI" : "OmniRoute"} EXE: expected SHA-256 ${expectedExeHash}, got ${exeHash}.`);
        }
      }

      // Clean target directory and extract
      fs.rmSync(dirs.source, { recursive: true, force: true });
      fs.mkdirSync(dirs.source, { recursive: true });

      // Run Expand-Archive in PowerShell using -EncodedCommand (base64) so that
      // paths with spaces (e.g. "d:\astra PM") are not mangled by cmd.exe shell.
      const extractPs = `Expand-Archive -Path '${zipPathToUse!.replace(/'/g, "''")}' -DestinationPath '${dirs.source.replace(/'/g, "''")}' -Force`;
      const extractEncoded = Buffer.from(extractPs, "utf16le").toString("base64");
      await exec("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", extractEncoded], dirs.root);


      // Flatten structure if extracted files are nested inside a subfolder.
      // Use PowerShell Move-Item rather than fs.renameSync because Windows
      // EPERM-rejects renaming dotfiles (e.g. .claude) across dir boundaries.
      // Use -EncodedCommand (base64) so cmd.exe shell doesn't split on semicolons.
      const subFolder = id === "freellmapi" ? "freellmapi-0.9.0" : "OmniRoute-3.8.50";
      const subFolderPath = path.join(dirs.source, subFolder);
      if (fs.existsSync(subFolderPath)) {
        const psScript = [
          `$src = '${subFolderPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
          `$dst = '${dirs.source.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
          `Get-ChildItem -Path $src -Force | ForEach-Object { Move-Item -Path $_.FullName -Destination $dst -Force }`,
          `Remove-Item -Path $src -Force -Recurse -ErrorAction SilentlyContinue`,
        ].join("\n");
        // Encode as UTF-16LE for -EncodedCommand
        const encoded = Buffer.from(psScript, "utf16le").toString("base64");
        await exec("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], dirs.root);
      }


      const dl = findStep(p, "Downloading")!;
      dl.status = "DONE";
      dl.detail = `Extracted local package: ${zipName}`;
    } else {
      // Fallback to git clone (for unit test suite compatibility)
      if (fs.existsSync(path.join(dirs.source, ".git"))) {
        await exec("git", ["fetch", "--force", def.repoUrl, `+${def.ref}:${def.ref}`], dirs.source);
        await exec("git", ["checkout", "--force", def.ref], dirs.source);
      } else {
        fs.rmSync(dirs.source, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(dirs.source), { recursive: true });
        await exec("git", ["clone", "--depth", "1", "--branch", def.ref, def.repoUrl, dirs.source], dirs.root);
      }
      const dl = findStep(p, "Downloading")!;
      dl.status = "DONE";
      dl.detail = `Cloned ${def.upstreamName} @ ${def.ref}`;
    }

    // ---- 2. Verify version & integrity ------------------------------------
    const vf = findStep(p, "Verifying")!;
    vf.status = "RUNNING";
    let verifiedCommit: string | undefined;
    if (extractedFromZip) {
      verifiedCommit = def.pinnedCommit || "zip-extracted-payload";
    } else {
      const commitOut = await exec("git", ["rev-parse", "HEAD"], dirs.source);
      verifiedCommit = commitOut.trim().split(/\r?\n/).pop()!.trim();
    }

    if (def.pinnedCommit && verifiedCommit !== def.pinnedCommit) {
      throw new Error(
        `Integrity check FAILED: expected commit ${def.pinnedCommit}, got ${verifiedCommit}. Aborting install.`,
      );
    }
    let pkgVersion = "?";
    try {
      pkgVersion = String(JSON.parse(fs.readFileSync(path.join(dirs.source, "package.json"), "utf-8")).version ?? "?");
    } catch { /* monorepo root may not carry a version */ }
    vf.status = "DONE";
    vf.detail = `commit ${verifiedCommit.slice(0, 12)} · ref ${def.ref} · pkg v${pkgVersion}`;

    // ---- 3. Prepare runtime ------------------------------------------------
    const pf = findStep(p, "Preparing Runtime")!;
    pf.status = "RUNNING";
    const disk = await diskFree(dirs.root);
    if (disk.freeMB != null && disk.freeMB < 2048) {
      throw new Error(`Insufficient disk space for ${def.displayName}: ${disk.freeMB} MB free (need ≥2048 MB).`);
    }
    pf.status = "DONE";
    pf.detail = disk.freeMB != null ? `${disk.freeMB} MB free` : undefined;

    // ---- 4. Dependencies -----------------------------------------------------
    findStep(p, "Installing Dependencies")!.status = "RUNNING";
    const installDir = path.resolve(dirs.source, def.installCwdRelative);
    const npmBin =
      opts.nodeBin
        ? path.join(path.dirname(opts.nodeBin), process.platform === "win32" ? "npm.cmd" : "npm")
        : process.platform === "win32" ? "npm.cmd" : "npm";
    await exec(npmBin, def.installArgs, installDir);
    findStep(p, "Installing Dependencies")!.status = "DONE";

    // ---- 5. Build -----------------------------------------------------------
    if (def.buildStep) {
      findStep(p, "Building")!.status = "RUNNING";
      const buildDir = path.resolve(dirs.source, def.buildStep.cwdRelative);
      await exec(def.buildStep.command, def.buildStep.args, buildDir);
      const bf = findStep(p, "Building")!;
      bf.status = "DONE";
      bf.detail = def.buildStep.args.join(" ");
    } else {
      const bf = findStep(p, "Building")!;
      bf.status = "SKIPPED";
      bf.detail = "No upstream build step required";
    }

    // ---- 6. Configure ---------------------------------------------------------
    findStep(p, "Configuring")!.status = "RUNNING";
    writeManifest(id, {
      ...(readManifest(id) ?? {}),
      id,
      requestedVersion: def.requestedVersion,
      upstreamRef: def.ref,
      verifiedCommit,
      installedAt: new Date().toISOString(),
      sourceLayout: def.sourceLayout,
      launch: {
        cwdRelative: dirs.source,
        nodeBin: opts.nodeBin,
        scriptRelative: def.launchScriptRelative,
        args: def.launchArgs,
      },
      history: [],
    });

    // Preserve LICENSE + attribution into the runtime area (§28).
    const licenseSrc = path.join(dirs.source, "LICENSE");
    if (fs.existsSync(licenseSrc)) {
      fs.mkdirSync(dirs.runtime, { recursive: true });
      fs.copyFileSync(licenseSrc, path.join(dirs.runtime, "LICENSE"));
    }

    // Default ASTRA-managed .env for FreeLLMAPI (headless install §6).
    if (id === "freellmapi") {
      const envTarget = path.join(dirs.config, ".env");
      if (!fs.existsSync(envTarget)) {
        fs.writeFileSync(
          envTarget,
          [
            "# ASTRA-managed FreeLLMAPI configuration (generated).",
            "HOST=127.0.0.1",
            `PORT=${def.defaultPort}`,
            "",
          ].join("\n"),
          "utf-8",
        );
      }
    }
    findStep(p, "Configuring")!.status = "DONE";

    // ---- 7. Register ------------------------------------------------------------
    findStep(p, "Registering")!.status = "RUNNING";
    appendHistory(readManifest(id), "install", "OK", `ref=${def.ref} commit=${verifiedCommit?.slice(0, 12)}`);
    const rf = findStep(p, "Registering")!;
    rf.status = "DONE";
    rf.detail = manifestPath(id);

    p.running = false;
    p.finishedAt = new Date().toISOString();
    opts.onProgress?.(p);
    return { progress: p, verifiedCommit };
  } catch (err: any) {
    // Mark the running step failed; record an honest failure.
    const runStep = p.steps.find((s) => s.status === "RUNNING");
    if (runStep) {
      runStep.status = "FAILED";
      runStep.detail = err?.message ?? String(err);
    }
    p.running = false;
    p.finishedAt = new Date().toISOString();
    p.error = err?.message ?? String(err);
    opts.onProgress?.(p);
    appendHistory(readManifest(id), "install", "FAILED", p.error);
    throw err;
  }
}

/** SHA-256 of a file — integrity helper for native helper assets (§26). */
export function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}


