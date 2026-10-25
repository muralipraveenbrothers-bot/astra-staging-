import { describe, it, expect } from "vitest";
import { runD7Workflow } from "./D7Workflow";
import { qSOFA, HEART } from "./ruleEngine";
import type { D7CasePacket } from "./d7Types";

/** Synthetic acute-chest-pain packet — TEST DATA ONLY (spec §68). */
const chestPainPacket: D7CasePacket = {
  patient: {
    id: "TEST-P-54",
    encounterId: "TEST-E-1",
    age: 54,
    sex: "male",
    allergies: ["penicillin"],
    comorbidities: ["diabetes"],
    medications: ["metformin"],
  },
  chiefComplaint: "chest pain",
  dominantSymptom: "chest pain",
  severity: "severe",
  vitals: {
    bp: { value: "90/60", provenance: "PATIENT_FACT" },
    heartRate: { value: 110, provenance: "PATIENT_FACT" },
  },
  redFlags: ["hypotension 90/60", "diaphoresis"],
  symptoms: [
    { name: "chest pain", present: true, detail: "2 hours, crushing" },
    { name: "diaphoresis", present: true },
    { name: "dyspnoea", present: true },
    { name: "pleuritic chest pain", present: false },
    { name: "fever", present: false },
  ],
  riskFactors: ["diabetes", "male >45"],
  exposures: [],
  observations: [
    {
      name: "ECG",
      domain: "ecg",
      result: "ST depression V4-V6",
      classification: "RULE_IN_SUPPORT",
      provenance: "PATIENT_FACT",
      dxTags: ["ACS"],
    },
    {
      name: "troponin",
      domain: "lab",
      result: 0.08,
      units: "ng/mL",
      classification: "UNKNOWN",
      provenance: "PATIENT_FACT",
      dxTags: ["ACS"],
    },
    {
      name: "chest x-ray",
      domain: "imaging",
      result: "no consolidation",
      classification: "RULE_OUT_SUPPORT",
      provenance: "PATIENT_FACT",
      dxTags: ["Pneumonia"],
    },
    {
      name: "Wells score (PE) low",
      domain: "exam",
      lrMinus: 0.5,
      classification: "RULE_OUT_SUPPORT",
      provenance: "EVIDENCE",
      dxTags: ["Pulmonary embolism"],
    },
  ],
  timeline: [
    { phase: "PAST", at: "2026-09-01", kind: "event", label: "baseline review", provenance: "PATIENT_FACT" },
    { phase: "ONSET", at: "2026-09-23T08:00", kind: "symptom", label: "chest pain onset", provenance: "PATIENT_FACT" },
    { phase: "CURRENT_STATE", at: "2026-09-23T10:00", kind: "vital", label: "BP", value: "90/60", provenance: "PATIENT_FACT" },
    { phase: "EXPECTED_NEXT_STATE", at: "2026-09-23T12:00", kind: "lab", label: "repeat troponin", provenance: "AI_INFERENCE" },
  ],
  trajectoryInput: { trajectory: "acute_worsening", basis: "serial troponin + hypotension" },
  bayesianInputs: [
    { observationName: "ECG", preTestProbability: 0.6, likelihoodRatio: 5, direction: "positive" },
  ],
  differentialInput: [
    {
      name: "ACS",
      supporting: ["crushing chest pain", "diaphoresis", "ST depression"],
      contradicting: [],
      missing: ["serial troponin"],
      dangerIfMissed: "missed MI → death or heart failure",
      nextDiscriminatingTest: "serial troponin at 1h",
      likelihood: "Higher likelihood",
    },
    {
      name: "Pulmonary embolism",
      supporting: ["tachycardia"],
      contradicting: ["low Wells score"],
      missing: ["D-dimer"],
      dangerIfMissed: "missed PE → right heart failure",
      likelihood: "Cannot exclude",
    },
    {
      name: "GERD",
      supporting: [],
      contradicting: ["diaphoresis", "hypotension"],
      missing: [],
      dangerIfMissed: "low",
      likelihood: "Lower likelihood",
    },
  ],
  mechanismInput: [
    { level: "organ", statement: "supply-demand mismatch causes ischaemia", provenance: "EVIDENCE" },
    { level: "molecular", statement: "plaque rupture → platelet aggregation", provenance: "EVIDENCE" },
    { level: "cellular", statement: "myocyte injury releases troponin", provenance: "EVIDENCE" },
    { level: "system", statement: "sympathetic activation → tachycardia, diaphoresis", provenance: "EVIDENCE" },
  ],
  compensationInput: [
    { mechanism: "sympathetic activation", active: true, helping: false, status: "COMPENSATION_FAILING" },
  ],
  managementInput: [
    {
      label: "Dual antiplatelet + urgent PCI pathway",
      description: "per local STEMI/NSTEMI protocol",
      benefit: "mortality reduction in ACS",
      risk: "bleeding",
      tier: "CURRENT_STANDARD",
      requiresClinicianConfirmation: true,
    },
    {
      label: "Experimental thrombolytic variant",
      description: "phase-II study arm",
      benefit: "unknown",
      risk: "unknown",
      tier: "INVESTIGATIONAL",
      requiresClinicianConfirmation: true,
    },
  ],
  counterfactualInput: [
    { label: "NO_TREATMENT", expectedCourse: "ongoing ischaemia", uncertainty: "population evidence only" },
    { label: "STANDARD_TREATMENT", expectedCourse: "reperfusion", uncertainty: "individual response varies" },
  ],
  monitoringInput: ["serial troponin", "continuous ECG"],
  escalationInput: ["ongoing hypotension despite fluids"],
  scores: [],
};

