import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const servers: Server[] = [];
afterAll(async () => Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

async function boot() {
  const { registerReceptionDocumentRoutes } = await import("./receptionDocuments");
  const { createSession } = await import("../rbac");
  const app = express(); app.use(express.json()); registerReceptionDocumentRoutes(app);
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return { base: "http://127.0.0.1:" + (server.address() as AddressInfo).port, reception: createSession("reception", "Reception").sessionToken };
}

describe("reception document intake", () => {
  it("requires auth, extracts labeled fields, and fails closed for empty text", async () => {
    const ctx = await boot();
    expect((await fetch(ctx.base + "/api/reception/document-intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
    const headers = { "Content-Type": "application/json", Authorization: "Bearer " + ctx.reception };
    const empty = await fetch(ctx.base + "/api/reception/document-intake", { method: "POST", headers, body: JSON.stringify({ filename: "scan.jpg" }) });
    expect(empty.status).toBe(422);
    const response = await fetch(ctx.base + "/api/reception/document-intake", { method: "POST", headers, body: JSON.stringify({ filename: "registration.txt", text: "Patient Name: Rajesh Kumar\nAge: 48\nSex: Male\nUHID: UHID-2026-8801" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.fieldCount).toBe(4);
    expect(body.extracted.name.value).toBe("Rajesh Kumar");
    expect(body.provenance.inventedFields).toBe(false);
  });
});
