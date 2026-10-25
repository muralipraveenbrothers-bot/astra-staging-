import fs from "fs";
import path from "path";
import crypto from "crypto";
import { realtimeHub } from "../events";

const GENESIS = "0".repeat(64);
const streams = new Map<string, DurableJsonlStream>();

export interface DurableJsonlEntry<T = unknown> {
  seq: number;
  at: string;
  stream: string;
  type: string;
  payload: T;
  prevHash: string;
  hash: string;
}

export interface VerifyResult {
  ok: boolean;
  entries: number;
  brokenAtSeq?: number;
  file?: string;
}

export interface DurableJsonlOptions {
  now?: () => Date;
  /** Read-only handle for verify(): no boot replay, no quarantine, no timers. */
  passive?: boolean;
}

let processHandlersInstalled = false;

function closeAllStreams(): void {
  for (const stream of streams.values()) {
    try { stream.close(); } catch { /* best effort on shutdown */ }
  }
}

/**
 * One set of process hooks for every stream (not one per stream, which trips
 * MaxListeners and swallows the default SIGINT/SIGTERM exit). After fsync the
 * signal is re-raised when nobody else handles it, so pm2 restarts stay clean.
 */
function installProcessHandlers(): void {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;
  process.once("beforeExit", closeAllStreams);
  process.once("exit", closeAllStreams);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      closeAllStreams();
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
    });
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function hashEntry(entry: Omit<DurableJsonlEntry, "hash">): string {
  return crypto.createHash("sha256").update(entry.prevHash + canonical(entry)).digest("hex");
}

