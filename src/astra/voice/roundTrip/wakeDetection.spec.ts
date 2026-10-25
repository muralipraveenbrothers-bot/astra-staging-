import { describe, expect, it } from "vitest";
import { extractWakeCommand, isCallingAstra, MAYIN_WAKE_PATTERN } from "./wakeDetection";

describe("wake detection", () => {
  it("matches the allowed Dr. Mayin wake names and common local STT spellings", () => {
    for (const text of [
      "hey Mayin", "Mayin", "mine", "mayan", "maine", "Astra", "Jarvis",
      "Saarathi", "Sanjeevani", "\u0c36\u0c3e\u0c30\u0c25\u0c3f", "\u0938\u0902\u091c\u0940\u0935\u0928\u0940",
    ]) {
      expect(MAYIN_WAKE_PATTERN.test(text), text).toBe(true);
    }
  });

  it("rejects nearby non-wake words", () => {
    for (const text of ["master", "extra", "jaundice", "main ward", "open lab"]) {
      expect(MAYIN_WAKE_PATTERN.test(text), text).toBe(false);
      expect(isCallingAstra(text), text).toBe(false);
    }
  });

  it("extracts the command after a wake phrase", () => {
    expect(extractWakeCommand("hey Mayin, open the lab")).toEqual({ woke: true, command: "open the lab" });
    expect(extractWakeCommand("Jarvis")).toEqual({ woke: true, command: "" });
    expect(extractWakeCommand("please open the lab")).toEqual({ woke: false, command: "please open the lab" });
  });
});
