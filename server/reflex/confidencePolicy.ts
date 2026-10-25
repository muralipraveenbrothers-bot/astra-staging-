import type { DecisionSchema } from "./schema/types";

export type ConfidenceBand = "high" | "mid" | "low";
export type ReflexMode = "SHADOW" | "ASSIST" | "AUTO";

const DEFAULTS = { auto: 0.9, assist: 0.65, minMargin: 0.25 };
const modes = new Map<string, ReflexMode>();
const alerts: string[] = [];

export function schemaThresholds(schema: Pick<DecisionSchema, "thresholds">): { auto: number; assist: number; minMargin: number } {
  return {
    auto: schema.thresholds?.auto ?? DEFAULTS.auto,
    assist: schema.thresholds?.assist ?? DEFAULTS.assist,
    minMargin: schema.thresholds?.minMargin ?? DEFAULTS.minMargin,
  };
}

export function confidenceBand(
  schema: Pick<DecisionSchema, "thresholds" | "abstainKeys">,
  confidence: number,
  margin: number,
  answer?: string,
): ConfidenceBand {
  if (answer && schema.abstainKeys?.includes(answer)) return "low";
  const t = schemaThresholds(schema);
  if (confidence >= t.auto && margin >= t.minMargin) return "high";
  if (confidence >= t.assist) return "mid";
  return "low";
}

export function modeFor(schemaId: string, fallback: ReflexMode = "SHADOW"): ReflexMode {
  return modes.get(schemaId) ?? fallback;
}

export function setSchemaMode(schema: Pick<DecisionSchema, "id" | "domain">, mode: ReflexMode): void {
  const clinical = schema.domain === "clinical" || schema.id.startsWith("clinical.");
  if (mode === "AUTO" && clinical) {
    throw new Error("Clinical schemas are capped at ASSIST and cannot be set to AUTO.");
  }
  modes.set(schema.id, mode);
}

export function escalationAlert(input: { schemaId: string; kind?: string; score: number; mode?: ReflexMode }): { escalate: boolean; alert?: string } {
  const named = /emergency|escalate/i.test(input.schemaId);
  const emergency = named && (input.kind == null || input.kind === "noul" || input.kind === "score");
  if (emergency && input.score >= 0.3) {
    const alert = "Nurse/doctor alert for " + input.schemaId + " score " + input.score + " (no automatic clinical action).";
    alerts.push(alert);
    return { escalate: true, alert };
  }
  return { escalate: false };
}

export function takeEscalationAlerts(): string[] {
  return alerts.splice(0, alerts.length);
}

export function annotatePolicy(schema: DecisionSchema, result: { answer: string; confidence: number; margin: number }): {
  band: ConfidenceBand; mode: ReflexMode; authority: string; needsHuman: boolean;
} {
  const band = confidenceBand(schema, result.confidence, result.margin, result.answer);
  const mode = modeFor(schema.id, schema.defaultMode);
  const clinical = schema.domain === "clinical";
  return {
    band,
    mode,
    authority: clinical ? "DOCTOR_ONLY" : "CONFIRM_USER",
    needsHuman: band === "low" || schema.abstainKeys.includes(result.answer),
  };
}

export function _resetModesForTest(): void {
  modes.clear();
  alerts.length = 0;
}
