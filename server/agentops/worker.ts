import { listTasks, saveTask, transitionTask, type AgentTask } from "./taskStore";

const alerts: string[] = [];
let active = 0;

function cap(): number {
  const n = Number(process.env.ASTRA_AGENTOPS_CONCURRENCY ?? 2);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

export function takeAdminAlerts(): string[] {
  return alerts.splice(0, alerts.length);
}

export function sweepStuck(now = Date.now()): string[] {
  const hit: string[] = [];
  for (const task of listTasks()) {
    if (task.status !== "RUNNING") continue;
    if (now - Date.parse(task.updatedAt) < 10 * 60 * 1000) continue;
    transitionTask(task.taskId, "BLOCKED", "stuck");
    const alert = `stuck:${task.taskId}`;
    alerts.push(alert);
    hit.push(alert);
  }
  return hit;
}

export function recoverAfterRestart(): AgentTask[] {
  const changed: AgentTask[] = [];
  for (const task of listTasks()) {
    if (task.status !== "RUNNING") continue;
    const writes = Boolean(task.pendingStep?.writes);
    task.needsHumanResume = writes;
    task.paused = writes;
    saveTask(task);
    changed.push(transitionTask(task.taskId, "WAITING", "restarted"));
  }
  return changed;
}

export function startAvailable(execute: (task: AgentTask) => Promise<void>): string[] {
  const room = Math.max(0, cap() - active);
  const queued = listTasks()
    .filter((task) => task.status === "QUEUED" && !task.paused && !task.cancelled && !task.needsHumanResume)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, room);
  for (const task of queued) {
    active += 1;
    transitionTask(task.taskId, "PLANNING", "start");
    transitionTask(task.taskId, "RUNNING", "start");
    void execute(task).finally(() => { active -= 1; });
  }
  return queued.map((task) => task.taskId);
}

export function activeWorkers(): number {
  return active;
}

export function _resetWorkerForTest(): void {
  active = 0;
  alerts.length = 0;
}
