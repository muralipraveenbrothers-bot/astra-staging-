import { describe, expect, it } from "vitest";
import { expectedCalibrationError, fitTemperature, topConfusions } from "./calibration";

describe("calibration", () => {
  it("scores a perfectly calibrated set near zero ECE", () => {
    const samples = [];
    for (let bin = 0; bin < 10; bin += 1) {
      const confidence = (bin + 0.5) / 10;
      const correctCount = Math.round(1000 * confidence);
      for (let i = 0; i < 1000; i += 1) samples.push({ confidence, correct: i < correctCount });
    }
    expect(expectedCalibrationError(samples)).toBeLessThan(0.02);
  });

  it("finds over-confidence and a temperature above 1.5 that lowers ECE", () => {
    const samples = Array.from({ length: 100 }, (_, i) => ({ confidence: 0.99, correct: i < 60 }));
    const before = expectedCalibrationError(samples);
    expect(before).toBeGreaterThan(0.37);
    expect(before).toBeLessThan(0.41);
    const temperature = fitTemperature(samples);
    expect(temperature).toBeGreaterThan(1.5);
    expect(expectedCalibrationError(samples, temperature)).toBeLessThan(before);
  });

  it("returns the dominant confused pair", () => {
    const samples = [
      ...Array.from({ length: 23 }, () => ({ confidence: 0.8, correct: false, predicted: "pharmacy", truth: "billing", lang: "te" })),
      { confidence: 0.8, correct: false, predicted: "lab", truth: "ward", lang: "en" },
    ];
    expect(topConfusions(samples, 1)[0]).toMatchObject({ predicted: "pharmacy", truth: "billing", count: 23 });
  });
});
