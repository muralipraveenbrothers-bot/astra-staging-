// Staging-only generic templates. No patient or production clinical records.
export interface SurgeryTemplate {
  name: string;
  specialty: string;
  steps: string[];
  risks: string[];
  postOp: string[];
}

export const surgeryTemplates: Record<string, SurgeryTemplate> = {
  tibia_nailing: {
    name: "Demo orthopaedic procedure",
    specialty: "Orthopaedics",
    steps: ["Confirm consent and procedure site.", "Perform procedure according to approved protocol."],
    risks: ["Bleeding", "Infection", "Need for further treatment"],
    postOp: ["Monitor recovery.", "Provide discharge instructions after clinical review."],
  },
};

export const surgeryGroups = [{ label: "Staging demo", items: ["tibia_nailing"] }];
