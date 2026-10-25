import { describe, expect, it } from "vitest";
import express from "express";
import { registerAiGatewayRoutes } from "./routes";
import { createSession } from "../rbac";

describe("RAG route protection", () => {
  it("requires an Astra session for query and stats", async () => {
    const app = express(); app.use(express.json()); registerAiGatewayRoutes(app);
    const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as any).port}`;
      expect((await fetch(`${base}/api/rag/stats`)).status).toBe(401);
      expect((await fetch(`${base}/api/rag/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "fever" }) })).status).toBe(401);
      const token = createSession("doctor", "Doctor").sessionToken;
      expect((await fetch(`${base}/api/rag/stats`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
