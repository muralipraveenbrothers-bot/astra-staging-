/**
 * Prompt 06 — Memory + Voice + Flight Recorder.
 *
 * Everything here is synthetic: no provider is contacted, no audio is decoded
 * and no transcript is invented. The point of the suite is the honesty rules —
 * scoped memory, a really measured trace, raw text preserved, and silence for a
 * side conversation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { astraEventBus } from "../../src/astra/events/astraEventBus";
import { memoryFabric, memoryGates, normalizeScope, renderRecallForPrompt } from "../../src/astra/brain/part5/memoryFabric";
import { resetMemoryStore } from "../../src/astra/brain/part5/memory";
import {
  beginTrace, beginTraceFor, currentTrace, reconstructTrace, recordError, recordModelCall, recordSpan, resetTraceStore, traceFor,
} from "../../src/astra/brain/part5/trace";
import {
  refineTranscript, resetVoiceTranscripts, runVoiceTurnPipeline, voiceboxHealth, voiceTranscripts,
} from "../../src/astra/brain/part5/voicePipeline";

const fabric = memoryFabric;

beforeEach(() => {
  resetMemoryStore();
  resetTraceStore();
  resetVoiceTranscripts();
  astraEventBus.clearFlightRecorder();
});

describe("Flight Recorder spans", () => {
  it("measures real spans, sums only reported tokens and keeps cost unclaimed", () => {
    const started = beginTrace("turn-1");
    expect(started.request_id).toBe("req-turn-1");
    recordSpan({ kind: "laya", name: "Laya decision pack", latencyMs: 7, detail: "gates answered.", correlationId: "turn-1" });
    recordModelCall({ name: "Astra orchestrator", latencyMs: 42, model: "local-model", tokens: { prompt: 120, completion: 30 }, correlationId: "turn-1" });

    const rebuilt = reconstructTrace("turn-1");
    expect(rebuilt.found).toBe(true);
    expect(rebuilt.steps.map((step) => step.kind)).toEqual(["laya", "model"]);
    expect(rebuilt.steps[1]?.latencyMs).toBe(42);
    expect(rebuilt.tokens).toEqual({ prompt: 120, completion: 30, total: 150 });
    expect(rebuilt.cost).toBeNull();
    expect(rebuilt.phiInTelemetry).toBe(false);
    expect(rebuilt.model).toBe("local-model");
  });

  it("does not invent tokens, steps or scrub rules", () => {
    beginTrace("turn-2");
    recordSpan({ kind: "tool", name: "vitals.read", latencyMs: 3, correlationId: "turn-2" });
    expect(reconstructTrace("turn-2").tokens).toBeNull();
    expect(reconstructTrace("turn-2").steps[0]?.tokens).toBeNull();
    expect(reconstructTrace("turn-2").steps[0]?.phi).toBe("excluded");

    const missing = reconstructTrace("never-happened");
    expect(missing.found).toBe(false);
    expect(missing.steps).toEqual([]);
    expect(missing.note).toMatch(/correlation id/i);

    recordError({ name: "voice", message: "freellmapi-abc123 failed for UHID 99123", correlationId: "turn-2" });
    const error = reconstructTrace("turn-2").steps.find((step) => step.kind === "error");
    expect(error?.ok).toBe(false);
    expect(error?.detail).not.toMatch(/freellmapi-abc123|99123/);
  });

  it("keeps a background trace keyed by its own id while another request is current", () => {
    const foreground = beginTrace("foreground-1");
    const background = beginTraceFor("flow-9");
    expect(currentTrace()?.request_id).toBe(foreground.request_id);
    expect(traceFor("flow-9")?.request_id).toBe("req-flow-9");
    recordSpan({ kind: "langgraph", name: "graph", latencyMs: 1, correlationId: "flow-9" });
    expect(background.spans).toHaveLength(1);
    expect(foreground.spans).toHaveLength(0);
  });
});

describe("Memory Fabric scopes", () => {
  it("maps legacy stored scopes onto the spec scopes", () => {
    expect(normalizeScope("workflow")).toBe("working");
    expect(normalizeScope("agent")).toBe("procedural");
    expect(normalizeScope("hospital")).toBe("organizational");
    expect(normalizeScope("patient")).toBe("patient");
    expect(normalizeScope(undefined)).toBe("working");
  });

  it("gates a micro command without recall and states the expiry source", () => {
    const gates = memoryGates("Astra, open pharmacy", Date.parse("2026-01-01T00:00:00.000Z"));
    expect(gates.needsRecall).toBe("NO");
    expect(gates.scope).toBe("working");
    expect(gates.expiry).toEqual({ duration: "none", expiresAt: null, source: "policy default" });
    expect(gates.explanation).toMatch(/scope=working/);
  });

  it("refuses a clinical recall without an exact patient id and never crosses patients", () => {
    const blocked = fabric.recall({ text: "patient has chest pain", patientId: null });
    expect(blocked.records).toEqual([]);
    expect(blocked.blocked).toMatch(/exact patient identity/i);
    expect(blocked.semanticUsed).toBe(false);

    const saved = fabric.store({
      source_id: "chart", source_type: "VERIFIED FACT", patient_id: "MRN1", encounter_id: "E1", user_id: "dr", agent_id: null, run_id: null,
      department: "medicine", memory_class: "clinical_verified", sensitivity: "PHI", workflow_version: "clinical-case-v1",
      text: "Penicillin allergy.", scope: "patient", expires_at: null, verification_state: "verified",
    });
    expect(saved.ok).toBe(true);
    expect(saved.scope).toBe("patient");

    expect(fabric.recall({ text: "penicillin allergy", patientId: "MRN2" }).records).toEqual([]);
    const own = fabric.recall({ text: "penicillin allergy", patientId: "MRN1" });
    expect(own.exactPatientScope).toBe(true);
    expect(own.records.map((record) => record.text)).toContain("Penicillin allergy.");
  });

  it("recalls non-clinical hospital scope without a patient and keeps the status honest", () => {
    fabric.store({
      source_id: "policy", source_type: "HOSPITAL POLICY", patient_id: null, encounter_id: null, user_id: null, agent_id: null, run_id: null,
      department: "administration", memory_class: "hospital_policy", sensitivity: "INTERNAL", workflow_version: "1",
      text: "Sepsis bundle starts within one hour.", scope: "hospital", expires_at: null, verification_state: "verified",
    });
    const recall = fabric.recall({ text: "sepsis bundle", patientId: null });
    expect(recall.exactPatientScope).toBe(false);
    expect(recall.records.map((record) => record.scope)).toEqual(["organizational"]);
    expect(renderRecallForPrompt(recall)).toMatch(/hospital_policy/);

    const status = fabric.status();
    expect(status.fabric).toBe("part5-classed");
    expect(status.semanticProvider).toBe("none");
    expect(status.providers.qdrant).toBe("not installed");
    expect(status.counts.byScope.organizational).toBe(1);
    expect(renderRecallForPrompt({ ...recall, records: [], blocked: null })).toBe("Memory: nothing recalled.");
  });

  it("refuses to promote an inference through the fabric", () => {
    const refused = fabric.store({
      source_id: "model", source_type: "AI INFERENCE", patient_id: "MRN1", encounter_id: null, user_id: null, agent_id: "7d", run_id: null,
      department: null, memory_class: "clinical_hypothesis", sensitivity: "PHI", workflow_version: "clinical-case-v1",
      text: "Possible sepsis.", scope: "patient", expires_at: null, verification_state: "verified",
    });
    expect(refused.ok).toBe(false);
    expect(refused.memory_id).toBeNull();
  });
});



describe("Voice pipeline", () => {
  it("refines locally without touching the meaning", () => {
    expect(refineTranscript("  show   cbc  ")).toBe("Show cbc.");
    expect(refineTranscript("Where is the patient?")).toBe("Where is the patient?");
    expect(refineTranscript("   ")).toBe("");
  });

  it("reports a missing local STT instead of inventing a transcript", async () => {
    const result = await runVoiceTurnPipeline({
      audio: { bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" },
      patientId: "MRN1",
      correlationId: "v-1",
    });
    expect(result.unavailable).toBe("VOICEBOX_STT_UNAVAILABLE");
    expect(result.rawTranscript).toBe("");
    expect(result.responseText).toBe("");
    expect(result.stages.find((stage) => stage.stage === "local STT")?.status).toBe("blocked");
    expect(result.spoken).toBe(false);
    expect(voiceTranscripts()).toEqual([]);
  });

  it("runs the whole chain with real transports and publishes PHI-free bus events", async () => {
    const seen: string[] = [];
    const off = astraEventBus.subscribe("*", (event) => {
      seen.push(event.eventType);
    });
    const respond = vi.fn(async () => "Opening the pharmacy screen now.");
    const tts = vi.fn(async () => ({ providerId: "voicebox", chunks: 2 }));
    const result = await runVoiceTurnPipeline(
      {
        audio: { bytes: new Uint8Array([9, 9]), mimeType: "audio/webm" },
        patientId: "MRN7",
        actorId: "dr-1",
        actorRole: "doctor",
        correlationId: "v-2",
      },
      { stt: async () => ({ text: "astra open pharmacy please", provider: "voicebox-whisper", language: "en-IN" }), respond, tts },
    );
    off();
    expect(result.intent).toBe("SYSTEM NAVIGATION");
    expect(result.rawTranscript).toBe("astra open pharmacy please");
    expect(result.refinedTranscript).toBe("Astra open pharmacy please.");
    expect(result.spoken).toBe(true);
    expect(result.ttsChunks).toBe(2);
    expect(result.unavailable).toBeNull();
    expect(result.stages.every((stage) => stage.status === "completed")).toBe(true);
    expect(result.authorization.voiceIsAuthorization).toBe(false);
    expect(seen).toEqual(["astra.voice.transcript", "astra.voice.response"]);

    const snapshot = astraEventBus.flightRecorderSnapshot();
    expect(snapshot.every((event) => event.payloadRedacted)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/open pharmacy/);
    expect(voiceTranscripts()[0]?.rawTranscript).toBe("astra open pharmacy please");
  });

  it("stays silent and unspoken for a side conversation", async () => {
    const respond = vi.fn(async () => "should not run");
    const tts = vi.fn(async () => ({ providerId: "voicebox", chunks: 1 }));
    const result = await runVoiceTurnPipeline(
      { textIn: "hey sister pass the chart", actorId: "dr-1", actorRole: "doctor", correlationId: "v-3" },
      { respond, tts },
    );
    expect(result.intent).toBe("NOT ADDRESSED TO ASTRA");
    expect(result.silent).toBe(true);
    expect(respond).not.toHaveBeenCalled();
    expect(tts).not.toHaveBeenCalled();
    expect(result.spoken).toBe(false);
  });

  it("does not write a transcript pair when persistence is switched off", async () => {
    const result = await runVoiceTurnPipeline(
      { textIn: "show cbc", persistTranscripts: false, correlationId: "v-4" },
      { respond: async () => "CBC panel ready.", tts: async () => ({ providerId: "voicebox", chunks: 1 }) },
    );
    expect(result.persistence.stored).toBe(false);
    expect(result.persistence.reason).toMatch(/disabled/i);
    expect(voiceTranscripts()).toEqual([]);
    expect(result.rawTranscript).toBe("show cbc");
    expect(result.refinedTranscript).toBe("Show cbc.");
  });

  it("probes Voicebox and reports OFF without pretending it is ready", async () => {
    const off = await voiceboxHealth({ base: "http://127.0.0.1:17493", probe: async () => false });
    expect(off.state).toBe("OFF");
    expect(off.fabricated).toBe(false);
    expect(off.detail).toMatch(/17493/);
    const ready = await voiceboxHealth({ probe: async () => true });
    expect(ready.state).toBe("READY");
    expect(ready.reachable).toBe(true);
  });
});
