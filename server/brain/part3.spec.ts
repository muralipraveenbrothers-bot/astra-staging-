import { describe, expect, it } from "vitest";
import { dischargeBlockers, parseCommand, reviewProgress } from "../../src/astra/brain/part3/command";
import {
  advanceEvaluation,
  classifyLearning,
  mayAutoApply,
  openEvaluation,
  proposePlugin,
  proposeRevision,
  replayCases,
  seedSkills,
} from "../../src/astra/brain/part3/evolution";
import { infectionBoundary, prophylaxisPlan, surgicalRoadmap } from "../../src/astra/brain/part3/surgery";
import { compareRegions, costEstimate, expectedStay, safeSavings } from "../../src/astra/brain/part3/value";

describe("Astra brain part 3", () => {
  it("keeps the working skill active and blocks clinical production without a reviewer", () => {
    const next = proposeRevision(seedSkills(), "discharge-summary", "Draft format.", "clinical", "Formatting only.");
    expect(next.skills.find((skill) => skill.id === "discharge-summary-v4")?.active).toBe(true);
    expect(next.draft.id).toBe("discharge-summary-v5-draft");
    expect(next.draft.active).toBe(false);
    let record = openEvaluation(next.draft, "discharge-summary-v4");
    for (let step = 0; step < 12; step += 1) record = advanceEvaluation(record);
    expect(record.stage).toBe("HUMAN_REVIEW");
    expect(record.blocked).toMatch(/reviewer/i);
    expect(mayAutoApply("navigation")).toBe(true);
    expect(mayAutoApply("drug dosing logic")).toBe(false);
    const learning = classifyLearning("preferred wording in the summary");
    expect(learning.becomesClinicalRule).toBe(false);
    const plugin = proposePlugin(["plugin-astra-brain-core"], {
      plugin_id: "plugin-astra-brain-core", name: "core", version: "1", owner: "hermes", purpose: "x",
      capabilities: [], inputs: [], outputs: [], tools: [], dependencies: [], data_classes: [], permissions: [],
      risk_class: "R4", human_approval: false, health_endpoint: "/health", fallback: "current", tests: [],
      eval_suite: "clinical", created_by: "hermes", reviewed_by: null, release_status: "proposal",
    });
    expect(plugin.appliedToProduction).toBe(false);
    expect(plugin.accepted).toBe(false);
  });

  it("does not copy past treatment or invent a surgical technique", () => {
    const replay = replayCases([]);
    expect(replay.archiveEmpty).toBe(true);
    expect(replay.applyPastTreatmentToNewPatient).toBe(false);
    const roadmap = surgicalRoadmap({ procedure: "tibial ORIF" });
    expect(roadmap.intraoperative.inventedTechnique).toBe(false);
    expect(roadmap.intraoperative.skillId).toBeNull();
    expect(roadmap.criticalPoints).toEqual([]);
    expect(roadmap.anesthesia.selectedPlan).toBeNull();
    expect(roadmap.ssi).toContain("avoid razor shaving");
    const watch = surgicalRoadmap({ procedure: "compartment watch" });
    expect(watch.criticalPoints.length).toBeGreaterThan(0);
    const plan = prophylaxisPlan({ procedure: "ORIF" });
    expect(plan.kind).toBe("SURGICAL ANTIBIOTIC PROPHYLAXIS");
    expect(plan.prolongedBecauseProcedureHappened).toBe(false);
    expect(plan.recommendedLocalProtocol).toMatch(/unknown/i);
    expect(infectionBoundary("established infection with pus")).not.toBeNull();
    expect(infectionBoundary("planned clean procedure")).toBeNull();
  });

  it("refuses a single day count, invented prices, and unsafe savings", () => {
    const stay = expectedStay({ icu: true, infection: true });
    expect(stay.dayCountShown).toBe(false);
    expect(stay.longerStayScenario).toMatch(/ICU/);
    const cost = costEstimate();
    expect(cost.low).toBeNull();
    expect(cost.principle).toBe("BEST OUTCOME PER RESOURCE USED");
    const rows = compareRegions([
      { place: "Hyderabad", item: "bed", amount: 1000 },
      {
        place: "Khammam", item: "bed", amount: 800, source: "hospital tariff", date: "2026-01-01",
        included: ["bed"], excluded: ["implant"], implantDifferences: "implant excluded", roomCategory: "general",
        surgeonAnesthesiaIncluded: false, confidence: "verified",
      },
    ], "bed");
    expect(rows.map((row) => row.place)).toEqual(["Khammam"]);
    const savings = safeSavings("repeat CT and prophylaxis continued for day 5");
    expect(savings.found).toContain("unnecessary repeat imaging");
    expect(savings.refused).toContain("premature discharge");
    expect(savings.found.join(" ")).not.toMatch(/premature discharge|cheaper implant|reduced sterility/);
  });

  it("keeps a billing block out of the clinical reason and hides agent names", () => {
    expect(dischargeBlockers("Why is this patient not discharged? The bill is unpaid.")).toEqual(["billing"]);
    const command = parseCommand("Run full differential again after the new creatinine.", "DOCTOR");
    expect(command.rerun).not.toContain("anatomical_localizer");
    expect(parseCommand("Run full differential again after the new creatinine.", "CEO").allowed).toBe(false);
    const progress = reviewProgress("lower back pain radiating to the leg");
    expect(progress.map((item) => item.label).join(" ")).not.toMatch(/agent/i);
  });
});
