import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const servers: Server[] = [];
const prevData = process.env.ASTRA_DATA_DIR;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-knowledge-api-"));
process.env.ASTRA_DATA_DIR = dataDir;

afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  if (prevData === undefined) delete process.env.ASTRA_DATA_DIR;
  else process.env.ASTRA_DATA_DIR = prevData;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function boot() {
  const { registerKnowledgeRoutes } = await import("./knowledge");
  const { createSession } = await import("../rbac");
  const app = express();
  app.use(express.json());
  registerKnowledgeRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  return {
    base,
    doctor: createSession("doctor", "Doctor").sessionToken,
    admin: createSession("admin", "Admin").sessionToken,
    reception: createSession("reception", "Reception").sessionToken,
  };
}

describe("knowledge routes RBAC", () => {
  it("returns 401 without a session, 403 for the wrong role, and allows doctor read plus admin export", async () => {
    const ctx = await boot();
    const anon = await fetch(ctx.base + "/api/knowledge/vault");
    expect(anon.status).toBe(401);
    const reception = await fetch(ctx.base + "/api/knowledge/vault", { headers: { Authorization: `Bearer ${ctx.reception}` } });
    expect(reception.status).toBe(403);
    const doctor = await fetch(ctx.base + "/api/knowledge/vault", { headers: { Authorization: `Bearer ${ctx.doctor}` } });
    expect(doctor.status).toBe(200);
    const doctorExport = await fetch(ctx.base + "/api/knowledge/training/export", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.doctor}` }, body: "{}" });
    expect(doctorExport.status).toBe(403);
    const adminExport = await fetch(ctx.base + "/api/knowledge/training/export", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.admin}` }, body: JSON.stringify({ family: "terminology", split: "train" }) });
    expect(adminExport.status).toBe(200);
    const clinical = await fetch(ctx.base + "/api/knowledge/skills/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.admin}` },
      body: JSON.stringify({ skill: { id: "c1", version: 1, name: "C", purpose: "p", allowedRoles: ["doctor"], inputs: {}, requiredData: [], steps: [], tools: [], validation: [], approvalLevel: "L5", failureHandling: "stop", tests: [], domain: "clinical", status: "candidate" } }),
    });
    expect(clinical.status).toBe(403);
  });
});
