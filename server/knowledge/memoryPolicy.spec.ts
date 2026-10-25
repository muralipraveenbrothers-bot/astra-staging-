import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { answerSource, canRead, canWrite, ensureIdentityFiles } from "./memoryPolicy";

describe("memory policy", () => {
  it("rejects copying a patient record into identity, procedural or conversation stores", () => {
    const patient = { uhid: "MP10001", creatinine: 2.4, phone: "9876543210" };
    expect(canWrite("hermes", "C", patient)).toBe(false);
    expect(canWrite("scientist", "D", patient)).toBe(false);
    expect(canWrite("micro_astra", "B", patient)).toBe(false);
    expect(canWrite("hermes", "E", patient)).toBe(false);
    expect(canWrite("hermes", "F", patient)).toBe(false);
    expect(canRead("micro_astra", "G", "PHI").mode).toBe("deny");
    expect(canRead("doctor", "G", "PHI").mode).toBe("reference");
  });

  it("routes creatinine to patient truth and a nursing charge to hospital or operational stores, never an LLM", () => {
    const lab = answerSource("latest creatinine for MP10001");
    expect(lab.store).toBe("G");
    expect(lab.llm).toBe(false);
    expect(lab.found).toBe(true);
    const price = answerSource("ICU nursing charge");
    expect(price.stores).toEqual(expect.arrayContaining(["F", "H"]));
    expect(price.llm).toBe(false);
    const missing = answerSource("what colour is the waiting room chair");
    expect(missing.found).toBe(false);
    expect(missing.llm).toBe(false);
  });

  it("creates empty identity headings and does not invent hospital facts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-id-"));
    const files = ensureIdentityFiles(dir);
    const hospital = fs.readFileSync(files[0], "utf8");
    expect(hospital.startsWith("# Hospital")).toBe(true);
    expect(hospital).not.toMatch(/bed|tariff|doctor name/i);
  });
});
