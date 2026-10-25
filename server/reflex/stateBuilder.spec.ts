import { describe, expect, it } from "vitest";
import { BUILTIN_DECISION_SCHEMAS } from "./schema/builtin";
import { buildState } from "./stateBuilder";

describe("reflex stateBuilder", () => {
  it("is compact, deterministic, and redacts identifiers", () => {
    const schema = BUILTIN_DECISION_SCHEMAS[0];
    const input = { text: { value: "SYNTHETIC call from 9876543210 aadhaar 123456789012", identifier: false }, name: { value: "Synthetic Person", identifier: true } };
    const a = buildState(input, schema);
    const b = buildState(input, schema);
    expect(a.state.length).toBeLessThanOrEqual(1400);
    expect(a.stateHash).toBe(b.stateHash);
    expect(a.state).not.toContain("9876543210");
    expect(a.state).not.toContain("123456789012");
  });
});
