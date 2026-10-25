import { describe, expect, it } from "vitest";
import { summarizeDiagnostics, type DiagnosticRow } from "./diagnosticsSummary";
import type { MayinRuntimeDiagnostics } from "./runtime/MayinRuntime";
import type { MemoryHealth } from "./memory/AstraMemoryGateway";
import type { LayaDiagnostics } from "@/astra/plugins/layaDecision";
import type { GestureDiagnostics } from "./gesture/MayinGestureController";
import type { VoiceStatus } from "./voice/voiceProvider";

function voice(over: Partial<VoiceStatus> = {}): VoiceStatus {
  return {
    provider: "voicebox",
    microphonePermission: "granted",
    microphoneActive: false,
    voiceProviderConnected: true,
    lastAudioInput: null,
    lastTranscript: null,
    lastVoiceOutput: null,
    roundTripLatency: null,
    reconnectAttempts: 0,
    language: "en",
    conversationState: "idle",
    ...over,
  };
}

function memory(over: Partial<MemoryHealth> = {}): MemoryHealth {
  return {
    memoryServiceReachable: true,
    lastRemember: null,
    lastRecall: null,
    recallLatencyMs: null,
    queueDepth: 0,
    databaseReachable: true,
    ...over,
  };
}

function laya(over: Partial<LayaDiagnostics> = {}): LayaDiagnostics {
  return {
    enabled: true,
    baseUrl: "http://127.0.0.1:8791",
    reachable: true,
    calls: 4,
    degradedCalls: 0,
    consecutiveFailures: 0,
    lastCallAt: "2026-09-23T12:00:00Z",
    lastLatencyMs: 546,
    modelLoaded: true,
    device: "cpu",
    ...over,
  };
}

function diag(over: Partial<MayinRuntimeDiagnostics> = {}): MayinRuntimeDiagnostics {
  return {
    started: false,
    voice: voice(),
    voiceTiers: null,
    memory: memory(),
    laya: laya(),
    gesture: null,
    visualState: "idle",
    conversationState: "idle",
    language: { primaryLanguage: "en" },
    unresolvedVoiceTurns: 0,
    ...over,
  };
}

function row(rows: DiagnosticRow[], label: string): DiagnosticRow {
  const found = rows.find((r) => r.label === label);
  expect(found, `expected row "${label}"`).toBeDefined();
  return found!;
}

