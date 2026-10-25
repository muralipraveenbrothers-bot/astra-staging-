import { beforeEach, describe, expect, it } from "vitest";
import { BUILTIN_DECISION_SCHEMAS, registerBuiltins } from "./builtin";
import { clearRegistryForTests, get, register } from "./registry";
import type { DecisionSchema } from "./types";

const base: DecisionSchema = {
  id: "test_route",
  version: 1,
  kind: "choice",
  question: "Where should this message go?",
  options: [
    { key: "billing", label: "Billing", description: "payments invoices refunds" },
    { key: "lab", label: "Lab", description: "laboratory tests results" },
    { key: "unknown", label: "Unknown" },
  ],
  abstainKeys: ["unknown"],
  domain: "router",
  dataClass: "synthetic",
  defaultMode: "SHADOW",
  thresholds: { auto: 0.8, assist: 0.55, minMargin: 0.1 },
  languages: ["en", "te", "hi"],
  owner: "spec",
  createdAt: "2026-09-29T00:00:00.000Z",
};

describe("reflex schema registry", () => {
  beforeEach(() => clearRegistryForTests());

  it("rejects a choice option without a description", () => {
    expect(() => register({ ...base, options: [{ key: "billing", label: "Billing" }, base.options![1], base.options![2]] })).toThrow(/description/);
  });

  it("rejects a choice schema without an abstain key", () => {
    expect(() => register({ ...base, abstainKeys: [], options: base.options!.slice(0, 2) })).toThrow(/abstain/);
  });

  it("rejects 41 options", () => {
    const options = Array.from({ length: 40 }, (_, i) => ({ key: `o${i}`, label: `O${i}`, description: "synthetic option bucket" }));
    expect(() => register({ ...base, options: [...options, { key: "unknown", label: "Unknown" }] })).toThrow(/2-40/);
  });

  it("rejects diagnosis and disease probability schemas", () => {
    expect(() => register({ ...base, id: "diagnose_patient" })).toThrow(/diagnosis/);
    expect(() => register({ ...base, question: "What is the probability of having dengue?" })).toThrow(/diagnosis/);
  });

  it("rejects a content change without a version bump", () => {
    register(base);
    expect(() => register({ ...base, question: "Where exactly should this message go?" })).toThrow(/version bump/);
  });

  it("accepts the 13 builtins and department_routing includes human_review", () => {
    registerBuiltins();
    expect(BUILTIN_DECISION_SCHEMAS).toHaveLength(13);
    expect(get("department_routing", 1)?.options?.some((o) => o.key === "human_review")).toBe(true);
  });
});
