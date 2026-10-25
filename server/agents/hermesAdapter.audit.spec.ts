import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-hermes-audit-"));
  process.env.ASTRA_DATA_DIR = tempDir;
  delete process.env.HERMES_USE_CLI;
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("Hermes task lifecycle audit", () => {
  it("records accepted and finished metadata without the prompt or output", async () => {
    const { hermesExecute } = await import("./hermesAdapter");
    const { db } = await import("../db");
    const sensitivePrompt = "synthetic prompt that must not appear in audit";
    const task = hermesExecute(sensitivePrompt, "task", 120000, {
      actorId: "synthetic-doctor",
      actorName: "Synthetic Doctor",
      actorRole: "doctor",
    });

    const entries = db.getAuditTrail(20).filter((entry) => entry.action.startsWith("HERMES_TASK_"));
    expect(task.status).toBe("COMPLETED");
    expect(entries.map((entry) => entry.action).reverse()).toEqual(["HERMES_TASK_ACCEPTED", "HERMES_TASK_FINISHED"]);
    for (const entry of entries) {
      expect(entry.details).not.toContain(sensitivePrompt);
      expect(entry.details).not.toContain(task.stdout);
      const detail = JSON.parse(entry.details);
      expect(detail.taskId).toBe(task.taskId);
      expect(detail.provider).toBeDefined();
      expect(detail.model).toBeDefined();
    }
    expect(JSON.parse(entries[0].details).durationMs).toBeDefined();
  });

  it("records a redacted CLI failure class and exit code without stderr", async () => {
    const { hermesFailureReason, hermesTaskAuditDetails } = await import("./hermesAdapter");
    const stderr = "dependency environment is missing or outside this install: C:\\secret-path";
    const task = {
      taskId: "synthetic-failed-cli",
      prompt: "synthetic prompt",
      status: "FAILED" as const,
      startedAt: 1,
      finishedAt: 2,
      // Hermes' packaged-app dependency failure exits zero but produces no
      // model output. The adapter therefore marks the task FAILED while
      // preserving the real process exit code for audit investigation.
      exitCode: 0,
      stdout: "",
      stderr,
      source: "task" as const,
      execution: "CLI" as const,
    };
    expect(hermesFailureReason(task)).toBe("DEPENDENCY_ENVIRONMENT_INVALID");
    const detail = hermesTaskAuditDetails(task, { model: "synthetic", provider: "custom:astra", baseUrl: null, contextLength: null, requiredContext: 64000, compatible: null });
    expect(detail).toMatchObject({ exitCode: 0, failureReason: "DEPENDENCY_ENVIRONMENT_INVALID", execution: "CLI" });
    expect(JSON.stringify(detail)).not.toContain(stderr);
    expect(JSON.stringify(detail)).not.toContain(task.prompt);
  });
});
