import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { approvedBookSkills, readCockpitAudience, suggestionLabel, validatedVaultItems } from "./suggestionModel";
import { CockpitSuggestionsView } from "./CockpitSuggestions";

describe("cockpit suggestions", () => {
  it("keeps only validated knowledge and approved book skills", () => {
    expect(validatedVaultItems([
      { id: "a", status: "validated", title: "Local protocol" },
      { id: "b", status: "candidate", title: "Draft" },
    ]).map((item) => item.id)).toEqual(["a"]);
    expect(approvedBookSkills([
      { id: "s", name: "Discharge", status: "approved", purpose: "Format" },
      { id: "c", name: "Candidate", status: "candidate" },
    ]).map((item) => item.id)).toEqual(["s"]);
    expect(suggestionLabel("pneumonia")).toMatch(/not a diagnosis/i);
    expect(readCockpitAudience({ getItem: () => JSON.stringify({ accountId: "ward" }) }, [{ id: "ward", role: "ward" }])).toBe("ward");
  });

  it("renders suggestions for a doctor and nothing but a red-flag note for ward", () => {
    const doctor = renderToStaticMarkup(
      <CockpitSuggestionsView
        role="doctor"
        knowledge={[{ id: "a", title: "Local protocol" }]}
        skills={[{ id: "s", name: "Discharge", purpose: "Format" }]}
        causeFinder={{ suggestionsOnly: true, statedAsFact: false, autoOrders: false, causeChain: "mechanism", items: [{ id: "c1", text: "Suggestion only, not a diagnosis: example" }] }}
        onApprove={() => undefined}
      />,
    );
    expect(doctor).toContain("Local protocol");
    expect(doctor).toContain("Discharge");
    expect(doctor).toContain("Suggestion only, not a diagnosis: example");
    expect(doctor).toContain("Doctor must approve");
    expect(doctor).not.toMatch(/diagnosed with/i);
    const ward = renderToStaticMarkup(
      <CockpitSuggestionsView role="ward" knowledge={[{ id: "a", title: "Local protocol" }]} skills={[]} causeFinder={null} onApprove={() => undefined} />,
    );
    expect(ward).toContain("Red flags only");
    expect(ward).not.toContain("Local protocol");
  });
});
