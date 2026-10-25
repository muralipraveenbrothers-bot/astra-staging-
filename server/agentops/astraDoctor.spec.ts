import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildAstraDoctor } from "./astraDoctor";

describe("astra doctor", () => {
  it("reports warming, a down local model, and env names only", async () => {
    const source = fs.readFileSync(path.resolve("server/agentops/astraDoctor.ts"), "utf8");
    expect(source).not.toMatch(/child_process/);
    const secret = "super-secret-value";
    const fetchImpl = async (url: string) => {
      if (url.includes("8791")) return { ok: true, json: async () => ({ status: "warming" }) };
      if (url.includes("11434")) throw new Error("connection refused");
      return { ok: true, json: async () => ({ ok: true }) };
    };
    const report = await buildAstraDoctor({
      fetchImpl,
      env: { ASTRA_LLM_LOCAL_MODEL: secret },
      ports: {},
    });
    const byId = Object.fromEntries(report.components.map((row) => [row.id, row]));
    expect(byId.Laya.state).toBe("DEGRADED");
    expect(byId.Laya.reason).toBe("warming");
    expect(byId.Ollama.state).toBe("FAILED");
    expect(byId.Ollama.reason.length).toBeGreaterThan(0);
    expect(byId.n8n).toBeUndefined();
    expect(byId.OmniRoute).toBeUndefined();
    expect(byId["env:ASTRA_BACKUP_DIR"].state).toBe("MISCONFIGURED");
    expect(byId["env:ASTRA_BACKUP_DIR"].reason).toBe("ASTRA_BACKUP_DIR");
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(report.credentials.find((row) => row.name === "ASTRA_LLM_LOCAL_MODEL")?.present).toBe(true);
  });
});
