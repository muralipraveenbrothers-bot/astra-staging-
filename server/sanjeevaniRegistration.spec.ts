import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/agents/core/ToolRegistry";

describe("Sanjeevani confirmation registration", () => {
  it("registers the confirmation tool with mandatory safety metadata", async () => {
    await import("../src/agents/specialists/SanjeevaniConfirmationAgent");
    const tool = ToolRegistry.get("confirmSanjeevaniActions");
    expect(tool).toBeDefined();
    expect(tool?.readOrWrite).toBe("WRITE");
    expect(tool?.patientScope).toBe(true);
    expect(tool?.confirmationRequired).toBe(true);
    expect(tool?.auditRequired).toBe(true);
  });
});
