import type { FabricDecisionResult } from "../decisionFabric";
import type { ScientistAnalysis, DdxMatrixRow } from "../../clinical/scientistAgent";
import type { CauseFinderView } from "./causeFinderView";

export type BoardItemKind = "missing_info" | "consider" | "contradiction" | "escalate" | "red_flag" | "blind_spot";
export type BoardSource = "level0" | "laya" | "rules";
export type BoardBand = "high" | "mid" | "low";

export interface ClinicalBoardItem {
  kind: BoardItemKind;
  text: string;
  source: BoardSource;
  band: BoardBand;
  schemaId?: string;
  decisionId?: string;
}

export interface DdxGraphNode {
  id: string;
  diagnosis: string;
  supporting: string[];
  against: string[];
  unexplainedFindings: string[];
  expectedButMissing: string[];
  dangerIfMissed: string;
  nextDiscriminatingStep: string;
  scientistRow?: DdxMatrixRow;
}

export interface HypothesisBoard {
  items: ClinicalBoardItem[];
  ddxGraph: DdxGraphNode[];
}

export interface ClinicalCompleteness {
  score: number;
  family: string;
  missing: string[];
}

export interface ClinicalContradiction {
  text: string;
  source: "rules" | "laya";
  band: BoardBand;
  schemaId?: string;
  decisionId?: string;
}

export interface ClinicalStateInput {
  patientId?: string;
  patient?: Record<string, unknown>;
  orders?: Array<Record<string, unknown>>;
  mitraHandoff?: Record<string, unknown>;
  extraSlices?: Array<{ key: string; text: string; pinned?: boolean; at?: string }>;
}

export interface ClinicalMeshInput extends ClinicalStateInput {
  scientist?: ScientistAnalysis;
  layaDecisions?: FabricDecisionResult[];
  shadowPreview?: boolean;
}

export interface ClinicalMeshResult {
  redFlags: ClinicalBoardItem[];
  board: HypothesisBoard;
  completeness: ClinicalCompleteness;
  contradictions: ClinicalContradiction[];
  latencyMs: number;
  modes: Record<string, "SHADOW" | "ASSIST" | "AUTO">;
  hidden?: boolean;
  /** Suggestions only. Never a stated diagnosis and never an order. */
  causeFinder?: CauseFinderView | null;
}
