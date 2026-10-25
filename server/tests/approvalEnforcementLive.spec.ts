import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let tempDir = "";
let baseUrl = "";
let server: Server;
let restoreFetch: typeof fetch;
let tokens: Record<"doctor" | "admin", string>;
let getAllDecisions: typeof import("../../src/astra/approval/approvalGate").getAllDecisions;
let classifyOrderRisk: typeof import("../../src/astra/approval/orderRisk").classifyOrderRisk;

function makeTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-approval-live-"));
  fs.writeFileSync(path.join(dir, "auth-vault.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(dir, "hospital.json"), JSON.stringify({
    patients: [], beds: [], orders: [], pharmacyInventory: [], otCases: [], tasks: [], bills: [], attentionItems: [],
  }), "utf8");
  fs.writeFileSync(path.join(dir, "hospital_profile.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(dir, "work-orders.json"), JSON.stringify({ orders: [], staff: [], seq: 0 }), "utf8");
  fs.writeFileSync(path.join(dir, "work-order-notifications.json"), JSON.stringify({ notifications: [], seq: 0 }), "utf8");
  fs.writeFileSync(path.join(dir, "audit.jsonl"), "", "utf8");
  fs.writeFileSync(path.join(dir, "decision-log.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(dir, "order-risk.json"), JSON.stringify({ reviewedStandardCodes: [] }), "utf8");
  return dir;
}

async function call(role: "doctor" | "admin", route: string, body: unknown) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokens[role]}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) as Record<string, any> };
}

function auditActions(): string[] {
  const file = process.env.ASTRA_AUDIT_PATH!;
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean)
    .map((line) => JSON.parse(line) as { action?: string })
    .map((entry) => entry.action ?? "");
}

