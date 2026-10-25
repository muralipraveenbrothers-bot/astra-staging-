import { describe, expect, it } from "vitest";
import { routeTwoStage } from "./twoStageRouter";

const decide = (answers: Record<string, string>) => async (schemaId: string) => ({ answer: answers[schemaId] ?? "unknown", confidence: 0.9, margin: 0.4 });

describe("two stage router", () => {
  it("asks a human when the family abstains and never calls the model", async () => {
    let calls = 0;
    const result = await routeTwoStage({ dataClass: "INTERNAL", role: "reception", decide: decide({ "router.tool_family": "unknown" }), complete: async () => { calls += 1; return "{}"; } });
    expect(result.status).toBe("ASK_HUMAN");
    expect(calls).toBe(0);
  });

  it("puts at most three tools in the prompt, rejects bad args, blocks PHI cloud, and does not execute clinical tools", async () => {
    const family = await routeTwoStage({
      dataClass: "INTERNAL", role: "reception",
      decide: decide({ "router.tool_family": "pharmacy", "router.tool_pick": "pharmacy_stock" }),
      complete: async (prompt) => { expect(prompt.split("pharmacy").length).toBeLessThan(6); expect((prompt.match(/\n/g) || []).length).toBeLessThanOrEqual(4); return "{\"valid\":false}"; },
    });
    expect(family.status).toBe("REJECTED");
    expect(family.tools.length).toBeLessThanOrEqual(3);

    let cloudCalls = 0;
    const blocked = await routeTwoStage({
      dataClass: "PHI", role: "doctor", provider: "omniroute",
      decide: decide({ "router.tool_family": "patient_lookup", "router.tool_pick": "patient_search" }),
      complete: async () => { cloudCalls += 1; return "{}"; },
    });
    expect(blocked.status).toBe("REJECTED");
    expect(cloudCalls).toBe(0);

    const clinical = await routeTwoStage({
      dataClass: "PHI", role: "doctor", provider: "ollama",
      decide: decide({ "router.tool_family": "lab", "router.tool_pick": "create_lab_order" }),
      complete: async () => "{}",
    });
    expect(clinical.status).toBe("APPROVAL");
  });
});