describe("7D Diagnostic Workflow (LangGraph)", () => {
  it("generates D1–D7 with all seven nodes in order and reports them", async () => {
    const nodes: string[] = [];
    const result = await runD7Workflow(chestPainPacket, {
      onNode: (n) => nodes.push(n),
    });

    expect(result.executedNodes).toEqual([
      "extract_1D",
      "build_2D_pattern",
      "collect_3D_evidence",
      "construct_4D_timeline",
      "branch_5D_differential",
      "model_6D_mechanisms",
      "synthesize_7D_decision",
    ]);
    expect(nodes).toEqual(result.executedNodes);
    expect(result.D1.redFlags).toEqual(chestPainPacket.redFlags);
    expect(result.D1.phenotype.age).toBe(54);
    expect(result.D1.phenotype.allergies).toEqual(["penicillin"]);
  });

  it("never invents facts: D3 contains ONLY packet observations; LRs only when supplied", async () => {
    const result = await runD7Workflow(chestPainPacket);
    const packetNames = chestPainPacket.observations.map((o) => o.name);
    const outObs = [...result.D3.exam, ...result.D3.labs, ...result.D3.imaging, ...(result.D3.ecg ?? [])];
    expect(outObs.map((o) => o.name).sort()).toEqual([...packetNames].sort());

    // LR list: only observations that actually carry LR data.
    expect(result.D3.likelihoodRatios.map((o) => o.name)).toEqual(["Wells score (PE) low"]);

    // Bayesian update computed ONLY from supplied pre-test + LR inputs.
    expect(result.D3.bayesUpdates).toHaveLength(1);
    const b = result.D3.bayesUpdates[0];
    expect(b.preTestProbability).toBeCloseTo(0.6, 4);
    expect(b.likelihoodRatio).toBe(5);
    expect(b.postTestProbability).toBeCloseTo(0.8824, 3);
  });

  it("splits the timeline into observed past / present / uncertain future (§4D)", async () => {
    const result = await runD7Workflow(chestPainPacket);
    expect(result.D4.observedPast.map((e) => e.phase)).toEqual(["PAST", "ONSET"]);
    expect(result.D4.observedPresent).toHaveLength(1);
    expect(result.D4.predictedFuture).toHaveLength(1);
    expect(result.D4.predictedFuture[0].uncertainty).toMatch(/uncertainty/i);
    expect(result.D4.trajectory).toBe("acute_worsening");
  });

  it("builds the differential with rule-in/rule-out separation and qualitative likelihood labels (§5/§B)", async () => {
    const result = await runD7Workflow(chestPainPacket);
    expect(result.D5.differential.map((d) => d.name)).toEqual(["ACS", "Pulmonary embolism", "GERD"]);

    const acs = result.D5.differential[0];
    expect(acs.ruleInEvidence).toContain("ECG");
    expect(acs.likelihood).toBe("Higher likelihood");

    const pe = result.D5.differential[1];
    expect(pe.ruleOutEvidence).toContain("Wells score (PE) low");
    expect(pe.likelihood).toBe("Cannot exclude");

    // No numeric probability unless validated probability source supplied.
    for (const d of result.D5.differential) {
      expect(d.validatedProbability).toBeUndefined();
      expect(["Higher likelihood", "Intermediate likelihood", "Lower likelihood", "Cannot exclude"]).toContain(d.likelihood);
    }
    expect(result.D5.counterfactualBranches.map((c) => c.label)).toContain("NO_TREATMENT");
    expect(result.D5.counterfactualBranches.every((c) => c.uncertainty.length > 0)).toBe(true);
  });

  it("orders the mechanism ladder molecule → patient and preserves compensation status (§6)", async () => {
    const result = await runD7Workflow(chestPainPacket);
    expect(result.D6.ladder.map((l) => l.level)).toEqual([
      "molecular",
      "cellular",
      "organ",
      "system",
    ]);
    expect(result.D6.compensation[0].status).toBe("COMPENSATION_FAILING");
  });

  it("keeps evidence tiers labelled and flags every action for clinician confirmation (§7/§G)", async () => {
    const result = await runD7Workflow(chestPainPacket);
    expect(result.D7.managementOptions.map((o) => o.tier)).toEqual([
      "CURRENT_STANDARD",
      "INVESTIGATIONAL",
    ]);
    expect(result.D7.managementOptions.every((o) => o.requiresClinicianConfirmation)).toBe(true);
    expect(result.D7.bestSupportedCurrentOption).toBe("Dual antiplatelet + urgent PCI pathway");
    expect(result.D7.monitoring).toEqual(["serial troponin", "continuous ECG"]);
    expect(result.D7.whenToEscalate).toEqual(["ongoing hypotension despite fluids"]);
    expect(result.D7.uncertainties.length).toBeGreaterThan(0); // missing evidence surfaces as uncertainty
  });
});

