import type { Express, Request, Response } from "express";
import { authenticate, requireRole } from "../rbac";
import { buildAstraDoctor } from "../agentops/astraDoctor";
import { buildMorningBrief, type BriefRow } from "../agentops/morningBrief";
import { controlTask, type ControlAction } from "../agentops/runControls";
import { listSchedules, saveSchedule, type ScheduleJob } from "../agentops/scheduler";
import { createTask, getTask, listTasks } from "../agentops/taskStore";

function actor(req: Request): { userId: string; role: string } {
  const user = (req as Request & { user?: { userId?: string; id?: string; role?: string; name?: string } }).user;
  return { userId: user?.userId || user?.id || user?.name || "unknown", role: user?.role ?? "" };
}

export function registerAgentOpsRoutes(app: Express): void {
  app.get("/api/agentops/tasks", authenticate, (_req, res) => {
    res.json({ ok: true, tasks: listTasks() });
  });

  app.post("/api/agentops/tasks", authenticate, (req, res) => {
    const who = actor(req);
    const task = createTask({
      title: String(req.body?.title ?? "Untitled task"),
      initiator: { userId: who.userId, role: who.role },
      channel: req.body?.channel ?? "api",
      module: req.body?.module,
      clinical: Boolean(req.body?.clinical),
    });
    res.status(201).json({ ok: true, task });
  });

  app.get("/api/agentops/tasks/:id", authenticate, (req: Request<{ id: string }>, res: Response) => {
    const task = getTask(req.params.id);
    if (!task) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, task });
  });

  app.post("/api/agentops/tasks/:id/control", authenticate, (req: Request<{ id: string }>, res: Response) => {
    const result = controlTask(req.params.id, String(req.body?.action ?? "") as ControlAction, actor(req), {
      constraint: req.body?.constraint,
      priority: req.body?.priority,
    });
    return res.status(result.ok ? 200 : result.via === "R5-01" ? 409 : 403).json(result);
  });

  app.get("/api/agentops/schedules", authenticate, requireRole(["admin"]), (_req, res) => {
    res.json({ ok: true, schedules: listSchedules() });
  });

  app.put("/api/agentops/schedules", authenticate, requireRole(["admin"]), (req, res) => {
    try {
      const saved = saveSchedule(req.body as ScheduleJob);
      res.json({ ok: true, schedule: saved });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "rejected" });
    }
  });

  app.get("/api/agentops/doctor", authenticate, requireRole(["admin"]), async (_req, res) => {
    const report = await buildAstraDoctor();
    res.json({ ok: true, report });
  });

  app.get("/api/agentops/brief", authenticate, (req, res) => {
    const who = actor(req);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows as BriefRow[] : [];
    res.json({ ok: true, brief: buildMorningBrief({ role: who.role, userId: who.userId, rows }) });
  });
}
