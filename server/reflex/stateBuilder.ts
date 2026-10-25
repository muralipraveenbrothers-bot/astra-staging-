import crypto from "crypto";
import type { DecisionSchema } from "./schema/types";

export interface StateField {
  value: unknown;
  identifier?: boolean;
}

export type StateInput = string | Record<string, unknown | StateField>;

function redactIdentifiers(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b\d{10}\b/g, "[redacted-phone]")
    .replace(/\b\d{12}\b/g, "[redacted-id]")
    .replace(/\b(?:name|patient_name)\s*:\s*[^\n]+/gi, "name: [redacted-name]");
}

function normalizeValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function buildState(input: StateInput, schema: DecisionSchema): { state: string; stateHash: string } {
  const lines: string[] = [`schema: ${schema.id}@${schema.version}`];
  if (typeof input === "string") {
    lines.push(`text: ${redactIdentifiers(normalizeValue(input))}`);
  } else {
    for (const key of Object.keys(input).sort()) {
      const raw = input[key];
      const field = raw && typeof raw === "object" && "value" in raw ? raw as StateField : { value: raw };
      const value = field.identifier ? "[redacted-identifier]" : redactIdentifiers(normalizeValue(field.value));
      lines.push(`${key}: ${value}`);
    }
  }
  const compact = lines.join("\n").slice(0, 1400);
  const stateHash = crypto.createHash("sha256").update(compact).digest("hex");
  return { state: compact, stateHash };
}
