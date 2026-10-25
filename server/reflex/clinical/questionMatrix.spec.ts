import { beforeEach, describe, expect, it, vi } from "vitest";

describe("clinical question matrix", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env.VITEST = "1";
  });

  it("registers about 32 clinical SHADOW schemas with abstain keys and rejects probability prompts", async () => {
    const { CLINICAL_QUESTION_SCHEMAS, registerClinicalQuestionMatrix } = await import("./questionMatrix");
    const { clearRegistryForTests, list, register } = await import("../schema/registry");
    const { setSchemaMode } = await import("../confidencePolicy");
    clearRegistryForTests();
    registerClinicalQuestionMatrix();
    const schemas = list().filter((schema) => schema.id.startsWith("clinical."));
    expect(schemas.length).toBeGreaterThanOrEqual(30);
    expect(schemas.length).toBeLessThanOrEqual(40);
    expect(schemas).toHaveLength(CLINICAL_QUESTION_SCHEMAS.length);
    for (const schema of schemas) {
      expect(schema.id).toMatch(/^clinical\./);
      expect(schema.defaultMode).toBe("SHADOW");
      expect(schema.domain).toBe("clinical");
      expect(schema.abstainKeys.length).toBeGreaterThan(0);
      expect(() => setSchemaMode(schema, "AUTO")).toThrow(/Clinical schemas/);
    }
    expect(() => register({ ...schemas[0], id: "clinical.injected", question: "What is the probability of dengue?" })).toThrow(/diagnosis/);
  });

  it("runs the whole matrix in one Laya batch call", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return {
        ok: true,
        json: async () => ({ version: "test", results: body.schemas.map((schema: { id: string }) => ({ schemaId: schema.id, answer: "unknown", confidence: 0.99, scores: { unknown: 0.99 } })) }),
      } as Response;
    }));
    const { runClinicalQuestionBatch, CLINICAL_SCHEMA_IDS } = await import("./questionMatrix");
    const results = await runClinicalQuestionBatch("SYNTHETIC chest pain state");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(CLINICAL_SCHEMA_IDS.length);
  });
});
