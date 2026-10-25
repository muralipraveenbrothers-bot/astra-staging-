import { describe, expect, it } from "vitest";
import { WAKE_WORD_PREF_KEY, isWakeWordEnabled, wakeWordStoredValue } from "./useVoicePrefs";

describe("useVoicePrefs", () => {
  it("defaults wake word listening off and persists on or off", () => {
    expect(WAKE_WORD_PREF_KEY).toBe("astra.voice.wakeWord");
    expect(isWakeWordEnabled(null)).toBe(false);
    expect(isWakeWordEnabled("off")).toBe(false);
    expect(isWakeWordEnabled("on")).toBe(true);
    expect(wakeWordStoredValue(false)).toBe("off");
    expect(wakeWordStoredValue(true)).toBe("on");
  });
});
