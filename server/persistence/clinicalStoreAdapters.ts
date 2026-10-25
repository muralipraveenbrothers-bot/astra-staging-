import crypto from "crypto";
import fs from "fs";
import path from "path";
import { realtimeHub } from "../events";
import { astraDataRoot } from "../services/env";
import { open, verifyOpenStreams, type VerifyResult } from "./durableJsonl";
import { configureWorkflowPersistence, type WorkflowPersistenceState } from "../../src/astra/clinical/workflow/workflowGuard";
import { configureResultsPersistence, type ResultsPersistenceState } from "../../src/astra/clinical/results/resultsLoop";
import { configureWardPersistence, pollWardEscalations, type WardPersistenceState } from "../../src/astra/clinical/ward/wardSafety";
import { configureTracePersistence, type FlightTrace } from "../../src/astra/brain/part5/trace";

const SECRET = /freellmapi-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{3,}/gi;
const IDENTIFIER = /\b(?:UHID|MRN|IP\s*no|bed)\s*[-:#]?\s*\d+\b|\b\d{6,}\b/gi;

function scrubText(text: string): string {
  return text.replace(SECRET, "[redacted]").replace(IDENTIFIER, "[id]");
}

function scrubDeep<T>(value: T): T {
  if (typeof value === "string") return scrubText(value) as T;
  if (Array.isArray(value)) return value.map(scrubDeep) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) out[key] = scrubDeep(child);
    return out as T;
  }
  return value;
}

/**
 * Store snapshot adapter. The in-memory stores hand over their whole state on
 * every change (their own lists already carry the history: events, overrides,
 * ward log, dose status trail). Writing that whole state into the JSONL line
 * each time would grow the files quadratically, so:
 *   - the full state goes to `<dir>/<stream>.checkpoint.json` (atomic temp-file
 *     write, the same pattern as server/db.ts), and
 *   - the hash-chained JSONL stream gets one small line per change:
 *     `{kind, stateHash, bytes}`, which makes any edit to the checkpoint
 *     detectable against the chain.
 * Mirror streams (the per-store directories named in R6-01) get the same small
 * change marker, never a second copy of the state.
 */
export function createSnapshotAdapter<T>(streamName: string, dir: string, mirrors: Array<[string, string]> = []) {
  const stream = open(streamName, dir);
  const mirrorStreams = mirrors.map(([name, mirrorDir]) => open(name, mirrorDir));
  const checkpointFile = path.join(dir, `${streamName}.checkpoint.json`);
  return {
    append(kind: string, record: T): void {
      const text = JSON.stringify(record);
      const stateHash = crypto.createHash("sha256").update(text).digest("hex");
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${checkpointFile}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, text, "utf8");
      fs.renameSync(tmp, checkpointFile);
      const marker = { kind, stateHash, bytes: Buffer.byteLength(text) };
      stream.append(kind, marker);
      for (const mirror of mirrorStreams) mirror.append(kind, { ...marker, mirrorOf: streamName });
    },
    load(): T | null {
      if (!fs.existsSync(checkpointFile)) return null;
      let text: string;
      let parsed: T;
      try {
        text = fs.readFileSync(checkpointFile, "utf8");
        parsed = JSON.parse(text) as T;
      } catch (error) {
        warnDurable(`Checkpoint for ${streamName} is unreadable; starting empty and keeping the file for review.`, { file: checkpointFile, error: String(error) });
        try { fs.renameSync(checkpointFile, `${checkpointFile}.unreadable-${Date.now()}`); } catch { /* keep going */ }
        return null;
      }
      const stateHash = crypto.createHash("sha256").update(text).digest("hex");
      const lastMarker = stream.last()?.payload as { stateHash?: string } | undefined;
      if (lastMarker?.stateHash !== stateHash) {
        // Never drop clinical data silently: load it, but tell the admin the chain does not vouch for it.
        warnDurable(`Checkpoint for ${streamName} does not match the last hash-chain entry (edited, or written during a crash). Loaded for human review.`, { file: checkpointFile });
      }
      return parsed;
    },
  };
}

function warnDurable(message: string, payload: Record<string, unknown>): void {
  console.warn(`[durable-jsonl] ${message}`, payload);
  try {
    realtimeHub.broadcast({ type: "ASTRA_BRAIN_EVENT", targetRoles: ["admin"], payload: { category: "durable-jsonl", severity: "warning", message, ...payload } });
  } catch {
    // Warnings must never stop boot.
  }
}

const configuredStreams: Record<string, string> = {};

let dataRoot: string | null = null;

function clinicalDir(name: string): string {
  const dir = path.join(dataRoot ?? astraDataRoot(), "clinical", name);
  configuredStreams[name] = dir;
  return dir;
}

function telemetryDir(name: string): string {
  const dir = path.join(dataRoot ?? astraDataRoot(), "telemetry", name);
  configuredStreams[name] = dir;
  return dir;
}

export function configureClinicalStorePersistence(options: { nowMs?: number; root?: string } = {}): void {
  dataRoot = options.root ?? null;
  configureWorkflowPersistence(createSnapshotAdapter<WorkflowPersistenceState>("workflow-events", clinicalDir("workflow-events"), [
    ["workflow-overrides", clinicalDir("workflow-overrides")],
    ["workflow-stamps", clinicalDir("workflow-stamps")],
    ["workflow-bill-labels", clinicalDir("workflow-bill-labels")],
  ]));
  configureResultsPersistence(createSnapshotAdapter<ResultsPersistenceState>("results-reports", clinicalDir("results-reports"), [
    ["critical-alerts", clinicalDir("critical-alerts")],
    ["result-notifications", clinicalDir("result-notifications")],
    ["results-log", clinicalDir("results-log")],
  ]));
  configureWardPersistence(createSnapshotAdapter<WardPersistenceState>("ward-dose-tasks", clinicalDir("ward-dose-tasks"), [
    ["ward-vitals-timers", clinicalDir("ward-vitals-timers")],
    ["ward-escalations", clinicalDir("ward-escalations")],
    ["ward-sbar", clinicalDir("ward-sbar")],
  ]));

  const traceStream = open("flight", telemetryDir("flight"));
  configureTracePersistence({
    append(kind, trace) {
      // request_id is a generated correlation key (not patient data); keep it so disk lookups work.
      traceStream.append(kind, { ...scrubDeep(trace), request_id: trace.request_id });
    },
    load(requestId) {
      const entries = traceStream.replay().reverse();
      return (entries.find((entry) => (entry.payload as FlightTrace).request_id === requestId)?.payload as FlightTrace | undefined) ?? null;
    },
  });

  // Timers that fell due while AstraAPI was down fire once now (firedLate: true); the escalation is persisted, so a second boot does not refire it.
  pollWardEscalations(options.nowMs ?? Date.now(), { boot: true });
}

export function verifyClinicalStorePersistence(): Record<string, VerifyResult> {
  return verifyOpenStreams();
}
