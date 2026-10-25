import { describe, expect, it } from "vitest";
import { brainToolTrace, executeBrainTool } from "./brain/toolRegistry";
import { serviceRegistry } from "./services/serviceRegistry";
import { ToolRegistry } from "../src/agents/core/ToolRegistry";
import { parseBrowserCommand } from "../src/astra/brain/part4/browser";

describe("tool registry contracts", () => {
  it("normalizes registered tools to Astra declarations", () => {
    const tools = ToolRegistry.listAstraTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      primaryDuty: expect.any(String),
      inputSchema: expect.any(Object),
      outputSchema: expect.any(Object),
      riskClass: expect.stringMatching(/^R[0-4]$/),
      allowedRoles: expect.any(Array),
      privacyClasses: expect.any(Array),
      timeout: expect.any(Number),
      retryPolicy: expect.any(Object),
      healthCheck: expect.any(Function),
      handler: expect.any(Function),
    }));
  });

  it("rejects role permission violations", async () => {
    const result = await executeBrainTool("hospital.census", "guest", {});
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/role/i);
  });

  it("exposes service registry browser/plugin declarations", () => {
    const laya = serviceRegistry.resolve("laya");
    expect(laya).toEqual(expect.objectContaining({
      serviceId: "laya",
      name: expect.any(String),
      primaryDuty: expect.any(String),
      url: "http://127.0.0.1:8791",
      type: expect.any(String),
      healthEndpoint: expect.any(String),
      apiCapability: true,
      embedCapability: expect.any(Boolean),
      permissions: expect.any(Array),
      actions: expect.any(Array),
      toolHandlers: expect.any(Array),
      fallback: expect.any(String),
      browserDestination: expect.any(String),
    }));
  });

  it("declares offline fallback without inventing missing capability", () => {
    expect(serviceRegistry.resolve("cognee")).toEqual(expect.objectContaining({
      fallback: expect.stringMatching(/unsupported|local memory/i),
      toolHandlers: [],
    }));
  });

  it("rejects unknown registered service opens", () => {
    expect(serviceRegistry.resolve("missing-service")).toBeNull();
  });

  it("keeps Internal Browser API-first for service and patient intents", () => {
    expect(parseBrowserCommand("/browser open laya")).toEqual(expect.objectContaining({
      action: "open-service",
      serviceId: "laya",
      method: "OPEN_SERVICE",
      apiFirst: true,
    }));
    expect(parseBrowserCommand("open patient")).toEqual(expect.objectContaining({
      method: "OPEN_PATIENT_VIEW",
      apiFirst: true,
    }));
  });

  it("marks external searches as approval-gated", () => {
    expect(parseBrowserCommand("/browser open chatgpt")).toEqual(expect.objectContaining({
      method: "SEARCH_EXTERNAL",
      external: true,
      needsApproval: true,
    }));
  });

  it("records browser/tool action traces without patient text", async () => {
    const result = await executeBrainTool("hospital.census", "doctor", { patientText: "do not record", caseId: "case-1" });
    expect(result.ok).toBe(true);
    const latest = brainToolTrace().at(-1);
    expect(latest).toEqual(expect.objectContaining({
      toolId: "hospital.census",
      executorId: "getHospitalCensus",
      allowed: true,
    }));
    expect(latest?.inputKeys).toContain("caseId");
    expect(latest?.inputKeys).not.toContain("patientText");
  });
});
