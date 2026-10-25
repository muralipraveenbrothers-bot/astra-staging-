import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decideBatch = vi.hoisted(() => vi.fn());
vi.mock("../reflex/decisionFabric", () => ({ decideBatch }));

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
  vi.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-laya-route-"));
  process.env.ASTRA_TEST_AUTH = "1";
  process.env.ASTRA_DATA_DIR = tempDir;
  process.env.ASTRA_AUDIT_PATH = path.join(tempDir, "audit.jsonl");
  process.env.ASTRA_LAYA_ENABLED = "1";
  fs.writeFileSync(path.join(tempDir, "auth-vault.json"), "[]\n", "utf8");
  decideBatch.mockReset();
});

afterEach(() => {
  process.env = { ...originalEnv };
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("Laya bounded decision route", () => {
  it("requires a doctor, reports runtime provenance, and audits no input text", async () => {
    decideBatch.mockResolvedValue([
      { schemaId: "urgency_classification", answer: "urgent", confidence: 0.81, abstained: false, source: "laya" },
      { schemaId: "department_routing", answer: "general_medicine", confidence: 0.77, abstained: false, source: "laya" },
      { schemaId: "intent_routing", answer: "clinical", confidence: 0.75, abstained: false, source: "laya" },
    ]);
    const { authenticate, createSyntheticSession } = await import("../rbac");
    const { registerLayaDecisionRoutes } = await import("./laya");
    const { db } = await import("../db");
    const app = express();
    app.use(express.json());
    app.use(authenticate);
    registerLayaDecisionRoutes(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const doctor = createSyntheticSession("doctor");
    const input = "synthetic clinical routing training case";
    const response = await fetch(`http://127.0.0.1:${address.port}/api/agents/laya/decision`, {
      method: "POST",
      headers: { authorization: `Bearer ${doctor.sessionToken}`, "content-type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const body = await response.json() as { source: string; routingAvailable: boolean; usableDecision: boolean; routingOnly: boolean; note: string; limitations: string; uncertainty: string };
    const audit = db.getAuditTrail(10).find((entry) => entry.action === "LAYA_BOUNDED_DECISION");
    expect(response.status).toBe(200);
    expect(body.source).toBe("LAYA");
    expect(body.routingAvailable).toBe(true);
    expect(body.usableDecision).toBe(true);
    expect(body.routingOnly).toBe(true);
    expect(body.note).toBe("Routing signal only, not clinical advice");
    expect(body.limitations).toMatch(/does not diagnose/i);
    expect(body.uncertainty).toMatch(/not clinical probability/i);
    expect(audit).toMatchObject({ actorRole: "doctor", status: "SUCCESS" });
    expect(audit?.details).not.toContain(input);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns an audited 503 when Laya is disabled", async () => {
    process.env.ASTRA_LAYA_ENABLED = "0";
    const { authenticate, createSyntheticSession } = await import("../rbac");
    const { registerLayaDecisionRoutes } = await import("./laya");
    const { db } = await import("../db");
    const app = express();
    app.use(express.json());
    app.use(authenticate);
    registerLayaDecisionRoutes(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const doctor = createSyntheticSession("doctor");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/agents/laya/decision`, {
      method: "POST",
      headers: { authorization: `Bearer ${doctor.sessionToken}`, "content-type": "application/json" },
      body: JSON.stringify({ input: "synthetic disabled-service test" }),
    });
    const body = await response.json() as { message: string };
    const audit = db.getAuditTrail(10).find((entry) => entry.action === "LAYA_BOUNDED_DECISION");
    expect(response.status).toBe(503);
    expect(body.message).toBe("Laya disabled");
    expect(audit).toMatchObject({ actorRole: "doctor", status: "FAILED" });
    expect(audit?.details).toContain("LAYA_DISABLED");
    expect(decideBatch).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
