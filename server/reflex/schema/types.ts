export type DecisionKind = "choice" | "score" | "noul";
export type DecisionDomain =
  | "reception" | "pharmacy" | "lab" | "radiology" | "ward" | "billing"
  | "cmrf" | "discharge" | "whatsapp" | "router" | "safety" | "context"
  | "hermes" | "browser" | "knowledge" | "ops" | "clinical";
export type DecisionLanguage = "en" | "te" | "hi";

export interface DecisionOption {
  key: string;
  label: string;
  description?: string;
}

export interface DecisionThresholds {
  auto: number;
  assist: number;
  minMargin: number;
}

export interface DecisionSchema {
  id: string;
  version: number;
  kind: DecisionKind;
  question: string;
  options?: DecisionOption[];
  levels?: string[];
  abstainKeys: string[];
  domain: DecisionDomain;
  dataClass: string;
  defaultMode: "SHADOW";
  thresholds: DecisionThresholds;
  languages: DecisionLanguage[];
  owner: string;
  createdAt: string;
}
