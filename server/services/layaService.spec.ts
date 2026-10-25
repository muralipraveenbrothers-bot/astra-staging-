import { describe, expect, it, vi } from "vitest";
import { decideWithLaya } from "./layaService";

describe("layaService decideWithLaya compatibility", () => {
  it("keeps the old return shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, results: [{ schemaId: "department_routing", answer: "lab", confidence: 0.9, scores: { lab: 0.9, unknown: 0.1 } }] })));
    const result = await decideWithLaya("department_routing", "SYNTHETIC lab request");
    expect(result).toMatchObject({ ok: true, task: "department_routing", model: "english" });
    expect(result.answers?.department_routing.choice).toBe("lab");
    vi.restoreAllMocks();
  });
});
