import { decideBatch } from "../reflex/decisionFabric";
import { realtimeHub } from "../events";
import type { BrainToolCard } from "./toolRegistry";
import { executeBrainTool } from "./toolRegistry";
import { advanceClinicalCase } from "./langGraphMaster";
import { assignWork, type CortexAssignment } from "./hermesCortex";
import { beginTraceFor, endTraceFor, recordSpan, type TraceSpan, type TraceTokens } from "../../src/astra/brain/part5/trace";
import { collectExistingAgentDrafts, type ExistingAgentDraft } from "../../src/agents/existingAgentDrafts";
import { doctorOrderStaysLocal } from "../ai/modelGateway";

export interface BrainFlowEvent {
  correlationId: string;
  stage: string;
  status: "started" | "completed" | "blocked" | "skipped";
  detail: string;
  at: string;
}

export interface BrainFlowResult {
  correlationId: string;
  assignment: CortexAssignment;
  trace: BrainFlowEvent[];
  toolResults: Array<{ toolId: string; ok: boolean; reason?: string; output?: unknown }>;
  /** Labeled drafts from agent modules that already existed but were not called. */
  agentDrafts: ExistingAgentDraft[];
  finalState: {
    caseId: string | null;
    stage: string | null;
    stoppedAt: string | null;
    approval: CortexAssignment["caseState"]["approval"] | null;
    completed: string[];
    missingInformation: string[];
  };
  /** Real measured spans this flow recorded under its correlation id. */
  flightTrace?: {
    request_id: string;
    latencyMs: number;
    model: string;
    tokens: TraceTokens | null;
    cost: null;
    spans: TraceSpan[];
  } | null;
}

