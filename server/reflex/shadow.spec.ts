import { beforeEach, describe, expect, it } from "vitest";
import { computeDecisionHash } from "../../src/astra/approval/approvalGate";
import { _resetModesForTest, modeFor, setSchemaMode } from "./confidencePolicy";
import { maybeDemote, promoteSchema, _resetShadowForTest, type ShadowSample } from "./shadow";
import type { DecisionSchema } from "./schema/types";

const schema = {
  id: "department_routing",
  domain: "router",
  defaultMode: "SHADOW",
  thresholds: { auto: 0.9, assist: 0.65, minMargin: 0.25 },
} as DecisionSchema;

function goodRows(extra: Partial<ShadowSample> = {}): ShadowSample[] {
  const langs = ["en", "te", "hi"] as const;
  return Array.from({ length: 210 }, (_, i) => ({
    lang: langs[i % 3],
    confidence: 0.96,
    margin: 0.4,
    correct: i % 50 !== 0,
    ...extra,
  }));
}

describe("shadow promotion", () => {
  beforeEach(() => { _resetShadowForTest(); _resetModesForTest(); });

  it("refuses short samples, thin Telugu, and a missing admin reason", () => {
    expect(promoteSchema(schema, goodRows().slice(0, 199), { role: "admin", reason: "enough written reason" }).ok).toBe(false);
    const mostlyEnglish = Array.from({ length: 200 }, (_, i) => ({ lang: i < 10 ? "te" as const : "en" as const, confidence: 0.96, margin: 0.4, correct: true }));
    expect(promoteSchema(schema, mostlyEnglish, { role: "admin", reason: "enough written reason" }).ok).toBe(false);
    expect(promoteSchema(schema, goodRows(), { role: "admin", reason: "short" }).ok).toBe(false);
  });

  it("accepts a complete window and writes a hash-chained entry", () => {
    const result = promoteSchema(schema, goodRows(), { role: "admin", reason: "labelled window meets the promotion bar" });
    expect(result.ok).toBe(true);
    expect(result.entry?.previousHash).toMatch(/^[0-9a-f]{64}$/);
    const { entryHash, previousHash, ...rest } = result.entry!;
    expect(entryHash).toBe(computeDecisionHash(previousHash, rest));
    expect(modeFor(schema.id)).toBe("ASSIST");
  });

  it("demotes when rolling accuracy drops", () => {
    setSchemaMode(schema, "ASSIST");
    const recent = Array.from({ length: 100 }, () => ({ lang: "en" as const, confidence: 0.5, margin: 0.1, correct: false }));
    const result = maybeDemote(schema, recent);
    expect(result.demoted).toBe(true);
    expect(result.mode).toBe("SHADOW");
  });
});
