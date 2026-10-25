import { describe, expect, it } from "vitest";
import { buildHypothesisBoard } from "./hypothesisBoard";
import type { FabricDecisionResult } from "../decisionFabric";
import type { ScientistAnalysis } from "../../clinical/scientistAgent";

function result(schemaId: string, answer: string, confidence = 0.9): FabricDecisionResult {
  return {
    schemaId, version: 1, schemaHash: "h", answer, confidence, margin: 0.5, alternatives: [], scores: { [answer]: confidence },
    abstained: false, source: "laya", scoreMeaning: "routing_confidence_not_clinical_probability", policy: null,
    trace: { decisionId: `${schemaId}-d`, checkpoint: "english", lang: "en", latencyMs: 1, cacheHit: false },
  };
}

const scientist = {
  ddxMatrix: [
    { id: "d1", diagnosis: "ACS", probabilityEstimatePct: 50, confidence: "Moderate", supports: ["chest pain"], againstOrMissing: [], definitiveRuleOutCriterion: "troponin", nextTestThatSettlesIt: "ECG", pinnedRedFlag: true, ruledOutByDoctor: false, estimateLabel: "derived estimate" },
    { id: "d2", diagnosis: "Pneumonia", probabilityEstimatePct: 20, confidence: "Low", supports: ["cough"], againstOrMissing: ["no fever"], definitiveRuleOutCriterion: "CXR", nextTestThatSettlesIt: "CXR", pinnedRedFlag: false, ruledOutByDoctor: false, estimateLabel: "derived estimate" },
  ],
  hypotheses: [],
  unexplainedFindings: [],
  investigationPlanner: [],
} as unknown as ScientistAnalysis;

describe("hypothesisBoard", () => {
  it("adds blind spots and treatment-response items without removing DDx", () => {
    const board = buildHypothesisBoard({ scientist, decisions: [result("clinical.blind_spot.two_conditions", "yes"), result("clinical.treatment.response", "not_as_expected")], level0RedFlags: [], stateText: "chest pain" });
    expect(board.items.filter((i) => i.kind === "blind_spot")).toHaveLength(2);
    expect(board.ddxGraph.map((n) => n.diagnosis)).toEqual(["ACS", "Pneumonia"]);
  });

  it("preserves scientist DDx order and flags missing ECG for chest pain", () => {
    const board = buildHypothesisBoard({ scientist, decisions: [], level0RedFlags: [], stateText: "complaint: chest pain for 2 hours" });
    expect(board.ddxGraph.map((n) => n.diagnosis)).toEqual(["ACS", "Pneumonia"]);
    expect(board.ddxGraph[0].expectedButMissing).toContain("ECG");
  });

  it("keeps level-0 red flag despite no Laya escalation and adds PE as consider only", () => {
    const board = buildHypothesisBoard({ scientist, decisions: [result("clinical.escalate.now", "1"), result("clinical.must_not_miss.pe", "4")], level0RedFlags: ["emergency-keyword"], stateText: "chest pain" });
    expect(board.items).toContainEqual(expect.objectContaining({ kind: "red_flag", source: "level0", text: "emergency-keyword" }));
    expect(board.items).toContainEqual(expect.objectContaining({ kind: "consider", text: expect.stringContaining("PE") }));
    expect(board.ddxGraph.map((n) => n.diagnosis)).toEqual(["ACS", "Pneumonia"]);
  });
});
