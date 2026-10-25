/**
 * ASTRA 7D — LANGGRAPH CLINICAL REASONING WORKFLOW
 * ============================================================================
 * Controlled graph: extract_1D → build_2D_pattern → collect_3D_evidence →
 * construct_4D_timeline → branch_5D_differential → model_6D_mechanisms →
 * synthesize_7D_decision
 *
 * Rules enforced by construction:
 *   • every node returns STRUCTURED JSON — no free-text passes between
 *     critical clinical nodes;
 *   • likelihood ratios / probabilities appear only if the input packet
 *     carried them from an approved evidence source (never invented);
 *   • every management option keeps its evidence tier label;
 *   • irreversible actions always carry requiresClinicianConfirmation=true;
 *   • an optional onNode hook streams REAL node events to the visual engine
 *     (THINKING/ANALYSING states come from these, not from timers).
 */

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type {
  D1State,
  D2Candidate,
  D2State,
  D3State,
  D4State,
  D5State,
  D6State,
  D7CasePacket,
  D7Result,
  D7State,
  RuleOutcome,
} from "./d7Types";

const MECHANISM_ORDER = [
  "molecular",
  "cellular",
  "tissue",
  "organ",
  "system",
  "multi_system",
  "whole_patient",
] as const;

const D7Annotation = Annotation.Root({
  packet: Annotation<D7CasePacket>,
  patient: Annotation<D7CasePacket["patient"]>,
  D1: Annotation<D1State>,
  D2: Annotation<D2State>,
  D3: Annotation<D3State>,
  D4: Annotation<D4State>,
  D5: Annotation<D5State>,
  D6: Annotation<D6State>,
  D7: Annotation<D7State>,
  scores: Annotation<Array<{ name: string; score: number | null; outcome: RuleOutcome }>>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  executedNodes: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

type D7StateType = typeof D7Annotation.State;

export interface D7WorkflowOptions {
  /** Fired with each real node name — wire to mayinVisualEngine "d7.node". */
  onNode?: (node: string) => void;
}

// --------------------------------------------------------------------- D1

function extract_1D(state: D7StateType): Partial<D7StateType> {
  const p = state.packet;
  return {
    patient: p.patient,
    scores: p.scores ?? [],
    executedNodes: ["extract_1D"],
    D1: {
      phenotype: {
        chiefComplaint: p.chiefComplaint,
        age: p.patient.age,
        sex: p.patient.sex,
        pregnancyStatus: p.patient.pregnancyStatus,
        vitals: p.vitals ?? {},
        dominantSymptom: p.dominantSymptom,
        severity: p.severity,
        comorbidities: p.patient.comorbidities ?? [],
        medicationsTaken: p.patient.medications ?? [],
        allergies: p.patient.allergies ?? [],
        recentProceduresOrExposures: p.recentProceduresOrExposures ?? [],
      },
      redFlags: p.redFlags,
    },
  };
}

// --------------------------------------------------------------------- D2

function build_2D_pattern(state: D7StateType): Partial<D7StateType> {
  const p = state.packet;
  const associated: D2Candidate[] = p.symptoms
    .filter((s) => s.present)
    .map((s) => ({
      symptom: s.name,
      supports: [s.detail ?? "recorded present"],
      arguesAgainst: [],
      unknown: [],
    }));
  const pertinentNegatives = p.symptoms.filter((s) => !s.present).map((s) => s.name);
  return {
    executedNodes: ["build_2D_pattern"],
    D2: {
      associatedSymptoms: associated,
      pertinentNegatives,
      riskFactors: p.riskFactors,
      exposures: p.exposures,
    },
  };
}

// --------------------------------------------------------------------- D3

function collect_3D_evidence(state: D7StateType): Partial<D7StateType> {
  const p = state.packet;
  const pick = (domain: "exam" | "lab" | "imaging" | "ecg") =>
    p.observations.filter((o) => o.domain === domain);

  const bayes = (p.bayesianInputs ?? []).map((b) => {
    const pre = clamp01(b.preTestProbability);
    const preOdds = pre / (1 - pre);
    const postOdds = preOdds * b.likelihoodRatio;
    return {
      preTestProbability: pre,
      preTestOdds: round4(preOdds),
      likelihoodRatio: b.likelihoodRatio,
      postTestOdds: round4(postOdds),
      postTestProbability: round4(postOdds / (1 + postOdds)),
    };
  });

  return {
    executedNodes: ["collect_3D_evidence"],
    D3: {
      exam: pick("exam"),
      labs: pick("lab"),
      imaging: pick("imaging"),
      ecg: pick("ecg"),
      likelihoodRatios: p.observations.filter(
        (o) => o.lrPlus !== undefined || o.lrMinus !== undefined,
      ),
      bayesUpdates: bayes,
    },
  };
}

// --------------------------------------------------------------------- D4

function construct_4D_timeline(state: D7StateType): Partial<D7StateType> {
  const p = state.packet;
  const observedPastPhases = new Set(["PAST", "BASELINE", "ONSET", "EARLY_EVOLUTION"]);
  const observedPast = p.timeline.filter((e) => observedPastPhases.has(e.phase));
  const observedPresent = p.timeline.filter((e) => e.phase === "CURRENT_STATE");
  const predictedFuture = p.timeline
    .filter((e) => e.phase === "EXPECTED_NEXT_STATE")
    .map((e) => ({
      description: `${e.label}${e.value !== undefined ? `: ${e.value}` : ""}`,
      uncertainty:
        "Predicted branch — carries uncertainty and population-level evidence only; not a claim about this individual.",
      evidence: undefined,
    }));

  return {
    executedNodes: ["construct_4D_timeline"],
    D4: {
      timeline: p.timeline,
      observedPast,
      observedPresent,
      predictedFuture,
      trajectory: p.trajectoryInput?.trajectory ?? "unknown",
    },
  };
}

// --------------------------------------------------------------------- D5

function branch_5D_differential(state: D7StateType): Partial<D7StateType> {
  const p = state.packet;
  const ruleInByDx = (dxName: string) =>
    p.observations
      .filter((o) => o.dxTags?.includes(dxName) && o.classification === "RULE_IN_SUPPORT")
      .map((o) => o.name);
  const ruleOutByDx = (dxName: string) =>
    p.observations
      .filter((o) => o.dxTags?.includes(dxName) && o.classification === "RULE_OUT_SUPPORT")
      .map((o) => o.name);

  return {
    executedNodes: ["branch_5D_differential"],
    D5: {
      differential: p.differentialInput.map((d) => ({
        name: d.name,
        supportingEvidence: d.supporting,
        contradictingEvidence: d.contradicting,
        missingEvidence: d.missing,
        ruleInEvidence: ruleInByDx(d.name),
        ruleOutEvidence: ruleOutByDx(d.name),
        dangerIfMissed: d.dangerIfMissed,
        nextDiscriminatingTest: d.nextDiscriminatingTest,
        likelihood: d.likelihood,
        validatedProbability: d.validatedProbability,
      })),
      counterfactualBranches: p.counterfactualInput,
    },
  };
}

// --------------------------------------------------------------------- D6

function model_6D_mechanisms(state: D7StateType): Partial<D7StateType> {
  const p = state.packet;
  const ladder = [...p.mechanismInput].sort(
    (a, b) => MECHANISM_ORDER.indexOf(a.level) - MECHANISM_ORDER.indexOf(b.level),
  );
  return {
    executedNodes: ["model_6D_mechanisms"],
    D6: {
      ladder,
      compensation: p.compensationInput,
    },
  };
}

// --------------------------------------------------------------------- D7

function synthesize_7D_decision(state: D7StateType): Partial<D7StateType> {
  const p = state.packet;
  const options = p.managementInput;
  const best = options.find((o) => o.tier === "CURRENT_STANDARD");

  const uncertainties = Array.from(
    new Set([
      ...(p.uncertaintyInput ?? []),
      ...p.differentialInput.flatMap((d) => d.missing),
      ...p.counterfactualInput.map((b) => `${b.label}: ${b.uncertainty}`),
    ]),
  );

  const D7: D7State = {
    managementOptions: options,
    bestSupportedCurrentOption: best?.label,
    alternatives: options.filter((o) => o.label !== best?.label).map((o) => o.label),
    whenToEscalate: p.escalationInput ?? [],
    whenToRefer: p.referInput ?? [],
    monitoring: p.monitoringInput ?? [],
    whatFailureLooksLike: p.whatFailureInput ?? [],
    expectedRecovery: p.recoveryInput ?? [],
    prognosis: p.prognosisInput ?? [],
    uncertainties,
  };

  return { executedNodes: ["synthesize_7D_decision"], D7 };
}

// -------------------------------------------------------------- compiled run

export async function runD7Workflow(
  packet: D7CasePacket,
  options: D7WorkflowOptions = {},
): Promise<D7Result> {
  const notify = (node: string) => options.onNode?.(node);

  const graph = new StateGraph(D7Annotation)
    .addNode("extract_1D", (s) => { notify("extract_1D"); return extract_1D(s); })
    .addNode("build_2D_pattern", (s) => { notify("build_2D_pattern"); return build_2D_pattern(s); })
    .addNode("collect_3D_evidence", (s) => { notify("collect_3D_evidence"); return collect_3D_evidence(s); })
    .addNode("construct_4D_timeline", (s) => { notify("construct_4D_timeline"); return construct_4D_timeline(s); })
    .addNode("branch_5D_differential", (s) => { notify("branch_5D_differential"); return branch_5D_differential(s); })
    .addNode("model_6D_mechanisms", (s) => { notify("model_6D_mechanisms"); return model_6D_mechanisms(s); })
    .addNode("synthesize_7D_decision", (s) => { notify("synthesize_7D_decision"); return synthesize_7D_decision(s); })
    .addEdge(START, "extract_1D")
    .addEdge("extract_1D", "build_2D_pattern")
    .addEdge("build_2D_pattern", "collect_3D_evidence")
    .addEdge("collect_3D_evidence", "construct_4D_timeline")
    .addEdge("construct_4D_timeline", "branch_5D_differential")
    .addEdge("branch_5D_differential", "model_6D_mechanisms")
    .addEdge("model_6D_mechanisms", "synthesize_7D_decision")
    .addEdge("synthesize_7D_decision", END)
    .compile();

  const finalState = await graph.invoke({ packet } as D7StateType);

  return {
    patient: finalState.patient ?? packet.patient,
    D1: finalState.D1,
    D2: finalState.D2,
    D3: finalState.D3,
    D4: finalState.D4,
    D5: finalState.D5,
    D6: finalState.D6,
    D7: finalState.D7,
    scores: finalState.scores ?? [],
    executedNodes: finalState.executedNodes ?? [],
  };
}


function clamp01(n: number): number {
  return Math.min(Math.max(n, 0.0001), 0.9999);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
