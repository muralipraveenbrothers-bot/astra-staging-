import { beforeEach, describe, expect, it } from "vitest";
import { runCoreCommand } from "../../src/astra/brain/part5/commands";
import { differenceMatrix, memoryGate, mem0Status, rankForHermes, recallPatient, resetMemoryStore, storeMemory } from "../../src/astra/brain/part5/memory";
import { reviewPatient } from "../../src/astra/brain/part5/review";
import { beginTrace } from "../../src/astra/brain/part5/trace";
import { isMicroCommand, keepTranscripts, voiceIntent } from "../../src/astra/brain/part5/voice";

beforeEach(() => resetMemoryStore());

describe("Astra brain part 5", () => {
  it("stays silent for a side conversation and keeps the raw transcript", () => {
    expect(voiceIntent("hey nurse pass the chart")).toBe("NOT ADDRESSED TO ASTRA");
    expect(voiceIntent("Astra, open pharmacy")).toBe("SYSTEM NAVIGATION");
    expect(isMicroCommand("show CBC")).toBe(true);
    const kept = keepTranscripts("show cbc", "Show the CBC.");
    expect(kept.rawTranscript).toBe("show cbc");
    expect(kept.rawPreserved).toBe(true);
    expect(memoryGate("open pharmacy").requires_memory_recall).toBe("NO");
    expect(reviewPatient("open pharmacy").hermesInvoked).toBe(false);
  });

  it("does not cross patients, invent Mem0 recall, or promote an inference", () => {
    const saved = storeMemory({
      source_id: "chart", source_type: "VERIFIED FACT", patient_id: "MRN1", encounter_id: "E1", user_id: "dr", agent_id: null, run_id: null,
      department: "medicine", memory_class: "clinical_verified", sensitivity: "PHI", workflow_version: "clinical-case-v1", text: "Penicillin allergy.", scope: "patient", expires_at: null, verification_state: "verified",
    });
    expect(saved.ok).toBe(true);
    storeMemory({
      source_id: "chart", source_type: "VERIFIED FACT", patient_id: "MRN1", encounter_id: "E1", user_id: "dr", agent_id: null, run_id: null,
      department: "medicine", memory_class: "clinical_verified", sensitivity: "PHI", workflow_version: "clinical-case-v1", text: "Penicillin and sulfa allergy.", scope: "patient", expires_at: null, verification_state: "verified",
    });
    expect(recallPatient("MRN2")).toEqual([]);
    expect(recallPatient("MRN1").map((item) => item.text)).toEqual(["Penicillin and sulfa allergy."]);
    expect(recallPatient("MRN1").some((item) => item.verification_state === "superseded")).toBe(false);
    expect(storeMemory({
      source_id: "model", source_type: "AI INFERENCE", patient_id: "MRN1", encounter_id: null, user_id: null, agent_id: "7d", run_id: null,
      department: null, memory_class: "clinical_hypothesis", sensitivity: "PHI", workflow_version: "clinical-case-v1", text: "Possible sepsis.", scope: "patient", expires_at: null, verification_state: "verified",
    }).ok).toBe(false);
    expect(storeMemory({
      source_id: "note", source_type: "CLINICIAN ASSESSMENT", patient_id: null, encounter_id: null, user_id: "dr", agent_id: null, run_id: null,
      department: null, memory_class: "technical_configuration", sensitivity: "INTERNAL", workflow_version: "1", text: "password=secret", scope: "hospital", expires_at: null,
    }).ok).toBe(false);
    expect(rankForHermes("MRN2", "penicillin")).toEqual([]);
    expect(mem0Status().fabricated).toBe(false);
    expect(mem0Status().hospitalDatabase).toBe("operational");
    const matrix = differenceMatrix({ age: "25", comorbidities: "none" }, { age: "70", comorbidities: "CKD, diabetes" });
    expect(matrix.copiesTreatment).toBe(false);
    expect(matrix.rows.find((row) => row.field === "age")).toEqual({ field: "age", previous: "25", current: "70" });
  });

  it("reviews a patient without replacing the clinician and traces the request", () => {
    const review = reviewPatient("55-year-old woman with lower back pain radiating to the right lower limb", { admitted: true, presentation: "radicular back pain" });
    expect(review.kind).toBe("clinical-review");
    if (review.kind !== "clinical-review") return;
    expect(review.replacesClinician).toBe(false);
    expect(review.diagnosis).toBeNull();
    expect(review.steps).toContain("identify red flags");
    expect(review.document.inventedFacts).toBe(false);
    const trace = beginTrace("mayin-1");
    expect(trace.request_id).toBe("req-mayin-1");
    expect(trace.phiInTelemetry).toBe(false);
    expect(trace.latencyMs).toBeGreaterThanOrEqual(0);
    expect(trace.note).not.toMatch(/patient|mrn/i);
    expect(runCoreCommand("/trace current").reply).toBe("req-mayin-1");
    expect(runCoreCommand("/memory compare").reply).toMatch(/not copied/i);
    expect(runCoreCommand("Astra, review this patient completely.").name).toBe("review-patient");
  });
});
