/**
 * ASTRA AI — RBAC security tests (Phase 2 §22)
 * ============================================
 * Proves the production auth contract:
 *   unauthenticated in production  → 401 (never mapped to a role)
 *   invalid token                  → 401
 *   doctor / admin                 → allowed per permissions
 *   wrong role                     → 403 (existing permissions untouched)
 *   dev bypass disabled (default)  → 401
 *   dev bypass enabled in dev      → controlled doctor default
 *   dev bypass set but production  → 401 (production always wins)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

vi.mock("./db", () => ({
  db: { logAudit: vi.fn(() => {}) },
}));

let cleanupFns: Array<() => Promise<void>> = [];

async function bootAuthApp(env: Record<string, string>) {
  for (const k of ["NODE_ENV", "ASTRA_DEV_AUTH_BYPASS"]) delete process.env[k];
  Object.assign(process.env, env);
  vi.resetModules();
  const { authenticate, requireRole, createSession } = await import("./rbac");
  const sessions = {
    doctor: createSession("doctor", "Test Doctor").sessionToken,
    admin: createSession("admin", "Test Admin").sessionToken,
    reception: createSession("reception", "Test Reception").sessionToken,
  };
  const app = express();
  app.post("/api/guarded", authenticate, requireRole(["doctor"]), (_req, res) =>
    res.json({ ok: true, role: (_req as any).user?.role }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const close = async () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
  cleanupFns.push(close);
  return { url: `http://127.0.0.1:${port}/api/guarded`, close, sessions };
}

afterAll(async () => {
  for (const c of cleanupFns) await c();
  delete process.env.ASTRA_DEV_AUTH_BYPASS;
  delete process.env.NODE_ENV;
});

async function post(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{}",
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as { error?: string } };
}

describe("production authentication (no anonymous doctor)", () => {
  it("rejects unauthenticated requests in production", async () => {
    const app = await bootAuthApp({ NODE_ENV: "production" });
    const r = await post(app.url);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("UNAUTHORIZED");
    await app.close();
  });

  it("rejects invalid tokens in production", async () => {
    const app = await bootAuthApp({ NODE_ENV: "production" });
    const r = await post(app.url, { Authorization: "Bearer not-a-real-token" });
    expect(r.status).toBe(401);
    await app.close();
  });

  it("rejects unauthenticated requests even when ASTRA_DEV_AUTH_BYPASS=true", async () => {
    const app = await bootAuthApp({ NODE_ENV: "production", ASTRA_DEV_AUTH_BYPASS: "true" });
    const r = await post(app.url);
    expect(r.status).toBe(401);
    await app.close();
  });
});

describe("authenticated RBAC (permissions unchanged)", () => {
  it("allows doctor on a doctor-gated route", async () => {
    const app = await bootAuthApp({ NODE_ENV: "production" });
    const r = await post(app.url, { Authorization: `Bearer ${app.sessions.doctor}` });
    expect(r.status).toBe(200);
    await app.close();
  });

  it("keeps the admin bypass on role gates", async () => {
    const app = await bootAuthApp({ NODE_ENV: "production" });
    const r = await post(app.url, { Authorization: `Bearer ${app.sessions.admin}` });
    expect(r.status).toBe(200);
    await app.close();
  });

  it("denies a non-doctor role with 403 (permissions not weakened)", async () => {
    const app = await bootAuthApp({ NODE_ENV: "production" });
    const r = await post(app.url, { Authorization: `Bearer ${app.sessions.reception}` });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("FORBIDDEN");
    await app.close();
  });
});

describe("explicit development bypass", () => {
  it("defaults to safe 401 when the bypass is disabled", async () => {
    const app = await bootAuthApp({ NODE_ENV: "development" });
    const r = await post(app.url);
    expect(r.status).toBe(401);
    await app.close();
  });

  it("still requires login when the old bypass flag is explicitly enabled in dev", async () => {
    const app = await bootAuthApp({ NODE_ENV: "development", ASTRA_DEV_AUTH_BYPASS: "true" });
    const r = await post(app.url);
    expect(r.status).toBe(401);
    await app.close();
  });
});
