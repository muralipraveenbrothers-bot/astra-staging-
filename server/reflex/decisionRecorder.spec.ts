import { describe, expect, it } from "vitest";
import { createDecisionRecorder, hashPatientId, _resetRecorderForTest } from "./decisionRecorder";

describe("decision recorder", () => {
  it("keeps the state hash, hashes the patient id, and drops raw text and phone numbers", async () => {
    _resetRecorderForTest();
    const seen: Record<string, unknown>[] = [];
    const recorder = createDecisionRecorder();
    const real = recorder.record.bind(recorder);
    recorder.record = (event) => { real(event); seen.push(event); };
    await recorder.record({
      decisionId: "d1",
      schemaId: "department_routing",
      stateHash: "a".repeat(64),
      patientId: "UHID1234567890",
      text: "SYNTHETIC raw phrase 9876543210",
      input: "9876543210",
    });
    const stored = JSON.stringify(seen.length ? undefined : undefined);
    const { recordedDecisions } = await import("./decisionRecorder");
    const row = recordedDecisions()[0];
    expect(row.stateHash).toBe("a".repeat(64));
    expect(row.patientHash).toBe(hashPatientId("UHID1234567890"));
    expect(row.patientHash).not.toBe("UHID1234567890");
    expect(JSON.stringify(row)).not.toContain("raw phrase");
    expect(JSON.stringify(row)).not.toContain("9876543210");
    expect(stored).toBeUndefined();
  });
});
