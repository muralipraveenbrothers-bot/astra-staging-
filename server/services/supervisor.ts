/**
 * Astra AI — Internal Service Manager :: Process Supervisor
 * =========================================================
 * Owns child-process lifecycle for managed services:
 *   spawn → stdout/stderr capture (ring buffer + rotating log files)
 *         → PID / start-time / uptime / command tracking
 *         → crash detection → exponential backoff restarts
 *         → crash-loop detection → visible degraded state with bounded recovery
 *
 * The supervisor never lies: state changes only on real observations.
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import type { ProbeResult } from "./types";

const RING_BUFFER_LINES = 1000;
const BACKOFF_SCHEDULE_MS = [2_000, 4_000, 8_000, 16_000, 30_000];
const MAX_RESTART_ATTEMPTS = 5;
const CRASH_LOOP_WINDOW_MS = 120_000;
const CRASH_LOOP_THRESHOLD = 3;
/** After this many ms of sustained health, stale crash-loop flags are cleared automatically. */
const STABLE_RECOVERY_MS = 120_000;

export interface SpawnSpec {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  /** Async probe deciding HEALTHY vs UNHEALTHY while the process runs. */
  probe(): Promise<ProbeResult>;
  logDir: string;
}

export interface SupervisedProcessInfo {
  pid?: number;
  startedAt?: string;
  uptimeMs: number;
  command: string;
  args: string[];
  exitCode?: number | null;
  restartCount: number;
  crashLoopDetected: boolean;
  restartPending: boolean;
}

type Phase = "STOPPED" | "STARTING" | "RUNNING" | "CRASHED" | "DISABLED";

