import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("RAG query audit", () => {
  let tempDir = "";
  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-rag-audit-"));
    process.env.ASTRA_TEST_AUTH = "1";
    process.env.ASTRA_DATA_DIR = tempDir;
    process.env.ASTRA_AUDIT_PATH = path.join(tempDir, "audit.jsonl");
    process.env.ASTRA_RAG_INDEX_PATH = path.join(tempDir, "rag-index.json");
    fs.writeFileSync(path.join(tempDir, "auth-vault.json"), "[]\n", "utf8");
  });
  afterEach(() => { process.env = { ...originalEnv }; fs.rmSync(tempDir, { recursive: true, force: true }); vi.resetModules(); });

  it("writes a PHI-safe audit entry without the question text", async () => {
    const { createSyntheticSession } = await import("../rbac");
    const { registerAiGatewayRoutes } = await import("../ai/routes");
    const { db } = await import("../db");
    const app = express(); app.use(express.json()); registerAiGatewayRoutes(app);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const session = createSyntheticSession("doctor");
      const question = "synthetic unrelated question never logged";
      const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/rag/query`, { method: "POST", headers: { Authorization: `Bearer ${session.sessionToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: question }) });
      const body = await response.json() as { answer: string; sources: unknown[]; answeredBy: string };
      const audit = db.getAuditTrail(10).find((entry) => entry.action === "RAG_QUERY");
      expect(response.status).toBe(200);
      expect(body.sources).toHaveLength(0);
      expect(body.answeredBy).toBe("none");
      expect(audit).toMatchObject({ action: "RAG_QUERY", actorRole: "doctor", status: "SUCCESS" });
      expect(audit?.details).toContain('"sourceCount":0');
      expect(audit?.details).toContain('"abstained":true');
      expect(audit?.details).not.toContain(question);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
