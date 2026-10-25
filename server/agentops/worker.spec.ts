import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { _resetTaskStoreForTest, createTask, getTask, saveTask, transitionTask } from "./taskStore";
import { _resetWorkerForTest, recoverAfterRestart, startAvailable, sweepStuck, takeAdminAlerts } from "./worker";

let dir = "";
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); _resetWorkerForTest(); });

describe("agent worker", () => {
  it("blocks a stuck run, does not rerun a write after restart, and caps concurrency", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-worker-"));
    _resetTaskStoreForTest(dir);
    const stuck = createTask({ title: "SYNTHETIC stuck", initiator: { userId: "a", role: "admin" }, channel: "scheduler" });
    transitionTask(stuck.taskId, "PLANNING");
    const running = transitionTask(stuck.taskId, "RUNNING");
    running.updatedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    expect(sweepStuck(Date.now())[0]).toMatch(/^stuck:/);
    expect(getTask(stuck.taskId)?.status).toBe("BLOCKED");
    expect(getTask(stuck.taskId)?.lastReason).toBe("stuck");
    expect(takeAdminAlerts().length).toBe(1);

    const write = createTask({ title: "SYNTHETIC write", initiator: { userId: "a", role: "admin" }, channel: "api" });
    transitionTask(write.taskId, "PLANNING");
    const live = transitionTask(write.taskId, "RUNNING");
    live.pendingStep = { writes: true, name: "create_lab_order" };
    saveTask(live);
    const recovered = recoverAfterRestart();
    expect(recovered.find((task) => task.taskId === write.taskId)?.status).toBe("WAITING");
    expect(recovered.find((task) => task.taskId === write.taskId)?.lastReason).toBe("restarted");

    process.env.ASTRA_AGENTOPS_CONCURRENCY = "2";
    createTask({ title: "q1", initiator: { userId: "a", role: "admin" }, channel: "ui" });
    createTask({ title: "q2", initiator: { userId: "a", role: "admin" }, channel: "ui" });
    createTask({ title: "q3", initiator: { userId: "a", role: "admin" }, channel: "ui" });
    let ran = 0;
    const started = startAvailable(async () => { ran += 1; });
    expect(started).toHaveLength(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ran).toBe(2);
    delete process.env.ASTRA_AGENTOPS_CONCURRENCY;
  });
});
