import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const servers: Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function boot() {
  const { registerAgentOpsRoutes } = await import("./agentops");
  const { createSession } = await import("../rbac");
  const app = express();
  app.use(express.json());
  registerAgentOpsRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return {
    base: "http://127.0.0.1:" + (server.address() as AddressInfo).port,
    admin: createSession("admin", "Ops Admin").sessionToken,
    reception: createSession("reception", "Ops Reception").sessionToken,
  };
}

describe("agentops routes", () => {
  it("returns 401 without auth and 403 for a non-admin on doctor and schedules", async () => {
    const ctx = await boot();
    const anon = await fetch(ctx.base + "/api/agentops/tasks");
    expect(anon.status).toBe(401);
    const doctor = await fetch(ctx.base + "/api/agentops/doctor", { headers: { Authorization: "Bearer " + ctx.reception } });
    const schedules = await fetch(ctx.base + "/api/agentops/schedules", { headers: { Authorization: "Bearer " + ctx.reception } });
    expect(doctor.status).toBe(403);
    expect(schedules.status).toBe(403);
  });
});
