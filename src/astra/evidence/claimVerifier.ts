import type { SourceReference } from "./evidenceBundle";

const REQUIRED_KIND: Record<string, RegExp> = {
  MEDICATION_RECEIVED: /PHARMACY/,
  LAB_VALUE_CHANGED: /LAB/,
  BILL_PAID: /BILL|PAYMENT|INVOICE/,
  SCAN_COMPLETED: /RADIOLOGY|SCAN/,
  ORDER_ACKNOWLEDGED: /ORDER/,
};

export function verifyClaim(
  claim: { claimId: string; kind: string; statement: string; requiredValues: string[] },
  sources: SourceReference[],
  options: { now?: Date; staleAfterMinutes?: number } = {},
) {
  const requiredKind = REQUIRED_KIND[claim.kind];
  const eligible = requiredKind ? sources.filter((s) => requiredKind.test(s.kind)) : sources;
  const reasons: string[] = [];
  if (sources.length && eligible.length !== sources.length) reasons.push("Some evidence is not from the required record kinds");
  if (eligible.length === 0) {
    const wrongKindSupported = claim.requiredValues.some((value) => sources.some((s) => s.excerpt.toLowerCase().includes(value.toLowerCase())));
    return {
      verdict: wrongKindSupported ? "PARTIALLY_VERIFIED" : "NOT_FOUND",
      supportingRefIds: [],
      conflictingRefIds: [],
      reasons,
      freshness: { stale: false },
    };
  }
  const supported = claim.requiredValues.filter((value) => eligible.some((s) => s.excerpt.toLowerCase().includes(value.toLowerCase())));
  const now = options.now ?? new Date();
  const staleAfter = options.staleAfterMinutes ?? 120;
  const stale = eligible.every((s) => now.getTime() - new Date(s.recordedAt).getTime() > staleAfter * 60_000);
  const numericValues = eligible.map((s) => s.excerpt.match(/:\s*([0-9.]+)/)?.[1]).filter(Boolean);
  const conflicting = new Set(numericValues).size > 1;
  return {
    verdict: conflicting ? "CONFLICTING" : stale ? "STALE" : supported.length === claim.requiredValues.length ? "VERIFIED" : "PARTIALLY_VERIFIED",
    supportingRefIds: eligible.filter((s) => supported.some((v) => s.excerpt.toLowerCase().includes(v.toLowerCase()))).map((s) => s.refId),
    conflictingRefIds: conflicting ? eligible.slice(1).map((s) => s.refId) : [],
    reasons,
    freshness: { stale },
  };
}
