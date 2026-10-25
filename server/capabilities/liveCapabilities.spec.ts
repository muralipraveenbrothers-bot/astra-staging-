/**
 * ASTRA AI — Live capability registry tests (Phase 2 §23 / §24 / §36)
 * ===================================================================
 * Truth contract: a service that is merely configured is never reported ready;
 * an unreachable optional service is configured:false/reachable:false; language
 * claims only list reachable providers. The module reads env at import time, so
 * each test resets modules and re-imports after stubbing env.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../ai/providerRegistry", () => ({
  getAiProvidersHealth: vi.fn(async () => [
    { id: "gemini", provider: "Google Gemini", status: "unavailable", latencyMs: 0, keyConfigured: false, checkedAt: "", model: "gemini-2.0-flash", detail: "GEMINI_API_KEY not configured" },
    { id: "freellmapi", provider: "FreeLLMAPI", status: "healthy", latencyMs: 12, keyConfigured: true, checkedAt: "" },
  ]),
}));

vi.mock("../ws/avatarGateway", () => ({
  wsGatewayStatus: () => ({ configured: true, running: true, path: "/ws/avatar", connections: 1 }),
}));

beforeEach(() => {
  vi.stubEnv("LINLY_ENABLED", "false");
  vi.stubEnv("LIVE_AVATAR_ENABLED", "false");
  vi.stubEnv("VOICEBOX_URL", "http://127.0.0.1:9/unreachable");
  vi.stubEnv("A2F_CONTROLLER_URL", "http://127.0.0.1:9/unreachable");
  vi.stubEnv("LINLY_BASE_URL", "");
  vi.stubEnv("LIVE_AVATAR_BASE_URL", "");
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadCaps() {
  const { collectLiveCapabilities } = await import("./liveCapabilities");
  return collectLiveCapabilities();
}

describe("capability truth matrix", () => {
  it("reports AI providers from the provider registry health", async () => {
    const caps = await loadCaps();
    const gemini = (caps.ai as { id: string; configured: boolean; ready: boolean; lastError?: string }[]).find((p) => p.id === "gemini");
    const free = (caps.ai as { id: string; ready: boolean }[]).find((p) => p.id === "freellmapi");
    expect(gemini?.configured).toBe(false);
    expect(gemini?.ready).toBe(false);
    expect(free?.ready).toBe(true);
    expect(gemini?.lastError).toContain("GEMINI_API_KEY");
  });

  it("never reports a disabled optional service as ready", async () => {
    const caps = await loadCaps();
    const linly = (caps.voice.providers as { id: string; configured: boolean; ready: boolean }[]).find((p) => p.id === "linly");
    const live = (caps.avatar.providers as { id: string; configured: boolean; ready: boolean }[]).find((p) => p.id === "live-avatar");
    expect(linly?.configured).toBe(false);
    expect(linly?.ready).toBe(false);
    expect(live?.configured).toBe(false);
    expect(live?.ready).toBe(false);
  });

  it("does not populate the language matrix from unreachable providers", async () => {
    const caps = await loadCaps();
    expect(Object.keys(caps.voice.languages).length).toBe(0);
    expect(caps.voice.textOnlyFallback).toBe(true);
  });

  it("exposes the websocket gateway status truthfully", async () => {
    const caps = await loadCaps();
    expect(caps.websocket).toMatchObject({ configured: true, running: true });
  });

  it("never leaks credentials or keys", async () => {
    const caps = await loadCaps();
    const raw = JSON.stringify(caps);
    expect(raw).not.toMatch(/AIza|sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9]{16,}/i);
  });
});