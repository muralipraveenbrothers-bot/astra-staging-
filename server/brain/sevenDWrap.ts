/**
 * Wraps the existing Astra 7D engine. The engine and its D1–D7 object are unchanged.
 * Part 2 layers are attached beside that object.
 */
import { explainCase } from "../../src/astra/brain/part2/explain";
import type { VerifiedFacts } from "../../src/astra/brain/part2/facts";
import { Astra7DClinicalEngine } from "../clinical/astra7dEngine";

function factsFromContext(patientContext: unknown): VerifiedFacts {
  if (!patientContext || typeof patientContext !== "object") return {};
  const source = patientContext as Record<string, unknown>;
  const facts: VerifiedFacts = {};
  if (typeof source.summary === "string") facts.presentation = source.summary;
  if (typeof source.age === "number") facts.age = source.age;
  if (typeof source.sex === "string") facts.sex = source.sex;
  if (Array.isArray(source.comorbidities)) facts.comorbidities = source.comorbidities.filter((item) => typeof item === "string");
  if (Array.isArray(source.recentLabs)) {
    facts.labs = source.recentLabs.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const lab = item as Record<string, unknown>;
      return typeof lab.name === "string" ? [{ name: lab.name, value: typeof lab.value === "string" ? lab.value : undefined }] : [];
    });
  }
  return facts;
}

export async function wrapExisting7D(query: string, patientContext?: unknown, language = "en") {
  const synthesis = await Astra7DClinicalEngine.synthesize7D(query, patientContext, language);
  return {
    invoked: true,
    engine: "Astra7DClinicalEngine",
    version: "existing",
    synthesis,
    layers: explainCase({ text: query, facts: factsFromContext(patientContext) }),
  };
}