function makeCorrelationId(): string {
  return `brain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function event(correlationId: string, stage: string, status: BrainFlowEvent["status"], detail: string): BrainFlowEvent {
  const entry = { correlationId, stage, status, detail, at: new Date().toISOString() };
  realtimeHub.broadcast({
    type: "ASTRA_BRAIN_EVENT",
    targetRoles: ["doctor", "admin", "ceo"],
    payload: entry,
  });
  return entry;
}

function runnableTools(tools: BrainToolCard[]): BrainToolCard[] {
  return tools.filter((tool) => tool.read_or_write === "read" && !tool.approval_required && tool.existing_tool_id);
}

export async function runAstraBrainFlow(input: {
  text: string;
  role: string;
  patientContext?: unknown;
  language?: string;
  correlationId?: string;
  executeReadTools?: boolean;
}): Promise<BrainFlowResult> {
  const correlationId = input.correlationId?.trim() || makeCorrelationId();
  const trace: BrainFlowEvent[] = [];
  const emit = (stage: string, status: BrainFlowEvent["status"], detail: string) => {
    trace.push(event(correlationId, stage, status, detail));
  };

  // The Flight Recorder follows this correlation id for the whole flow, so the
  // turn route, the tool registry and the graph share one reconstruction.
  const recorder = beginTraceFor(correlationId);
  emit("FLIGHT_RECORDER", "started", `Recorder open for ${recorder.request_id}.`);
  recordSpan({
    kind: "request",
    name: "brain flow request",
    latencyMs: 0,
    ok: true,
    detail: `Role ${input.role || "unknown"} accepted; language ${input.language ?? "en"}.`,
    correlationId,
  });

  emit("SAFETY_IDENTITY", "completed", `Role ${input.role || "unknown"} accepted for local brain flow.`);
  emit("LAYA", "started", "Fast bounded decision pack requested.");

  const layaStarted = Date.now();
  const fabric = await decideBatch({
    schemaIds: ["intent_routing", "possible_emergency_flag"],
    input: input.text,
    timeoutMs: process.env.VITEST ? 50 : undefined,
  });
  const fabricSource = fabric[0]?.source ?? "abstain";
  const assignment = await assignWork({
    text: input.text,
    role: input.role,
    patientContext: input.patientContext,
    language: input.language ?? "en",
    invoke7D: true,
    openCase: true,
  });
  recordSpan({
    kind: "laya",
    name: "Laya decision pack",
    latencyMs: Date.now() - layaStarted,
    ok: true,
    detail: `source=${fabricSource}; latencyMs=${fabric[0]?.trace.latencyMs ?? (Date.now() - layaStarted)}; Hermes=${assignment.decisions.needsHermes}; 7D=${assignment.decisions.needs7D}; localOnly=${assignment.decisions.localOnly}.`,
    correlationId,
  });

  emit("LAYA", "completed", `Hermes=${assignment.decisions.needsHermes}; 7D=${assignment.decisions.needs7D}; localOnly=${assignment.decisions.localOnly}.`);
  emit("CONTEXT_COMPILER", "completed", `${assignment.context.tools.length} relevant tool card(s), ${assignment.context.omittedToolCount} omitted.`);

  let caseState = assignment.caseState;
  if (caseState) {
    emit("LANGGRAPH", "started", `Master graph opened ${caseState.caseId}.`);
    const graphStarted = Date.now();
    while (caseState.approval.status !== "pending" && !caseState.stoppedAt && !caseState.completed.includes("OUTCOME")) {
      const next = advanceClinicalCase(caseState.caseId);
      if (next.completed.length === caseState.completed.length && next.stage === caseState.stage) break;
      caseState = next;
    }
    assignment.caseState = caseState;
    recordSpan({
      kind: "langgraph",
      name: "LangGraph master case",
      latencyMs: Date.now() - graphStarted,
      ok: caseState.approval.status !== "pending",
      detail: `${caseState.caseId}: ${caseState.completed.length} node(s) done, stage ${caseState.stage}.`,
      correlationId,
    });
    emit("LANGGRAPH", caseState.approval.status === "pending" ? "blocked" : "completed", caseState.stopReason ?? `Stage ${caseState.stage}.`);
  } else {
    recordSpan({
      kind: "langgraph",
      name: "LangGraph master case",
      latencyMs: 0,
      ok: true,
      detail: "Skipped: Laya did not require a clinical case graph.",
      correlationId,
    });
    emit("LANGGRAPH", "skipped", "Laya did not require a clinical case graph.");
  }

  recordSpan({
    kind: "hermes",
    name: "Hermes integration",
    latencyMs: 0,
    ok: true,
    detail: assignment.integrated,
    correlationId,
  });
  emit("HERMES", "completed", assignment.integrated);

  if (assignment.delegation) {
    emit("SPECIALIST_DISPATCHER", "completed", `Active specialists: ${assignment.delegation.active.join(", ")}.`);
  } else {
    emit("SPECIALIST_DISPATCHER", "skipped", "Hermes did not request specialists.");
  }

  if (assignment.sevenD) {
    recordSpan({
      kind: "sevenD",
      name: "Astra 7D engine",
      latencyMs: 0,
      ok: true,
      detail: "Existing D1-D7 engine returned structured state.",
      correlationId,
    });
    emit("ASTRA_7D", "completed", "Existing D1-D7 engine returned structured state.");
  } else {
    recordSpan({
      kind: "sevenD",
      name: "Astra 7D engine",
      latencyMs: 0,
      ok: true,
      detail: "Skipped: Laya did not request 7D.",
      correlationId,
    });
    emit("ASTRA_7D", "skipped", "Laya did not request 7D.");
  }

  const toolResults: BrainFlowResult["toolResults"] = [];
  if (input.executeReadTools === true) {
    for (const tool of runnableTools(assignment.context.tools)) {
      const toolStarted = Date.now();
      const result = await executeBrainTool(tool.tool_id, input.role, { caseId: caseState?.caseId });
      toolResults.push({ toolId: tool.tool_id, ...result });
      recordSpan({
        kind: "tool",
        name: tool.tool_id,
        latencyMs: Date.now() - toolStarted,
        ok: result.ok,
        detail: result.ok ? "Read tool executed inside the flow." : result.reason ?? "blocked",
        correlationId,
      });
      emit("TOOL_REGISTRY", result.ok ? "completed" : "blocked", `${tool.tool_id}: ${result.ok ? "executed" : result.reason}`);
    }
  } else {
    emit("TOOL_REGISTRY", "skipped", "Tool execution not requested; cards are ready for approval-aware execution.");
  }

  if (caseState?.approval.status === "pending") {
    recordSpan({
      kind: "approval",
      name: "clinical approval",
      latencyMs: 0,
      ok: false,
      detail: "Waiting for human approval; nothing was auto-applied.",
      correlationId,
    });
  }
  let agentDrafts: ExistingAgentDraft[] = [];
  try {
    const ctx = input.patientContext as { name?: string; patientName?: string; uhid?: string; note?: string; diagnosis?: string } | null | undefined;
    const staysLocal = doctorOrderStaysLocal({
      text: input.text ?? "",
      patientName: ctx?.patientName || ctx?.name || (input.patientContext ? "context" : undefined),
      uhid: typeof ctx?.uhid === "string" ? ctx.uhid : undefined,
      note: typeof ctx?.note === "string" ? ctx.note : undefined,
      diagnosis: typeof ctx?.diagnosis === "string" ? ctx.diagnosis : undefined,
    });
    agentDrafts = await collectExistingAgentDrafts(input.text, {
      allowExternalEvidence: !staysLocal,
    });
  } catch {
    agentDrafts = [];
  }
  emit(
    "EXISTING_AGENT_DRAFTS",
    agentDrafts.length ? "completed" : "skipped",
    agentDrafts.length
      ? `Labeled local drafts: ${agentDrafts.map((draft) => draft.agentId).join(", ")}.`
      : "No unused local agent matched this turn.",
  );

  const flightTrace = endTraceFor(correlationId);
  emit(
    "FLIGHT_RECORDER",
    "completed",
    `${flightTrace?.spans.length ?? 0} measured span(s) and ${trace.length + 1} event(s) under ${correlationId}.`,
  );

  return {
    correlationId,
    assignment,
    trace,
    toolResults,
    agentDrafts,
    flightTrace: flightTrace
      ? {
          request_id: flightTrace.request_id,
          latencyMs: flightTrace.latencyMs,
          model: flightTrace.model,
          tokens: flightTrace.tokens,
          cost: null,
          spans: flightTrace.spans,
        }
      : null,
    finalState: {
      caseId: caseState?.caseId ?? null,
      stage: caseState?.stage ?? null,
      stoppedAt: caseState?.stoppedAt ?? null,
      approval: caseState?.approval ?? null,
      completed: caseState?.completed ?? [],
      missingInformation: assignment.missingInformation,
    },
  };
}
