import { describe, expect, it } from "vitest";
import fs from "fs";
import { Astra7DClinicalEngine } from "./astra7dEngine";

describe("astra7d triage source", () => {
  it("labels regex triage as rules and does not hard-code 0.98 or 0.90", () => {
    const source = fs.readFileSync(new URL("./astra7dEngine.ts", import.meta.url), "utf8");
    const triage = source.slice(source.indexOf("layaSystem1Triage"), source.indexOf("calculateBayesianProbability"));
    expect(triage).not.toMatch(/0\.98|0\.90/);
    const result = Astra7DClinicalEngine.layaSystem1Triage("chest pain");
    expect(result.source).toBe("rules");
    expect(result.confidence).toBe(1);
  });
});
