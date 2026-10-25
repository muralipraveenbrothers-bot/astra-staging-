/**
 * Astra command center → worker dispatch.
 *
 * Does not replace HospitalCommandEngine (mutations) or invent worker APIs.
 * Inference goes through the Central AI Adapter.
 */
import { aiGatewayConfig } from "./config";
import { centralAiChat, chatText } from "./centralCore";
import { hermesExecute, hermesHealth } from "../agents/hermesAdapter";
import { agentOrchestrator } from "../langgraph";
import type { UserSession } from "../types";

export type WorkerId =
  | "inference"
  | "hermes"
  | "langgraph"
  | "paperclip"
  | "openclaw"
  | "n8n";

export interface WorkerSpec {
  id: WorkerId;
  name: string;
  role: string;
  kind: "INFERENCE_GATEWAY" | "WORKER" | "EXTERNAL_CLOUD";
  throughAdapter: boolean;
  portPreserved: boolean;
}

export const WORKERS: WorkerSpec[] = [
  { id: "inference", name: "FreeLLMAPI chain", role: "PRIMARY LLM GATEWAY (+ OmniRoute fallback + Ollama local)", kind: "INFERENCE_GATEWAY", throughAdapter: true, portPreserved: true },
  { id: "hermes", name: "Hermes", role: "PLANNING/REASONING WORKER", kind: "WORKER", throughAdapter: true, portPreserved: true },
  { id: "langgraph", name: "LangGraph", role: "WORKFLOW ORCHESTRATOR", kind: "WORKER", throughAdapter: true, portPreserved: true },
  { id: "paperclip", name: "Paperclip", role: "TASK/AGENT EXECUTION", kind: "WORKER", throughAdapter: true, portPreserved: true },
  { id: "openclaw", name: "OpenClaw", role: "TOOL/AGENT EXECUTION", kind: "WORKER", throughAdapter: true, portPreserved: true },
  { id: "n8n", name: "n8n", role: "AUTOMATION BUS (existing, not removed)", kind: "WORKER", throughAdapter: true, portPreserved: true },
].filter((worker) => !["paperclip", "openclaw", "n8n"].includes(worker.id)) as WorkerSpec[];

const MUTATION =
  /\b(admit|discharge|prescribe|order (lab|cbc|mri|ct)|post bill|delete patient|cancel surgery|administer)\b/i;

export function classifyWorker(input: string, explicit?: string): WorkerId {
  const e = (explicit ?? "").toLowerCase().trim();
  // Retired external workers hand workflow execution to the existing bounded graph.
  if (["paperclip", "openclaw", "n8n", "agentzero", "openhands"].includes(e)) return "langgraph";
  if (WORKERS.some((w) => w.id === e)) return e as WorkerId;
  const q = input.toLowerCase();
  if (/\b(paperclip|openclaw|n8n|agentzero|agent zero|openhands|webhook|automation)\b/.test(q)) return "langgraph";
  if (/\b(hermes|plan|reasoning worker)\b/.test(q)) return "hermes";
  if (/\b(langgraph|clinical workflow|differential|orchestrat)\b/.test(q)) return "langgraph";
  if (/\bpaperclip\b/.test(q)) return "paperclip";
  if (/\bopenclaw\b/.test(q)) return "openclaw";
  if (/\b(n8n|webhook|automat)\b/.test(q)) return "n8n";
  return "inference";
}

async function probe(url: string): Promise<{ reachable: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return { reachable: true, status: res.status };
  } catch (e) {
    return { reachable: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

function dispatcherSession(): UserSession {
  return {
    userId: "astra-dispatcher",
    name: "Astra Command Center",
    email: "dispatcher@astra.local",
    role: "admin",
    department: "command",
    sessionToken: "dispatcher",
    expiresAt: Date.now() + 60_000,
  };
}

async function roleJob(agent: "hermes" | "langgraph" | "paperclip" | "openclaw" | "n8n" | "astra", system: string, input: string) {
  const chat = await centralAiChat({
    agent,
    clinical: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input },
    ],
    max_tokens: 280,
    temperature: 0.15,
  });
  return {
    worker: agent,
    via: chat.service,
    requestId: chat.requestId,
    latencyMs: chat.latencyMs,
    text: chatText(chat).slice(0, 1200),
  };
}

/**
 * Astra assigns hospital/patient/doctor analysis to specialized workers.
 * Every AI call uses the Central Adapter (FreeLLMAPI primary, OmniRoute fallback).
 * Offline processes still receive a role job via the adapter — they are not marked LIVE.
 */