function segmentSuffix(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function safeStreamName(name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Invalid durable stream name: ${name}`);
  return name;
}

function warnAdmin(message: string, payload: Record<string, unknown>): void {
  console.warn(`[durable-jsonl] ${message}`, payload);
  try {
    realtimeHub.broadcast({
      type: "ASTRA_BRAIN_EVENT",
      targetRoles: ["admin"],
      payload: { category: "durable-jsonl", severity: "warning", message, ...payload },
    });
  } catch {
    // SSE warnings must never stop boot.
  }
}

export class DurableJsonlStream {
  private seq = 0;
  private prevHash = GENESIS;
  private readonly name: string;
  private readonly dir: string;
  private readonly now: () => Date;
  private fsyncTimer: NodeJS.Timeout | null = null;

  constructor(streamName: string, dir: string, options: DurableJsonlOptions = {}) {
    this.name = safeStreamName(streamName);
    this.dir = dir;
    this.now = options.now ?? (() => new Date());
    if (options.passive) return;
    fs.mkdirSync(this.dir, { recursive: true });
    const entries = this.replay();
    const last = entries[entries.length - 1];
    this.seq = last?.seq ?? 0;
    this.prevHash = last?.hash ?? GENESIS;
    this.fsyncTimer = setInterval(() => this.fsync(), 2000);
    this.fsyncTimer.unref?.();
    installProcessHandlers();
  }

  /** Last entry without re-reading every segment line into memory twice. */
  last(): DurableJsonlEntry | null {
    const entries = this.replay();
    return entries[entries.length - 1] ?? null;
  }

  append(type: string, payload: unknown): DurableJsonlEntry {
    const base = {
      seq: this.seq + 1,
      at: this.now().toISOString(),
      stream: this.name,
      type,
      payload,
      prevHash: this.prevHash,
    };
    const entry: DurableJsonlEntry = { ...base, hash: hashEntry(base) };
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(this.segmentFile(this.now()), `${JSON.stringify(entry)}\n`, "utf8");
    this.seq = entry.seq;
    this.prevHash = entry.hash;
    return entry;
  }

  replay(): DurableJsonlEntry[] {
    const entries: DurableJsonlEntry[] = [];
    let prevHash = GENESIS;
    let expectedSeq = 1;
    for (const file of this.segmentFiles()) {
      const full = path.join(this.dir, file);
      const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
      let goodLineCount = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed: DurableJsonlEntry;
        try {
          parsed = JSON.parse(line);
        } catch {
          this.quarantine(full, entries, goodLineCount, `Unparsable line in ${file}`);
          this.resumeFrom(entries);
          return entries;
        }
        const { hash, ...withoutHash } = parsed;
        const expectedHash = hashEntry(withoutHash);
        if (parsed.stream !== this.name || parsed.seq !== expectedSeq || parsed.prevHash !== prevHash || hash !== expectedHash) {
          this.quarantine(full, entries, goodLineCount, `Broken hash chain in ${file} at seq ${parsed.seq}`);
          this.resumeFrom(entries);
          return entries;
        }
        entries.push(parsed);
        prevHash = parsed.hash;
        expectedSeq += 1;
        goodLineCount += 1;
      }
    }
    return entries;
  }

  verify(): VerifyResult {
    let prevHash = GENESIS;
    let expectedSeq = 1;
    let entries = 0;
    for (const file of this.segmentFiles()) {
      const full = path.join(this.dir, file);
      for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as DurableJsonlEntry;
          const { hash, ...withoutHash } = parsed;
          if (parsed.stream !== this.name || parsed.seq !== expectedSeq || parsed.prevHash !== prevHash || hash !== hashEntry(withoutHash)) {
            return { ok: false, entries, brokenAtSeq: parsed.seq || expectedSeq, file: full };
          }
          prevHash = parsed.hash;
          expectedSeq += 1;
          entries += 1;
        } catch {
          return { ok: false, entries, brokenAtSeq: expectedSeq, file: full };
        }
      }
    }
    return { ok: true, entries };
  }

  fsync(): void {
    try {
      const fd = fs.openSync(this.segmentFile(this.now()), "a");
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    } catch {
      // Append path reports write errors synchronously; fsync is best effort.
    }
  }

  close(): void {
    if (this.fsyncTimer) clearInterval(this.fsyncTimer);
    this.fsyncTimer = null;
    this.fsync();
  }

  private segmentFile(date: Date): string {
    return path.join(this.dir, `${this.name}-${segmentSuffix(date)}.jsonl`);
  }

  private segmentFiles(): string[] {
    try {
      // Exact segment names only: quarantined files must never be replayed or verified again.
      const segment = new RegExp(`^${this.name}-\\d{4}-\\d{2}\\.jsonl$`);
      return fs.readdirSync(this.dir)
        .filter((name) => segment.test(name))
        .sort();
    } catch {
      return [];
    }
  }

  /** After a quarantine the next append must chain onto the last GOOD entry. */
  private resumeFrom(entries: DurableJsonlEntry[]): void {
    const last = entries[entries.length - 1];
    this.seq = last?.seq ?? 0;
    this.prevHash = last?.hash ?? GENESIS;
  }

  private quarantine(file: string, goodPrefix: DurableJsonlEntry[], goodLineCount: number, message: string): void {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const quarantine = file.replace(/\.jsonl$/, `.quarantined-${ts}.jsonl`);
    try {
      fs.renameSync(file, quarantine);
      if (goodLineCount > 0) {
        const prefix = goodPrefix.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
        fs.writeFileSync(file, prefix, "utf8");
      }
    } catch (error) {
      warnAdmin("Failed to quarantine durable segment", { stream: this.name, file, error: String(error) });
      return;
    }
    warnAdmin(message, { stream: this.name, file: quarantine });
  }
}

export function open(streamName: string, dir: string, options?: DurableJsonlOptions): DurableJsonlStream {
  const key = `${path.resolve(dir)}::${streamName}`;
  const existing = streams.get(key);
  if (existing) return existing;
  const stream = new DurableJsonlStream(streamName, dir, options);
  streams.set(key, stream);
  return stream;
}

export function verify(streamName: string, dir: string): VerifyResult {
  return new DurableJsonlStream(streamName, dir, { passive: true }).verify();
}

export function verifyOpenStreams(): Record<string, VerifyResult> {
  const out: Record<string, VerifyResult> = {};
  for (const [key, stream] of streams) out[key] = stream.verify();
  return out;
}
