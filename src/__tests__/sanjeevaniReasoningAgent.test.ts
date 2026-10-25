import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolRegistry } from "@/agents/core/ToolRegistry";
import { LangGraphOrchestrator } from "@/agents/core/LangGraphOrchestrator";

// Mock the LangGraphOrchestrator
vi.mock("@/agents/core/LangGraphOrchestrator", () => ({
  LangGraphOrchestrator: {
    executeGraph: vi.fn().mockResolvedValue({
      finalResult: {
        understanding: "Test understanding",
        differential: { likely: ["Test diagnosis"] },
        keyFindings: ["Test finding"]
      }
    })
  }
}));

describe("Sanjeevani Reasoning Tool", () => {
  beforeEach(() => {
    // Clear the tool registry before each test
    // Note: In a real test, we might need to reset the registry
  });

  it("should run reasoning and return structured response", async () => {
    const result = await ToolRegistry.execute("runSanjeevaniReasoning", {
      text: "What is the diagnosis for fever?",
      patientId: "PAT123"
    });

    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("differential");
    expect(result).toHaveProperty("recommendations");
    expect(result.summary).toBe("Test understanding");
    expect(result.differential).toContain("Test diagnosis");
    expect(result.recommendations).toContain("Test finding");
  });

  it("should handle errors gracefully", async () => {
    // Mock the orchestrator to throw an error
    vi.mocked(LangGraphOrchestrator.executeGraph).mockRejectedValueOnce(new Error("Test error"));

    await expect(
      ToolRegistry.execute("runSanjeevaniReasoning", {
        text: "What is the diagnosis for fever?",
        patientId: "PAT123"
      })
    ).rejects.toThrow("Test error");
  });
});