import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("RAG gateway authentication transport", () => {
  it("sends the resolved gateway key as a bearer Authorization header", async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer synthetic-rag-key");
      return new Response(JSON.stringify({ choices: [{ message: { content: "synthetic" } }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    const { openaiChatCompletions } = await import("./openaiCompatible");
    const result = await openaiChatCompletions({ baseURL: "http://127.0.0.1:31416/v1", apiKey: "synthetic-rag-key", body: { model: "auto", messages: [] } });
    expect(result.ok).toBe(true);
  });
});
