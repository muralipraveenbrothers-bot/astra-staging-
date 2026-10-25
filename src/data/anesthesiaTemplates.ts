// Staging-only generic templates. No production protocols or patient records.
export interface AnesthesiaTemplate {
  name: string;
  technique: string;
  drugs: string[];
  monitoring: string[];
  complications: string[];
  recovery: string[];
}

export const anesthesiaTemplates: Record<string, AnesthesiaTemplate> = {
  spinal: {
    name: "Demo anesthesia plan",
    technique: "For UI preview only; clinical staff must select an approved plan.",
    drugs: ["To be selected by the clinical team."],
    monitoring: ["Standard monitoring per approved policy."],
    complications: ["Discuss and document as clinically appropriate."],
    recovery: ["Recover under the approved post-anesthesia protocol."],
  },
};

export const anesthesiaOptions = [{ key: "spinal", label: "Demo anesthesia plan" }];
