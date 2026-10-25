import { describe, expect, it } from "vitest";
import { explainCase, explainDocument } from "../../src/astra/brain/part2/explain";
import { nodesToRerun, watchCaseEvent, whatChanged } from "../../src/astra/brain/part2/follow";
import { nodesForView } from "../../src/astra/brain/part2/mechanism";
import { wrapExisting7D } from "./sevenDWrap";

const fracture = "Admitted after a tibial fracture with a swollen painful leg. Distal pulses are present.";

describe("Astra brain part 2", () => {
  it("keeps the compartment story causal and does not let pulses or CK clear it", () => {
    const explained = explainCase({
      text: fracture,
      facts: {
        presentation: fracture,
        admitted: true,
        pulsesPresent: true,
        examinationReliable: false,
        comorbidities: ["CKD", "warfarin"],
        labs: [{ name: "CBC" }, { name: "CK", value: "not a clearance test" }],
      },
    });
    expect(explained.diagnosis).toBeNull();
    expect(explained.ordersPlaced).toBe(false);
    expect(explained.mechanism.pulsesReassuring).toBe(false);
    expect(explained.mechanism.chain[0]).toBe("fracture / tissue injury");
    expect(explained.mechanism.chain).toContain("reduced capillary perfusion");
    expect(explained.mechanism.chain.at(-1)).toBe("systemic consequences");
    expect(explained.mechanism.labLimitation).toMatch(/do not reliably exclude/i);
    expect(explained.mechanism.compartmentPressurePrompt).toMatch(/compartment-pressure/i);
    expect(explained.radar?.earliestSignals).toContain("pain with passive stretch");
    expect(explained.radar?.inventedBiomarker).toBe(false);
    expect(explained.investigations.hiddenInformation.join(" ")).toMatch(/unknown/i);
    expect(JSON.stringify(explained.investigations)).not.toMatch(/CBC is normal/i);
    expect(explained.disagreements).toHaveLength(1);
    expect(explained.disagreements[0]?.scientistCalled).toBe(false);
    expect(explained.workers.every((worker) => worker.treatmentChanged === false)).toBe(true);
    expect(explained.comorbidity.map((item) => item.comorbidity)).toEqual(expect.arrayContaining(["ckd", "anticoagulation"]));
    expect(explained.sections.some((section) => section.title === "Surgical considerations")).toBe(true);
    expect(explained.crossCutting.map((link) => link.from)).toContain("symptoms");
  });

  it("reruns only the nodes a new creatinine can affect", () => {
    expect(nodesToRerun("new creatinine result")).toEqual([
      "investigation_interpreter",
      "drug_safety",
      "comorbidity_overlay",
      "management",
      "monitoring",
    ]);
    expect(nodesToRerun("new creatinine result")).not.toContain("anatomical_localizer");
    const same = watchCaseEvent("creatinine 1.2", "creatinine 1.2");
    expect(same.action).toBe("record-only");
    expect(same.generativeModelStarted).toBe(false);
    const changed = watchCaseEvent("creatinine 2.4 mg/dL", "creatinine 1.1");
    expect(changed.action).toBe("update-and-rerun");
    expect(changed.rerun).not.toContain("voice");
  });

  it("shows only a real delta and leaves unknown document fields unknown", () => {
    const delta = whatChanged(
      { at: "t0", symptoms: ["pain"], signs: [], investigations: [], labs: ["creatinine 1.1"], medications: [], procedures: [], complications: [], pending: [] },
      { at: "t1", symptoms: ["pain"], signs: ["tense compartment"], investigations: [], labs: ["creatinine 1.1", "creatinine 2.4"], medications: [], procedures: [], complications: [], pending: ["doctor review"] },
    );
    expect(delta.compared).toBe(true);
    expect(delta.newSign).toEqual(["tense compartment"]);
    expect(delta.newLabTrend).toContain("creatinine 2.4");
    expect(delta.newSymptom).toEqual([]);
    const note = explainDocument("ip-note", { presentation: "tibial fracture" });
    expect(note.lines.join("\n")).toMatch(/Age: unknown/);
    expect(note.inventedFacts).toBe(false);
    const simple = explainCase({ text: "show the night census" });
    expect(simple.sections.some((section) => section.title === "Surgical considerations")).toBe(false);
    expect(nodesForView(simple.mechanism, "Cellular").map((node) => node.id)).toEqual(["CAUSE", "CELL", "TISSUE"]);
  });

  it("wraps 7D without replacing the existing synthesis", async () => {
    const wrapped = await wrapExisting7D("tibial fracture with swelling", { age: 44, comorbidities: ["diabetes"] }, "en");
    expect(wrapped.engine).toBe("Astra7DClinicalEngine");
    expect(wrapped.synthesis.d6Mechanism.molecular.length).toBeGreaterThan(0);
    expect(wrapped.synthesis.d7Decision.requiresClinicianApproval).toBe(true);
    expect(wrapped.layers.diagnosis).toBeNull();
    expect(wrapped.layers.mechanism.chain.length).toBeGreaterThan(3);
    expect(wrapped.layers.comorbidity.some((item) => item.comorbidity === "diabetes")).toBe(true);
  });
});
