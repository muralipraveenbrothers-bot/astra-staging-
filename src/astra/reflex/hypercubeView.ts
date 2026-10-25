import { submitReflexApproval } from "./approvalClient";

export interface OrganEdgeView { id: string; from: string; to: string; stage: number; expectedFindings: string[]; reviewStatus: "draft_needs_doctor_review" | "approved" }
export interface AxisView { axis: string; value: string | null; status: "documented" | "draft_extracted" | "missing" }
export interface TreatmentView { option: string; avoidBecause: string[]; concerns: string[]; whyItFits: string[] }

export function visibleOrganEdges<T extends { reviewStatus: string }>(edges: T[]): T[] {
  return edges.filter((edge) => edge.reviewStatus === "approved");
}

export function confirmBadge(status: string): "confirm" | null {
  return status === "draft_extracted" ? "confirm" : null;
}

export function documentedAxes(axes: AxisView[]): AxisView[] {
  return axes.filter((axis) => axis.status === "documented");
}

/** Approve goes through the existing R5-01 client. It does not create an order. */
export function approveTreatmentOption(patientId: string, option: string) {
  return submitReflexApproval({
    patientId,
    text: option,
    decision: "APPROVE_CASE_ONLY",
    reason: "Treatment matrix doctor action",
  });
}
