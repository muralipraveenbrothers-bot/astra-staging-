import { describe, expect, it } from "vitest";
import { symptomQuestions } from "./symptom7d";

describe("symptom 7D questions", () => {
  it("asks for trigger, radiation and associated red flags without claiming a spinal level", () => {
    const questions = symptomQuestions("low back pain since yesterday", ["D1", "D3"]);
    const axes = questions.map((item) => item.axis);
    expect(axes).toEqual(expect.arrayContaining(["D4", "D6", "D7"]));
    expect(questions.find((item) => item.axis === "D7")?.question).toMatch(/bladder|bowel/i);
    expect(questions.find((item) => item.axis === "D6")?.schemaId).toBe("clinical.symptom.radiation");
    const blob = questions.map((item) => item.question).join(" ");
    expect(blob).not.toMatch(/spinal level is|this is L[1-5]/i);
    expect(blob).toMatch(/does not identify a spinal segment/i);
  });
});
