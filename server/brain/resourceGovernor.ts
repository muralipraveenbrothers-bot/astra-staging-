/**
 * Resource governor. Clinical case files are never deleted from here.
 * Shared Ollama and Voicebox processes are not killed; the brain tier is capped instead.
 */
import os from "os";
import { clinicalCasesOnDisk } from "./caseState";

export const GOVERNOR_MODES = ["ECO", "NORMAL", "PERFORMANCE", "CLINICAL_PRIORITY"] as const;
export type GovernorMode = (typeof GOVERNOR_MODES)[number];

export interface ResourceSnapshot {
  ramFreeMB: number;
  ramTotalMB: number;
  cpuCount: number;
  loadAverage: number[];
  heapUsedMB: number;
  diskNote: string;
  gpu: { source: "not-probed"; vramMB: null };
  activeLocalModels: "not-enumerated";
  activeWorkflows: number;
  memoryPressure: boolean;
}

let mode: GovernorMode = "NORMAL";

export function currentGovernorMode(): GovernorMode {
  return mode;
}

export function snapshotResources(): ResourceSnapshot {
  const total = os.totalmem();
  const free = os.freemem();
  const heap = process.memoryUsage().heapUsed;
  const memoryPressure = total > 0 && (free / total < 0.12 || heap > 1024 * 1024 * 1024);
  return {
    ramFreeMB: Math.round(free / 1048576),
    ramTotalMB: Math.round(total / 1048576),
    cpuCount: os.cpus().length,
    loadAverage: os.loadavg(),
    heapUsedMB: Math.round(heap / 1048576),
    diskNote: "Case files stay on the Astra data directory. Disk capacity is not invented.",
    gpu: { source: "not-probed", vramMB: null },
    activeLocalModels: "not-enumerated",
    activeWorkflows: clinicalCasesOnDisk(),
    memoryPressure,
  };
}

export interface GovernorReport {
  mode: GovernorMode;
  snapshot: ResourceSnapshot;
  actions: string[];
  casesPreserved: number;
  casesDeleted: 0;
}

export function govern(requested?: GovernorMode): GovernorReport {
  const snapshot = snapshotResources();
  if (requested) {
    mode = requested;
  } else if (snapshot.activeWorkflows > 0 && snapshot.memoryPressure) {
    mode = "CLINICAL_PRIORITY";
  } else if (snapshot.memoryPressure) {
    mode = "ECO";
  } else {
    mode = "NORMAL";
  }

  const actions: string[] = [];
  if (mode === "ECO" || mode === "CLINICAL_PRIORITY") {
    actions.push(
      "prefer Laya and Micro Astra for non-clinical work",
      "queue developer-agent work",
      "pause noncritical brain background work",
      "preserve active clinical workflows",
    );
  }
  if (mode === "PERFORMANCE") actions.push("allow the deeper reasoning tier when privacy permits");
  if (mode === "NORMAL") actions.push("use the smallest sufficient tier");

  return {
    mode,
    snapshot,
    actions,
    casesPreserved: snapshot.activeWorkflows,
    casesDeleted: 0,
  };
}
