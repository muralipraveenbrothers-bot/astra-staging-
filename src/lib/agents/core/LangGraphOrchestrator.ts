/**
 * LANGGRAPH ORCHESTRATOR
 * Level 0 Platform Intelligence Service.
 *
 * Authoritative workflow and orchestration engine (IN-PROCESS CORE — never a
 * separate server/brain). Implements a bounded DAG engine:
 *   graph creation · node execution · edges · state · execution IDs · status ·
 *   errors · retries · cancellation · checkpoints · human-approval gates.
 *
 * Backward-compatible legacy API preserved: startWorkflow / routeToAgent /
 * completeWorkflow (used by CommandCore flow and tests).
 */

import { modelRouter } from "./ModelRouter";
import { invokeOfficialGraph, resumeOfficialGraph, OFFICIAL_LANGGRAPH } from "./officialLangGraph";

export interface WorkflowState {
  workflowId: string;
  status: "RUNNING" | "PAUSED_FOR_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  activeAgents: string[];
  context: any;
}

/** Real orchestration layer types (Phase 8 minimums). */
export type NodeHandler = (state: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>;

export interface GraphNode {
  id: string;
  name: string;
  handler?: NodeHandler;
  /** "approval" nodes pause the workflow until approveWorkflowResume() is called. */
  kind?: "task" | "approval" | "router" | "validation";
  retriesLeft?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphDefinition {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  entry: string;
  description?: string;
}

export interface ExecutionStep {
  nodeId: string;
  status: "PENDING" | "RUNNING" | "DONE" | "SKIPPED" | "ERROR" | "AWAITING_APPROVAL";
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

export interface GraphExecution {
  executionId: string;
  graphId: string;
  graphName: string;
  status: "RUNNING" | "PAUSED_FOR_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
  currentNode: string | null;
  steps: ExecutionStep[];
  state: Record<string, any>;
  checkpoint: Record<string, any> | null;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export class LangGraphOrchestrator {
  private agentId = "core-langgraph";
  private activeWorkflows: Map<string, WorkflowState> = new Map();
  private graphs: Map<string, GraphDefinition> = new Map();
  private executions: Map<string, GraphExecution> = new Map();
  private cancelRequested: Set<string> = new Set();
  private maxHistory = 100;

  constructor() {
    this.registerBuiltInTestGraphs();
  }

  // ── Legacy API (preserved for CommandCore + tests) ──────────────────────────
  public startWorkflow(workflowId: string, initialContext: any): WorkflowState {
    const state: WorkflowState = {
      workflowId,
      status: "RUNNING",
      activeAgents: [],
      context: initialContext
    };
    this.activeWorkflows.set(workflowId, state);
    console.log(`[LangGraph] Workflow ${workflowId} started.`);
    return state;
  }

  public routeToAgent(workflowId: string, agentId: string): void {
    const state = this.activeWorkflows.get(workflowId);
    if (!state) throw new Error("Workflow not found");

    state.activeAgents.push(agentId);
    console.log(`[LangGraph] Workflow ${workflowId} routing to ${agentId}`);
  }

  public completeWorkflow(workflowId: string): void {
    const state = this.activeWorkflows.get(workflowId);
    if (state) {
      state.status = "COMPLETED";
      console.log(`[LangGraph] Workflow ${workflowId} completed.`);
    }
  }

  // ── Graph registry ──────────────────────────────────────────────────────────
  public registerGraph(graph: GraphDefinition): void {
    const ids = new Set(graph.nodes.map((n) => n.id));
    if (!ids.has(graph.entry)) throw new Error(`Entry node '${graph.entry}' not in graph`);
    for (const e of graph.edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`Edge ${e.from}->${e.to} references unknown node`);
    }
    this.graphs.set(graph.id, graph);
  }

  public listGraphs(): GraphDefinition[] {
    return [...this.graphs.values()];
  }

  public getGraph(graphId: string): GraphDefinition | undefined {
    return this.graphs.get(graphId);
  }

  /** Model-router integration point (Astra remains the control plane). */
  public routeModel(complexity: "LOW" | "MEDIUM" | "HIGH", medical = false) {
    return modelRouter.selectModel({ taskComplexity: complexity, requiresVision: false, requiresVoice: false, medicalSpecialty: medical });
  }

  // ── Execution ───────────────────────────────────────────────────────────────
  public async runGraph(graphId: string, initialState: Record<string, any> = {}): Promise<GraphExecution> {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph '${graphId}' not registered`);

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const execution: GraphExecution = {
      executionId,
      graphId: graph.id,
      graphName: graph.name,
      status: "RUNNING",
      currentNode: graph.entry,
      steps: graph.nodes.map((n) => ({ nodeId: n.id, status: "PENDING" })),
      state: { ...initialState },
      checkpoint: null,
      startedAt: Date.now(),
    };
    this.executions.set(executionId, execution);
    this.trimHistory();
    void this.runOfficial(execution, graph);
    return execution;
  }

  /** Official @langchain/langgraph execution; falls back to the in-process DAG if invoke fails to boot. */
  private async runOfficial(execution: GraphExecution, graph: GraphDefinition): Promise<void> {
    execution.state = { ...execution.state, langgraphPackage: OFFICIAL_LANGGRAPH.package, langgraphVersion: OFFICIAL_LANGGRAPH.version };
    try {
      const result = await invokeOfficialGraph(graph, execution.executionId, execution.state);
      execution.state = { ...execution.state, ...result.state };
      if (result.status === "PAUSED_FOR_APPROVAL") {
        const gate = result.lastNode ?? graph.nodes.find((n) => n.kind === "approval")?.id;
        if (gate) {
          const step = execution.steps.find((s) => s.nodeId === gate);
          if (step) {
            step.status = "AWAITING_APPROVAL";
            step.startedAt = Date.now();
          }
          execution.currentNode = gate;
        }
        execution.status = "PAUSED_FOR_APPROVAL";
        execution.checkpoint = { ...execution.state };
        return;
      }
      if (result.status === "FAILED") {
        execution.status = "FAILED";
        execution.error = result.error;
        execution.finishedAt = Date.now();
        return;
      }
      for (const step of execution.steps) {
        if (step.status !== "AWAITING_APPROVAL") {
          step.status = "DONE";
          step.finishedAt = Date.now();
        }
      }
      execution.status = "COMPLETED";
      execution.currentNode = null;
      execution.finishedAt = Date.now();
      execution.checkpoint = { ...execution.state };
    } catch (err: any) {
      console.warn("[LangGraph] official runtime error, falling back to in-process DAG:", err?.message ?? err);
      await this.advance(execution, graph);
    }
  }

  private async advance(execution: GraphExecution, graph: GraphDefinition): Promise<void> {
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    try {
      let current: string | null = execution.currentNode;
      while (current) {
        if (this.cancelRequested.has(execution.executionId)) {
          this.cancelRequested.delete(execution.executionId);
          execution.status = "CANCELLED";
          execution.finishedAt = Date.now();
          execution.checkpoint = { ...execution.state, pausedAt: current };
          console.log(`[LangGraph] ${execution.executionId} cancelled at ${current}`);
          return;
        }
        const step = execution.steps.find((s) => s.nodeId === current)!;
        const node = nodeMap.get(current)!;
        step.status = "RUNNING";
        step.startedAt = Date.now();
        execution.currentNode = current;

        if (node.kind === "approval") {
          step.status = "AWAITING_APPROVAL";
          execution.status = "PAUSED_FOR_APPROVAL";
          execution.checkpoint = { ...execution.state, pausedAt: current };
          console.log(`[LangGraph] ${execution.executionId} paused for approval at ${current}`);
          return; // resumed via approveWorkflowResume()
        }

        const handler =
          node.handler ??
          (async (state) => ({ ...state, [`${node.id}_done`]: true, processedAt: new Date().toISOString() }));
        const output = await handler(execution.state);
        execution.state = { ...execution.state, ...output };
        step.status = "DONE";
        step.finishedAt = Date.now();

        const nextEdge = graph.edges.find((e) => e.from === current);
        current = nextEdge ? nextEdge.to : null;
        execution.currentNode = current;
      }
      execution.status = "COMPLETED";
      execution.finishedAt = Date.now();
      execution.checkpoint = { ...execution.state };
      console.log(`[LangGraph] ${execution.executionId} completed`);
    } catch (e: any) {
      const step = execution.steps.find((s) => s.nodeId === execution.currentNode);
      const node = nodeMap.get(execution.currentNode ?? "");
      const retries = node?.retriesLeft ?? 0;
      if (step && retries > 0) {
        node!.retriesLeft = retries - 1;
        step.status = "PENDING";
        step.error = String(e?.message ?? e);
        console.warn(`[LangGraph] ${execution.executionId} retrying ${step.nodeId} (${retries - 1} left)`);
        await new Promise((r) => setTimeout(r, 200));
        return this.advance(execution, graph);
      }
      if (step) {
        step.status = "ERROR";
        step.error = String(e?.message ?? e);
        step.finishedAt = Date.now();
      }
      execution.status = "FAILED";
      execution.error = String(e?.message ?? e);
      execution.finishedAt = Date.now();
      execution.checkpoint = { ...execution.state, failedAt: execution.currentNode };
      console.error(`[LangGraph] ${execution.executionId} failed: ${execution.error}`);
    }
  }

  public async approveWorkflowResume(executionId: string, approvedBy = "human"): Promise<GraphExecution | undefined> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== "PAUSED_FOR_APPROVAL") return undefined;
    const graph = this.graphs.get(execution.graphId)!;
    const step = execution.steps.find((s) => s.status === "AWAITING_APPROVAL");
    if (step) {
      step.status = "DONE";
      step.finishedAt = Date.now();
    }
    execution.state = { ...execution.state, approvedBy, approvedAt: new Date().toISOString() };
    execution.status = "RUNNING";
    void (async () => {
      try {
        const result = await resumeOfficialGraph(graph, execution.executionId, { approvedBy });
        execution.state = { ...execution.state, ...result.state };
        if (result.status === "COMPLETED") {
          for (const s of execution.steps) {
            if (s.status === "AWAITING_APPROVAL" || s.status === "PENDING" || s.status === "RUNNING") {
              s.status = "DONE";
              s.finishedAt = Date.now();
            }
          }
          execution.status = "COMPLETED";
          execution.currentNode = null;
          execution.finishedAt = Date.now();
          execution.checkpoint = { ...execution.state };
          return;
        }
        if (result.status === "FAILED") {
          execution.status = "FAILED";
          execution.error = result.error;
          execution.finishedAt = Date.now();
          return;
        }
        execution.status = "PAUSED_FOR_APPROVAL";
      } catch {
        const edge = graph.edges.find((e) => e.from === execution.currentNode);
        execution.currentNode = edge ? edge.to : null;
        await this.advance(execution, graph);
      }
    })();
    return execution;
  }

  public cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution) return false;
    if (execution.status === "RUNNING") {
      this.cancelRequested.add(executionId);
      return true;
    }
    if (execution.status === "PAUSED_FOR_APPROVAL") {
      execution.status = "CANCELLED";
      execution.finishedAt = Date.now();
      return true;
    }
    return false;
  }

  public retryExecution(executionId: string): Promise<GraphExecution | undefined> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== "FAILED") return Promise.resolve(undefined);
    const graph = this.graphs.get(execution.graphId)!;
    const failedStep = execution.steps.find((s) => s.status === "ERROR");
    if (failedStep) failedStep.status = "PENDING";
    execution.status = "RUNNING";
    execution.error = undefined;
    execution.currentNode = failedStep?.nodeId ?? graph.entry;
    void this.advance(execution, graph);
    return Promise.resolve(execution);
  }

  public getExecution(executionId: string): GraphExecution | undefined {
    return this.executions.get(executionId);
  }

  public listExecutions(): GraphExecution[] {
    return [...this.executions.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  public getHistory(limit = 20): GraphExecution[] {
    return this.listExecutions().slice(0, limit);
  }

  private trimHistory(): void {
    const all = this.listExecutions();
    for (const e of all.slice(this.maxHistory)) this.executions.delete(e.executionId);
  }

  /**
   * Built-in HARMLESS integration-test graphs (Phase 10). Never connected to
   * clinical/hospital actions — the executor is a pure data transform.
   */
  private registerBuiltInTestGraphs(): void {
    this.registerGraph({
      id: "test-basic",
      name: "Integration Test — Basic Pipeline",
      description: "START → Planner → Model Router → Result Validation → END (harmless test)",
      entry: "planner",
      nodes: [
        { id: "planner", name: "Planner", kind: "task" },
        {
          id: "model_router",
          name: "Model Router",
          kind: "router",
          handler: async (state) => ({ ...state, modelTier: this.routeModel("LOW") }),
        },
        {
          id: "validation",
          name: "Result Validation",
          kind: "validation",
          handler: async (state) => {
            if (!state.modelTier) throw new Error("Model Router produced no tier");
            return { ...state, validated: true };
          },
        },
      ],
      edges: [
        { from: "planner", to: "model_router" },
        { from: "model_router", to: "validation" },
      ],
    });

    this.registerGraph({
      id: "test-approval",
      name: "Integration Test — Human Approval Gate",
      description: "START → Planner → Human Approval Gate → Executor → END (harmless test)",
      entry: "planner",
      nodes: [
        { id: "planner", name: "Planner", kind: "task" },
        { id: "approval_gate", name: "Human Approval Gate", kind: "approval" },
        {
          id: "executor",
          name: "Harmless Test Executor",
          kind: "task",
          handler: async (state) => ({ ...state, executed: true, executedAt: new Date().toISOString() }),
        },
      ],
      edges: [
        { from: "planner", to: "approval_gate" },
        { from: "approval_gate", to: "executor" },
      ],
    });
  }
}

export const langGraph = new LangGraphOrchestrator();

