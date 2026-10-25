/** Scientist cause-finder lines for the doctor cockpit. Suggestions only. */
export interface CauseFinderView {
  suggestionsOnly: true;
  statedAsFact: false;
  autoOrders: false;
  causeChain: string;
  items: Array<{ id: string; text: string; tier: string }>;
}

export function toCauseFinder(input: { causeChain?: string; hypotheses?: Array<{ diagnosis?: string; tier?: string }> } | null | undefined): CauseFinderView | null {
  if (!input) return null;
  const items = (input.hypotheses ?? []).slice(0, 5).flatMap((hypothesis, index) => {
    const diagnosis = String(hypothesis.diagnosis ?? "").trim();
    if (!diagnosis) return [];
    return [{
      id: `cause-${index + 1}`,
      text: `Suggestion only, not a diagnosis: ${diagnosis}`,
      tier: String(hypothesis.tier ?? "consider"),
    }];
  });
  return {
    suggestionsOnly: true,
    statedAsFact: false,
    autoOrders: false,
    causeChain: String(input.causeChain ?? ""),
    items,
  };
}
