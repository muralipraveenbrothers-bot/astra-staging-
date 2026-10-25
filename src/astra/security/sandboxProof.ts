export function generateContainmentProof(input: { policyVersion: string; checks: Record<string, boolean | string> }) {
  const items = Object.entries(input.checks).map(([name, value]) => {
    const fail =
      value === "none" ||
      (typeof value === "boolean" &&
        (/Accessible|Exposure|PersistenceAfterDestroy/.test(name) ? value : value === false));
    return { name, result: fail ? "FAIL" : "PASS" };
  });
  return { policyVersion: input.policyVersion, overall: items.every((i) => i.result === "PASS") ? "CONTAINED" : "NOT_CONTAINED", items };
}
