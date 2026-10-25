import crypto from "crypto";
import { hermesExecute } from "../../agents/hermesAdapter";
import { classifyPrivacy, type PrivacyClass } from "../../brain/privacy";
import { LocalModelUnavailableError, modelGatewayChat, readModelGatewayEnv, type ModelDataClass } from "../../ai/modelGateway";
import { beginTraceFor, endTraceFor, recordSpan } from "../../../src/astra/brain/part5/trace";
import { authorize, toolLevelToAuthority } from "../actionAuthority";
import { decide, type FabricDecisionResult } from "../decisionFabric";
import { CATALOG } from "../tools/catalog";
import { parsePlan, type Plan, type PlanStep } from "./planSchema";
import "./schemas";

export type PlanRunStatus = "planning" | "running" | "paused" | "cancelled" | "completed" | "failed" | "human_review";
export type PlanControl = "PAUSE" | "RESUME" | "CANCEL" | "STEER";

export interface PlannerContext {
  role?: string;
  hasPatientContext?: boolean;
  constraints?: string[];
  observeStep?: (step: PlanStep, run: PlanRun) => Promise<string> | string;
  executeStep?: (step: PlanStep, run: PlanRun) => Promise<string> | string;
  decide?: (schemaId: string, text: string, context?: Record<string, unknown>) => Promise<Pick<FabricDecisionResult, "answer" | "abstained" | "confidence" | "margin">>;
}

export interface PlanStepRecord {
  stepId: string;
  intent: string;
  status: "pending" | "done" | "skipped" | "blocked" | "human_review";
  observation?: string;
  delegateTo?: string;
}

export interface PlanRun {
  runId: string;
  goal: string;
  dataClass: PrivacyClass;
  status: PlanRunStatus;
  plan?: Plan;
  constraints: string[];
  steps: PlanStepRecord[];
  pending?: string;
  reason?: string;
  startedAt: number;
  updatedAt: number;
  cancelled: boolean;
}

const SECRET_VALUE = /freellmapi-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{8,}|\bpassword\s*=\s*[^\s&]+|\b(?:api[_-]?key|token|otp|secret)\s*[:=]\s*[^\s&]+/gi;
const IDENTIFIER = /\b(?:UHID|MRN|IP\s*no|bed)\s*[-:#]?\s*\d+\b/gi;
const MAX_WALL_MS = 3 * 60 * 1000;
const EXISTING_AGENTS = new Set(["Scientist", "Astra 7D", "Book skills", "Department Ops"]);

const runs = new Map<string, PlanRun>();

function scrub(text: string): string {
  return text.replace(SECRET_VALUE, "[redacted]").replace(IDENTIFIER, "[id]");
}

export function containsSecret(text: string): boolean {
  return SECRET_VALUE.test(text);
}

function resetSecretRegex(): void {
  SECRET_VALUE.lastIndex = 0;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const payload = fenced ?? trimmed;
  try {
    return JSON.parse(payload);
  } catch {
    const start = payload.indexOf("{");
    const end = payload.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(payload.slice(start, end + 1));
    throw new Error("invalid planner JSON");
  }
}

function promptFor(goal: string, dataClass: PrivacyClass, constraints: string[], retry = false): string {
  return [
    "Return only JSON matching Astra Hermes Plan schema.",
    "Hermes states requirements only. Do not name a provider, model, key, token, password, OTP, or secret.",
    "Use at most 12 steps. Browser hosts must be local Astra hosts only.",
    retry ? "Previous JSON was invalid. Correct it and return JSON only." : "",
    `dataClass: ${dataClass}`,
    constraints.length ? `constraints: ${constraints.map(scrub).join("; ")}` : "",
    `goal: ${scrub(goal)}`,
  ].filter(Boolean).join("\n");
}

function toGatewayClass(dataClass: PrivacyClass): ModelDataClass {
  if (dataClass === "HIGH-RISK CLINICAL") return "HIGH_RISK_CLINICAL";
  if (dataClass === "PHI" || dataClass === "CONFIDENTIAL") return "PHI";
  if (dataClass === "PUBLIC") return "PUBLIC";
  return "INTERNAL";
}

async function completePlanJson(goal: string, dataClass: PrivacyClass, ctx: PlannerContext, retry = false): Promise<string> {
  const prompt = promptFor(goal, dataClass, ctx.constraints ?? [], retry);
  if (dataClass === "PUBLIC" || dataClass === "INTERNAL") {
    const task = hermesExecute(prompt, "task", 120000);
    return task.stdout || task.stderr;
  }
  const env = readModelGatewayEnv();
  const localModel = env.localModel;
  if (!localModel) throw new LocalModelUnavailableError(`plan-${Date.now()}`, "restricted planning needs ASTRA_LLM_LOCAL_MODEL");
  const result = await modelGatewayChat({
    model: localModel,
    dataClass: toGatewayClass(dataClass),
    temperature: 0,
    max_tokens: 1800,
    messages: [{ role: "user", content: prompt }],
  });
  return result.text;
}

async function buildPlan(goal: string, dataClass: PrivacyClass, ctx: PlannerContext): Promise<Plan> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await completePlanJson(goal, dataClass, ctx, attempt > 0);
    try {
      const parsed = parsePlan(extractJson(text));
      if (parsed.dataClass !== dataClass) return { ...parsed, dataClass };
      return parsed;
    } catch (error) {
      if (attempt === 1) throw new Error("plan_invalid_json_fail_closed");
    }
  }
  throw new Error("plan_invalid_json_fail_closed");
}

