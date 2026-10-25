import { computeDecisionHash, GENESIS_HASH, type ApprovalDecision } from "../../src/astra/approval/approvalGate";
import { expectedCalibrationError, fitTemperature, type LabelledScore } from "./calibration";
import { modeFor, setSchemaMode, type ReflexMode } from "./confidencePolicy";
import type { DecisionSchema } from "./schema/types";

export interface ShadowSample {
  lang: "en" | "te" | "hi";
  confidence: number;
  margin: number;
  correct: boolean;
  level0Conflict?: boolean;
  predicted?: string;
  truth?: string;
}

const log: ApprovalDecision[] = [];
const demotionAlerts: string[] = [];

function toScores(rows: ShadowSample[]): LabelledScore[] {
  return rows.map((row) => ({ confidence: row.confidence, correct: row.correct, predicted: row.predicted, truth: row.truth, lang: row.lang }));
}

export function promotionBlockers(schema: Pick<DecisionSchema, "id" | "domain" | "thresholds">, rows: ShadowSample[], admin?: { role?: string; reason?: string }, target: ReflexMode = "ASSIST"): string[] {
  const reasons: string[] = [];
  if (rows.length < 200) reasons.push("need at least 200 labelled outcomes");
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.lang] = (counts[row.lang] ?? 0) + 1;
  for (const [lang, count] of Object.entries(counts)) {
    if (count < 50) reasons.push("need at least 50 labelled outcomes for " + lang);
  }
  const auto = rows.filter((row) => row.confidence >= (schema.thresholds?.auto ?? 0.9) && row.margin >= (schema.thresholds?.minMargin ?? 0.25));
  const accuracy = auto.length ? auto.filter((row) => row.correct).length / auto.length : 0;
  if (!auto.length || accuracy < 0.97) reasons.push("auto-band accuracy must be at least 97%");
  const temperature = rows.length ? fitTemperature(toScores(rows)) : 1;
  const ece = rows.length ? expectedCalibrationError(toScores(rows), temperature) : 1;
  if (ece > 0.05) reasons.push("ECE after temperature fitting must be <= 0.05");
  if (rows.some((row) => row.level0Conflict)) reasons.push("Level-0 conflicts must be zero");
  if (admin?.role !== "admin") reasons.push("an admin must approve promotion");
  if (!admin?.reason || admin.reason.trim().length < 15) reasons.push("admin reason must be at least 15 characters");
  const clinical = schema.domain === "clinical" || schema.id.startsWith("clinical.");
  if (target === "AUTO" && clinical) reasons.push("clinical schemas cannot exceed ASSIST");
  return reasons;
}

export function promoteSchema(schema: DecisionSchema, rows: ShadowSample[], admin: { role?: string; reason?: string }): { ok: boolean; reasons: string[]; entry?: ApprovalDecision; mode?: ReflexMode } {
  const current = modeFor(schema.id, schema.defaultMode);
  const target: ReflexMode = current === "SHADOW" ? "ASSIST" : "AUTO";
  const reasons = promotionBlockers(schema, rows, admin, target);
  if (reasons.length) return { ok: false, reasons };
  setSchemaMode(schema, target);
  const previousHash = log.at(-1)?.entryHash ?? GENESIS_HASH;
  const base = {
    decisionId: "promo-" + schema.id + "-" + log.length,
    suggestionId: "schema-mode:" + schema.id,
    patientId: "none",
    kind: "other" as const,
    payload: { schemaId: schema.id, from: current, to: target },
    source: "reflex-shadow",
    createdAt: "2026-09-29T00:00:00.000Z",
    status: "APPROVED" as const,
    decision: "APPROVE_CASE_ONLY" as const,
    decidedBy: admin.role,
    decidedAt: "2026-09-29T00:00:00.000Z",
    reason: admin.reason!.trim(),
    learningWritten: false,
  };
  const entry: ApprovalDecision = { ...base, previousHash, entryHash: computeDecisionHash(previousHash, base) };
  log.push(entry);
  return { ok: true, reasons: [], entry, mode: target };
}

export function maybeDemote(schema: DecisionSchema, recent: ShadowSample[]): { demoted: boolean; mode: ReflexMode; alert?: string } {
  const current = modeFor(schema.id, schema.defaultMode);
  const window = recent.slice(-100);
  const accuracy = window.length ? window.filter((row) => row.correct).length / window.length : 1;
  const ece = window.length ? expectedCalibrationError(toScores(window)) : 0;
  const clinical = schema.domain === "clinical" || schema.id.startsWith("clinical.");
  if (current === "AUTO" && clinical) {
    setSchemaMode(schema, "ASSIST");
    return { demoted: true, mode: "ASSIST", alert: schema.id + " cannot stay on AUTO" };
  }
  if (window.length >= 100 && (accuracy < 0.94 || ece > 0.08) && current !== "SHADOW") {
    const next: ReflexMode = current === "AUTO" ? "ASSIST" : "SHADOW";
    setSchemaMode(schema, next);
    const alert = schema.id + " demoted to " + next;
    demotionAlerts.push(alert);
    return { demoted: true, mode: next, alert };
  }
  return { demoted: false, mode: current };
}

export function promotionLog(): ApprovalDecision[] {
  return log.slice();
}

export function _resetShadowForTest(): void {
  log.length = 0;
  demotionAlerts.length = 0;
}
