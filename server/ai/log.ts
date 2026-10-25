import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface AiRequestLog {
  requestId: string;
  timestamp: string;
  service: string;
  model: string;
  latencyMs: number;
  status: number;
  fallbackAttempts: number;
  error?: string;
  routedVia?: string | null;
}

const MAX = 80;
const ring: AiRequestLog[] = [];

/** Durable API-call DB: every call logged with timestamp, service (agent), route used, success/failure. */
const AI_CALLS_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "ai-calls.jsonl");

export function nextRequestId(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const seq = String(ring.length + 1).padStart(6, "0");
  return `ASTRA-${stamp}-${seq}`;
}

export function recordAiLog(entry: AiRequestLog): void {
  ring.unshift(entry);
  if (ring.length > MAX) ring.pop();
  const line = `[ai-gateway] ${entry.requestId} service=${entry.service} model=${entry.model} status=${entry.status} latencyMs=${entry.latencyMs} fallback=${entry.fallbackAttempts}${entry.error ? ` error=${entry.error}` : ""}`;
  console.log(line);
  // Durable append — survives server restarts (central state DB, item 3).
  try {
    const record = { ...entry, success: entry.status >= 200 && entry.status < 400 };
    fs.appendFileSync(AI_CALLS_PATH, JSON.stringify(record) + "\n");
  } catch {
    /* persistence is best-effort; in-memory ring still works */
  }
}

export function recentAiLogs(): AiRequestLog[] {
  return ring.slice(0, 40);
}
