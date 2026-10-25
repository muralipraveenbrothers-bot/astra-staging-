import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
const entry = (online: boolean, level: "live" | "offline" = online ? "live" : "offline") => ({ online, level });

describe("workspace runtime readiness", () => {
  it("is healthy when all required services are live", async () => {
    const { combineRequiredStatus } = await import("./runtimeStatus");
    expect(combineRequiredStatus({ "astra-api": entry(true), freellmapi: entry(true), laya: entry(true), ollama: entry(true), voicebox: entry(false) })).toBe("HEALTHY");
  });
  it("is degraded when one required service is down", async () => {
    const { combineRequiredStatus } = await import("./runtimeStatus");
    expect(combineRequiredStatus({ "astra-api": entry(true), freellmapi: entry(false), laya: entry(true), ollama: entry(true) })).toBe("DEGRADED");
  });
  it("keeps voicebox offline as a warning rather than degrading required status", async () => {
    const { combineRequiredStatus } = await import("./runtimeStatus");
    expect(combineRequiredStatus({ "astra-api": entry(true), freellmapi: entry(true), laya: entry(true), ollama: entry(true), voicebox: entry(false) })).toBe("HEALTHY");
  });
  it("sends the gateway Authorization header to FreeLLMAPI /v1/models", async () => {
    vi.stubEnv("FREELLMAPI_API_KEY", "synthetic-test-key");
    const request = vi.fn(async (_input: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer synthetic-test-key");
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    const { collectRuntimeStatus } = await import("./runtimeStatus");
    const { services } = await collectRuntimeStatus();
    expect(services.freellmapi).toMatchObject({ level: "live", online: true });
    expect(request.mock.calls.some(([url]) => String(url).includes("/v1/models"))).toBe(true);
  });
  it("warns when Ollama is reachable but has no models", async () => {
    const { ollamaModelsAvailable } = await import("./runtimeStatus");
    expect(ollamaModelsAvailable({ models: [] })).toBe(false);
    expect(ollamaModelsAvailable({ models: [{ name: "synthetic" }] })).toBe(true);
  });
});
