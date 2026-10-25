import { afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const servers: Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function boot() {
  vi.resetModules();
  const { registerReflexRoutes, _seedDecisionForTest } = await import("./reflex");
  const { createSession } = await import("../rbac");
  _seedDecisionForTest({ decisionId: "d1", schemaId: "department_routing", stateHash: "abc", text: "SYNTHETIC should not leak", state: "raw text", patientId: "9876543210" });
  const app = express();
  app.use(express.json());
  registerReflexRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  return {
    base,
    admin: createSession("admin", "Reflex Admin").sessionToken,
    reception: createSession("reception", "Reflex Reception").sessionToken,
  };
}

describe("reflex routes", () => {
  it("rejects a non-admin mode change and never returns text or state", async () => {
    const ctx = await boot();
    const denied = await fetch(ctx.base + "/api/reflex/schemas/department_routing/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ctx.reception },
      body: JSON.stringify({ mode: "ASSIST" }),
    });
    expect(denied.status).toBe(403);
    const decisions = await fetch(ctx.base + "/api/reflex/decisions", { headers: { Authorization: "Bearer " + ctx.admin } });
    expect(decisions.status).toBe(200);
    const body = await decisions.json();
    expect(JSON.stringify(body)).not.toContain("should not leak");
    expect(JSON.stringify(body)).not.toContain("raw text");
    expect(body.decisions[0].text).toBeUndefined();
    expect(body.decisions[0].state).toBeUndefined();
  });

  it("returns 401 without a session and 403 when reception asks for a clinical pack", async () => {
    const ctx = await boot();
    const anon = await fetch(ctx.base + "/api/reflex/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schemaId: "department_routing", text: "SYNTHETIC", pack: "router" }) });
    expect(anon.status).toBe(401);
    const clinical = await fetch(ctx.base + "/api/reflex/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ctx.reception },
      body: JSON.stringify({ schemaId: "department_routing", text: "SYNTHETIC", pack: "clinical.note" }),
    });
    expect(clinical.status).toBe(403);
  });
});