describe("Deterministic clinical scores (rule engine)", () => {
  it("qSOFA is arithmetic and reproducible; missing input → INDETERMINATE", () => {
    const a = qSOFA({ respiratoryRate: 24, systolicBp: 92, alteredMentation: false });
    expect(a.score).toBe(2);
    expect(a.outcome).toBe("POSITIVE");

    const b = qSOFA({ respiratoryRate: 24, systolicBp: 92, alteredMentation: false });
    expect(b).toEqual(a); // fully deterministic

    const missing = qSOFA({ respiratoryRate: 20 });
    expect(missing.score).toBeNull();
    expect(missing.outcome).toBe("INDETERMINATE");
    expect(missing.components.find((c) => c.label.includes("Systolic"))?.provided).toBe(false);
  });

  it("HEART sums clinician-coded components and stays indeterminate when incomplete", () => {
    const full = HEART({ history: 2, ecg: 1, age: 1, riskFactors: 1, troponin: 1 });
    expect(full.score).toBe(6);
    expect(full.outcome).toBe("POSITIVE");

    const low = HEART({ history: 0, ecg: 0, age: 0, riskFactors: 0, troponin: 0 });
    expect(low.outcome).toBe("NEGATIVE");

    const partial = HEART({ history: 1, ecg: 1 });
    expect(partial.score).toBeNull();
    expect(partial.outcome).toBe("INDETERMINATE");
  });
});

