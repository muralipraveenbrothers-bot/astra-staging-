import { describe, expect, it } from "vitest";
import { runCascade } from "./cascade";

describe("reflex cascade", () => {
  it("does not call a model for T0 and keeps Micro Astra on the allow-list", async () => {
    let calls = 0;
    const t0 = await runCascade({ text: "Open pharmacy dashboard", tier: "T0", gateway: async () => { calls += 1; return { ok: true }; } });
    expect(calls).toBe(0);
    expect(t0.llmCalls).toBe(0);
    const seen: string[][] = [];
    await runCascade({
      text: "Tell reception Dr X arrives in 15 min",
      tier: "T2",
      gateway: async (call) => { seen.push(call.tools); return { ok: true }; },
    });
    expect(seen[0]).not.toContain("issue_refund");
    expect(seen[0]).not.toContain("sign_prescription");
    expect(seen[0]?.length).toBeLessThanOrEqual(8);
  });

  it("escalates a failed T2, keeps PHI local, skips uncertain Micro Astra, and does not lower delete risk", async () => {
    const hops: string[] = [];
    const escalated = await runCascade({
      text: "draft",
      tier: "T2",
      gateway: async (call) => { hops.push(call.tier); return { ok: call.tier !== "T2" }; },
    });
    expect(hops).toEqual(["T2", "T3"]);
    const phi = await runCascade({
      text: "phi", tier: "T3", dataClass: "PHI",
      gateway: async (call) => { expect(call.localOnly).toBe(true); return { ok: true }; },
    });
    expect(phi.tier).toBe("T3");
    const uncertain = await runCascade({ text: "maybe", tier: "T2", micro: "uncertain", gateway: async (call) => { expect(call.tier).not.toBe("T2"); return { ok: true }; } });
    expect(uncertain.tier).not.toBe("T2");
    const raised = await runCascade({ text: "sort", tier: "T0", action: "queue_sort", layaRisk: 5, gateway: async () => ({ ok: true }) });
    expect(raised.risk).toBe("high");
    const kept = await runCascade({ text: "delete", tier: "T0", action: "delete_patient", layaRisk: 1, gateway: async () => ({ ok: true }) });
    expect(kept.risk).toBe("high");
  });
});
