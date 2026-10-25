import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { controlTask, nextStepContext } from "./runControls";
import { _resetTaskStoreForTest, createTask, transitionTask } from "./taskStore";

let dir = "";
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe("agent run controls", () => {
  it("steers, cancels, pauses, and sends clinical approval to R5-01", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-controls-"));
    _resetTaskStoreForTest(dir);
    const task = createTask({ title: "SYNTHETIC draft", initiator: { userId: "doc", role: "doctor" }, channel: "ui" });
    transitionTask(task.taskId, "PLANNING");
    transitionTask(task.taskId, "RUNNING");
    const steered = controlTask(task.taskId, "STEER", { userId: "doc", role: "doctor" }, { constraint: "exclude the provisional bill" });
    expect(steered.ok).toBe(true);
    expect(nextStepContext(task.taskId).constraints).toContain("exclude the provisional bill");
    const paused = controlTask(task.taskId, "PAUSE", { userId: "doc", role: "doctor" });
    expect(paused.ok).toBe(true);
    expect(nextStepContext(task.taskId).execute).toBe(false);
    const clinical = createTask({ title: "SYNTHETIC order draft", initiator: { userId: "doc", role: "doctor" }, channel: "ui", clinical: true });
    transitionTask(clinical.taskId, "PLANNING");
    transitionTask(clinical.taskId, "RUNNING");
    transitionTask(clinical.taskId, "REVIEW");
    const denied = controlTask(clinical.taskId, "APPROVE", { userId: "rec", role: "reception" });
    expect(denied.ok).toBe(false);
    expect(denied.via).toBe("R5-01");
    const running = createTask({ title: "SYNTHETIC cancel", initiator: { userId: "doc", role: "doctor" }, channel: "api" });
    transitionTask(running.taskId, "PLANNING");
    transitionTask(running.taskId, "RUNNING");
    controlTask(running.taskId, "CANCEL", { userId: "doc", role: "doctor" });
    expect(nextStepContext(running.taskId).execute).toBe(false);
  });
});
