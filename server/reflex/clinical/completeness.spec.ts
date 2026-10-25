import { describe, expect, it } from "vitest";
import { evaluateCompleteness } from "./completeness";

describe("clinical completeness", () => {
  it("scores three synthetic chief complaint families deterministically", () => {
    expect(evaluateCompleteness("Complaint chest pain for 2 hours severe radiates to arm ECG done troponin pending BP HR SpO2").score).toBeGreaterThan(80);
    expect(evaluateCompleteness("Complaint fever for 3 days temp 101 cough CBC WBC vitals BP HR").family).toBe("fever");
    expect(evaluateCompleteness("Complaint abdominal pain vomiting right lower quadrant").missing).toContain("pregnancy status");
  });
});
