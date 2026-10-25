import { describe, expect, it } from "vitest";
import { buildInvestigationMatrix } from "./investigationMatrix";

describe("investigation matrix", () => {
  it("marks an ordered test without a question and keeps a suggestion as a proposal", () => {
    const matrix = buildInvestigationMatrix({
      ordered: [{ name: "CBC" }],
      suggestions: [{ name: "MRI", clinicalQuestion: "Would this discriminate the hypothesis?", hypotheses: ["disc prolapse"] }],
    });
    expect(matrix.missingInfo[0].text).toMatch(/clinical question not recorded/i);
    expect(matrix.proposals[0]).toMatchObject({ name: "MRI", proposalOnly: true, orderCreated: false, gate: "R5-01" });
  });
});
