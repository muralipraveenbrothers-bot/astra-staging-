import crypto from "crypto";
import fs from "fs";
import path from "path";
import { astraDataRoot } from "../services/env";
import { open } from "../persistence/durableJsonl";
import type { Recorder } from "./decisionFabric";

const ALLOWED = [
  "decisionId", "at", "schemaId", "version", "schemaHash", "stateHash", "checkpoint", "lang",
  "answer", "confidence", "margin", "band", "mode", "level0Override", "authority", "latencyMs",
  "requestId", "role", "patientHash", "source",
] as const;

const memory: Record<string, unknown>[] = [];

function saltPath(): string {
  return path.join(astraDataRoot(), "reflex", "salt");
}

function salt(): string {
  if (process.env.VITEST) return "vitest-reflex-salt";
  const file = saltPath();
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    const value = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value, { encoding: "utf8", mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch { /* windows may ignore */ }
    return value;
  } catch {
    return "reflex-salt-unavailable";
  }
}

export function hashPatientId(patientId: string): string {
  return crypto.createHash("sha256").update(salt() + patientId).digest("hex");
}

export function recordedDecisions(): Record<string, unknown>[] {
  return memory.map((row) => ({ ...row }));
}

export function createDecisionRecorder(): Recorder {
  return {
    record(event) {
      const source = event as Record<string, unknown>;
      const row: Record<string, unknown> = { at: new Date().toISOString() };
      for (const key of ALLOWED) {
        if (source[key] !== undefined) row[key] = source[key];
      }
      if (typeof source.patientId === "string") row.patientHash = hashPatientId(source.patientId);
      memory.push(row);
      if (process.env.VITEST) return;
      try {
        open("decisions", path.join(astraDataRoot(), "reflex")).append("decision", row);
      } catch { /* never throw to the fabric */ }
    },
  };
}

export function _resetRecorderForTest(): void {
  memory.length = 0;
}
