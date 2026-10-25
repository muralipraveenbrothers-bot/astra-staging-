import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolRegistry } from "@/agents/core/ToolRegistry";
import { getVoiceboxEngine } from "@/voice/VoiceboxEngine";

// Mock the VoiceboxEngine
vi.mock("@/voice/VoiceboxEngine", () => ({
  getVoiceboxEngine: () => ({
    startSession: vi.fn().mockReturnValue({ id: "test-session-id" }),
    endSession: vi.fn(),
    transcribe: vi.fn().mockResolvedValue({ text: "test transcript", confidence: 0.95 }),
    synthesize: vi.fn().mockResolvedValue({ audioContent: new ArrayBuffer(0), durationMs: 1000 }),
    on: vi.fn(),
  }),
}));

describe("Sanjeevani Voice Plugin Tools", () => {
  beforeEach(() => {
    // Clear the tool registry before each test
    // Note: In a real test, we might need to reset the registry
  });

  it("should start a voice session", async () => {
    const result = await ToolRegistry.execute("startVoiceSession", {
      userId: "test-user",
      role: "doctor",
    });

    expect(result).toHaveProperty("sessionId");
    expect(result.sessionId).toBe("test-session-id");
  });

  it("should end a voice session", async () => {
    // First start a session
    await ToolRegistry.execute("startVoiceSession", {
      userId: "test-user",
      role: "doctor",
    });

    const result = await ToolRegistry.execute("endVoiceSession", {
      sessionId: "test-session-id",
    });

    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
  });

  it("should transcribe voice", async () => {
    const result = await ToolRegistry.execute("transcribeVoice", {
      audioBase64: "dGVzdCBhdWRpbw==", // "test audio" in base64
      language: "en",
      sessionId: "test-session-id",
    });

    expect(result).toHaveProperty("transcript");
    expect(result.transcript).toBe("test transcript");
    expect(result).toHaveProperty("confidence");
    expect(result.confidence).toBe(0.95);
  });

  it("should synthesize voice", async () => {
    const result = await ToolRegistry.execute("speakVoice", {
      text: "Hello world",
      voicePersona: "DR_ARJUN",
      language: "en",
    });

    expect(result).toHaveProperty("audioBase64");
    expect(result).toHaveProperty("durationMs");
  });
});