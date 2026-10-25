import { describe, expect, it } from "vitest";
import { approveEdge, approvedEdges, loadOrganGraph } from "./organSystemGraph";

describe("organ system graph", () => {
  it("hides drafts, rejects a non-doctor, and shows an approved kidney to lung edge", () => {
    const edges = loadOrganGraph();
    expect(approvedEdges(edges)).toHaveLength(0);
    expect(edges.every((edge) => edge.reviewStatus === "draft_needs_doctor_review")).toBe(true);
    expect(approveEdge(edges, "kidney-fluid-lung", { role: "admin", id: "a" }, "no").ok).toBe(false);
    const approved = approveEdge(edges, "kidney-fluid-lung", { role: "doctor", id: "d1" }, "teaching pattern accepted");
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    const shown = approvedEdges(approved.edges);
    expect(shown).toHaveLength(1);
    expect(shown[0].expectedFindings).toEqual(expect.arrayContaining(["dyspnoea", "hypoxia"]));
    expect(shown[0].stage).toBe(3);
    expect(shown[0].to).toBe("lungs");
  });
});
