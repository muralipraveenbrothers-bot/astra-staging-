/**
 * Clinical approval routes require a real session (Round 4 prompt 10).
 * No logged-in user = 401. No fallback doctor id.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const servers: Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function boot() {
  vi.resetModules();
  const { registerClinicalApprovalRoutes } = await import("./clinicalApproval");
  const { createSession } = await import("../rbac");
  const app = express();
  app.use(express.json());
  registerClinicalApprovalRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    doctor: createSession("doctor", "Approval Test Doctor").sessionToken,
    reception: createSession("reception", "Approval Test Reception").sessionToken,
  };
}

const post = (url: string, body: unknown, token?: string) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

describe("clinical approval routes: login required", () => {
  it("returns 401 on every route without a session", async () => {
    const { base } = await boot();
    for (const path of ["/api/clinical/action/stage", "/api/clinical/approval/sign", "/api/clinical/action/commit"]) {
      const r = await post(`${base}${path}`, { actionId: "x", actionHash: "y" });
      expect(r.status, path).toBe(401);
    }
  });

  it("lets a logged-in doctor reach the handlers (no 401) and blocks non-doctors from signing", async () => {
    const { base, doctor, reception } = await boot();
    const sign = await post(`${base}/api/clinical/approval/sign`, { actionId: "missing", actionHash: "h" }, doctor);
    expect(sign.status).toBe(403);
    expect(((await sign.json()) as { error?: string }).error).toContain("STAGED_ACTION_NOT_FOUND");
    const commit = await post(`${base}/api/clinical/action/commit`, { actionId: "missing" }, doctor);
    expect(commit.status).toBe(400);
    const receptionSign = await post(`${base}/api/clinical/approval/sign`, { actionId: "missing", actionHash: "h" }, reception);
    expect(receptionSign.status).toBe(403);
    expect(((await receptionSign.json()) as { error?: string }).error).toBe("FORBIDDEN");
  });
});