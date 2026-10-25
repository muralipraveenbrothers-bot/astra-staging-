export function runContainmentHarness(input: { tests: Record<string, { expected: string; actual: string; detail: string }> }) {
  const allPassed = Object.values(input.tests).every((t) => t.expected === t.actual);
  return { allPassed, agentsAllowedInProduction: allPassed };
}
