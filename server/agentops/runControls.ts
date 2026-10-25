import { controlPlanRun, type PlanControl } from "../reflex/hermes/hermesPlanner";
import { getTask, saveTask, transitionTask, type AgentTask, type TaskStatus } from "./taskStore";

export const CONTROLS = ["PAUSE", "RESUME", "CANCEL", "RETRY", "STEER", "ESCALATE", "PRIORITIZE", "BACKGROUND", "APPROVE", "REJECT"] as const;
export type ControlAction = (typeof CONTROLS)[number];

export interface ControlActor { userId: string; role: string }
export interface ControlResult { ok: boolean; via?: "R5-01"; error?: string; task?: AgentTask; executed?: boolean }

function canControl(task: AgentTask, actor: ControlActor): boolean {
  return actor.role === "admin" || actor.role === "supervisor" || actor.userId === task.initiator.userId;
}

function safeTransition(task: AgentTask, to: TaskStatus, reason: string): void {
  if (task.status === to) return;
  try { transitionTask(task.taskId, to, reason); } catch { task.lastReason = reason; saveTask(task); }
}

export function controlTask(taskId: string, action: ControlAction, actor: ControlActor, extra?: { constraint?: string; priority?: number }): ControlResult {
  const task = getTask(taskId);
  if (!task) return { ok: false, error: "not_found" };
  if ((action === "APPROVE" || action === "REJECT") && task.clinical) {
    return { ok: false, via: "R5-01", error: "clinical_approval_required", task };
  }
  if (!canControl(task, actor)) return { ok: false, error: "forbidden", task };

  if (action === "STEER" && extra?.constraint?.trim()) {
    task.constraints.push(extra.constraint.trim());
    saveTask(task);
    if (task.planRunId) {
      const planAction: PlanControl = "STEER";
      controlPlanRun(task.planRunId, { action: planAction, constraint: extra.constraint.trim() });
    }
    return { ok: true, task };
  }
  if (action === "PAUSE") {
    task.paused = true;
    saveTask(task);
    safeTransition(task, "WAITING", "paused");
    if (task.planRunId) controlPlanRun(task.planRunId, { action: "PAUSE" });
    return { ok: true, task: getTask(taskId), executed: false };
  }
  if (action === "RESUME") {
    if (task.needsHumanResume && task.pendingStep?.writes) return { ok: false, error: "human_resume_required", task };
    task.paused = false;
    saveTask(task);
    safeTransition(task, "RUNNING", "resumed");
    if (task.planRunId) controlPlanRun(task.planRunId, { action: "RESUME" });
    return { ok: true, task: getTask(taskId) };
  }
  if (action === "CANCEL") {
    task.cancelled = true;
    task.paused = true;
    saveTask(task);
    safeTransition(task, "CANCELLED", "cancelled");
    if (task.planRunId) controlPlanRun(task.planRunId, { action: "CANCEL" });
    return { ok: true, task: getTask(taskId), executed: false };
  }
  if (action === "RETRY") {
    safeTransition(task, "QUEUED", "retry");
    return { ok: true, task: getTask(taskId) };
  }
  if (action === "PRIORITIZE") {
    task.priority = extra?.priority ?? task.priority + 1;
    saveTask(task);
    return { ok: true, task };
  }
  if (action === "BACKGROUND") {
    task.priority = Math.min(task.priority, -1);
    saveTask(task);
    return { ok: true, task };
  }
  if (action === "ESCALATE") {
    safeTransition(task, "REVIEW", "escalated");
    return { ok: true, task: getTask(taskId) };
  }
  if (action === "APPROVE") {
    safeTransition(task, "APPROVED", "approved");
    return { ok: true, task: getTask(taskId) };
  }
  if (action === "REJECT") {
    safeTransition(task, "FAILED", "rejected");
    return { ok: true, task: getTask(taskId) };
  }
  return { ok: false, error: "unknown_control", task };
}

export function nextStepContext(taskId: string): { constraints: string[]; execute: boolean } {
  const task = getTask(taskId);
  if (!task || task.paused || task.cancelled || task.status === "CANCELLED" || task.status === "WAITING") {
    return { constraints: task?.constraints ?? [], execute: false };
  }
  return { constraints: task.constraints, execute: true };
}
