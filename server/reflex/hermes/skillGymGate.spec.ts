import { describe, expect, it, beforeEach, vi } from "vitest";
import { evaluateSkillGate } from "./skillGymGate";

describe("Hermes Skill Gym provenance/health gate", () => {
  beforeEach(() => { delete process.env.HERMES_SKILL_GYM_ENABLED; });

  it("fails closed while the feature flag is off", () => {
    const result = evaluateSkillGate({ skillId: "demo", provenance: "local:test", health: "healthy", authorized: true });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("feature_disabled");
  });

  it("requires provenance, live health, and authorization", () => {
    process.env.HERMES_SKILL_GYM_ENABLED = "true";
    const result = evaluateSkillGate({ skillId: "demo" });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(["provenance_required", "live_health_required", "authorization_required"]);
  });

  it("allows only a verified healthy authorized skill", () => {
    process.env.HERMES_SKILL_GYM_ENABLED = "true";
    const result = evaluateSkillGate({ skillId: "demo", provenance: "local:test", health: "healthy", authorized: true });
    expect(result.allowed).toBe(true);
    expect(result.provenance.verified).toBe(true);
  });
});