export async function distributeHospitalWork(input: string): Promise<{
  ok: boolean;
  request: string;
  inference: { primary: string; fallback: string };
  assignments: Array<{ worker: string; role: string; runtime: "process" | "adapter-role" | "skipped"; text: string; via?: string; error?: string }>;
  doctorBrief: string;
  mutatesHospital: false;
  approvalRequired: true;
}> {
  const q = input.trim();
  if (!q) {
    return {
      ok: false,
      request: "",
      inference: { primary: "freellmapi", fallback: "omniroute" },
      assignments: [],
      doctorBrief: "",
      mutatesHospital: false,
      approvalRequired: true,
    };
  }

  const specs: Array<{ agent: "langgraph" | "hermes" | "paperclip" | "openclaw" | "n8n"; system: string }> = [
    {
      agent: "langgraph",
      system:
        "You are Astra's clinical workflow worker. Bounded decision support only. List differentials, red flags, missing tests, uncertainty. Do not diagnose as final. Do not order or prescribe.",
    },
    {
      agent: "hermes",
      system: "You are Astra's planning/reasoning worker. Produce a short 4-step investigation plan for the clinician. No treatment execution.",
    },
    {
      agent: "langgraph",
      system: "You are Astra's task-organization worker. Turn this into 4 hospital tasks (owner role, due, risk). Do not invent patient IDs.",
    },
    {
      agent: "langgraph",
      system: "You are Astra's tool-execution planner. List approved read-only tools (labs lookup, med safety, evidence search). No write actions.",
    },
    {
      agent: "langgraph",
      system: "You are Astra's automation planner. Suggest 3 n8n-style notifications/webhooks (lab ready, deterioration, follow-up). Do not fire them.",
    },
  ];

  const assignments: Array<{ worker: string; role: string; runtime: "process" | "adapter-role" | "skipped"; text: string; via?: string; error?: string }> = [];
  const roles: Record<string, string> = {
    langgraph: "WORKFLOW ORCHESTRATOR",
    hermes: "PLANNING/REASONING",
    paperclip: "TASK/AGENT EXECUTION",
    openclaw: "TOOL/AGENT EXECUTION",
    n8n: "AUTOMATION BUS",
  };

  for (const spec of specs) {
    try {
      const job = await roleJob(spec.agent, spec.system, q);
      assignments.push({
        worker: job.worker,
        role: roles[job.worker] ?? job.worker,
        runtime: "adapter-role",
        text: job.text,
        via: job.via,
      });
    } catch (e) {
      assignments.push({
        worker: spec.agent,
        role: roles[spec.agent] ?? spec.agent,
        runtime: "skipped",
        text: "",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const doctorBrief = assignments
    .filter((a) => a.text)
    .map((a) => `### ${a.worker} (${a.role})\n${a.text}`)
    .join("\n\n");

  return {
    ok: assignments.some((a) => a.via),
    request: q.slice(0, 500),
    inference: { primary: "freellmapi", fallback: "omniroute" },
    assignments,
    doctorBrief:
      doctorBrief +
      "\n\n---\nAstra decision support only. Not a diagnosis. High-risk actions require a licensed clinician. Mutations use /api/command/execute.",
    mutatesHospital: false,
    approvalRequired: true,
  };
}

export async function dispatchWorker(opts: {
  input: string;
  worker?: string;
  memory?: string;
}): Promise<{
  ok: boolean;
  worker: WorkerId;
  role: string;
  throughAdapter: boolean;
  mutatesHospital: false;
  detail: string;
  result?: unknown;
  error?: string;
}> {
  const input = (opts.input ?? "").trim();
  if (!input) return { ok: false, worker: "inference", role: WORKERS[0].role, throughAdapter: true, mutatesHospital: false, detail: "", error: "input is required" };

  const negated = /\b(do not|don't|cannot|must not)\b.{0,60}\b(admit|discharge|prescribe|order|administer)\b/i.test(input);
  if (MUTATION.test(input) && !negated) {
    return {
      ok: false,
      worker: "inference",
      role: "refused",
      throughAdapter: true,
      mutatesHospital: false,
      detail: "Hospital mutations stay on /api/command/execute. Workers cannot admit, prescribe, or order.",
      error: "MUTATION_REFUSED",
    };
  }

  const worker = classifyWorker(input, opts.worker);
  const spec = WORKERS.find((w) => w.id === worker)!;
  const cfg = aiGatewayConfig();

  if (worker === "inference") {
    const chat = await centralAiChat({
      agent: "astra",
      clinical: true,
      memory: opts.memory,
      messages: [{ role: "user", content: input }],
      max_tokens: 400,
      temperature: 0.2,
    });
    return {
      ok: true,
      worker,
      role: spec.role,
      throughAdapter: true,
      mutatesHospital: false,
      detail: `Adapter ${chat.service} model=${chat.model} ${chat.latencyMs}ms`,
      result: { text: chatText(chat), service: chat.service, requestId: chat.requestId },
    };
  }

  if (worker === "hermes") {
    const health = await hermesHealth();
    if (health.config.compatible === false) {
      return {
        ok: false,
        worker,
        role: spec.role,
        throughAdapter: true,
        mutatesHospital: false,
        detail: health.detail,
        error: "HERMES_CONTEXT_GATE",
      };
    }
    const task = hermesExecute(input.slice(0, 4000), "task");
    return {
      ok: true,
      worker,
      role: spec.role,
      throughAdapter: true,
      mutatesHospital: false,
      detail: "Hermes CLI started in safe-mode (existing adapter). LLM is Astra /v1, not a private Hermes model.",
      result: { taskId: task.taskId, status: task.status },
    };
  }

  if (worker === "langgraph") {
    const state = await agentOrchestrator.runGraph(input, dispatcherSession(), undefined, 8);
    let adapterNote = "deterministic clinical graph (unchanged)";
    try {
      const synth = await agentOrchestrator.llmComplete(
        `Summarize this Astra LangGraph clinical state for a licensed clinician. Do not invent facts or orders.\nDifferentials: ${JSON.stringify(state.differentialList).slice(0, 1500)}\nSafety: ${JSON.stringify(state.safetyFlags).slice(0, 800)}`,
        input,
      );
      if (synth.trim()) {
        adapterNote = "deterministic graph + adapter synthesis via FreeLLMAPI chain";
        state.finalResponse = `${state.finalResponse}\n\n#### Central adapter synthesis\n${synth}`;
        state.executionTrace.push({
          step: "ADAPTER_SYNTHESIS",
          timestamp: new Date().toISOString(),
          agent: "Astra Central AI Adapter",
          outputSnippet: synth.slice(0, 240),
        });
      }
    } catch (e) {
      adapterNote = `deterministic graph only — adapter synthesis skipped (${e instanceof Error ? e.message : String(e)})`;
    }
    return {
      ok: true,
      worker,
      role: spec.role,
      throughAdapter: true,
      mutatesHospital: false,
      detail: adapterNote,
      result: {
        sessionId: state.sessionId,
        intent: state.intent,
        requiresHumanApproval: state.requiresHumanApproval,
        finalResponse: state.finalResponse.slice(0, 4000),
        trace: state.executionTrace,
      },
    };
  }

  if (worker === "paperclip") {
    const p = await probe(`${cfg.paperclip.baseUrl.replace(/\/+$/, "")}/api/health`);
    return {
      ok: false,
      worker,
      role: spec.role,
      throughAdapter: true,
      mutatesHospital: false,
      detail: p.reachable
        ? "Paperclip is reachable on existing :3100. Astra will not invent an issues/tasks payload."
        : "Paperclip is not running on http://127.0.0.1:3100 (port unchanged).",
      error: p.reachable ? "NO_INVENTED_TASK_API" : "WORKER_OFFLINE",
      result: p,
    };
  }

  if (worker === "openclaw") {
    const p = await probe(cfg.openclaw.baseUrl.replace(/\/+$/, "") + "/");
    return {
      ok: false,
      worker,
      role: spec.role,
      throughAdapter: true,
      mutatesHospital: false,
      detail: p.reachable
        ? "OpenClaw gateway is reachable on existing :18789. It must call Astra /v1 (openai-completions); Astra will not invent a gateway RPC."
        : "OpenClaw is not running on http://127.0.0.1:18789 (port unchanged).",
      error: p.reachable ? "NO_INVENTED_GATEWAY_RPC" : "WORKER_OFFLINE",
      result: p,
    };
  }

  if (worker === "n8n") {
    const p = await probe(`${cfg.n8n.baseUrl.replace(/\/+$/, "")}/healthz`);
    return {
      ok: false,
      worker,
      role: spec.role,
      throughAdapter: true,
      mutatesHospital: false,
      detail: p.reachable
        ? "n8n is reachable on existing :5678. Existing webhooks in n8nClient.ts are unchanged; no new workflow was invented."
        : "n8n is not running on http://127.0.0.1:5678 (port unchanged).",
      error: p.reachable ? "NO_INVENTED_WORKFLOW" : "WORKER_OFFLINE",
      result: p,
    };
  }

  return {
    ok: false,
    worker,
    role: spec.role,
    throughAdapter: true,
    mutatesHospital: false,
    detail: "Handled by the Central AI Adapter (FreeLLMAPI → OmniRoute → Ollama). No external cloud dispatch.",
    error: "NO_EXTERNAL_CLOUD_WORKER",
  };
}
