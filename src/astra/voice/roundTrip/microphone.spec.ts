import { describe, expect, it } from "vitest";
import { microphoneErrorMessage } from "./microphone";

describe("Saarathi microphone permission copy", () => {
  it("tells the user how to Allow a blocked mic", () => {
    expect(microphoneErrorMessage({ name: "NotAllowedError" })).toMatch(/Allow/i);
  });

  it("names a missing device", () => {
    expect(microphoneErrorMessage({ name: "NotFoundError" })).toMatch(/No microphone/i);
  });

  it("names a busy device", () => {
    expect(microphoneErrorMessage({ name: "NotReadableError" })).toMatch(/in use/i);
  });
});
