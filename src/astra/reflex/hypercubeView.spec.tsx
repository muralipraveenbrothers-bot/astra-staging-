import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HypercubeTabs } from "./HypercubeTabs";
import { visibleOrganEdges } from "./hypercubeView";

vi.mock("@/services/apiFetch", () => ({ apiFetch: vi.fn() }));

describe("hypercube cockpit", () => {
  it("hides unapproved graph entries, badges a draft, and approves treatment only through the approval client", async () => {
    const edges = visibleOrganEdges([
      { id: "draft", reviewStatus: "draft_needs_doctor_review" as const, from: "kidney", to: "lungs", stage: 3, expectedFindings: ["dyspnoea"] },
      { id: "ok", reviewStatus: "approved" as const, from: "kidney", to: "heart", stage: 3, expectedFindings: ["arrhythmia risk"] },
    ]);
    expect(edges.map((edge) => edge.id)).toEqual(["ok"]);
    const html = renderToStaticMarkup(
      <HypercubeTabs
        tab="organs"
        onTab={() => undefined}
        onApproveTreatment={() => undefined}
        view={{ organEdges: [
          { id: "draft", reviewStatus: "draft_needs_doctor_review", from: "kidney", to: "lungs", stage: 3, expectedFindings: ["dyspnoea"] },
          { id: "ok", reviewStatus: "approved", from: "kidney", to: "heart", stage: 3, expectedFindings: ["arrhythmia risk"] },
        ] }}
      />,
    );
    expect(html).toContain("kidney to heart");
    expect(html).not.toContain("kidney to lungs");
    const draft = renderToStaticMarkup(
      <HypercubeTabs tab="vectors" onTab={() => undefined} onApproveTreatment={() => undefined} view={{ axes: [{ axis: "D6", value: "thigh", status: "draft_extracted" }] }} />,
    );
    expect(draft).toContain("draft: confirm");
    const { apiFetch } = await import("@/services/apiFetch");
    vi.mocked(apiFetch).mockResolvedValue({ json: async () => ({ ok: true, decision: { suggestionId: "s1" } }) } as Response);
    const { approveTreatmentOption } = await import("./hypercubeView");
    await approveTreatmentOption("SYN", "amoxicillin");
    const urls = vi.mocked(apiFetch).mock.calls.map((call) => String(call[0]));
    expect(urls).toContain("/api/clinical/approval/suggestion");
    expect(urls.some((url) => url.includes("order"))).toBe(false);
  });
});
