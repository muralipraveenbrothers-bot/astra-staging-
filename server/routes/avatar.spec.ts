/**
 * ASTRA AI — Avatar route tests (§23 / §27 / §22)
 * ===============================================
 * 1. A2F endpoints are env-configurable (A2F_CONTROLLER_URL) — proven by
 *    pointing the route at a local stub server and seeing its response.
 * 2. Honest degradation: when the configured A2F endpoint is unreachable the
 *    routes report OFFLINE / 503 — never a fabricated "connected" status.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import express from "express";
import type { AddressInfo } from "node:net";

let stubServer: http.Server;
let stubPort = 0;
let stubHits = 0;

beforeAll(async () => {
  stubServer = http.createServer((_req, res) => {
    stubHits += 1;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ engine: "STUB_A2F", status: "READY", hit: stubHits }));
  });
  await new Promise<void>((resolve) => stubServer.listen(0, "127.0.0.1", resolve));
  stubPort = (stubServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
});

/**
 * Loads the avatar route module with a fresh module registry so that the
 * module-level `A2F_CONTROLLER_URL` read picks up the given URL. ESM caches
 * modules, so every env scenario requires a resetModules() re-import.
 */
async function loadRoutes(a2fUrl: string) {
  process.env.A2F_CONTROLLER_URL = a2fUrl;
  vi.resetModules();
  const { registerAvatarRoutes } = await import("./avatar");
  // Avatar routes require login: mint a real session in the SAME module
  // registry the routes were loaded into (no fixed demo tokens).
  const { createSession } = await import("../rbac");
  const session = createSession("doctor", "Avatar Test Doctor").sessionToken;
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerAvatarRoutes(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    auth: { Authorization: `Bearer ${session}` },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("avatar routes — env-configurable endpoint", () => {
  it("probes A2F at A2F_CONTROLLER_URL, not the hardcoded default", async () => {
    const app = await loadRoutes(`http://127.0.0.1:${stubPort}`);
    try {
      const r = await fetch(`${app.base}/api/avatar/status`, { headers: app.auth });
      const body = (await r.json()) as { engine?: string; status?: string };
      expect(stubHits).toBeGreaterThan(0);
      expect(body.engine).toBe("STUB_A2F");
      expect(body.status).toBe("READY");
    } finally {
      await app.close();
    }
  });
});

describe("avatar routes — honest offline degradation", () => {
  it("reports OFFLINE (never connected) when A2F is unreachable", async () => {
    const app = await loadRoutes("http://127.0.0.1:9/nope");
    try {
      const r = await fetch(`${app.base}/api/avatar/status`, { headers: app.auth });
      const body = (await r.json()) as { status?: string; error?: string };
      expect(body.status).toBe("OFFLINE");
      expect(body.error).toBeTruthy();
      const r2 = await fetch(`${app.base}/api/avatar/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...app.auth },
        body: JSON.stringify({ text: "hello" }),
      });
      expect(r2.status).toBe(503);
    } finally {
      await app.close();
    }
  });

  it("rejects /api/avatar/speak without text", async () => {
    const app = await loadRoutes("http://127.0.0.1:9/nope");
    try {
      const r = await fetch(`${app.base}/api/avatar/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...app.auth },
        body: JSON.stringify({}),
      });
      expect(r.status).toBe(400);
      const body = (await r.json()) as { error?: string };
      expect(body.error).toBe("MISSING_TEXT");
    } finally {
      await app.close();
    }
  });
});
