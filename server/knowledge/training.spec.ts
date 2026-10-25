import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { acceptTrainingExample, curriculumReport, deidentifyTrainingText, exportJsonl, type TrainingExample } from "./training/candidates";

const synthetic: TrainingExample = {
  id: "syn-1",
  family: "terminology",
  language: "en",
  department: "lab",
  text: "Name: Anita Sharma; phone: 9876543210; UHID: MP123456; address: 12 Lake Road; date: 2024-01-15; term: creatinine",
  verified: true,
  approved: true,
  correct: true,
};

describe("training candidates", () => {
  it("rejects an unverified example and de-identifies a SYNTHETIC sample", () => {
    expect(acceptTrainingExample({ ...synthetic, verified: false }).ok).toBe(false);
    const clean = deidentifyTrainingText(synthetic.text);
    expect(clean).not.toMatch(/Anita|9876543210|MP123456|Lake Road/);
    expect(clean).not.toContain("2024-01-15");
    const accepted = acceptTrainingExample(synthetic);
    expect(accepted.ok).toBe(true);
  });

  it("requires admin to export and groups the curriculum report", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "astra-train-"));
    expect(() => exportJsonl({ family: "terminology", split: "train", role: "doctor", rows: [synthetic], root })).toThrow(/admin/);
    const exported = exportJsonl({ family: "terminology", split: "train", role: "admin", rows: [synthetic, { ...synthetic, id: "no", verified: false }], root });
    const lines = fs.readFileSync(exported.file, "utf8").trim().split(/\n/);
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/Anita|9876543210|MP123456|Lake Road/);
    const report = curriculumReport([
      { language: "te", department: "ward", family: "terminology", correct: true },
      { language: "te", department: "ward", family: "terminology", correct: false },
      { language: "hi", department: "pharmacy", family: "normalization", correct: true },
    ]);
    expect(report).toHaveLength(2);
    const te = report.find((row) => row.language === "te");
    expect(te?.department).toBe("ward");
    expect(te?.family).toBe("terminology");
    expect(te?.accuracy).toBe(0.5);
  });
});
