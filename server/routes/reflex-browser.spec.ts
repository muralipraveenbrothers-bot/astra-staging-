import { afterAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const servers: Server[] = [];

afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function boot() {
  const { registerReflexRoutes } = await import("./reflex");
  const { createSession } = await import("../rbac");
  const app = express();
  app.use(express.json());
  registerReflexRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  return {
    base,
    admin: createSession("admin", "Browser Admin").sessionToken,
    marketing: createSession("marketing", "Browser Marketing").sessionToken,
  };
}

describe("reflex browser routes", () => {
  beforeEach(() => {
    delete process.env.ASTRA_REFLEX_BROWSER;
  });

  it("returns 404 while the feature flag is off", async () => {
    const ctx = await boot();
    const res = await fetch(ctx.base + "/api/reflex/browser/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ctx.admin },
      body: JSON.stringify({ goal: "open queue" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a non-staff role", async () => {
    process.env.ASTRA_REFLEX_BROWSER = "1";
    const ctx = await boot();
    const res = await fetch(ctx.base + "/api/reflex/browser/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ctx.marketing },
      body: JSON.stringify({ goal: "open queue" }),
    });
    expect(res.status).toBe(403);
  });
});
