import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { _reloadSchedulerForTest, _resetSchedulerForTest, listSchedules, saveSchedule, tickSchedules } from "./scheduler";

let dir = "";
afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

describe("agent scheduler", () => {
  it("rejects L3 jobs, keeps defaults disabled, and fires an 08:00 job once", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-sched-"));
    _resetSchedulerForTest(dir);
    expect(listSchedules().every((job) => job.enabled === false)).toBe(true);
    expect(() => saveSchedule({
      id: "bad", title: "lab order", hhmm: "08:00", enabled: true, tool: "create_lab_order", level: "L5", kind: "WRITE",
    })).toThrow(/schedule_rejected/);
    saveSchedule({
      id: "morning-command-brief", title: "Morning Command Brief", hhmm: "08:00", enabled: true,
      tool: "document_lookup", level: "L0", kind: "READ_ONLY",
    });
    const at = new Date(2026, 8, 29, 8, 0, 0);
    expect(tickSchedules(at)).toContain("morning-command-brief");
    _reloadSchedulerForTest();
    expect(tickSchedules(at)).not.toContain("morning-command-brief");
  });
});
