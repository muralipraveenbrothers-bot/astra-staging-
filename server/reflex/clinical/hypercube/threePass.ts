export interface DdxItem { id: string; diagnosis: string }
export interface ExpectedFrame { diagnosis: string; expectedFindings: string[]; reviewStatus: "draft_needs_doctor_review" | "approved" }

export interface ThreePassResult {
  passA: Array<{ finding: string; couldExplain: string[] }>;
  passB: Array<{ hypothesis: string; expected: string[] }>;
  passC: Array<{ text: string; kind: "contradiction" | "blind_spot" }>;
  ddxOrder: string[];
}

/** Deterministic. Does not re-rank the scientist DDx. Uses approved frames only. */
export function threePass(args: { ddx: DdxItem[]; findings: string[]; frames: ExpectedFrame[] }): ThreePassResult {
  const order = args.ddx.map((row) => row.id);
  const passA = args.findings.map((finding) => ({
    finding,
    couldExplain: args.ddx.map((row) => row.diagnosis),
  }));
  const approved = args.frames.filter((frame) => frame.reviewStatus === "approved");
  const passB = approved.map((frame) => ({ hypothesis: frame.diagnosis, expected: frame.expectedFindings }));
  const passC: ThreePassResult["passC"] = [];
  const observed = args.findings.join(" ").toLowerCase();
  for (const frame of approved) {
    for (const expected of frame.expectedFindings) {
      if (!observed.includes(expected.toLowerCase())) {
        passC.push({ kind: "blind_spot", text: `expected ${expected} absent` });
      }
    }
  }
  return { passA, passB, passC, ddxOrder: order };
}
