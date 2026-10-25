import { describe, expect, it } from "vitest";
import { asRecommendation, clearEvidenceForTests, getEvidenceBadge, saveEvidence, scoutPublicSource } from "./evidence";

describe("evidence scout", () => {
  it("never returns a tier-5 or unverified item as a recommendation and badges tier, date and verified", async () => {
    clearEvidenceForTests();
    const weak = saveEvidence({
      id: "e5", claim: "opinion", source: "letter", publisher: "local", date: "2020-01-01",
      tier: 5, evidenceLevel: "expert opinion", verified: true, conflicts: [], applicability: "narrow", limitations: "not a guideline", version: 1,
    });
    const unverified = saveEvidence({
      id: "eu", claim: "rumour", source: "web", publisher: "unknown", date: "2024-01-01",
      tier: 2, evidenceLevel: "review", verified: false, conflicts: [], applicability: "unknown", limitations: "not checked", version: 1,
    });
    const strong = saveEvidence({
      id: "e1", claim: "guideline statement", source: "standard", publisher: "standards body", date: "2025-06-01",
      tier: 1, evidenceLevel: "guideline", verified: true, conflicts: [], applicability: "adults", limitations: "not local policy", version: 1,
    });
    expect(asRecommendation(weak)).toBeNull();
    expect(asRecommendation(unverified)).toBeNull();
    expect(asRecommendation(strong)?.id).toBe("e1");
    expect(getEvidenceBadge("e1")).toEqual({ tier: 1, date: "2025-06-01", verified: true });
    let fetched = 0;
    const refused = await scoutPublicSource({
      query: "guideline for UHID: MP123456 phone 9876543210",
      role: "doctor",
      explicit: true,
      url: "http://127.0.0.1/never",
      client: { async fetch() { fetched += 1; return "no"; } },
    });
    expect(refused.ok).toBe(false);
    expect(fetched).toBe(0);
  });
});