/** Terminate the managed child; Windows also terminates its descendant tree. */
export async function killTree(pid: number, isWindows: boolean, timeoutMs = 8_000): Promise<void> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const exec = promisify(execFile);
  try {
    if (isWindows) {
      await exec("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: timeoutMs });
    } else {
      try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
    }
  } catch {
    try {
      if (isWindows) await exec("taskkill", ["/PID", String(pid), "/F"], { timeout: timeoutMs });
      else process.kill(pid, "SIGKILL");
    } catch { /* already gone */ }
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      return;
    }
  }
  if (!isWindows) {
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    const forceDeadline = Math.min(deadline, Date.now() + 2_000);
    while (Date.now() < forceDeadline) {
      try {
        process.kill(pid, 0);
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        return;
      }
    }
  }
  try {
    process.kill(pid, 0);
    throw new Error(`Process ${pid} did not terminate within ${timeoutMs}ms.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Process ")) throw error;
  }
}

export class ServiceSupervisor extends EventEmitter {
  readonly id: string;
  private spec: SpawnSpec | null = null;
  private child: ChildProcess | null = null;
  private phase: Phase = "STOPPED";
  private startedAtMs?: number;
  private restartCount = 0;
  private exitCode: number | null | undefined;
  private healthTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private lastLatencyMs?: number;
  private lastHealthDetail?: string;
  private lastProbeAtMs?: number;
  private ring: string[] = [];
  private logStream: fs.WriteStream | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private crashTimes: number[] = [];
  private crashLoopDetected = false;
  private disabledReason?: string;
  private stoppingIntentionally = false;
  private processGeneration = 0;
  private stopPromise: Promise<void> | null = null;
  private finalizedGeneration = 0;
  private healthProbeGeneration?: number;
  private healthProbePromise: Promise<ProbeResult> | null = null;
  /** Real counters incremented via noteRequest() by AI-gateway hooks. */
  requests = 0;
  errors = 0;

  constructor(id: string) {
    super();
    this.id = id;
  }

  get statePhase(): Phase { return this.phase; }

  isRunning(): boolean {
    return this.phase === "RUNNING" || this.phase === "STARTING";
  }

  logTail(maxLines = 200): string[] {
    return this.ring.slice(-maxLines);
  }

  info(): SupervisedProcessInfo {
    return {
      pid: this.child?.pid,
      startedAt: this.startedAtMs ? new Date(this.startedAtMs).toISOString() : undefined,
      uptimeMs: this.startedAtMs ? Math.max(0, Date.now() - this.startedAtMs) : 0,
      command: this.spec?.command ?? "",
      args: this.spec?.args ?? [],
      exitCode: this.exitCode,
      restartCount: this.restartCount,
      crashLoopDetected: this.crashLoopDetected,
      restartPending: this.restartTimer !== null,
    };
  }

  metrics(): { requests: number; errors: number } {
    return { requests: this.requests, errors: this.errors };
  }

  /** Called by gateway hooks after each real proxied request. */
  noteRequest(ok: boolean): void {
    this.requests += 1;
    if (!ok) this.errors += 1;
  }

  derivedState(notInstalledFallback: "NOT_INSTALLED" | "STOPPED" = "STOPPED"): string {
    if (this.phase === "DISABLED") return "DISABLED";
    if (this.phase === "CRASHED") return "CRASHED";
    if (this.phase === "STARTING") return "STARTING";
    if (this.phase === "STOPPED") return notInstalledFallback;
    // RUNNING:
    return this.crashLoopDetected
      ? "DEGRADED"
      : this.consecutiveFailures >= 3
      ? "UNHEALTHY"
      : this.consecutiveFailures > 0
        ? "DEGRADED"
        : "HEALTHY";
  }

  snapshotHealth() {
    return {
      lastProbeAt: this.lastProbeAtMs ? new Date(this.lastProbeAtMs).toISOString() : undefined,
      latencyMs: this.lastLatencyMs,
      consecutiveFailures: this.consecutiveFailures,
      detail: this.lastHealthDetail,
    };
  }

  lastErrorText(): string | undefined {
    return this.disabledReason ?? this.lastHealthDetail;
  }

  disabledReasonText(): string | undefined {
    return this.disabledReason;
  }

  /** Start (or restart) the supervised process. Idempotent while running. */
  start(spec: SpawnSpec): void {
    if (this.stopPromise) {
      throw new Error(`${this.id} is still stopping; wait for shutdown to complete before starting it again.`);
    }
    if (this.child) {
      throw new Error(`${this.id} still has a live process after the previous stop failed; stop it successfully before starting again.`);
    }
    if (this.isRunning()) return;
    if (this.phase === "DISABLED") {
      throw new Error(
        `${this.id} is DISABLED after repeated failures: ${this.disabledReason ?? "crash loop"}. Explicit re-enable required.`,
      );
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.spec = spec;
    this.stoppingIntentionally = false;
    this.restartCount = 0;
    this.beginSpawn();
  }

  private beginSpawn(): void {
    const spec = this.spec!;
    const generation = ++this.processGeneration;
    this.finalizedGeneration = generation - 1;
    this.phase = "STARTING";
    this.lastProbeAtMs = undefined;
    this.lastLatencyMs = undefined;
    this.consecutiveFailures = 0;
    this.emit("state", this.id, "STARTING");

    try {
      fs.mkdirSync(spec.logDir, { recursive: true });
    } catch (error) {
      this.handlePreSpawnFailure(
        generation,
        `Log directory setup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = path.join(spec.logDir, `${this.id}-${stamp}.log`);
    const processLogStream = fs.createWriteStream(logFile, { flags: "a" });
    this.logStream = processLogStream;
    processLogStream.on("error", (error) => {
      if (generation !== this.processGeneration) return;
      this.lastHealthDetail = `Log stream failed: ${error.message}`;
    });

    const env: NodeJS.ProcessEnv = { ...process.env, ...spec.env };
    let child: ChildProcess;
    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: false,
      });
    } catch (error) {
      processLogStream.end();
      this.logStream = null;
      this.child = null;
      this.startedAtMs = undefined;
      this.exitCode = null;
      this.handlePreSpawnFailure(
        generation,
        `Spawn failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    this.child = child;
    this.startedAtMs = Date.now();
    let spawnErrorDetail: string | undefined;

    const capture = (chunk: Buffer) => {
      for (const line of chunk.toString("utf-8").split(/\r?\n/)) {
        if (!line) continue;
        this.ring.push(line);
        if (this.ring.length > RING_BUFFER_LINES) this.ring.shift();
      }
      processLogStream.write(chunk.toString("utf-8"));
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);

    child.on("exit", (code) => {
      if (generation !== this.processGeneration) {
        processLogStream.end();
        if (this.stoppingIntentionally && this.child === child) {
          this.child = null;
          this.startedAtMs = undefined;
          this.exitCode = code;
          this.phase = "STOPPED";
          this.emit("state", this.id, "STOPPED");
        }
        return;
      }
      if (this.finalizedGeneration === generation) return;
      this.finalizedGeneration = generation;
      this.exitCode = code;
      processLogStream.end();
      this.logStream = null;
      this.stopHealthPolling();
      this.child = null;

      if (this.stoppingIntentionally) {
        this.phase = "STOPPED";
        this.emit("state", this.id, "STOPPED");
        return;
      }

      this.crashTimes.push(Date.now());
      this.crashTimes = this.crashTimes.filter((t) => Date.now() - t <= CRASH_LOOP_WINDOW_MS);

      // A crash burst is diagnostic information, not permission to strand a
      // service. Keep retrying with the bounded backoff below; a transient
      // dependency failure must not require manual re-enable to recover.
      if (
        this.crashTimes.length >= CRASH_LOOP_THRESHOLD &&
        Date.now() - this.crashTimes[this.crashTimes.length - CRASH_LOOP_THRESHOLD] <= CRASH_LOOP_WINDOW_MS
      ) {
        this.crashLoopDetected = true;
        this.lastHealthDetail =
          `Crash loop detected (${this.crashTimes.length} exits within ${CRASH_LOOP_WINDOW_MS / 1000}s). ` +
          "Retrying with bounded backoff; service remains recoverable.";
      }

      this.phase = "CRASHED";
      this.emit("state", this.id, "CRASHED");
      if (this.restartCount < MAX_RESTART_ATTEMPTS && this.spec) {
        const delay = BACKOFF_SCHEDULE_MS[Math.min(this.restartCount, BACKOFF_SCHEDULE_MS.length - 1)];
        this.restartCount += 1;
        const restartDetail =
          `Process exited (code ${code}). Restarting in ${delay / 1000}s (attempt ${this.restartCount}/${MAX_RESTART_ATTEMPTS}).`;
        this.lastHealthDetail = this.crashLoopDetected
          ? `${this.lastHealthDetail} ${restartDetail}`
          : restartDetail;
        if (spawnErrorDetail) this.lastHealthDetail += ` Launch error: ${spawnErrorDetail}`;
        this.scheduleRestart(this.processGeneration, delay);
      } else {
        // Keep the process recoverable indefinitely. restartCount is reset
        // after a stable window, preventing a later unrelated failure from
        // inheriting an exhausted retry budget.
        this.restartCount = 0;
        this.scheduleRestart(this.processGeneration, BACKOFF_SCHEDULE_MS[BACKOFF_SCHEDULE_MS.length - 1]);
      }
    });

    child.on("error", (err) => {
      if (generation !== this.processGeneration) return;
      spawnErrorDetail = err.message;
      this.lastHealthDetail = `Spawn error: ${err.message}`;
    });

    this.startHealthPolling();
  }

  private handlePreSpawnFailure(generation: number, detail: string): void {
    this.lastHealthDetail = detail;
    this.startedAtMs = undefined;
    this.exitCode = null;
    this.phase = "CRASHED";
    this.emit("state", this.id, "CRASHED");
    this.crashTimes.push(Date.now());
    this.crashTimes = this.crashTimes.filter((t) => Date.now() - t <= CRASH_LOOP_WINDOW_MS);
    if (
      this.crashTimes.length >= CRASH_LOOP_THRESHOLD &&
      Date.now() - this.crashTimes[this.crashTimes.length - CRASH_LOOP_THRESHOLD] <= CRASH_LOOP_WINDOW_MS
    ) {
      this.crashLoopDetected = true;
      this.lastHealthDetail +=
        ` Crash loop detected (${this.crashTimes.length} exits within ${CRASH_LOOP_WINDOW_MS / 1000}s).`;
    }
    if (this.restartCount < MAX_RESTART_ATTEMPTS) {
      const delay = BACKOFF_SCHEDULE_MS[Math.min(this.restartCount, BACKOFF_SCHEDULE_MS.length - 1)];
      this.restartCount += 1;
      this.scheduleRestart(generation, delay);
    } else {
      this.restartCount = 0;
      this.scheduleRestart(generation, BACKOFF_SCHEDULE_MS[BACKOFF_SCHEDULE_MS.length - 1]);
    }
  }

  private scheduleRestart(generation: number, delay = BACKOFF_SCHEDULE_MS[0]): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (generation !== this.processGeneration || this.stoppingIntentionally || !this.spec) return;
      this.beginSpawn();
    }, delay);
    this.restartTimer.unref?.();
  }

  private startHealthPolling(): void {
    this.stopHealthPolling();
    const generation = this.processGeneration;
    this.healthTimer = setInterval(async () => {
      if (generation !== this.processGeneration || !this.spec || !this.child) return;
      if (this.healthProbePromise) return;
      const probePromise = this.runProbe(generation);
      this.healthProbePromise = probePromise;
      try {
        const result = await probePromise;
        if (generation !== this.processGeneration || !this.child) return;
        this.lastLatencyMs = result.latencyMs;
        this.lastHealthDetail = result.detail;
        this.lastProbeAtMs = Date.now();
        this.consecutiveFailures = result.ok ? 0 : this.consecutiveFailures + 1;
        if (result.ok && this.phase === "STARTING") {
          this.phase = "RUNNING";
          this.emit("state", this.id, "RUNNING");
        }
        // Reconcile stale crash-loop state: once a process stays healthy for a
        // full stabilization window, old crash entries expire and the service
        // is allowed to leave the crash-loop state.
        if (result.ok) this.reconcileStableProcess();
      } finally {
        if (this.healthProbePromise === probePromise) this.healthProbePromise = null;
      }
    }, 15_000);
    this.healthTimer.unref?.();
  }

  private async runProbe(generation: number): Promise<ProbeResult> {
    if (this.healthProbeGeneration === generation) {
      return { ok: false, latencyMs: 0, detail: "Probe already in flight." };
    }
    const spec = this.spec;
    if (!spec) return { ok: false, latencyMs: 0, detail: "No launch spec registered (service not installed/started)." };
    this.healthProbeGeneration = generation;
    try {
      return await spec.probe();
    } catch (err: any) {
      return { ok: false, latencyMs: 0, detail: err?.message ?? String(err) };
    } finally {
      if (this.healthProbeGeneration === generation) this.healthProbeGeneration = undefined;
    }
  }

  private stopHealthPolling(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  /**
   * Crash-loop state reconciliation: a process that stays healthy (HTTP probe
   * passing) for a full stabilization window means the old crash burst did NOT
   * belong to this live instance. Under Core pattern 7, old exits must never
   * keep disabling an unrelated newer healthy process. Entries expire and the
   * service leaves the crash-loop-disabled state on its own.
   *
   * The historical crash record is preserved in the ring-buffer log stream.
   */
  private reconcileStableProcess(): void {
    if (!this.child || !this.startedAtMs) return;
    if (Date.now() - this.startedAtMs < STABLE_RECOVERY_MS) return;
    if (this.consecutiveFailures > 0) return;
    if (this.crashLoopDetected || this.restartCount > 0 || this.crashTimes.length > 0) {
      this.crashLoopDetected = false;
      this.crashTimes = [];
      this.restartCount = 0;
      this.disabledReason = undefined;
      this.lastHealthDetail = "Recovered: process stable past crash-loop window; stale crash history cleared.";
      this.emit("state", this.id, "HEALTHY");
      console.log(`[supervisor:${this.id}] crash-loop flag reconciled — process stable for ${STABLE_RECOVERY_MS / 1000}s.`);
    }
  }

  /** Run one health probe right now (diagnostics). Honest — never faked. */
  async probeNow(): Promise<ProbeResult> {
    if (!this.spec) {
      return { ok: false, latencyMs: 0, detail: "No launch spec registered (service not installed/started)." };
    }
    if (!this.child) {
      return { ok: false, latencyMs: 0, detail: "Supervised process is not running." };
    }
    const generation = this.processGeneration;
    const child = this.child;
    if (this.healthProbePromise) return this.healthProbePromise;
    const probePromise = this.runProbe(generation);
    this.healthProbePromise = probePromise;
    try {
      const result = await probePromise;
      if (generation !== this.processGeneration || child !== this.child) return result;
      this.lastLatencyMs = result.latencyMs;
      this.lastHealthDetail = result.detail;
      this.lastProbeAtMs = Date.now();
      this.consecutiveFailures = result.ok ? 0 : this.consecutiveFailures + 1;
      if (result.ok && this.phase === "STARTING" && this.child) {
        this.phase = "RUNNING";
        this.emit("state", this.id, "RUNNING");
      }
      return result;
    } catch (err: any) {
      if (generation !== this.processGeneration || child !== this.child) {
        return { ok: false, latencyMs: 0, detail: "Probe superseded by a service lifecycle change." };
      }
      this.consecutiveFailures += 1;
      const detail = err?.message ?? String(err);
      this.lastHealthDetail = detail;
      this.lastProbeAtMs = Date.now();
      return { ok: false, latencyMs: 0, detail };
    } finally {
      if (this.healthProbePromise === probePromise) this.healthProbePromise = null;
    }
  }

  /** Graceful stop. Kills the process tree on Windows; resolves when dead. */
  async stop(timeoutMs = 10_000): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    const operation = this.performStop(timeoutMs);
    this.stopPromise = operation.finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  private async performStop(timeoutMs: number): Promise<void> {
    this.stoppingIntentionally = true;
    this.processGeneration += 1;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.stopHealthPolling();
    this.healthProbeGeneration = undefined;
    this.healthProbePromise = null;
    const pid = this.child?.pid;
    const child = this.child;
    if (pid == null) {
      this.phase = "STOPPED";
      this.consecutiveFailures = 0;
      this.crashTimes = [];
      this.crashLoopDetected = false;
      this.restartCount = 0;
      this.startedAtMs = undefined;
      this.emit("state", this.id, "STOPPED");
      return;
    }
    try {
      await killTree(pid, process.platform === "win32", timeoutMs);
    } catch (error) {
      this.child = child;
      this.phase = "CRASHED";
      this.lastHealthDetail = `Stop failed: ${error instanceof Error ? error.message : String(error)}`;
      this.emit("state", this.id, "CRASHED");
      throw error;
    }
    this.child = null;
    this.phase = "STOPPED";
    this.consecutiveFailures = 0;
    this.crashTimes = [];
    this.crashLoopDetected = false;
    this.restartCount = 0;
    this.exitCode = null;
    this.startedAtMs = undefined;
    this.emit("state", this.id, "STOPPED");
  }

  /**
   * Re-enable a manually disabled service. Administrator action.
   * Resets counters only; does not start.
   */
  reEnable(): void {
    if (this.stopPromise) {
      throw new Error(`${this.id} is still stopping; wait for shutdown to complete before re-enabling it.`);
    }
    if (this.child || this.isRunning()) {
      throw new Error(`${this.id} is still running; stop it before re-enabling it.`);
    }
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.processGeneration += 1;
    this.healthProbeGeneration = undefined;
    this.healthProbePromise = null;
    this.crashTimes = [];
    this.crashLoopDetected = false;
    this.restartCount = 0;
    this.disabledReason = undefined;
    this.consecutiveFailures = 0;
    this.lastHealthDetail = undefined;
    this.lastLatencyMs = undefined;
    this.lastProbeAtMs = undefined;
    this.exitCode = undefined;
    this.phase = "STOPPED";
    this.emit("state", this.id, "STOPPED");
  }

  tailSizeBytes(): number {
    return this.ring.reduce((acc, l) => acc + l.length + 1, 0);
  }
}
