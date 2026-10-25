import { describe, expect, it } from "vitest";
import express from "express";
import { createSession } from "../rbac";
import { registerCommandCenterRoutes } from "./commandCenter";

describe("command center accountability", () => {
  it("exposes terminal/unresolved accountability with escalation metadata", async () => {
    const app = express(); app.use(express.json()); registerCommandCenterRoutes(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const port = (server.address() as any).port;
      const token = createSession("ceo", "CEO").sessionToken;
      const response = await fetch(`http://127.0.0.1:${port}/api/command-center/accountability`, { headers: { Authorization: `Bearer ${token}` } });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.successCondition).toContain("escalation pathway");
      expect(Array.isArray(body.records)).toBe(true);
      for (const record of body.records.filter((item: any) => item.unresolved)) {
        expect(record).toHaveProperty("owner"); expect(record).toHaveProperty("reason"); expect(record).toHaveProperty("escalationPath");
      }
      const report = await fetch(`http://127.0.0.1:${port}/api/command-center/executive-report`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ domain: "operations", query: "overview" }) });
      expect(report.status).toBe(200);
      const reportBody = await report.json();
      expect(reportBody.report.data.source).toBe("authorized-operational-snapshot");
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
