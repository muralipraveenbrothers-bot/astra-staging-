import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string;
let engine: any;

function auditEntries(): any[] {
  const file = path.join(tempDir, "audit.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

describe("work-order two-phase creation", () => {
  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-two-phase-"));
    process.env.ASTRA_DATA_DIR = tempDir;
    process.env.ASTRA_WORK_ORDERS_DB_PATH = path.join(tempDir, "work-orders.json");
    vi.resetModules();
    ({ workOrderEngine: engine } = await import("./workOrders"));
  });

  afterEach(() => {
    delete process.env.ASTRA_DATA_DIR;
    delete process.env.ASTRA_WORK_ORDERS_DB_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("restores the work-order snapshot when phase 1 validation throws", () => {
    expect(() => engine.createClinicalOrder({ patientId: "test-patient", patientName: "Synthetic", bed: "test", ward: "test", department: "Lab", serviceCode: "CBP", serviceName: "", actor: "test", role: "doctor" })).toThrow("INVALID_CLINICAL_ORDER_INPUT");
    expect(engine.listOrders()).toEqual([]);
    expect(auditEntries().map((entry) => entry.action)).toEqual(["workorder.create_failed"]);
  });

  it("keeps the committed order when a post-commit side effect throws", () => {
    const originalTransition = engine.transition;
    engine.transition = vi.fn(() => { throw new Error("SIDE_EFFECT_FAILED"); });
    expect(() => engine.createClinicalOrder({ patientId: "test-patient", patientName: "Synthetic", bed: "test", ward: "test", department: "Lab", serviceCode: "CBP", serviceName: "Complete Blood Picture", actor: "test", role: "doctor" })).toThrow("SIDE_EFFECT_FAILED");
    engine.transition = originalTransition;
    expect(engine.listOrders()).toHaveLength(1);
    expect(auditEntries().map((entry) => entry.action)).toEqual(["workorder.post_commit_failed"]);
  });
});
