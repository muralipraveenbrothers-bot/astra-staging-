import { afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const servers: Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

vi.mock("../reflex/clinical/hypercube/run", () => ({
  runHypercube: () => ({
    vectors: [],
    organEdges: [],
    redFlags: [{ kind: "red_flag", text: "level0" }],
    escalations: [{ kind: "escalate", text: "senior" }],
    missingVitals: [{ text: "vitals not recorded" }],
    passes: { ddxOrder: ["a"] },
    treatments: [{ option: "amoxicillin" }],
    modes: { "clinical.symptom.onset": "SHADOW" },
  }),
}));

vi.mock("../reflex/clinical/mesh", () => ({ patientExists: () => true }));

async function boot() {
  vi.resetModules();
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
    doctor: createSession("doctor", "Doctor").sessionToken,
    nurse: createSession("ward", "Nurse").sessionToken,
    reception: createSession("reception", "Reception").sessionToken,
  };
}

describe("hypercube route", () => {
  it("blocks reception, filters the nurse view, and hides SHADOW detail unless preview is on", async () => {
    const ctx = await boot();
    const anon = await fetch(ctx.base + "/api/reflex/clinical/hypercube", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: "SYN" }) });
    expect(anon.status).toBe(401);
    const reception = await fetch(ctx.base + "/api/reflex/clinical/hypercube", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.reception}` }, body: JSON.stringify({ patientId: "SYN" }) });
    expect(reception.status).toBe(403);
    const nurse = await fetch(ctx.base + "/api/reflex/clinical/hypercube", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.nurse}` }, body: JSON.stringify({ patientId: "SYN" }) }).then((r) => r.json());
    expect(nurse.redFlags).toHaveLength(1);
    expect(nurse.escalations).toBeUndefined();
    expect(nurse.missingVitals).toBeUndefined();
    expect(nurse.treatments).toBeUndefined();
    expect(nurse.organEdges).toBeUndefined();
    const doctor = await fetch(ctx.base + "/api/reflex/clinical/hypercube", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.doctor}` }, body: JSON.stringify({ patientId: "SYN" }) }).then((r) => r.json());
    expect(doctor.hidden).toBe(true);
    const preview = await fetch(ctx.base + "/api/reflex/clinical/hypercube", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.doctor}` }, body: JSON.stringify({ patientId: "SYN", shadowPreview: true }) }).then((r) => r.json());
    expect(preview.hidden).toBe(false);
    expect(preview.organEdges.every((edge: { reviewStatus: string }) => edge.reviewStatus === "approved")).toBe(true);
  });
});
