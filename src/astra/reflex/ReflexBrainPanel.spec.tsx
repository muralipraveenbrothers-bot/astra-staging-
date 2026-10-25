import { describe, expect, it, vi } from "vitest";
import { groupReflexItems } from "./ReflexBrainPanel";

vi.mock("@/services/apiFetch", () => ({ apiFetch: vi.fn() }));

describe("ReflexBrainPanel logic", () => {
  it("keeps red flags first in the grouped view and supports empty state logic", () => {
    const grouped = groupReflexItems({
      redFlags: [{ kind: "red_flag", text: "level0", source: "level0", band: "high" }],
      board: { items: [{ kind: "missing_info", text: "ECG", source: "rules", band: "mid" }] },
    });
    expect(grouped.red_flag[0].text).toBe("level0");
    expect(grouped.missing_info[0].text).toBe("ECG");
    expect(groupReflexItems(null).red_flag).toHaveLength(0);
  });

  it("approval client uses approval and outcome APIs, not order APIs", async () => {
    const { apiFetch } = await import("@/services/apiFetch");
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ json: async () => ({ ok: true, decision: { suggestionId: "s1" } }) } as Response)
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) } as Response)
      .mockResolvedValueOnce({ json: async () => ({ ok: true }) } as Response);
    const { submitReflexApproval, postReflexOutcome } = await import("./approvalClient");
    await submitReflexApproval({ patientId: "SYN", text: "ECG", decision: "APPROVE_CASE_ONLY" });
    await postReflexOutcome("d1", "rejected");
    const urls = vi.mocked(apiFetch).mock.calls.map((call) => String(call[0]));
    expect(urls).toContain("/api/clinical/approval/suggestion");
    expect(urls).toContain("/api/clinical/approval/decision");
    expect(urls).toContain("/api/reflex/outcome");
    expect(urls.some((url) => url.includes("order"))).toBe(false);
  });
});
