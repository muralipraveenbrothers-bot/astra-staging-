import crypto from "crypto";
import path from "path";
import { decidePackSync } from "../brain/layaDecisionApi";
import { astraDataRoot } from "../services/env";
import { LAYA_HOST, LAYA_PORT } from "../services/layaService";
import { open } from "../persistence/durableJsonl";
import { detectLanguage, pickCheckpoint } from "./language";
import { buildState, type StateInput } from "./stateBuilder";
import { contentHash, get } from "./schema/registry";
import "./schema/builtin";
import type { DecisionSchema } from "./schema/types";

const SCORE_MEANING = "routing_confidence_not_clinical_probability";
const cache = new Map<string, { expires: number; result: FabricDecisionResult }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

export interface FabricDecisionResult {
  schemaId: string;
  version: number;
  schemaHash: string;
  answer: string;
  confidence: number;
  margin: number;
  alternatives: Array<{ key: string; p: number }>;
  scores: Record<string, number>;
  abstained: boolean;
  source: "laya" | "rules" | "abstain";
  scoreMeaning: typeof SCORE_MEANING;
  policy: null;
  trace: {
    decisionId: string;
    layaVersion?: string;
    checkpoint: "english" | "multilingual";
    lang: ReturnType<typeof detectLanguage>["lang"];
    latencyMs: number;
    cacheHit: boolean;
  };
}

export interface Recorder {
  record(event: Record<string, unknown>): void | Promise<void>;
}

let recorder: Recorder = { record: () => undefined };

export function setReflexRecorder(next: Recorder): void {
  recorder = next;
}

const stream = () => open("reflex-decisions", path.join(astraDataRoot(), "reflex"));

function decisionId(): string {
  return crypto.randomUUID?.() ?? crypto.randomBytes(16).toString("hex");
}

function asLayaQuestion(schema: DecisionSchema): Record<string, unknown> {
  if (schema.kind === "choice") {
    return { type: "choice", instructions: schema.question, criteria: Object.fromEntries((schema.options ?? []).map((o) => [o.key, o.description ?? o.label])) };
  }
  if (schema.kind === "score") return { type: "score", instructions: schema.question, criteria: schema.levels ?? [] };
  return { type: "noul", instructions: schema.question };
}

function normalizeScores(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function fromLaya(schema: DecisionSchema, schemaHash: string, raw: any, trace: FabricDecisionResult["trace"]): FabricDecisionResult {
  const scores = normalizeScores(raw?.scores ?? raw?.probabilities);
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const answer = String(raw?.answer ?? raw?.choice ?? sorted[0]?.[0] ?? schema.abstainKeys[0] ?? "unknown");
  const confidence = Number(raw?.confidence ?? sorted[0]?.[1] ?? raw?.score ?? raw?.noul ?? 0);
  const margin = sorted.length > 1 ? Number((sorted[0][1] - sorted[1][1]).toFixed(6)) : confidence;
  const alternatives = sorted.filter(([key]) => key !== answer).slice(0, 3).map(([key, p]) => ({ key, p }));
  const abstained = Boolean(raw?.abstained) || schema.abstainKeys.includes(answer) || confidence < schema.thresholds.assist || margin < schema.thresholds.minMargin;
  return { schemaId: schema.id, version: schema.version, schemaHash, answer, confidence, margin, alternatives, scores, abstained, source: "laya", scoreMeaning: SCORE_MEANING, policy: null, trace };
}

function fallback(schema: DecisionSchema, schemaHash: string, text: string, trace: FabricDecisionResult["trace"], source: "rules" | "abstain", role = "doctor"): FabricDecisionResult {
  const pack = source === "rules" ? decidePackSync(text, role) : undefined;
  const matched = pack?.decisions.find((d) => d.task === schema.id || d.task === schema.id.replace(/_routing|_classification|_flag/g, ""));
  const answer = String(matched?.choice ?? (matched?.verdict === "YES" ? "yes" : matched?.verdict === "NO" ? "no" : schema.abstainKeys[0] ?? "unknown"));
  const confidence = matched?.score ?? 0;
  return { schemaId: schema.id, version: schema.version, schemaHash, answer, confidence, margin: confidence, alternatives: [], scores: {}, abstained: source === "abstain" || schema.abstainKeys.includes(answer) || confidence === 0, source, scoreMeaning: SCORE_MEANING, policy: null, trace };
}

function remember(key: string, result: FabricDecisionResult): void {
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, result });
  const oldest = cache.keys().next().value;
  if (cache.size > CACHE_MAX && oldest) cache.delete(oldest);
}

async function recordCall(result: FabricDecisionResult, stateHash: string): Promise<void> {
  const event = { decisionId: result.trace.decisionId, schemaId: result.schemaId, version: result.version, schemaHash: result.schemaHash, stateHash, source: result.source, answer: result.answer, confidence: result.confidence, abstained: result.abstained, checkpoint: result.trace.checkpoint, lang: result.trace.lang, latencyMs: result.trace.latencyMs, scoreMeaning: result.scoreMeaning };
  try {
    if (!process.env.VITEST) stream().append("decision", event);
  } catch { /* logging never fails the caller */ }
  try { await recorder.record(event); } catch { /* recorder hook is best-effort */ }
}

