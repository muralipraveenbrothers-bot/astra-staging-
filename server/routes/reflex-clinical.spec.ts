import { afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const servers: Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

vi.mock("../reflex/clinical/mesh", () => ({
  patientExists: () => true,
  runClinicalMesh: async () => ({
    redFlags: [{ kind: "red_flag", text: "level0", source: "level0", band: "high" }],
    board: { items: [
      { kind: "missing_info", text: "ECG", source: "rules", band: "high" },
      { kind: "escalate", text: "senior", source: "laya", band: "high" },
    ], ddxGraph: [{ id: "d1", diagnosis: "ACS", supporting: [], against: [], unexplainedFindings: [], expectedButMissing: [], dangerIfMissed: "", nextDiscriminatingStep: "ECG" }] },
    completeness: { score: 50, family: "chest_pain", missing: ["ECG"] },
    contradictions: [{ text: "contradiction", source: "rules", band: "high" }],
    latencyMs: 10,
    modes: { "clinical.x": "SHADOW" },
    causeFinder: { suggestionsOnly: true, statedAsFact: false, autoOrders: false, causeChain: "mechanism", items: [{ id: "c1", text: "Suggestion only, not a diagnosis: example" }] },
  }),
}));

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

describe("reflex clinical mesh route", () => {
  it("blocks reception, filters nurse output, and hides doctor SHADOW output unless preview is on", async () => {
    const ctx = await boot();
    const reception = await fetch(ctx.base + "/api/reflex/clinical/mesh", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.reception}` }, body: JSON.stringify({ patientId: "SYN" }) });
    expect(reception.status).toBe(403);
    const nurse = await fetch(ctx.base + "/api/reflex/clinical/mesh", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.nurse}` }, body: JSON.stringify({ patientId: "SYN" }) }).then((r) => r.json());
    expect(nurse.board.items.map((i: any) => i.kind)).toEqual(["red_flag"]);
    expect(nurse.board.ddxGraph).toHaveLength(0);
    expect(nurse.causeFinder).toBeUndefined();
    const doctor = await fetch(ctx.base + "/api/reflex/clinical/mesh", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.doctor}` }, body: JSON.stringify({ patientId: "SYN" }) }).then((r) => r.json());
    expect(doctor.hidden).toBe(true);
    expect(doctor.causeFinder?.suggestionsOnly).toBe(true);
    expect(doctor.causeFinder?.autoOrders).toBe(false);
    const preview = await fetch(ctx.base + "/api/reflex/clinical/mesh", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.doctor}` }, body: JSON.stringify({ patientId: "SYN", shadowPreview: true }) }).then((r) => r.json());
    expect(preview.hidden).toBe(false);
    expect(preview.board.ddxGraph[0].diagnosis).toBe("ACS");
  });
});
