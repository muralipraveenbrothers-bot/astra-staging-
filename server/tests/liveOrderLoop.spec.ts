import express from "express";
import type { Express } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let app: Express;
let server: ReturnType<Express["listen"]>;
let baseUrl = "";
let tempDir = "";
let sessions: Record<string, string> = {};
let realFetch: typeof globalThis.fetch;
let workOrderEngine: typeof import("../services/workOrders").workOrderEngine;
let listWorkOrderNotifications: typeof import("../services/workOrderNotifications").listWorkOrderNotifications;
let listClinicalReviewTasks: typeof import("../services/workOrderNotifications").listClinicalReviewTasks;
let processClinicalEscalationTasks: typeof import("../services/workOrderNotifications").processClinicalEscalationTasks;

function auditLines(): Array<{ action: string; actorRole: string; status: string }> {
  const file = process.env.ASTRA_AUDIT_PATH!;
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function readNotificationsFor(orderId: string) {
  return listWorkOrderNotifications().filter((notification) => notification.orderId === orderId);
}

async function call(role: string, route: string, bodyInput?: unknown) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: bodyInput === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${sessions[role]}`, "content-type": "application/json" },
    body: bodyInput === undefined ? undefined : JSON.stringify(bodyInput),
  });
  const raw = await response.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new Error(`HTTP ${response.status} returned non-JSON response for ${route}`); }
  return { status: response.status, body };
}

function makeEmptyTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-live-order-"));
  fs.writeFileSync(path.join(dir, "auth-vault.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(dir, "hospital.json"), JSON.stringify({
    patients: [], beds: [], orders: [], pharmacyInventory: [], otCases: [], tasks: [], bills: [], attentionItems: [],
  }), "utf8");
  fs.writeFileSync(path.join(dir, "hospital_profile.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(dir, "work-orders.json"), JSON.stringify({ orders: [], staff: [], seq: 0 }), "utf8");
  fs.writeFileSync(path.join(dir, "work-order-notifications.json"), JSON.stringify({ notifications: [], seq: 0 }), "utf8");
  return dir;
}

beforeAll(async () => {
  vi.resetModules();
  process.env.ASTRA_TEST_AUTH = "1";
  tempDir = makeEmptyTempDataDir();
  process.env.ASTRA_DATA_DIR = tempDir;
  process.env.ASTRA_HOSPITAL_DB_PATH = path.join(tempDir, "hospital.json");
  process.env.ASTRA_HOSPITAL_PROFILE_PATH = path.join(tempDir, "hospital_profile.json");
  process.env.ASTRA_WORK_ORDERS_DB_PATH = path.join(tempDir, "work-orders.json");
  process.env.ASTRA_WORK_ORDER_NOTIFICATIONS_PATH = path.join(tempDir, "work-order-notifications.json");
  process.env.ASTRA_AUDIT_PATH = path.join(tempDir, "audit.jsonl");

  const { authenticate, createSyntheticSession } = await import("../rbac");
  const { registerWorkOrderRoutes } = await import("../routes/workOrders");
  ({ workOrderEngine } = await import("../services/workOrders"));
  ({ listWorkOrderNotifications, listClinicalReviewTasks, processClinicalEscalationTasks } = await import("../services/workOrderNotifications"));

  app = express();
  app.use(express.json());
  app.use(authenticate);
  registerWorkOrderRoutes(app);

  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("loopback server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;

  sessions = {
    doctor: createSyntheticSession("doctor").sessionToken,
    billing: createSyntheticSession("billing").sessionToken,
    reception: createSyntheticSession("reception").sessionToken,
    lab: createSyntheticSession("lab").sessionToken,
    supervisor: createSyntheticSession("supervisor").sessionToken,
    admin: createSyntheticSession("admin").sessionToken,
    ceo: createSyntheticSession("ceo").sessionToken,
  };

  realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = input instanceof Request
      ? new URL(input.url)
      : new URL(typeof input === "string" ? input : input.toString());
    if (requestUrl.hostname !== "127.0.0.1" || Number(requestUrl.port) !== Number(address.port)) {
      return Promise.reject(new Error(`blocked outbound call ${requestUrl.hostname}:${requestUrl.port}`));
    }
    return realFetch(input, init);
  }) as typeof globalThis.fetch;

  await expect(fetch("http://127.0.0.1:31416/v1/models")).rejects.toThrow("blocked outbound call");
  expect((await call("doctor", "/api/workorders/dashboard")).status).toBe(200);
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  delete process.env.ASTRA_TEST_AUTH;
  delete process.env.ASTRA_DATA_DIR;
  delete process.env.ASTRA_HOSPITAL_DB_PATH;
  delete process.env.ASTRA_HOSPITAL_PROFILE_PATH;
  delete process.env.ASTRA_WORK_ORDERS_DB_PATH;
  delete process.env.ASTRA_WORK_ORDER_NOTIFICATIONS_PATH;
  delete process.env.ASTRA_AUDIT_PATH;
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("isolated synthetic work-order loop", () => {
  it("runs the real paid order loop and records ordered transitions", async () => {
    const created = await call("doctor", "/api/workorders", {
      patientId: "SYNTHETIC-ID", patientName: "Synthetic Patient", bed: "Synthetic Bed", ward: "Synthetic Ward",
      department: "Lab", serviceCode: "SYNTH-CBC", serviceName: "Synthetic CBC", priority: "ROUTINE", slaMinutes: 30,
    });
    expect(created.status).toBe(201);
    expect(Object.keys(created.body as object)).toContain("id");
    const id = created.body.id;
    expect((await call("billing", `/api/workorders/${id}/bill`, { amount: 100 })).status).toBe(200);
    expect((await call("reception", `/api/workorders/${id}/pay`, { reference: "SYNTHETIC" })).status).toBe(200);
    expect((await call("lab", `/api/workorders/${id}/ack`, {})).status).toBe(200);
    expect((await call("lab", `/api/workorders/${id}/start`, {})).status).toBe(200);
    expect((await call("lab", `/api/workorders/${id}/complete`, { resultSummary: "Synthetic result" })).status).toBe(200);
    expect((await call("doctor", `/api/workorders/${id}/review`, { notes: "Synthetic review" })).status).toBe(200);

    const actions = auditLines().filter((entry) => entry.action.startsWith("workorder.")).map((entry) => entry.action);
    console.log("ORDERED_TRANSITIONS", JSON.stringify(actions));
    expect(actions).toEqual(expect.arrayContaining([
      "workorder.requested", "workorder.validated", "workorder.bill_required", "workorder.bill_created",
      "workorder.payment_pending", "workorder.paid", "workorder.released", "workorder.acknowledged",
      "workorder.in_progress", "workorder.completed", "workorder.result_ready", "workorder.reviewed",
    ]));
  });

  it("escalates once and emits supervisor/admin/CEO notifications plus one brain event", async () => {
    const created = await call("doctor", "/api/workorders", {
      patientId: "SYNTHETIC-SLA-ID", patientName: "Synthetic SLA Patient", bed: "Synthetic Bed", ward: "Synthetic Ward",
      department: "Lab", serviceCode: "SYNTH-SLA", serviceName: "Synthetic SLA", priority: "ROUTINE", slaMinutes: 1,
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const liveOrder = workOrderEngine.getOrder(id)!;
    liveOrder.createdAt = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(workOrderEngine.getOrder(id)).toBe(liveOrder);

    const first = workOrderEngine.checkSla();
    expect(first.some((entry) => entry.order.id === id && entry.action === "ESCALATE")).toBe(true);
    expect(workOrderEngine.getOrder(id)?.status).toBe("ESCALATED");
    const firstNotifications = readNotificationsFor(id);
    console.log("ESCALATION_RECIPIENT_ROLES", JSON.stringify(firstNotifications.map((entry) => entry.recipientRole).sort()));
    expect(firstNotifications.map((entry) => entry.recipientRole)).toEqual(expect.arrayContaining(["supervisor", "admin", "ceo"]));
    const firstBrainEvents = auditLines().filter((entry) => entry.action === "CLINICAL_BRAIN_ORDER_ESCALATION");
    console.log("CLINICAL_BRAIN_AUDIT_COUNT", firstBrainEvents.length);
    expect(firstBrainEvents).toHaveLength(1);

    workOrderEngine.checkSla();
    expect(readNotificationsFor(id)).toEqual(firstNotifications);
    expect(auditLines().filter((entry) => entry.action === "CLINICAL_BRAIN_ORDER_ESCALATION")).toHaveLength(1);
  });

  it("reaches final CEO escalation with an injected clock", async () => {
    const task = listClinicalReviewTasks("doctor")[0];
    expect(task).toBeDefined();
    let now = Date.parse(task!.dueAt);
    processClinicalEscalationTasks(now);
    now = Date.parse(listClinicalReviewTasks("doctor")[0].dueAt);
    processClinicalEscalationTasks(now);
    now = Date.parse(listClinicalReviewTasks("doctor")[0].dueAt);
    processClinicalEscalationTasks(now);
    expect(auditLines().some((entry) => entry.action === "CLINICAL_BRAIN_FINAL_CEO_ESCALATION")).toBe(true);
  });
});
