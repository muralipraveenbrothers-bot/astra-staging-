/**
 * Astra AI — Internal Service Manager :: Facade
 * =============================================
 * Single owner of managed-service lifecycle: install / start / stop /
 * restart / health / logs / diagnostics / model discovery / external-install
 * detection & import / decommission reporting.
 *
 * States derive only from real observations; endpoints shown to users are
 * the endpoints actually probed — never fabricated.
 */

import fs from "fs";
import http from "http";
import path from "path";
import { EventEmitter } from "events";
import { ALL_SERVICE_IDS, SERVICE_DEFS, buildEnv, makeProbe } from "./serviceDefs";
import { ServiceSupervisor } from "./supervisor";
import { ensureServiceDirs, readManifest, serviceDirs, writeManifest } from "./env";
import { backupService, installService, isInstalled } from "./installer";
import {
  diskFree,
  isPortResponding,
  selectCompatibleRuntime,
} from "./runtimeDetect";
import { pruneBackups } from "./installer";
import type { InstallProgress, ProbeResult, ServiceId, ServiceState, ServiceSnapshot, UnifiedModelEntry } from "./types";

function expandWindowsPath(p: string): string {
  return p.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`);
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<any> {
  const body = await new Promise<string>((resolve, reject) => {
    const req = http.request(url, { method: "GET", timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; if (data.length > 2_000_000) res.destroy(); });
      res.on("end", () => resolve(data));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
  if (!body.trim()) return null;
  try { return JSON.parse(body); } catch { throw new Error("Response was not JSON"); }
}

export class InternalServiceManager extends EventEmitter {
  private supervisors = new Map<ServiceId, ServiceSupervisor>();
  private registry = new Map<ServiceId, { host: string; port?: number; endpoint?: string }>();
  progress = new Map<ServiceId, InstallProgress>();

  constructor() {
    super();
    for (const id of ALL_SERVICE_IDS) {
      ensureServiceDirs(id);
      const def = SERVICE_DEFS[id];
      const cfg = readManifest(id)?.config ?? {};
      this.registry.set(id, {
        host: cfg.host ?? def.defaultHost,
        // Canonical ports only. A persisted remap is what made Plugin Center /
        // Vite /proxy fetch fail after upgrades.
        port: def.defaultPort,
      });
      this.supervisors.set(id, new ServiceSupervisor(id));
    }
  }

  supervisor(id: ServiceId): ServiceSupervisor {
    return this.supervisors.get(id)!;
  }

  /** Detection-only runtime lookup (no side effects) for snapshots. */
  private async pickRuntimeInfo(id: ServiceId) {
    const manifest = readManifest(id) ?? {};
    const override = manifest?.config?.nodeBinOverride || process.env.ASTRA_SERVICES_NODE_OVERRIDE;
    return selectCompatibleRuntime(SERVICE_DEFS[id].nodeRequirementClauses, override);
  }

  processFacts(id: ServiceId) {
    const sup = this.supervisor(id);
    if (!sup.isRunning() && sup.info().exitCode === undefined && sup.info().uptimeMs === 0) return undefined;
    return sup.info();
  }

  endpointOf(id: ServiceId): string | undefined {
    const r = this.registry.get(id)!;
    return r.endpoint ?? (r.port != null ? `http://${r.host}:${r.port}` : undefined);
  }

  noteRequest(id: ServiceId, ok: boolean): void {
    this.supervisor(id).noteRequest(ok);
  }

  // ----------------------------------------------------------- Snapshots ---

  async snapshot(id: ServiceId): Promise<ServiceSnapshot> {
    const def = SERVICE_DEFS[id];
    const sup = this.supervisor(id);
    const manifest = readManifest(id);
    const reg = this.registry.get(id)!;
    const installed = isInstalled(id);

    let state = sup.derivedState(installed ? "STOPPED" : "NOT_INSTALLED") as ServiceState;
    // When ASTRA's own child is not running, observe honestly whether
    // anything answers on the port (external or previously spawned instance).
    const endpointLive =
      !sup.isRunning() && reg.port != null && (await isPortResponding(reg.host, reg.port));
    let externalProbe: ProbeResult | undefined;
    if (!sup.isRunning() && endpointLive && state !== "NOT_INSTALLED") {
      externalProbe = await makeProbe(id, reg.host, reg.port!)()
        .then((p) => p)
        .catch(() => ({ ok: false } as ProbeResult));
      state = externalProbe.ok ? "HEALTHY" : "DEGRADED";
    }
    const externalHealthy = Boolean(externalProbe?.ok);

    const runtimeSel = await this.pickRuntimeInfo(id);
    const disk = await diskFree(serviceDirs(id).root);
    const procInfo = sup.info();

    return {
      id,
      displayName: def.displayName,
      managed: true,
      upstreamName: def.upstreamName,
      upstreamRepo: def.repoUrl,
      upstreamRef: def.ref,
      upstreamLicense: def.license,
      requestedVersion: def.requestedVersion,
      installedVersion: manifest?.requestedVersion,
      verifiedCommit: manifest?.verifiedCommit,
      state,
      endpoint: this.endpointOf(id),
      host: reg.host,
      port: reg.port,
      process: externalHealthy ? undefined : (sup.isRunning() || procInfo.exitCode !== undefined ? procInfo : undefined),
      restartCount: externalHealthy ? 0 : procInfo.restartCount,
      crashLoopDetected: externalHealthy ? false : procInfo.crashLoopDetected,
      health: externalHealthy
        ? { lastProbeAt: new Date().toISOString(), latencyMs: externalProbe?.latencyMs, consecutiveFailures: 0, detail: "Healthy external process detected" }
        : sup.snapshotHealth(),
      metrics: sup.metrics(),
      runtime: {
        nodeRequired: def.nodeRequirementClauses.join(" || "),
        nodeCompatible: Boolean(runtimeSel.runtime?.version) || endpointLive,
        nodeBinUsed: runtimeSel.runtime?.nodeBin ?? manifest?.launch?.nodeBin,
        nodeVersionUsed: runtimeSel.runtime?.version,
        diskFreeMB: disk.freeMB,
      },
      installProgress: this.progress.get(id),
      lastError: externalHealthy ? undefined : sup.lastErrorText(),
      disabledReason: externalHealthy ? undefined : sup.disabledReasonText(),
      logTailSizeBytes: sup.tailSizeBytes(),
    };
  }

  allSnapshots(): Promise<ServiceSnapshot[]> {
    return Promise.all(ALL_SERVICE_IDS.map((id) => this.snapshot(id)));
  }

  // ------------------------------------------------------------ Lifecycle ---

  /** Start a managed service as an ASTRA child process (§7, §19). */
  async start(id: ServiceId, opts: { timeoutMs?: number } = {}): Promise<ServiceSnapshot> {
    const def = SERVICE_DEFS[id];
    const sup = this.supervisor(id);
    if (sup.isRunning()) return this.snapshot(id);
    if (!isInstalled(id)) {
      throw new Error(`${def.displayName} is not installed. Run Install first.`);
    }
    if (sup.statePhase === "DISABLED") sup.reEnable(); // explicit admin start overrides

    const nodeBin = await this.pickRuntime(id);
    const reg = this.registry.get(id)!;
    const dirs = serviceDirs(id);

    // Pin the canonical port from config/ports.json. Never scan for
    // a free alternative — Vite /proxy/* and the Plugin Center hard-wire these.
    const host = def.defaultHost;
    const port = def.defaultPort;
    reg.host = host;
    reg.port = port;
    reg.endpoint = `http://${host}:${port}`;
    this.persistConfig(id);

    if (await isPortResponding(host, port)) {
      const probe = await makeProbe(id, host, port)();
      if (probe.ok) {
        this.emit("state", id, "HEALTHY");
        return this.snapshot(id);
      }
      throw new Error(
        `${def.displayName} canonical port ${port} is occupied by a process that failed health (${probe.detail}). Free that port — Astra will not silently move the service.`,
      );
    }

    const scriptAbs = path.resolve(dirs.source, def.launchScriptRelative);
    if (!fs.existsSync(scriptAbs)) {
      throw new Error(`Launch target missing: ${scriptAbs}. Reinstall the service.`);
    }

    sup.start({
      id,
      command: nodeBin,
      args: [scriptAbs, ...def.launchArgs],
      cwd: dirs.source,
      env: buildEnv(id, reg.host, reg.port ?? def.defaultPort),
      probe: makeProbe(id, reg.host, reg.port ?? def.defaultPort),
      logDir: dirs.logs,
    });
    this.emit("state", id, "STARTING");
    await this.awaitHealthy(id, opts.timeoutMs ?? 45_000);
    return this.snapshot(id);
  }

  async stop(id: ServiceId): Promise<ServiceSnapshot> {
    await this.supervisor(id).stop();
    this.emit("state", id, "STOPPED");
    return this.snapshot(id);
  }

  async restart(id: ServiceId): Promise<ServiceSnapshot> {
    await this.stop(id);
    return this.start(id);
  }

  /** Wait until health passes (or time out) so callers get honest readiness. */
  private async awaitHealthy(id: ServiceId, timeoutMs: number): Promise<ProbeResult> {
    const deadline = Date.now() + timeoutMs;
    let last: ProbeResult = { ok: false, latencyMs: 0, detail: "Probe not yet executed" };
    while (Date.now() < deadline) {
      last = await this.supervisor(id).probeNow();
      if (last.ok) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return last;
  }

  async diagnose(id: ServiceId): Promise<{ probe: ProbeResult; endpoint?: string; pid?: number; uptimeMs: number }> {
    const probe = await this.supervisor(id).probeNow();
    const info = this.supervisor(id).info();
    return { probe, endpoint: this.endpointOf(id), pid: info.pid, uptimeMs: info.uptimeMs };
  }

  logs(id: ServiceId, lines = 200): string[] {
    return this.supervisor(id).logTail(lines);
  }

  /**
   * Choose the Node executable that will host the child process:
   * config override → env override → best compatible detected runtime.
   * Persists the actual choice into manifest.json.
   */
  private async pickRuntime(id: ServiceId): Promise<string> {
    const manifest = readManifest(id) ?? {};
    const override =
      manifest?.config?.nodeBinOverride || process.env.ASTRA_SERVICES_NODE_OVERRIDE;
    const sel = await selectCompatibleRuntime(SERVICE_DEFS[id].nodeRequirementClauses, override);
    if (!sel.runtime) throw new Error(sel.reason ?? "No compatible Node.js runtime found");
    writeManifest(id, {
      ...manifest,
      launch: { ...(manifest.launch ?? {}), nodeBin: sel.runtime.nodeBin },
      config: {
        ...(manifest.config ?? {}),
        host: this.registry.get(id)!.host,
        port: this.registry.get(id)!.port,
        autoStart: manifest.config?.autoStart ?? true,
        nodeBinOverride: override || undefined,
      },
    });
    return sel.runtime.nodeBin;
  }

  persistConfig(id: ServiceId): void {
    const manifest = readManifest(id) ?? {};
    const reg = this.registry.get(id)!;
    writeManifest(id, {
      ...manifest,
      config: { ...(manifest.config ?? {}), host: reg.host, port: reg.port },
    });
  }

  // --------------------------------------------- Install / Upgrade / Rollback ---

  async install(id: ServiceId, opts: { nodeBin?: string } = {}): Promise<InstallProgress> {
    if (this.progress.get(id)?.running) throw new Error(`${id} installation already in progress`);
    const result = await installService(id, {
      nodeBin: opts.nodeBin,
      onProgress: (p) => {
        this.progress.set(id, p);
        this.emit("progress", id, p);
      },
    });
    this.progress.set(id, { ...result.progress, running: false });
    const reg = this.registry.get(id)!;
    reg.endpoint = `http://${reg.host}:${reg.port}`;
    return this.progress.get(id)!;
  }

  /** Upgrade = backup → reinstall at the pinned/new ref → verify → prune. */
  async upgrade(id: ServiceId): Promise<{ backupPath: string }> {
    const backupPath = await backupService(id, "pre-upgrade");
    await this.install(id); // working version never silently replaced (§22)
    pruneBackups(id);
    return { backupPath };
  }

  async rollbackToBackup(id: ServiceId, backupName: string): Promise<void> {
    const dirs = serviceDirs(id);
    const src = path.join(dirs.backups, backupName);
    if (!fs.existsSync(src)) throw new Error(`Backup not found: ${backupName}`);
    await this.stop(id).catch(() => undefined);
    for (const kind of ["source", "runtime", "data", "config"] as const) {
      const from = path.join(src, kind);
      if (fs.existsSync(from)) fs.cpSync(from, dirs[kind], { recursive: true, force: true });
    }
  }

  listBackups(id: ServiceId): string[] {
    try {
      return fs.readdirSync(serviceDirs(id).backups).sort().reverse();
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------- Model discovery ---

  /**
   * Discover models from the ACTUAL upstream runtime. Returns [] honestly
   * when the service is unreachable — no fabricated model lists.
   */
  async discoverModels(id: ServiceId): Promise<Array<UnifiedModelEntry & { raw?: any }>> {
    const endpoint = this.endpointOf(id);
    if (!endpoint || !(await this.supervisor(id).probeNow()).ok) return [];
    try {
      const data = await fetchJson(`${endpoint}/v1/models`);
      const arr = data?.data ?? data?.models ?? [];
      return arr.map((m: any) => ({
        stableId: `${id}:${m.id ?? m.model ?? String(m.name)}`,
        modelId: String(m.id ?? m.model ?? m.name),
        providerLabel: m.provider ?? m.owned_by ?? SERVICE_DEFS[id].displayName,
        sourceService: id,
        available: m.available !== false,
        capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
        contextWindow:
          typeof m.context_length === "number" ? m.context_length
          : typeof m.context_window === "number" ? m.context_window
          : undefined,
        requestCount: 0,
        errorCount: 0,
        route: id === "freellmapi" ? "local-gateway" : "omniroute",
        fallbackRoute: undefined,
        raw: m,
      }));
    } catch {
      return []; // honest empty state; diagnostics carry probe detail
    }
  }

  /** Unified registry across services + ASTRA's own static catalog (§17). */
  async unifiedModelRegistry(staticEntries: UnifiedModelEntry[] = []): Promise<UnifiedModelEntry[]> {
    const discovered = (
      await Promise.all(ALL_SERVICE_IDS.map((id) => this.discoverModels(id)))
    ).flat();
    const byStableId = new Map<string, UnifiedModelEntry>();
    for (const entry of [...staticEntries, ...discovered]) {
      const existing = byStableId.get(entry.stableId);
      byStableId.set(
        entry.stableId,
        existing
          ? { ...existing, ...entry, requestCount: existing.requestCount + entry.requestCount }
          : entry, // deduplicate by stable ID
      );
    }
    return [...byStableId.values()];
  }

  // ------------------------------------- External-install detection / import ---

  /** Detect existing external Windows installs WITHOUT touching them (§23). */
  async detectExternalInstallations(id: ServiceId): Promise<{
    detected: boolean;
    hints: string[];
    defaultPortResponding?: boolean;
  }> {
    const def = SERVICE_DEFS[id];
    const hints: string[] = [];
    for (const hintPath of def.externalInstallHints.configPaths) {
      const expanded = expandWindowsPath(hintPath);
      if (fs.existsSync(expanded)) hints.push(expanded);
    }
    let defaultPortResponding: boolean | undefined;
    for (const port of def.externalInstallHints.defaultPorts) {
      if (await isPortResponding("127.0.0.1", port)) {
        defaultPortResponding = true;
        break;
      }
    }
    return { detected: hints.length > 0 || Boolean(defaultPortResponding), hints, defaultPortResponding };
  }

  /**
   * Import config from an external installation into the managed service's
   * config dir. Additive only — the source is never modified or deleted,
   * so dual-run validation remains possible (§24).
   */
  importExternalConfig(id: ServiceId, fromDir: string, fileNames: string[]): { imported: string[]; missing: string[] } {
    const target = serviceDirs(id).config;
    const imported: string[] = [];
    const missing: string[] = [];
    for (const name of fileNames) {
      const src = path.join(fromDir, name);
      if (!fs.existsSync(src) || fs.statSync(src).size > 5_000_000) {
        missing.push(name);
        continue;
      }
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(src, path.join(target, name));
      imported.push(name);
    }
    return { imported, missing };
  }

  /**
   * Decommission eligibility (§25): only after the internal service has
   * proven HEALTHY may the UI surface external-removal options. The manager
   * itself NEVER uninstalls the user's software automatically.
   */
  decommissionEligibility(id: ServiceId): { eligibleForRemovalOffer: boolean; internalHealthy: boolean; reason: string } {
    const state = this.supervisor(id).derivedState(isInstalled(id) ? "STOPPED" : "NOT_INSTALLED");
    const internalHealthy = state === "HEALTHY";
    return {
      eligibleForRemovalOffer: internalHealthy,
      internalHealthy,
      reason: internalHealthy
        ? "Internal managed service is HEALTHY."
        : `Internal service is ${state}; removal must not be offered until internal health is proven.`,
    };
  }
}

/** Singleton used by server routes. */
export const internalServiceManager = new InternalServiceManager();
