import crypto from "crypto";
import fs from "fs";
import { open } from "../persistence/durableJsonl";
import { astraDataRoot } from "../services/env";

export const TASK_STATUSES = [
  "QUEUED", "PLANNING", "RUNNING", "WAITING", "BLOCKED", "REVIEW", "APPROVED", "DONE", "FAILED", "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskChannel = "ui" | "voice" | "whatsapp" | "browser" | "scheduler" | "api";

const NEXT: Record<TaskStatus, TaskStatus[]> = {
  QUEUED: ["PLANNING", "CANCELLED", "FAILED"],
  PLANNING: ["RUNNING", "WAITING", "CANCELLED", "FAILED"],
  RUNNING: ["WAITING", "BLOCKED", "REVIEW", "FAILED", "CANCELLED", "DONE"],
  WAITING: ["RUNNING", "PLANNING", "BLOCKED", "CANCELLED", "FAILED"],
  BLOCKED: ["WAITING", "RUNNING", "CANCELLED", "FAILED"],
  REVIEW: ["APPROVED", "FAILED", "CANCELLED"],
  APPROVED: ["DONE", "FAILED"],
  DONE: [],
  FAILED: ["QUEUED", "PLANNING"],
  CANCELLED: [],
};

export interface AgentTask {
  taskId: string;
  title: string;
  initiator: { userId: string; role: string };
  channel: TaskChannel;
  channels: TaskChannel[];
  patientRefHash?: string;
  module: string;
  status: TaskStatus;
  priority: number;
  constraints: string[];
  paused: boolean;
  cancelled: boolean;
  clinical: boolean;
  planRunId?: string;
  pendingStep?: { writes: boolean; name: string };
  needsHumanResume: boolean;
  lastReason?: string;
  layaDecisions: string[];
  subagents: string[];
  tools: string[];
  approvals: string[];
  artifacts: string[];
  errors: string[];
  createdAt: string;
  updatedAt: string;
  traceId: string;
}

let memory = new Map<string, AgentTask>();
let booted = false;
let dirOverride: string | null = null;

function rootDir(): string {
  return dirOverride ?? astraDataRoot();
}

function stream() {
  fs.mkdirSync(rootDir(), { recursive: true });
  return open("agentops-tasks", rootDir());
}

function stamp(task: AgentTask): AgentTask {
  task.updatedAt = new Date().toISOString();
  return task;
}

export function hashPatientRef(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function bootTaskStore(): void {
  if (booted) return;
  booted = true;
  for (const entry of stream().replay()) {
    const task = (entry.payload as { task?: AgentTask } | undefined)?.task;
    if (task?.taskId) memory.set(task.taskId, task);
  }
}

export function _resetTaskStoreForTest(dir: string): void {
  dirOverride = dir;
  memory = new Map();
  booted = false;
  fs.mkdirSync(dir, { recursive: true });
}

export function _forgetTaskMemoryForTest(): void {
  memory = new Map();
  booted = false;
}

export function listTasks(): AgentTask[] {
  bootTaskStore();
  return [...memory.values()];
}

export function getTask(taskId: string): AgentTask | undefined {
  bootTaskStore();
  return memory.get(taskId);
}

export function createTask(input: {
  taskId?: string;
  title: string;
  initiator: { userId: string; role: string };
  channel: TaskChannel;
  module?: string;
  patientRef?: string;
  clinical?: boolean;
  priority?: number;
}): AgentTask {
  bootTaskStore();
  if (input.taskId && memory.has(input.taskId)) return openOnChannel(input.taskId, input.channel);
  const now = new Date().toISOString();
  const task: AgentTask = {
    taskId: input.taskId ?? `task-${crypto.randomUUID()}`,
    title: input.title,
    initiator: input.initiator,
    channel: input.channel,
    channels: [input.channel],
    patientRefHash: input.patientRef ? hashPatientRef(input.patientRef) : undefined,
    module: input.module ?? "agentops",
    status: "QUEUED",
    priority: input.priority ?? 0,
    constraints: [],
    paused: false,
    cancelled: false,
    clinical: Boolean(input.clinical),
    needsHumanResume: false,
    layaDecisions: [],
    subagents: [],
    tools: [],
    approvals: [],
    artifacts: [],
    errors: [],
    createdAt: now,
    updatedAt: now,
    traceId: `trace-${crypto.randomUUID()}`,
  };
  memory.set(task.taskId, task);
  stream().append("created", { task });
  return task;
}

export function openOnChannel(taskId: string, channel: TaskChannel): AgentTask {
  bootTaskStore();
  const task = memory.get(taskId);
  if (!task) throw new Error("task_not_found");
  if (!task.channels.includes(channel)) task.channels.push(channel);
  stamp(task);
  stream().append("channel", { task, channel });
  return task;
}

export function saveTask(task: AgentTask): AgentTask {
  bootTaskStore();
  stamp(task);
  memory.set(task.taskId, task);
  stream().append("update", { task });
  return task;
}

export function transitionTask(taskId: string, to: TaskStatus, reason?: string): AgentTask {
  bootTaskStore();
  const task = memory.get(taskId);
  if (!task) throw new Error("task_not_found");
  if (!NEXT[task.status].includes(to)) throw new Error(`illegal_transition:${task.status}->${to}`);
  const from = task.status;
  task.status = to;
  if (reason) task.lastReason = reason;
  stamp(task);
  stream().append("transition", { task, from, to, reason });
  return task;
}
