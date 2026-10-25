import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { _forgetTaskMemoryForTest, _resetTaskStoreForTest, createTask, getTask, openOnChannel, transitionTask } from "./taskStore";

let dir = "";
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe("agent task store", () => {
  it("rejects an illegal transition, survives restart, and keeps one id across channels", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-tasks-"));
    _resetTaskStoreForTest(dir);
    const task = createTask({ title: "SYNTHETIC follow-up", initiator: { userId: "doc", role: "doctor" }, channel: "ui" });
    transitionTask(task.taskId, "PLANNING");
    expect(() => transitionTask(task.taskId, "DONE")).toThrow(/illegal_transition/);
    const again = openOnChannel(task.taskId, "whatsapp");
    expect(again.taskId).toBe(task.taskId);
    expect(again.channels).toEqual(["ui", "whatsapp"]);
    _forgetTaskMemoryForTest();
    expect(getTask(task.taskId)?.status).toBe("PLANNING");
    expect(getTask(task.taskId)?.patientRefHash).toBeUndefined();
  });
});
