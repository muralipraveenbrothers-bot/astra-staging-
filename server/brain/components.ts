/**
 * Visible registry for Part 1. Later build-order modules are listed as not running.
 * Nothing here pretends to be healthy if it was not built.
 */
import { clinicalCasesOnDisk } from "./caseState";
import { currentGovernorMode, snapshotResources } from "./resourceGovernor";

export interface BrainComponent {
  id: string;
  health: string;
  status: string;
  version: string;
  capabilities: string[];
  dependencies: string[];
  metrics: Record<string, string | number | boolean>;
  lastError: string | null;
}

const PART1: Array<Omit<BrainComponent, "metrics" | "lastError"> & { metrics?: BrainComponent["metrics"] }> = [
  { id: "case-state", health: "ready", status: "ready", version: "clinical-case-v1", capabilities: ["persist", "resume"], dependencies: ["data-directory"] },
  { id: "laya-decision-api", health: "ready", status: "ready", version: "1.0.0", capabilities: ["YES", "NO", "CHOICE", "SCORE", "UNKNOWN", "INSUFFICIENT_INFORMATION", "REQUIRES_HUMAN_REVIEW"], dependencies: ["laya-runtime-optional"] },
  { id: "langgraph-master", health: "ready", status: "ready", version: "clinical-case-v1", capabilities: ["index", "approval-gate", "parallel-presentation-and-records"], dependencies: ["case-state"] },
  { id: "hermes-cortex", health: "ready", status: "ready", version: "1.0.0", capabilities: ["assign", "review-subset"], dependencies: ["laya-decision-api", "langgraph-master", "hermes-cli-existing"] },
  { id: "tool-registry", health: "ready", status: "ready", version: "1.0.0", capabilities: ["role-filter", "class-filter"], dependencies: ["existing-tool-registry"] },
  { id: "specialist-delegation", health: "ready", status: "ready", version: "1.0.0", capabilities: ["subset-selection", "qualitative-differential"], dependencies: ["laya-decision-api"] },
  { id: "seven-d-wrap", health: "ready", status: "ready", version: "existing", capabilities: ["wrap-Astra7DClinicalEngine"], dependencies: ["server/clinical/astra7dEngine.ts"] },
  { id: "authority", health: "ready", status: "ready", version: "1.0.0", capabilities: ["doctor-clinical", "ceo-operations"], dependencies: ["SaarathiCommand"] },
  { id: "model-router", health: "ready", status: "ready", version: "1.0.0", capabilities: ["smallest-sufficient-tier"], dependencies: ["privacy", "resource-governor"] },
  { id: "privacy-router", health: "ready", status: "ready", version: "1.0.0", capabilities: ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "PHI", "HIGH-RISK CLINICAL"], dependencies: [] },
  { id: "secret-vault", health: "ready", status: "ready", version: "1.0.0", capabilities: ["capability-reference", "scrub"], dependencies: ["server/services/secrets.ts"] },
  { id: "resource-governor", health: "ready", status: "ready", version: "1.0.0", capabilities: ["ECO", "NORMAL", "PERFORMANCE", "CLINICAL_PRIORITY"], dependencies: ["case-state"] },
  { id: "context-compiler", health: "ready", status: "ready", version: "1.0.0", capabilities: ["tool-subset"], dependencies: ["tool-registry", "case-state"] },
];

const PART2: Array<Omit<BrainComponent, "metrics" | "lastError">> = [
  { id: "mechanism-graph", health: "ready", status: "ready", version: "1.0.0", capabilities: ["cell-to-failure", "fracture-compartment"], dependencies: ["seven-d-wrap"] },
  { id: "case-watcher", health: "ready", status: "ready", version: "1.0.0", capabilities: ["record-only", "rerun-affected-nodes"], dependencies: ["laya-decision-api", "case-state"] },
  { id: "comorbidity-overlay", health: "ready", status: "ready", version: "1.0.0", capabilities: ["patient-physiology"], dependencies: ["mechanism-graph"] },
  { id: "deterioration-radar", health: "ready", status: "ready", version: "1.0.0", capabilities: ["admission-watch"], dependencies: ["mechanism-graph"] },
  { id: "investigation-intelligence", health: "ready", status: "ready", version: "1.0.0", capabilities: ["existing-results", "no-unvalidated-biomarker"], dependencies: ["case-state"] },
  { id: "case-documents", health: "ready", status: "ready", version: "1.0.0", capabilities: ["verified-facts-only"], dependencies: ["clinical-reports-skill"] },
  { id: "clinical-output", health: "ready", status: "ready", version: "1.0.0", capabilities: ["relevant-sections-only"], dependencies: ["hermes-cortex"] },
];

const PART3: Array<Omit<BrainComponent, "metrics" | "lastError">> = [
  { id: "evolution-room", health: "ready", status: "ready", version: "1.0.0", capabilities: ["versioned-skills", "eval-pipeline", "rollback"], dependencies: ["hermes-cortex"] },
  { id: "replay-lab", health: "ready", status: "ready", version: "1.0.0", capabilities: ["de-identified-comparison"], dependencies: ["evolution-room"] },
  { id: "los-value-engine", health: "ready", status: "ready", version: "1.0.0", capabilities: ["stay-range", "cost-band", "verified-prices-only"], dependencies: ["case-state"] },
];

const PART4: Array<Omit<BrainComponent, "metrics" | "lastError">> = [
  { id: "contact-brain", health: "ready", status: "ready", version: "1.0.0", capabilities: ["directory", "audit-without-send"], dependencies: ["browser"] },
  { id: "internal-browser-nervous-system", health: "ready", status: "ready", version: "1.0.0", capabilities: ["api-first", "patient-lock", "primary-labels"], dependencies: ["src/services/astraServices.ts"] },
];

const PART5: Array<Omit<BrainComponent, "metrics" | "lastError">> = [
  { id: "memory-fabric", health: "ready", status: "ready", version: "1.0.0", capabilities: ["scoped-recall", "mem0-degraded-honest"], dependencies: ["case-state", "hospital-database"] },
  { id: "observatory", health: "ready", status: "ready", version: "1.0.0", capabilities: ["request-id", "phi-excluded-telemetry"], dependencies: ["saarathi"] },
];

const LATER: string[] = [];

export function listBrainComponents(): BrainComponent[] {
  const resources = snapshotResources();
  const live = [...PART1, ...PART2, ...PART3, ...PART4, ...PART5].map((component) => ({
    ...component,
    metrics: {
      governor: currentGovernorMode(),
      storedCases: clinicalCasesOnDisk(),
      ramFreeMB: resources.ramFreeMB,
      ...(component.metrics ?? {}),
    },
    lastError: null,
  }));
  const later = LATER.map((id) => ({
    id,
    health: "not-running",
    status: "specified-later",
    version: "0",
    capabilities: [],
    dependencies: ["part-1-case-state"],
    metrics: { implemented: false },
    lastError: null,
  }));
  return [
    ...live,
    ...later,
    {
      id: "internal-browser-registry",
      health: "unchanged",
      status: "existing",
      version: "existing",
      capabilities: ["src/services/astraServices.ts"],
      dependencies: [],
      metrics: { replaced: false },
      lastError: null,
    },
  ];
}