async function gateStep(step: PlanStep, run: PlanRun, ctx: PlannerContext): Promise<"proceed" | "ask_human" | "stop" | "replan"> {
  const text = `${step.intent}\n${run.constraints.join("\n")}`;
  const choice = ctx.decide
    ? await ctx.decide("hermes.step_gate", text, { runId: run.runId, stepId: step.id })
    : await decide({ schemaId: "hermes.step_gate", input: text, context: { runId: run.runId, stepId: step.id } });
  if (choice.abstained || (choice.confidence ?? 1) < 0.65 || (choice.margin ?? 1) < 0.25) return "ask_human";
  if (choice.answer === "proceed" || choice.answer === "ask_human" || choice.answer === "stop" || choice.answer === "replan") return choice.answer;
  return "ask_human";
}

async function delegateFor(step: PlanStep, run: PlanRun, ctx: PlannerContext): Promise<{ delegateTo?: string; humanReview: boolean; parallelizable: boolean }> {
  if (step.delegateTo) return { delegateTo: step.delegateTo, humanReview: !EXISTING_AGENTS.has(step.delegateTo), parallelizable: false };
  const text = `${step.intent}\n${step.requirements.domain}`;
  const delegated = ctx.decide
    ? await ctx.decide("router.delegate_to", text, { runId: run.runId, stepId: step.id })
    : await decide({ schemaId: "router.delegate_to", input: text, context: { runId: run.runId, stepId: step.id } });
  if (delegated.abstained || delegated.answer === "human_review" || delegated.answer === "unknown") return { humanReview: false, parallelizable: false };
  if (delegated.answer === "none") return { humanReview: false, parallelizable: false };
  if (!EXISTING_AGENTS.has(delegated.answer)) return { delegateTo: delegated.answer, humanReview: true, parallelizable: false };
  const parallel = ctx.decide
    ? await ctx.decide("router.parallelizable", text, { runId: run.runId, stepId: step.id })
    : await decide({ schemaId: "router.parallelizable", input: text, context: { runId: run.runId, stepId: step.id } });
  return { delegateTo: delegated.answer, humanReview: false, parallelizable: parallel.answer === "yes" && !parallel.abstained };
}

function hashObservation(step: PlanStep, observation: string): string {
  return crypto.createHash("sha256").update(`${step.intent}\n${observation}`).digest("hex");
}

async function defaultExecute(step: PlanStep): Promise<string> {
  return `drafted:${step.id}`;
}

export async function plan(goal: string, ctx: PlannerContext = {}): Promise<PlanRun> {
  resetSecretRegex();
  const runId = `plan-${crypto.randomUUID?.() ?? crypto.randomBytes(8).toString("hex")}`;
  const dataClass = classifyPrivacy(goal, ctx.hasPatientContext);
  const run: PlanRun = {
    runId,
    goal: scrub(goal),
    dataClass,
    status: "planning",
    constraints: [...(ctx.constraints ?? [])].map(scrub),
    steps: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    cancelled: false,
  };
  runs.set(runId, run);
  beginTraceFor(runId);

  if (containsSecret(goal)) {
    run.status = "failed";
    run.reason = "secret_refused";
    recordSpan({ kind: "hermes", name: "plan refused", latencyMs: 0, ok: false, detail: "secret_refused", correlationId: runId });
    endTraceFor(runId);
    return run;
  }

  try {
    const built = await buildPlan(goal, dataClass, ctx);
    run.plan = built;
    run.steps = built.steps.map((step) => ({ stepId: step.id, intent: scrub(step.intent), status: "pending" }));
    run.status = "running";
    await executePlanRun(run, ctx);
    return run;
  } catch (error) {
    run.status = "failed";
    run.reason = error instanceof Error ? error.message : "planner_failed";
    recordSpan({ kind: "hermes", name: "plan failed", latencyMs: 0, ok: false, detail: run.reason, correlationId: runId });
    endTraceFor(runId);
    return run;
  }
}

