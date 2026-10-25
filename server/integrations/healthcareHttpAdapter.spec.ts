import { describe, expect, it, vi, beforeEach } from "vitest";
import { callHealthcareHttpTool } from "./healthcareHttpAdapter";

describe("healthcare HTTP adapter", () => {
  beforeEach(() => { process.env.ASTRA_HEALTHCARE_HTTP_ADAPTER_ENABLED = "true"; });
  it("fails closed when disabled", async () => {
    process.env.ASTRA_HEALTHCARE_HTTP_ADAPTER_ENABLED = "false";
    expect(await callHealthcareHttpTool("health_topics", { topic: "flu" })).toMatchObject({ ok: false, status: "disabled" });
  });
  it("calls the custom upstream and labels the provider HTTP-adapter", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ topics: ["flu"] }), { status: 200 })));
    const result = await callHealthcareHttpTool("health_topics", { topic: "flu" });
    expect(result).toMatchObject({ ok: true, provider: "HTTP-adapter", upstreamStatus: 200 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
