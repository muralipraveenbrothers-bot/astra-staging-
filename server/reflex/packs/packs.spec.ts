import { describe, expect, it } from "vitest";
import { PACKS, SCHEMA_AUTHORITY, registerPacks } from "./desks";
import { get } from "../schema/registry";

describe("hospital decision packs", () => {
  it("registers every pack in SHADOW with an abstain key and no diagnostic question", () => {
    registerPacks();
    const schemas = Object.values(PACKS).flat();
    expect(schemas.length).toBeGreaterThan(10);
    for (const schema of schemas) {
      expect(schema.defaultMode).toBe("SHADOW");
      expect(schema.abstainKeys.length).toBeGreaterThan(0);
      expect(schema.question + schema.id).not.toMatch(/diagnos|probability|prognos/i);
      expect(get(schema.id, 1)?.id).toBe(schema.id);
    }
    expect(get("reception.department", 1)?.options?.some((option) => option.key === "human_review")).toBe(true);
    expect(SCHEMA_AUTHORITY["billing.discount_request"]).toBe("APPROVAL_REQUIRED");
  });
});
