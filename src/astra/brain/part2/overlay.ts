/**
 * Comorbidity overlay and the admission deterioration radar.
 * No early biomarker is added unless it is already a standard bedside or lab signal.
 */
import type { VerifiedFacts } from "./facts";
import { isFractureRisk } from "./mechanism";

export interface OverlayAnswer {
  comorbidity: string;
  normalCompensation: string;
  patientHasIt: "yes" | "no" | "unknown";
  failsFirst: string;
  detection: string;
}

const OVERLAYS: Record<string, Omit<OverlayAnswer, "comorbidity" | "patientHasIt">> = {
  ckd: {
    normalCompensation: "Remaining nephrons increase filtration and potassium excretion.",
    failsFirst: "Potassium balance and volume handling.",
    detection: "Creatinine trend, urine output, and potassium. A single creatinine does not describe the reserve.",
  },
  diabetes: {
    normalCompensation: "Inflammatory healing and protective sensation.",
    failsFirst: "Pain sensation and wound control.",
    detection: "Do not treat absent pain as safety when neuropathy is possible. Inspect the limb.",
  },
  "heart failure": {
    normalCompensation: "Cardiac output reserve and tolerance of intravenous fluid.",
    failsFirst: "Pulmonary congestion.",
    detection: "Breathlessness, weight, and oxygenation. Fluid given for a limb injury still loads the heart.",
  },
  copd: {
    normalCompensation: "Ventilatory reserve.",
    failsFirst: "Gas exchange.",
    detection: "Respiratory rate and oxygenation. A normal pulse does not measure ventilation.",
  },
  "liver disease": {
    normalCompensation: "Clotting factor and albumin synthesis.",
    failsFirst: "Bleeding into injured tissue.",
    detection: "Observed bleeding and the recorded coagulation result. Do not invent a coagulation value.",
  },
  obesity: {
    normalCompensation: "Examination access to compartments and veins.",
    failsFirst: "Clinical detection, because the compartment is harder to feel.",
    detection: "Treat an unreliable exam as equivocal rather than reassuring.",
  },
  frailty: {
    normalCompensation: "Physiological reserve across organs.",
    failsFirst: "The organ system with the least reserve. That system is unknown until the history names it.",
    detection: "Function, intake, and the first abnormal vital or lab that was actually recorded.",
  },
  pregnancy: {
    normalCompensation: "Expanded blood volume and a hypercoagulable state.",
    failsFirst: "Maternal perfusion and thrombosis risk. Fetal status is a separate clinical review.",
    detection: "Maternal pulse and blood pressure do not describe the fetus. Escalate obstetric review.",
  },
  anticoagulation: {
    normalCompensation: "Normal hemostasis inside an injured compartment.",
    failsFirst: "The compartment, because bleeding raises pressure faster.",
    detection: "Tension, pain, and hemoglobin trend. A present pulse is not clearance.",
  },
  immunosuppression: {
    normalCompensation: "Fever and a brisk inflammatory response.",
    failsFirst: "Infection detection.",
    detection: "Fever may be absent. Use the wound, the recorded white-cell count, and clinical course.",
  },
  anemia: {
    normalCompensation: "Oxygen delivery from hemoglobin reserve.",
    failsFirst: "Tissue oxygen delivery.",
    detection: "The recorded hemoglobin and symptoms. Do not invent a hemoglobin.",
  },
  "peripheral vascular disease": {
    normalCompensation: "Arterial inflow around the injury.",
    failsFirst: "The limb distal to the diseased vessel.",
    detection: "Compare with the other limb. A weak pulse can be chronic vascular disease or acute ischemia. The difference is a doctor exam.",
  },
};

function canon(name: string): string | null {
  const text = name.toLowerCase();
  if (/ckd|chronic kidney|renal failure/.test(text)) return "ckd";
  if (/diabet/.test(text)) return "diabetes";
  if (/heart failure|ccf|chf/.test(text)) return "heart failure";
  if (/copd|chronic obstructive/.test(text)) return "copd";
  if (/cirrh|liver disease/.test(text)) return "liver disease";
  if (/obes/.test(text)) return "obesity";
  if (/frail/.test(text)) return "frailty";
  if (/pregnan/.test(text)) return "pregnancy";
  if (/anticoag|warfarin|apixaban|rivaroxaban|heparin/.test(text)) return "anticoagulation";
  if (/immunosup|steroid|transplant|chemotherapy/.test(text)) return "immunosuppression";
  if (/anemi/.test(text)) return "anemia";
  if (/peripheral vascular|pvd|pad\b/.test(text)) return "peripheral vascular disease";
  return null;
}

export function comorbidityOverlay(facts: VerifiedFacts, text: string): OverlayAnswer[] {
  const named = [...(facts.comorbidities ?? []), ...(facts.medications ?? []), text];
  const keys = new Set<string>();
  for (const item of named) {
    const key = canon(item);
    if (key) keys.add(key);
  }
  return [...keys].map((key) => ({
    comorbidity: key,
    patientHasIt: "yes" as const,
    ...OVERLAYS[key]!,
  }));
}

export interface Radar {
  expectedCourse: string[];
  expectedComplications: string[];
  rareButDangerous: string[];
  earliestSignals: string[];
  monitoringPlan: string[];
  pulsesReassuring: false;
  inventedBiomarker: false;
}

export function deteriorationRadar(facts: VerifiedFacts, text: string): Radar | null {
  if (facts.admitted !== true && !/admitted|inpatient|\bip\b/i.test(text)) return null;
  if (isFractureRisk(text)) {
    return {
      expectedCourse: ["Pain and swelling follow the fracture. The course is observed, not predicted as a number."],
      expectedComplications: ["Rising compartment pressure", "Nerve irritation", "Bleeding into the compartment"],
      rareButDangerous: ["Established compartment syndrome", "Rhabdomyolysis with renal injury"],
      earliestSignals: [
        "serial pain assessment",
        "pain out of proportion where clinically applicable",
        "pain with passive stretch",
        "increasing compartment tension",
        "sensory changes",
        "motor changes",
        "serial neurovascular examination",
        "analgesic requirement trend",
      ],
      monitoringPlan: [
        "Repeat the limb exam on a schedule the doctor sets.",
        "A present pulse is recorded and is not treated as reassurance.",
        "Blood tests track muscle injury and the kidney. They do not clear early compartment syndrome.",
      ],
      pulsesReassuring: false,
      inventedBiomarker: false,
    };
  }
  return {
    expectedCourse: ["The expected course is unknown until the working clinical problem is recorded."],
    expectedComplications: ["unknown"],
    rareButDangerous: ["unknown"],
    earliestSignals: ["Use the signs already in the chart. No new biomarker is proposed."],
    monitoringPlan: ["A doctor sets the monitoring interval."],
    pulsesReassuring: false,
    inventedBiomarker: false,
  };
}
