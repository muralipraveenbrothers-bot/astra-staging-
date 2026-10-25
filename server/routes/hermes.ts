import type { Express, Request, Response } from "express";
import { authenticate, requireRole } from "../rbac";
import { hermesCancel, hermesExecute, hermesTask, hermesTaskList, type HermesAuditContext } from "../agents/hermesAdapter";

// Non-clinical, tool-free validation only. The adapter additionally enforces
// safe-mode and one turn for every CLI invocation.
const HERMES_TEST_TASK = "Return a short three-step plan for organizing a non-clinical administrative workflow.";

function auditContext(req: Request): HermesAuditContext {
  const user = (req as Request & { user?: { userId: string; name: string; role: string } }).user;
  if (!user) throw new Error("authenticated Hermes route missing session user");
  return { actorId: user.userId, actorName: user.name, actorRole: user.role };
}

/** Production Hermes execution endpoints, extracted so the isolated harness
 * exercises the exact same route implementation as the running Astra API. */
export function registerHermesExecutionRoutes(app: Express): void {
  app.post("/api/agents/hermes/test", authenticate, requireRole(["doctor", "admin", "ceo"]), (req: Request, res: Response) => {
    res.json({ task: hermesExecute(HERMES_TEST_TASK, "test", 120000, auditContext(req)), testTask: HERMES_TEST_TASK });
  });

  app.post("/api/agents/hermes/execute", authenticate, requireRole(["doctor", "admin", "ceo"]), (req: Request, res: Response) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt || prompt.length > 4000) {
      res.status(400).json({ error: "VALIDATION", message: "prompt is required (1–4000 chars)" });
      return;
    }
    // `task.execution` is returned verbatim: CLI and planner fallback can
    // never be confused by callers or the dashboard.
    res.json({ task: hermesExecute(prompt, "task", 120000, auditContext(req)) });
  });

  app.get("/api/agents/hermes/task/:taskId", authenticate, (req: Request<{ taskId: string }>, res: Response) => {
    const task = hermesTask(req.params.taskId);
    if (!task) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    res.json({ task });
  });

  app.post("/api/agents/hermes/cancel/:taskId", authenticate, (req: Request<{ taskId: string }>, res: Response) => {
    res.json({ cancelled: hermesCancel(req.params.taskId) });
  });

  app.get("/api/agents/hermes/logs", authenticate, (_req: Request, res: Response) => {
    res.json({ tasks: hermesTaskList().slice(0, 50) });
  });
}
