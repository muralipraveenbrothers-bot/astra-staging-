import raw from "./organGraph.v1.json";

export interface OrganEdge {
  id: string;
  from: string;
  mechanism: string;
  to: string;
  expectedFindings: string[];
  stage: 1 | 2 | 3 | 4;
  monitorNext: string;
  escalationThreshold: string;
  reviewStatus: "draft_needs_doctor_review" | "approved";
  approvedBy?: string | null;
  evidenceRef?: string | null;
}

export function loadOrganGraph(entries: OrganEdge[] = raw.entries as OrganEdge[]): OrganEdge[] {
  return entries.map((edge) => ({ ...edge, expectedFindings: [...edge.expectedFindings] }));
}

export function approvedEdges(edges: OrganEdge[]): OrganEdge[] {
  return edges.filter((edge) => edge.reviewStatus === "approved");
}

export function approveEdge(edges: OrganEdge[], id: string, actor: { role: string; id: string }, reason: string): { ok: true; edges: OrganEdge[] } | { ok: false; reason: string } {
  if (actor.role !== "doctor") return { ok: false, reason: "organ-graph approval requires a doctor" };
  if (!reason.trim()) return { ok: false, reason: "a reason is required" };
  const next = edges.map((edge) => edge.id === id ? { ...edge, reviewStatus: "approved" as const, approvedBy: actor.id } : edge);
  if (!next.some((edge) => edge.id === id)) return { ok: false, reason: "unknown entry" };
  return { ok: true, edges: next };
}