export async function decide(args: { schemaId: string; input: StateInput; context?: Record<string, unknown>; timeoutMs?: number }): Promise<FabricDecisionResult> {
  const [result] = await decideBatch({ schemaIds: [args.schemaId], input: args.input, context: args.context, timeoutMs: args.timeoutMs });
  return result;
}

function abstainFor(schemaId: string, checkpoint: "english" | "multilingual" = "english"): FabricDecisionResult {
  return {
    schemaId, version: 0, schemaHash: "", answer: "unknown", confidence: 0, margin: 0,
    alternatives: [], scores: {}, abstained: true, source: "abstain", scoreMeaning: SCORE_MEANING, policy: null,
    trace: { decisionId: decisionId(), checkpoint, lang: "en", latencyMs: 0, cacheHit: false },
  };
}


function overlayBrowserOptions(schema: DecisionSchema, context?: Record<string, unknown>): DecisionSchema {
  if (schema.id !== "browser.next_action" || !Array.isArray(context?.options)) return schema;
  const keys = context.options.filter((item): item is string => typeof item === "string").slice(0, 34);
  const abstain = (schema.options ?? []).filter((option) => schema.abstainKeys.includes(option.key));
  const generated = keys
    .filter((key) => !schema.abstainKeys.includes(key))
    .map((key) => ({ key, label: key, description: "bounded action chosen from the current page" }));
  const options = [...generated, ...abstain].slice(0, 40);
  return options.length >= 2 ? { ...schema, options } : schema;
}

export async function decideBatch(args: { schemaIds: string[]; input: StateInput; context?: Record<string, unknown>; timeoutMs?: number }): Promise<FabricDecisionResult[]> {
  const schemas = args.schemaIds.map((id) => get(id)).filter((schema): schema is DecisionSchema => Boolean(schema));
  const missing = args.schemaIds.filter((id) => !get(id)).map((id) => abstainFor(id));
  if (!schemas.length) return missing.length ? missing : [abstainFor("unknown")];
  const firstState = buildState(args.input, schemas[0]);
  const detection = detectLanguage(firstState.state);
  const checkpoint = pickCheckpoint(detection);
  const timeoutMs = args.timeoutMs ?? Number(process.env.ASTRA_REFLEX_TIMEOUT_MS ?? 1500);
  const now = Date.now();
  const prepared = schemas.map((schema) => {
    const built = buildState(args.input, schema);
    const schemaHash = contentHash(schema);
    const key = `${schemaHash}:${built.stateHash}:${checkpoint}`;
    const cached = cache.get(key);
    if (cached && cached.expires > now) return { schema, built, schemaHash, key, cached: { ...cached.result, trace: { ...cached.result.trace, cacheHit: true, latencyMs: 0 } } };
    return { schema, built, schemaHash, key };
  });
  if (prepared.every((item) => item.cached)) {
    const results = prepared.map((item) => item.cached!);
    await Promise.all(results.map((r, i) => recordCall(r, prepared[i].built.stateHash)));
    return [...results, ...missing];
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { state: firstState.state, checkpoint, schemas: prepared.map(({ schema }) => { const view = overlayBrowserOptions(schema, args.context); return { id: view.id, version: view.version, kind: view.kind, question: view.question, options: view.options, levels: view.levels }; }) };
    const response = await fetch(`http://${LAYA_HOST}:${LAYA_PORT}/v1/decide_batch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = await response.json() as { results?: any[]; version?: string };
    const byId = new Map((parsed.results ?? []).map((r) => [r.schemaId ?? r.id, r]));
    const results = prepared.map(({ schema, schemaHash, key }) => {
      const trace = { decisionId: decisionId(), layaVersion: parsed.version, checkpoint, lang: detection.lang, latencyMs: Date.now() - started, cacheHit: false };
      const result = fromLaya(schema, schemaHash, byId.get(schema.id), trace);
      remember(key, result);
      return result;
    });
    await Promise.all(results.map((r, i) => recordCall(r, prepared[i].built.stateHash)));
    return [...results, ...missing];
  } catch {
    clearTimeout(timer);
    const results = prepared.map(({ schema, built, schemaHash }) => {
      const trace = { decisionId: decisionId(), checkpoint, lang: detection.lang, latencyMs: Date.now() - started, cacheHit: false };
      const rules = fallback(schema, schemaHash, built.state, trace, "rules");
      const usable = rules.source === "rules" && !schema.abstainKeys.includes(rules.answer) && rules.confidence > 0;
      return usable ? rules : fallback(schema, schemaHash, built.state, trace, "abstain");
    });
    await Promise.all(results.map((r, i) => recordCall(r, prepared[i].built.stateHash)));
    return [...results, ...missing];
  }
}

export function clearDecisionCacheForTests(): void {
  cache.clear();
}
export function clearDecisionRequestCache(): void { cache.clear(); }
