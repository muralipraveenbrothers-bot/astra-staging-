import { describe, expect, it } from "vitest";
import { createReflexBrowserSession, detectBrowserChannel } from "./session";
import { runBrowserLoop } from "./browserLoop";

describe("reflex browser real UI E2E", () => {
  it("stays on the public/login surface when explicitly enabled", async (ctx) => {
    if (process.env.ASTRA_REFLEX_E2E !== "1") ctx.skip();
    const channel = await detectBrowserChannel();
    if (!channel) ctx.skip();
    try {
      const res = await fetch("http://127.0.0.1:5173", { signal: AbortSignal.timeout(1000) });
      await res.body?.cancel().catch(() => undefined);
      if (!res.ok) ctx.skip();
    } catch {
      ctx.skip();
    }
    const session = await createReflexBrowserSession("http://127.0.0.1:5173");
    try {
      const run = await runBrowserLoop({
        goal: "observe the public login page only",
        session,
        decide: async () => ({ answer: "DONE", abstained: false, confidence: 0.99, margin: 0.9 }),
        maxTicks: 1,
      });
      expect(run.status).toBe("done");
    } finally {
      await session.close();
    }
  });
});