beforeAll(async () => {
  vi.resetModules();
  tempDir = makeTempDataDir();
  process.env.ASTRA_TEST_AUTH = "1";
  process.env.ASTRA_DATA_DIR = tempDir;
  process.env.ASTRA_HOSPITAL_DB_PATH = path.join(tempDir, "hospital.json");
  process.env.ASTRA_HOSPITAL_PROFILE_PATH = path.join(tempDir, "hospital_profile.json");
  process.env.ASTRA_WORK_ORDERS_DB_PATH = path.join(tempDir, "work-orders.json");
  process.env.ASTRA_WORK_ORDER_NOTIFICATIONS_PATH = path.join(tempDir, "work-order-notifications.json");
  process.env.ASTRA_AUDIT_PATH = path.join(tempDir, "audit.jsonl");
  process.env.ASTRA_DECISION_LOG_PATH = path.join(tempDir, "decision-log.json");
  process.env.ASTRA_ORDER_RISK_CONFIG_PATH = path.join(tempDir, "order-risk.json");
  process.env.ASTRA_ORDER_APPROVAL_ENFORCE = "1";
  process.env.ASTRA_APPROVAL_HMAC_SECRET = "synthetic-test-secret-for-approval-32-bytes";

  const { authenticate, createSyntheticSession } = await import("../rbac");
  const { registerClinicalApprovalRoutes } = await import("../routes/clinicalApproval");
  const { registerWorkOrderRoutes } = await import("../routes/workOrders");
  ({ getAllDecisions } = await import("../../src/astra/approval/approvalGate"));
  ({ classifyOrderRisk } = await import("../../src/astra/approval/orderRisk"));

  const app = express();
  app.use(express.json());
  app.use(authenticate);
  registerClinicalApprovalRoutes(app);
  registerWorkOrderRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  tokens = {
    doctor: createSyntheticSession("doctor").sessionToken,
    admin: createSyntheticSession("admin").sessionToken,
  };

  restoreFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.hostname !== "127.0.0.1" || Number(url.port) !== address.port) {
      return Promise.reject(new Error("blocked non-loopback or external service"));
    }
    return restoreFetch(input, init);
  }) as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = restoreFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const key of ["ASTRA_TEST_AUTH", "ASTRA_DATA_DIR", "ASTRA_HOSPITAL_DB_PATH", "ASTRA_HOSPITAL_PROFILE_PATH", "ASTRA_WORK_ORDERS_DB_PATH", "ASTRA_WORK_ORDER_NOTIFICATIONS_PATH", "ASTRA_AUDIT_PATH", "ASTRA_DECISION_LOG_PATH", "ASTRA_ORDER_RISK_CONFIG_PATH", "ASTRA_ORDER_APPROVAL_ENFORCE", "ASTRA_APPROVAL_HMAC_SECRET"]) delete process.env[key];
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("isolated approval enforcement dry run", () => {
  const highOrder = () => ({
    patientId: "SYNTH-APPROVAL-PATIENT",
    department: "Lab",
    serviceCode: "SYNTH-HIGH",
    serviceName: "Synthetic high-risk service",
    category: "procedure",
    procedure: "synthetic-procedure",
    priority: "ROUTINE",
    quantity: 1,
  });

  async function approve(order: Record<string, unknown>, role: "doctor" | "admin" = "doctor") {
    const suggestion = await call(role, "/api/clinical/approval/suggestion", {
      suggestionId: `synthetic-suggestion-${Math.random().toString(36).slice(2)}`,
      patientId: order.patientId,
      kind: "procedure",
      payload: order,
      source: "synthetic-test",
    });
    const decision = await call(role, "/api/clinical/approval/decision", {
      suggestionId: suggestion.body.suggestion.suggestionId,
      decision: "APPROVE_CASE_ONLY",
    });
    return { suggestion, decision };
  }

  it("enforces HIGH approval, consumes once, detects changed fields, and rejects admin approvers", async () => {
    const order = highOrder();
    expect(classifyOrderRisk({ order, serviceCode: String(order.serviceCode) })).toBe("HIGH");
    const withoutApproval = await call("admin", "/api/workorders", order);
    expect(withoutApproval.status).toBe(403);
    expect(withoutApproval.body.error).toBe("ORDER_APPROVAL_REQUIRED");

    const approved = await approve(order);
    expect(approved.decision.status).toBe(200);
    expect(approved.decision.body.decision.status).toBe("APPROVED");
    const decisionId = approved.decision.body.decision.decisionId as string;
    const ordered = await call("admin", "/api/workorders", { ...order, approvalDecisionId: decisionId });
    expect(ordered.status).toBe(201);
    const reused = await call("admin", "/api/workorders", { ...order, approvalDecisionId: decisionId });
    expect(reused.status).toBe(400);
    expect(reused.body.error).toContain("ALREADY_CONSUMED");

    const changedOrder = highOrder();
    changedOrder.quantity = 2;
    const secondApproval = await approve(highOrder());
    const changed = await call("admin", "/api/workorders", { ...changedOrder, approvalDecisionId: secondApproval.decision.body.decision.decisionId });
    expect(changed.status).toBe(400);
    expect(changed.body.error).toContain("ORDER_FINGERPRINT_MISMATCH");

    const adminApproval = await approve(highOrder(), "admin");
    expect(adminApproval.decision.status).toBe(403);
    expect(adminApproval.decision.body.error).toBe("HIGH_RISK_DOCTOR_APPROVAL_REQUIRED");

    const statuses = {
      noApproval: withoutApproval.status,
      doctorApproval: approved.decision.status,
      adminOrder: ordered.status,
      reuse: reused.status,
      changed: changed.status,
      adminApprover: adminApproval.decision.status,
    };
    const actions = auditActions().filter((action) => action.startsWith("workorder."));
    const approvalActions = auditActions().filter((action) => ["ORDER_BLOCKED_UNAPPROVED", "APPROVAL_SIGNED", "APPROVAL_CONSUMED"].includes(action));
    const decisionStatuses = getAllDecisions().map((entry) => entry.status);
    console.log("APPROVAL_DRY_RUN_STATUSES", JSON.stringify(statuses));
    console.log("APPROVAL_DRY_RUN_AUDIT_ACTIONS", JSON.stringify(actions));
    console.log("APPROVAL_DRY_RUN_APPROVAL_AUDIT_ACTIONS", JSON.stringify(approvalActions));
    console.log("APPROVAL_DRY_RUN_DECISION_STATUSES", JSON.stringify(decisionStatuses));
    expect(actions).toContain("workorder.requested");
    expect(approvalActions).toContain("ORDER_BLOCKED_UNAPPROVED");
    expect(approvalActions).toContain("APPROVAL_SIGNED");
    expect(approvalActions).toContain("APPROVAL_CONSUMED");
    expect(decisionStatuses).toContain("APPROVED");
    expect(decisionStatuses).toContain("CONSUMED");
  });
});