export async function executePlanRun(run: PlanRun, ctx: PlannerContext = {}): Promise<PlanRun> {
  if (!run.plan) return run;
  const seen = new Map<string, number>();
  const role = ctx.role ?? "staff";
  const pendingParallel: Array<Promise<void>> = [];
  const flushParallel = async () => {
    await Promise.all(pendingParallel.splice(0, pendingParallel.length));
  };

  for (const step of run.plan.steps) {
    if (Date.now() - run.startedAt > MAX_WALL_MS) {
      run.status = "failed";
      run.reason = "wall_time_exceeded";
      break;
    }
    if (run.cancelled || run.status === "cancelled") break;
    if (run.status === "paused") break;

    const record = run.steps.find((item) => item.stepId === step.id);
    const gate = await gateStep(step, run, ctx);
    const catalogTool = step.toolFamily ? CATALOG.find((tool) => tool.family === step.toolFamily) : undefined;
    const auth = catalogTool
      ? toolLevelToAuthority(catalogTool.authorityLevel, role, run.dataClass, "SHADOW")
      : authorize({ action: step.intent, role, dataClass: run.dataClass, mode: "SHADOW" });
    if (gate === "ask_human" || !auth.allowed || step.needsApproval) {
      run.status = "human_review";
      run.pending = `step:${step.id}`;
      if (record) record.status = "human_review";
      break;
    }
    if (gate === "stop") {
      run.status = "completed";
      run.reason = "laya_stop";
      break;
    }
    if (gate === "replan") {
      run.status = "human_review";
      run.reason = "replan_requested";
      break;
    }

    const delegated = await delegateFor(step, run, ctx);
    if (delegated.humanReview) {
      run.status = "human_review";
      run.reason = "unknown_delegate";
      if (record) {
        record.status = "human_review";
        record.delegateTo = delegated.delegateTo;
      }
      break;
    }

    const runOne = async () => {
      const started = Date.now();
      const observation = await (ctx.observeStep ? ctx.observeStep(step, run) : (ctx.executeStep ?? defaultExecute)(step, run));
      const safeObservation = scrub(String(observation));
      const hash = hashObservation(step, safeObservation);
      const count = (seen.get(hash) ?? 0) + 1;
      seen.set(hash, count);
      if (count >= 3) {
        run.status = "failed";
        run.reason = "loop_detected";
      }
      if (record) {
        record.status = run.reason === "loop_detected" ? "blocked" : "done";
        record.observation = safeObservation.slice(0, 300);
        record.delegateTo = delegated.delegateTo;
      }
      recordSpan({ kind: "hermes", name: `step ${step.id}`, latencyMs: Date.now() - started, ok: run.reason !== "loop_detected", detail: safeObservation, correlationId: run.runId });
    };

    if (delegated.parallelizable) {
      pendingParallel.push(runOne());
      if (pendingParallel.length >= 3) await flushParallel();
    } else {
      await flushParallel();
      await runOne();
    }
    if (run.reason === "loop_detected") break;
    run.updatedAt = Date.now();
  }
  await flushParallel();
  if (run.cancelled) run.status = "cancelled";
  if (run.status === "running") run.status = "completed";
  run.updatedAt = Date.now();
  endTraceFor(run.runId);
  return run;
}

export function controlPlanRun(runId: string, control: { action: PlanControl; constraint?: string }): PlanRun | null {
  const run = runs.get(runId) ?? null;
  if (!run) return null;
  if (control.action === "PAUSE" && run.status === "running") run.status = "paused";
  if (control.action === "RESUME" && run.status === "paused") run.status = "running";
  if (control.action === "CANCEL") {
    run.cancelled = true;
    run.status = "cancelled";
  }
  if (control.action === "STEER" && control.constraint?.trim()) run.constraints.push(scrub(control.constraint.trim()));
  run.updatedAt = Date.now();
  return run;
}

export function getPlanRun(runId: string): PlanRun | null {
  return runs.get(runId) ?? null;
}

export function resetPlannerRunsForTests(): void {
  runs.clear();
}
