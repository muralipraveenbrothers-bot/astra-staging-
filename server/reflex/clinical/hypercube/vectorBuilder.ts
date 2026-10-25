import { AXES, type AxisId, type AxisValue, type ClinicalVector, type VectorKind } from "./types";

export interface DocumentedFact {
  kind: VectorKind;
  axes: Partial<Record<AxisId, string>>;
  sourceRefs: string[];
  documentedAt?: string;
}

export interface DraftExtraction {
  kind: VectorKind;
  axes: Partial<Record<AxisId, string>>;
  sourceRefs: string[];
}

function axesFrom(provided: Partial<Record<AxisId, string>>, status: "documented" | "draft_extracted"): Record<AxisId, AxisValue> {
  const axes = {} as Record<AxisId, AxisValue>;
  for (const axis of AXES) {
    const value = provided[axis];
    if (typeof value === "string" && value.trim()) axes[axis] = { value: value.trim(), status };
    else axes[axis] = { value: null, status: "missing" };
  }
  return axes;
}

/** Builds vectors only from supplied documented fields or an explicit draft extraction. No axis is inferred. */
export function buildVectors(input: { documented?: DocumentedFact[]; extracted?: DraftExtraction[] }): ClinicalVector[] {
  const documented = (input.documented ?? []).map((fact): ClinicalVector => ({
    kind: fact.kind,
    axes: axesFrom(fact.axes, "documented"),
    sourceRefs: fact.sourceRefs,
    documentedAt: fact.documentedAt,
    status: "documented",
  }));
  const extracted = (input.extracted ?? []).map((fact): ClinicalVector => ({
    kind: fact.kind,
    axes: axesFrom(fact.axes, "draft_extracted"),
    sourceRefs: fact.sourceRefs,
    status: "draft_extracted",
  }));
  return [...documented, ...extracted];
}

/** Draft extractions do not count until a clinician confirms them. Genetics stays a placeholder. */
export function countsTowardCompleteness(vector: ClinicalVector): boolean {
  if (vector.kind === "genetics") return false;
  if (vector.status === "draft_extracted" && !vector.confirmedBy) return false;
  return AXES.some((axis) => vector.axes[axis].status === "documented" || (vector.axes[axis].status === "draft_extracted" && !!vector.confirmedBy));
}

export function geneticsPlaceholder(): ClinicalVector {
  const vector = buildVectors({ documented: [{ kind: "genetics", axes: {}, sourceRefs: ["placeholder"] }] })[0];
  return { ...vector, status: "missing" };
}
