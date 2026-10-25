import { modeFor } from "../../confidencePolicy";
import { buildClinicalState } from "../caseStateBuilder";
import { diseaseFrames } from "./diseaseSevenD";
import { buildInvestigationMatrix } from "./investigationMatrix";
import { approvedEdges, loadOrganGraph } from "./organSystemGraph";
import { threePass } from "./threePass";
import { buildVectors, geneticsPlaceholder } from "./vectorBuilder";
import { view360 } from "./view360";

export interface HypercubeResult {
  vectors: ReturnType<typeof buildVectors>;
  genetics: { status: "placeholder"; logic: false };
  symptomQuestions: [];
  diseaseFrames: ReturnType<typeof diseaseFrames>;
  organEdges: ReturnType<typeof approvedEdges>;
  passes: ReturnType<typeof threePass>;
  investigations: ReturnType<typeof buildInvestigationMatrix>;
  treatments: [];
  trajectory: { blindSpots: []; treatmentChange: null };
  timeline: { items: []; flags: [] };
  map360: ReturnType<typeof view360>;
  redFlags: Array<{ kind: "red_flag"; text: string }>;
  escalations: Array<{ kind: "escalate"; text: string }>;
  missingVitals: Array<{ text: string }>;
  modes: Record<string, "SHADOW" | "ASSIST" | "AUTO">;
}

/** Organises documented structure only. Free text is not turned into axis values. */
export function runHypercube(input: { patientId: string; shadowPreview?: boolean }): HypercubeResult {
  const state = buildClinicalState({ patientId: input.patientId });
  const missingVitals = /not recorded/i.test(state.text) ? [{ text: "vitals not recorded" }] : [];
  const mode = modeFor("clinical.symptom.onset", "SHADOW");
  return {
    vectors: buildVectors({ documented: [] }),
    genetics: { status: "placeholder", logic: false },
    symptomQuestions: [],
    diseaseFrames: diseaseFrames([]),
    organEdges: approvedEdges(loadOrganGraph()),
    passes: threePass({ ddx: [], findings: [], frames: [] }),
    investigations: buildInvestigationMatrix({ ordered: [], suggestions: [] }),
    treatments: [],
    trajectory: { blindSpots: [], treatmentChange: null },
    timeline: { items: [], flags: [] },
    map360: view360("", { forward: [], reverse: [], lateral: [], up: [], down: [], time: [], contradiction: [] }),
    redFlags: [],
    escalations: [],
    missingVitals,
    modes: { "clinical.symptom.onset": mode },
  };
}
