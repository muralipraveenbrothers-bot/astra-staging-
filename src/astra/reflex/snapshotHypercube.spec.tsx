import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { axesFromMedicationPrefill } from "./snapshotHypercube";
import { HypercubeTabs } from "./HypercubeTabs";

describe("snapshot hypercube", () => {
  it("copies only documented snapshot fields and shows not loaded otherwise", () => {
    expect(axesFromMedicationPrefill(null)).toEqual([]);
    expect(axesFromMedicationPrefill({
      allergiesText: "penicillin",
      egfrText: "",
      creatinineText: "1.8",
      altText: "",
      astText: "",
    }).map((axis) => axis.axis)).toEqual(["allergies", "lab:creatinine"]);
    const html = renderToStaticMarkup(
      <HypercubeTabs tab="vectors" chartStatus="not_loaded" onTab={() => undefined} onApproveTreatment={() => undefined} view={{ axes: [{ axis: "lab:creatinine", value: "9", status: "documented" }], treatments: [{ option: "amoxicillin", avoidBecause: [], concerns: [], whyItFits: [] }] }} />,
    );
    expect(html).toContain("not loaded");
    expect(html).not.toContain("amoxicillin");
    expect(html).not.toContain("lab:creatinine");
  });
});
