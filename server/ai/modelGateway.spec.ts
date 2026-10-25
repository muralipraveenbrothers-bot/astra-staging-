import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ModelGateway,
  modelGatewayChat,
  modelGatewayHealth,
  modelGatewayMetrics,
  resetModelGatewayMetrics,
  LocalModelUnavailableError,
  readModelGatewayEnv,
} from "./modelGateway";
import { resetBreakers } from "./circuitBreaker";
import { canonicalPort, portEntries } from "../astra/supervisor/portRegistry";

const FREELLMAPI_ORIGIN = `http://${portEntries().freellmapi.host}:${canonicalPort("freellmapi")}`;
const FREELLMAPI_BASE_URL = `${FREELLMAPI_ORIGIN}/v1`;

describe("ModelGateway (Prompt 03 contract)", () => {
  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...origEnv };
    resetModelGatewayMetrics();
    resetBreakers();
  });

  afterEach(() => {
    process.env = { ...origEnv };
    globalThis.fetch = origFetch;
    resetModelGatewayMetrics();
    resetBreakers();
  });

  it("reads configuration from one unified env layer with sane defaults", () => {
    process.env.ASTRA_LLM_BASE_URL = FREELLMAPI_BASE_URL;
    process.env.ASTRA_LLM_API_KEY = "test-key-123";
    process.env.ASTRA_LLM_DEFAULT_MODEL = "auto";
    process.env.ASTRA_LLM_LOCAL_MODEL = "llama3.2:3b";
    process.env.ASTRA_LLM_TIMEOUT_MS = "45000";
    process.env.ASTRA_LLM_MAX_RETRIES = "3";
    process.env.ASTRA_LLM_LOCAL_ALLOWLIST = "llama3.2:3b,qwen2.5:7b";

    const env = readModelGatewayEnv();
    expect(env.baseUrl).toBe(FREELLMAPI_BASE_URL);
    expect(env.apiKey).toBe("test-key-123");
    expect(env.defaultModel).toBe("auto");
    expect(env.localModel).toBe("llama3.2:3b");
    expect(env.timeoutMs).toBe(45000);
    expect(env.maxRetries).toBe(3);
    expect(env.localAllowlist).toEqual(["llama3.2:3b", "qwen2.5:7b"]);
  });

  it("probes health in the exact order: /api/ping, /readyz, /v1/models?ready=true", async () => {
    const urlsCalled: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urlsCalled.push(url);
      if (url.includes("/api/ping")) {
        return new Response("pong", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as any;

    const health = await modelGatewayHealth();
    expect(health.order).toEqual(["GET /api/ping", "GET /readyz", "GET /v1/models?ready=true"]);
    expect(health.freellmapi).toBe(true);
    expect(urlsCalled[0]).toContain("/api/ping");
  });

  it("routes through FreeLLMAPI when primary is healthy and logs answeredBy", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`${FREELLMAPI_BASE_URL}/chat/completions`)) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "FreeLLMAPI online" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("fail", { status: 500 });
    }) as any;

    const res = await modelGatewayChat({
      messages: [{ role: "user", content: "hello world" }],
      dataClass: "PUBLIC",
    });

    expect(res.answeredBy).toBe("freellmapi");
    expect(res.text).toBe("FreeLLMAPI online");
    expect(res.status).toBe(200);

    const m = modelGatewayMetrics();
    expect(m.byRoute.freellmapi.successes).toBe(1);
    expect(m.blockedDeprecatedFallbacks).toBe(0);
  });

  it("refuses a deprecated gateway fallback when FreeLLMAPI is down", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(`${FREELLMAPI_ORIGIN}/`)) {
        return new Response("gateway timeout", { status: 504 });
      }
      if (url.includes("/v1/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "OmniRoute takeover response" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as any;

    process.env.ASTRA_LLM_MAX_RETRIES = "0";

    await expect(ModelGateway.chat({
      messages: [{ role: "user", content: "test query" }],
      dataClass: "INTERNAL",
    })).rejects.toThrow("FREELLMAPI_UNAVAILABLE");
    const m = modelGatewayMetrics();
    expect(m.blockedDeprecatedFallbacks).toBe(1);
    expect(m.byRoute.freellmapi.failures).toBeGreaterThan(0);
  });

  it("PRIVACY MANDATORY: refuses remote fallback for PHI and fails closed with LOCAL_MODEL_UNAVAILABLE", async () => {
    let remoteCalled = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(FREELLMAPI_ORIGIN) || url.includes(":20128") || url.includes(":5171")) {
        remoteCalled = true;
      }
      return new Response("local engine offline", { status: 500 });
    }) as any;

    process.env.ASTRA_LLM_LOCAL_MODEL = "llama3.2:3b";
    process.env.ASTRA_LLM_LOCAL_ALLOWLIST = "llama3.2:3b";

    await expect(
      modelGatewayChat({
        model: "llama3.2:3b",
        messages: [{ role: "user", content: "Patient UHID-2026-9901 platelets 45k" }],
        dataClass: "PHI",
      }),
    ).rejects.toThrow(LocalModelUnavailableError);

    expect(remoteCalled).toBe(false);
    const m = modelGatewayMetrics();
    expect(m.phiLocalOnly).toBe(1);
    expect(m.localUnavailable).toBe(1);
  });

  it("PRIVACY MANDATORY: NEVER uses FreeLLMAPI 'auto' for PHI", async () => {
    await expect(
      modelGatewayChat({
        model: "auto",
        messages: [{ role: "user", content: "PHI data" }],
        dataClass: "PHI",
      }),
    ).rejects.toThrow("cannot use model \"auto\"");
  });

  it("blocks unapproved models for PHI even if requested", async () => {
    process.env.ASTRA_LLM_LOCAL_ALLOWLIST = "llama3.2:3b";
    await expect(
      modelGatewayChat({
        model: "gpt-4o-remote",
        messages: [{ role: "user", content: "PHI data" }],
        dataClass: "PHI",
      }),
    ).rejects.toThrow("is not on the local PHI allowlist");
  });

  it("routes clean PHI successfully to the local model without remote calls", async () => {
    let remoteCalled = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(FREELLMAPI_ORIGIN) || url.includes(":20128") || url.includes(":5171")) {
        remoteCalled = true;
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "Local private reasoning" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    process.env.ASTRA_LLM_LOCAL_MODEL = "llama3.2:3b";
    process.env.ASTRA_LLM_LOCAL_ALLOWLIST = "llama3.2:3b";

    const res = await modelGatewayChat({
      model: "llama3.2:3b",
      messages: [{ role: "user", content: "UHID-12345 labs" }],
      dataClass: "PHI",
    });

    expect(res.answeredBy).toBe("ollama");
    expect(res.text).toBe("Local private reasoning");
    expect(remoteCalled).toBe(false);
  });

  it("optional live FreeLLMAPI test controlled by env flag (ASTRA_LIVE_GATEWAY_TEST=1)", async () => {
    if (process.env.ASTRA_LIVE_GATEWAY_TEST !== "1") {
      expect(true).toBe(true);
      return;
    }
    const res = await modelGatewayChat({
      messages: [{ role: "user", content: "ping" }],
      dataClass: "PUBLIC",
    });
    expect(res.status).toBe(200);
    expect(res.answeredBy).toBe("freellmapi");
  });
});

