export interface ExpectedResponse {
  metric: "temperature" | "pain" | "urine_output";
  direction: "fall" | "rise";
  withinHours: number;
  baseline: number;
}

export interface ResponseEvaluation {
  blindSpots: Array<{ kind: "blind_spot"; text: string }>;
  treatmentChange: null;
}

/** Compares an expected response with observations. Never changes treatment. */
export function evaluateResponseWindow(input: {
  startedAt: string;
  now: string;
  expected: ExpectedResponse;
  observations: Array<{ at: string; temperature?: number; pain?: number; urineOutput?: number }>;
}): ResponseEvaluation {
  const started = Date.parse(input.startedAt);
  const now = Date.parse(input.now);
  const closed = now - started >= input.expected.withinHours * 60 * 60 * 1000;
  const latest = [...input.observations].reverse().find((row) => {
    if (input.expected.metric === "temperature") return typeof row.temperature === "number";
    if (input.expected.metric === "pain") return typeof row.pain === "number";
    return typeof row.urineOutput === "number";
  });
  const value = input.expected.metric === "temperature" ? latest?.temperature : input.expected.metric === "pain" ? latest?.pain : latest?.urineOutput;
  const met = typeof value === "number" && (input.expected.direction === "fall" ? value < input.expected.baseline : value > input.expected.baseline);
  if (closed && !met) {
    return { blindSpots: [{ kind: "blind_spot", text: `expected ${input.expected.metric} ${input.expected.direction} within ${input.expected.withinHours} h was not met; reconsider diagnosis, dose, complication, adherence or a new problem` }], treatmentChange: null };
  }
  return { blindSpots: [], treatmentChange: null };
}