describe("summarizeDiagnostics", () => {
  it("renders every fixed label exactly once with non-empty values", () => {
    const rows = summarizeDiagnostics(diag());
    const labels = rows.map((r) => r.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const r of rows) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.value.length).toBeGreaterThan(0);
    }
    for (const required of [
      "Runtime",
      "Voice — provider",
      "Memory — service",
      "Laya — reachability",
      "Gesture",
      "Unresolved voice turns",
    ]) {
      expect(labels).toContain(required);
    }
  });

  it("healthy runtime produces NO error rows", () => {
    expect(summarizeDiagnostics(diag()).filter((r) => r.tone === "error")).toEqual([]);
  });

  it("a single provider says so — it never invents a tier chain", () => {
    const r = row(summarizeDiagnostics(diag({ voiceTiers: null })), "Voice — tiers");
    expect(r.value).toContain("single provider");
    expect(r.tone).toBe("neutral");
  });

  it("no speak() attempt yet is neutral — never a green claim", () => {
    const r = row(
      summarizeDiagnostics(diag({ voiceTiers: { lastSpokenBy: null, outcomes: [] } })),
      "Voice — tiers",
    );
    expect(r.value).toBe("no speak() attempt yet");
    expect(r.tone).toBe("neutral");
  });

  it("names the tier that actually spoke", () => {
    const r = row(
      summarizeDiagnostics(diag({ voiceTiers: { lastSpokenBy: "sarvam", outcomes: [] } })),
      "Voice — tiers",
    );
    expect(r.value).toBe("spoke via sarvam");
    expect(r.tone).toBe("ok");
  });

  it("every tier skipped is an ERROR row carrying the real skip reasons", () => {
    const r = row(
      summarizeDiagnostics(
        diag({
          voiceTiers: {
            lastSpokenBy: null,
            outcomes: [
              { id: "openai-live", skipped: "disconnected" },
              { id: "sarvam", skipped: "phi-local-only" },
              { id: "voicebox", error: "ECONNREFUSED 127.0.0.1:17493" },
            ],
          },
        }),
      ),
      "Voice — tiers",
    );
    expect(r.tone).toBe("error");
    expect(r.value).toContain("openai-live: skipped (disconnected)");
    expect(r.value).toContain("sarvam: skipped (phi-local-only)");
    expect(r.value).toContain("ECONNREFUSED");
  });

  it("unreachable memory service is an error row, not silent ok", () => {
    const rows = summarizeDiagnostics(
      diag({ memory: memory({ memoryServiceReachable: false, databaseReachable: false }) }),
    );
    expect(row(rows, "Memory — service").tone).toBe("error");
    expect(row(rows, "Memory — database").tone).toBe("error");
  });

  it("unreachable Laya reports error + rule-fallback wording (degradation contract)", () => {
    const r = row(summarizeDiagnostics(diag({ laya: laya({ reachable: false }) })), "Laya — reachability");
    expect(r.tone).toBe("error");
    expect(r.value).toContain("falls back to rules");
  });

  it("disabled Laya is neutral, not an error", () => {
    const rows = summarizeDiagnostics(diag({ laya: laya({ enabled: false, reachable: false }) }));
    expect(row(rows, "Laya — reachability").tone).toBe("neutral");
  });

  it("microphone permission maps granted→ok, prompt→warn, denied→error", () => {
    expect(row(summarizeDiagnostics(diag({ voice: voice({ microphonePermission: "granted" }) })), "Voice — microphone").tone).toBe("ok");
    expect(row(summarizeDiagnostics(diag({ voice: voice({ microphonePermission: "prompt" }) })), "Voice — microphone").tone).toBe("warn");
    expect(row(summarizeDiagnostics(diag({ voice: voice({ microphonePermission: "denied" }) })), "Voice — microphone").tone).toBe("error");
  });

  it("pending memory queue is a warning", () => {
    expect(row(summarizeDiagnostics(diag({ memory: memory({ queueDepth: 3 }) })), "Memory — queue").tone).toBe("warn");
  });

  it("null gesture renders an honest neutral 'not attached' row", () => {
    const r = row(summarizeDiagnostics(diag({ gesture: null })), "Gesture");
    expect(r.tone).toBe("neutral");
    expect(r.value).toContain("not attached");
  });

  it("running gesture with camera reports ok and includes Hz", () => {
    const gesture: GestureDiagnostics = {
      state: "running",
      cameraActive: true,
      inferenceHz: 28.5,
      framesProcessed: 1024,
    };
    const r = row(summarizeDiagnostics(diag({ gesture })), "Gesture");
    expect(r.tone).toBe("ok");
    expect(r.value).toContain("28.5 Hz");
    expect(r.value).toContain("1024 frames");
  });

  it("Laya lastError surfaces as error row and is clipped to 140 chars", () => {
    const long = "ECONNREFUSED 127.0.0.1:8791 ".repeat(20);
    const r = row(
      summarizeDiagnostics(diag({ laya: laya({ reachable: false, lastError: long }) })),
      "Laya — last error",
    );
    expect(r.tone).toBe("error");
    expect(r.value.length).toBeLessThanOrEqual(140);
    expect(r.value.endsWith("…")).toBe(true);
  });

  it("language object renders primaryLanguage without lying about shape", () => {
    expect(row(summarizeDiagnostics(diag({ language: { primaryLanguage: "te-en" } })), "Language").value).toBe("te-en");
    expect(row(summarizeDiagnostics(diag({ language: null })), "Language").value).toBe("unknown");
  });

  it("unresolved voice turns > 0 is a warning", () => {
    expect(row(summarizeDiagnostics(diag({ unresolvedVoiceTurns: 2 })), "Unresolved voice turns").tone).toBe("warn");
    expect(row(summarizeDiagnostics(diag({ unresolvedVoiceTurns: 0 })), "Unresolved voice turns").tone).toBe("ok");
  });

  it("zero Laya calls is neutral (never exercised ≠ healthy nor broken)", () => {
    const r = row(summarizeDiagnostics(diag({ laya: laya({ calls: 0, degradedCalls: 0 }) })), "Laya — calls");
    expect(r.tone).toBe("neutral");
  });
});

