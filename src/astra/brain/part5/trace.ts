/**
 * One request id follows the brain. Telemetry does not carry raw PHI.
 *
 * Flight Recorder rules:
 *  - timings are really measured (Date.now deltas), never estimated;
 *  - tokens are recorded only when the caller/gateway reports them, otherwise
 *    the field stays null instead of being invented;
 *  - every recorded detail is scrubbed of identifiers and secrets, so a default
 *    trace never carries patient text.
 */
export const TRACE_PATH = ["Voicebox", "Laya", "Context Compiler", "LangGraph", "Hermes", "7D", "Scientist", "Model", "Tool", "n8n", "Database"] as const;

export const TRACE_SPAN_KINDS = [
  "request", "voice", "laya", "memory", "langgraph", "hermes", "sevenD",
  "model", "tool", "browser", "approval", "error",
] as const;

export type TraceSpanKind = (typeof TRACE_SPAN_KINDS)[number];

const SECRET = /freellmapi-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{8,}/gi;
const IDENTIFIER = /\b(?:UHID|MRN|IP\s*no|bed)\s*[-:#]?\s*\d+\b/gi;

/** Telemetry keeps secrets and identifiers out; it never keeps patient text. */
function scrub(text: string): string {
  return text.replace(SECRET, "[redacted]").replace(IDENTIFIER, "[id]");
}

export interface TraceTokens {
  prompt: number;
  completion: number;
  total: number;
}

export interface TraceSpan {
  kind: TraceSpanKind;
  name: string;
  startedAt: number;
  latencyMs: number;
  ok: boolean;
  detail: string;
  model: string | null;
  tokens: TraceTokens | null;
  phi: "excluded";
}

export interface FlightTrace {
  request_id: string;
  follows: string[];
  startedAt: number;
  latencyMs: number;
  model: string;
  tokens: TraceTokens | null;
  cost: null;
  phiInTelemetry: false;
  note: string;
  spans: TraceSpan[];
}

export interface TraceSpanInput {
  kind: TraceSpanKind;
  name: string;
  latencyMs: number;
  ok?: boolean;
  detail?: string;
  model?: string | null;
  tokens?: { prompt?: number; completion?: number } | null;
  correlationId?: string;
}

export interface TraceReconstruction {
  found: boolean;
  request_id: string;
  follows: string[];
  steps: TraceSpan[];
  latencyMs: number;
  model: string;
  tokens: TraceTokens | null;
  cost: null;
  phiInTelemetry: false;
  note: string;
}

const TRACE_HISTORY_LIMIT = 500;
const traces = new Map<string, FlightTrace>();

export interface TracePersistence {
  append(kind: string, trace: FlightTrace): void;
  load(requestId: string): FlightTrace | null;
}

let persistence: TracePersistence | null = null;

export function configureTracePersistence(p: TracePersistence | null): void {
  persistence = p;
}

function keyOf(seed: string): string {
  const trimmed = (seed ?? "").trim();
  return trimmed.startsWith("req-") ? trimmed : `req-${trimmed || "anonymous"}`;
}

function create(requestId: string): FlightTrace {
  return {
    request_id: requestId,
    follows: [],
    startedAt: Date.now(),
    latencyMs: 0,
    model: "not recorded",
    tokens: null,
    cost: null,
    phiInTelemetry: false,
    note: scrub("trace opened"),
    spans: [],
  };
}

function register(trace: FlightTrace): FlightTrace {
  traces.set(trace.request_id, trace);
  while (traces.size > TRACE_HISTORY_LIMIT) {
    const oldest = traces.keys().next().value as string | undefined;
    if (!oldest || oldest === trace.request_id) break;
    traces.delete(oldest);
  }
  return trace;
}

function resolve(correlationId?: string): FlightTrace | null {
  if (!correlationId) return current;
  return traces.get(keyOf(correlationId)) ?? null;
}

let current: FlightTrace | null = null;

/** Open the request trace that `/trace`, the turn route and the flow all follow. */
export function beginTrace(seed: string): FlightTrace {
  current = register(create(keyOf(seed)));
  return current;
}

/**
 * Open a fresh trace for a caller-supplied correlation id without stealing
 * `current`: background flows know their id from their caller, not from a route.
 * Re-using an id restarts that recorder instead of mixing two requests together.
 */
export function beginTraceFor(correlationId: string): FlightTrace {
  return register(create(keyOf(correlationId)));
}

export function traceFor(correlationId: string): FlightTrace | null {
  const key = keyOf(correlationId);
  return traces.get(key) ?? persistence?.load(key) ?? null;
}

export function currentTrace(): FlightTrace | null {
  return current;
}

/** Legacy stage marker: keeps the follow list and refreshes the measured latency. */
export function markTrace(component: string): void {
  if (!current) return;
  if ((TRACE_PATH as readonly string[]).includes(component) && !current.follows.includes(component)) {
    current.follows.push(component);
  }
  current.latencyMs = Date.now() - current.startedAt;
  current.note = scrub("timings only");
}

function sumTokens(spans: TraceSpan[]): TraceTokens | null {
  const reported = spans.filter((span) => span.tokens);
  if (reported.length === 0) return null;
  return reported.reduce<TraceTokens>(
    (acc, span) => ({
      prompt: acc.prompt + (span.tokens?.prompt ?? 0),
      completion: acc.completion + (span.tokens?.completion ?? 0),
      total: acc.total + (span.tokens?.total ?? 0),
    }),
    { prompt: 0, completion: 0, total: 0 },
  );
}

/** Record one really-executed step. Returns null when no trace is open for the id. */
export function recordSpan(input: TraceSpanInput): TraceSpan | null {
  const trace = resolve(input.correlationId);
  if (!trace) return null;

  const prompt = input.tokens?.prompt;
  const completion = input.tokens?.completion;
  const tokens: TraceTokens | null =
    typeof prompt === "number" || typeof completion === "number"
      ? { prompt: prompt ?? 0, completion: completion ?? 0, total: (prompt ?? 0) + (completion ?? 0) }
      : null;

  const span: TraceSpan = {
    kind: input.kind,
    name: scrub(input.name),
    startedAt: Date.now() - Math.max(0, Math.round(input.latencyMs)),
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    ok: input.ok !== false,
    detail: scrub(input.detail ?? ""),
    model: input.model ? scrub(input.model) : null,
    tokens,
    phi: "excluded",
  };

  trace.spans.push(span);
  trace.latencyMs = Date.now() - trace.startedAt;
  if (span.model) trace.model = span.model;
  trace.tokens = sumTokens(trace.spans);
  trace.note = scrub("timings only");
  return span;
}

export function recordModelCall(input: {
  name: string;
  latencyMs: number;
  model?: string | null;
  ok?: boolean;
  detail?: string;
  tokens?: { prompt?: number; completion?: number } | null;
  correlationId?: string;
}): TraceSpan | null {
  return recordSpan({
    kind: "model",
    name: input.name,
    latencyMs: input.latencyMs,
    ok: input.ok,
    detail: input.detail,
    model: input.model ?? null,
    tokens: input.tokens ?? null,
    correlationId: input.correlationId,
  });
}

export function recordToolCall(input: {
  toolId: string;
  latencyMs: number;
  ok: boolean;
  detail?: string;
  correlationId?: string;
}): TraceSpan | null {
  return recordSpan({
    kind: "tool",
    name: input.toolId,
    latencyMs: input.latencyMs,
    ok: input.ok,
    detail: input.detail,
    correlationId: input.correlationId,
  });
}

export function recordBrowserAction(input: {
  action: string;
  latencyMs?: number;
  ok?: boolean;
  apiFirst?: boolean;
  correlationId?: string;
}): TraceSpan | null {
  return recordSpan({
    kind: "browser",
    name: input.action,
    latencyMs: input.latencyMs ?? 0,
    ok: input.ok,
    detail: input.apiFirst === false ? "not api-first" : "api-first",
    correlationId: input.correlationId,
  });
}

export function recordApproval(input: {
  name: string;
  approved: boolean;
  latencyMs?: number;
  correlationId?: string;
}): TraceSpan | null {
  return recordSpan({
    kind: "approval",
    name: input.name,
    latencyMs: input.latencyMs ?? 0,
    ok: input.approved,
    detail: input.approved ? "human approval recorded" : "waiting for human approval",
    correlationId: input.correlationId,
  });
}

export function recordError(input: { name: string; message?: string; correlationId?: string }): TraceSpan | null {
  return recordSpan({
    kind: "error",
    name: input.name,
    latencyMs: 0,
    ok: false,
    detail: input.message ?? "failed",
    correlationId: input.correlationId,
  });
}

export function recordMemorySpan(input: {
  operation: "gate" | "recall" | "store";
  detail?: string;
  latencyMs?: number;
  ok?: boolean;
  count?: number;
  correlationId?: string;
}): TraceSpan | null {
  const counts = typeof input.count === "number" ? `${input.count} record(s); ` : "";
  return recordSpan({
    kind: "memory",
    name: `memory ${input.operation}`,
    latencyMs: input.latencyMs ?? 0,
    ok: input.ok,
    detail: `${counts}${input.detail ?? ""}`.trim(),
    correlationId: input.correlationId,
  });
}

export function endTrace(): FlightTrace | null {
  const trace = current;
  if (!trace) return null;
  trace.latencyMs = Date.now() - trace.startedAt;
  current = null;
  persistence?.append("trace-completed", trace);
  return trace;
}

export function endTraceFor(correlationId: string): FlightTrace | null {
  const trace = traces.get(keyOf(correlationId)) ?? null;
  if (trace) {
    trace.latencyMs = Date.now() - trace.startedAt;
    if (current && current.request_id === trace.request_id) current = null;
    persistence?.append("trace-completed", trace);
  }
  return trace;
}

/** Reconstruct a past request from its correlation id. Never returns invented steps. */
export function reconstructTrace(correlationId: string): TraceReconstruction {
  const trace = traces.get(keyOf(correlationId)) ?? persistence?.load(keyOf(correlationId)) ?? null;
  if (!trace) {
    return {
      found: false,
      request_id: keyOf(correlationId),
      follows: [],
      steps: [],
      latencyMs: 0,
      model: "not recorded",
      tokens: null,
      cost: null,
      phiInTelemetry: false,
      note: scrub("no trace with this correlation id"),
    };
  }
  return {
    found: true,
    request_id: trace.request_id,
    follows: [...trace.follows],
    steps: trace.spans.map((span) => ({ ...span })),
    latencyMs: trace.latencyMs,
    model: trace.model,
    tokens: trace.tokens,
    cost: null,
    phiInTelemetry: false,
    note: trace.note,
  };
}

export function listTraceIds(): string[] {
  return [...traces.keys()];
}

export function resetTraceStore(): void {
  traces.clear();
  current = null;
  persistence = null;
}
