import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolRegistry } from "@/agents/core/ToolRegistry";

describe("Sanjeevani Confirmation Tool", () => {
  beforeEach(() => {
    // Clear the tool registry before each test
    // Note: In a real test, we might need to reset the registry
  });

  it("should confirm and execute actions", async () => {
    // Mock some actions
    const mockActions = [
      { toolId: "createLabOrder", input: { patientId: "PAT123", testName: "CBC" } },
      { toolId: "createRadiologyOrder", input: { patientId: "PAT123", modality: "X-Ray" } }
    ];

    // Mock the tool executions
    vi.spyOn(ToolRegistry, "execute")
      .mockImplementationOnce(async (toolId, input) => {
        if (toolId === "createLabOrder") return { orderId: "LAB123", status: "CREATED" };
        if (toolId === "createRadiologyOrder") return { orderId: "RAD123", status: "CREATED" };
        return {};
      });

    const result = await ToolRegistry.execute("confirmSanjeevaniActions", {
      actions: mockActions,
      patientId: "PAT123"
    });

    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
    expect(result).toHaveProperty("executedActions");
    expect(result.executedActions).toHaveLength(2);
    expect(result.executedActions).toContain("createLabOrder");
    expect(result.executedActions).toContain("createRadiologyOrder");
  });

  it("should handle execution errors", async () => {
    // Mock some actions where one fails
    const mockActions = [
      { toolId: "createLabOrder", input: { patientId: "PAT123", testName: "CBC" } },
      { toolId: "invalidTool", input: { some: "data" } }
    ];

    // Mock the tool executions - first succeeds, second fails
    vi.spyOn(ToolRegistry, "execute")
      .mockImplementationOnce(async (toolId, input) => {
        if (toolId === "createLabOrder") return { orderId: "LAB123", status: "CREATED" };
        throw new Error("Tool not found");
      });

    const result = await ToolRegistry.execute("confirmSanjeevaniActions", {
      actions: mockActions,
      patientId: "PAT123"
    });

    expect(result).toHaveProperty("success");
    expect(result.success).toBe(false); // One action failed
    expect(result).toHaveProperty("executedActions");
    expect(result.executedActions).toHaveLength(1);
    expect(result.executedActions).toContain("createLabOrder");
  });
});