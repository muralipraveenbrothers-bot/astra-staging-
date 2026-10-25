export interface OrderedTest { name: string; clinicalQuestion?: string }
export interface SuggestedTest { name: string; clinicalQuestion: string; hypotheses: string[]; expectedIfPositive?: string; expectedIfNegative?: string; wouldChangeManagement?: "yes" | "no" | "unknown" }

export interface InvestigationMatrix {
  rows: Array<{ name: string; clinicalQuestion: string | null; hypothesesItDiscriminates: string[]; expectedIfPositive: string; expectedIfNegative: string; wouldChangeManagement: "yes" | "no" | "unknown"; proposalOnly: boolean }>;
  missingInfo: Array<{ text: string }>;
  proposals: Array<{ name: string; proposalOnly: true; orderCreated: false; gate: "R5-01" }>;
}

/** Suggestions are R5-01 proposals. They never create an order. */
export function buildInvestigationMatrix(input: { ordered?: OrderedTest[]; suggestions?: SuggestedTest[] }): InvestigationMatrix {
  const missingInfo: InvestigationMatrix["missingInfo"] = [];
  const rows: InvestigationMatrix["rows"] = [];
  for (const test of input.ordered ?? []) {
    const question = test.clinicalQuestion?.trim() || null;
    if (!question) missingInfo.push({ text: `${test.name}: clinical question not recorded` });
    rows.push({ name: test.name, clinicalQuestion: question, hypothesesItDiscriminates: [], expectedIfPositive: "", expectedIfNegative: "", wouldChangeManagement: "unknown", proposalOnly: false });
  }
  const proposals: InvestigationMatrix["proposals"] = [];
  for (const test of input.suggestions ?? []) {
    rows.push({
      name: test.name,
      clinicalQuestion: test.clinicalQuestion,
      hypothesesItDiscriminates: test.hypotheses,
      expectedIfPositive: test.expectedIfPositive ?? "",
      expectedIfNegative: test.expectedIfNegative ?? "",
      wouldChangeManagement: test.wouldChangeManagement ?? "unknown",
      proposalOnly: true,
    });
    proposals.push({ name: test.name, proposalOnly: true, orderCreated: false, gate: "R5-01" });
  }
  return { rows, missingInfo, proposals };
}
