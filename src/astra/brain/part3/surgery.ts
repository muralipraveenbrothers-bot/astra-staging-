/**
 * Surgical support. Operative technique is shown only from an approved skill.
 * Prophylaxis is not treatment of an established infection.
 */

export interface ProphylaxisPlan {
  kind: "SURGICAL ANTIBIOTIC PROPHYLAXIS";
  procedure: string;
  likelyOrganisms: string;
  recommendedLocalProtocol: string;
  allergy: string;
  weight: string;
  renalFactors: string;
  timing: string;
  redosingRequirement: string;
  duration: string;
  prolongedBecauseProcedureHappened: false;
}

export interface InfectionTreatmentBoundary {
  kind: "TREATMENT OF ESTABLISHED INFECTION";
  separateFromProphylaxis: true;
  note: string;
}

const UNKNOWN_PROTOCOL = "unknown — no validated hospital or guideline policy was supplied";

export function prophylaxisPlan(input: {
  procedure?: string;
  allergy?: string;
  weight?: string;
  renal?: string;
  protocol?: string;
}): ProphylaxisPlan {
  return {
    kind: "SURGICAL ANTIBIOTIC PROPHYLAXIS",
    procedure: input.procedure?.trim() || "unknown",
    likelyOrganisms: UNKNOWN_PROTOCOL,
    recommendedLocalProtocol: input.protocol?.trim() || UNKNOWN_PROTOCOL,
    allergy: input.allergy?.trim() || "unknown",
    weight: input.weight?.trim() || "unknown",
    renalFactors: input.renal?.trim() || "unknown",
    timing: input.protocol?.trim() ? "Follow the supplied protocol." : UNKNOWN_PROTOCOL,
    redosingRequirement: input.protocol?.trim() ? "Follow the supplied protocol." : UNKNOWN_PROTOCOL,
    duration: "Stop when the protocol's prophylactic window ends. A completed procedure is not a reason to continue.",
    prolongedBecauseProcedureHappened: false,
  };
}

export function infectionBoundary(text: string): InfectionTreatmentBoundary | null {
  if (!/established infection|pus|abscess|sepsis|wound infection|cellulitis/i.test(text)) return null;
  return {
    kind: "TREATMENT OF ESTABLISHED INFECTION",
    separateFromProphylaxis: true,
    note: "Established infection is treated on its own plan. It is not surgical prophylaxis.",
  };
}

export interface ApprovedSkill {
  id: string;
  procedureMatch: RegExp;
  intraoperative: string[];
  criticalPoints: Array<{ title: string; why: string; whatCanGoWrong: string; detect: string; response: string }>;
}

/** Safety checklists that were specified. Not an operative atlas. */
export const APPROVED_SURGICAL_SKILLS: ApprovedSkill[] = [
  {
    id: "compartment-watch-v1",
    procedureMatch: /compartment/i,
    intraoperative: [
      "This skill is a limb watch, not an operative technique.",
      "Record pulses and do not treat a present pulse as clearance.",
    ],
    criticalPoints: [
      { title: "Present pulse", why: "Arterial pulse can persist after capillary flow fails.", whatCanGoWrong: "Ischemia is missed because the pulse is palpable.", detect: "Pain, passive stretch, tension, sensation, and power.", response: "Repeat the exam. The surgeon decides on pressure measurement." },
      { title: "Blood tests", why: "CK and creatinine describe later muscle and kidney injury.", whatCanGoWrong: "A normal or pending blood test is used to exclude early compartment syndrome.", detect: "The result is read as systemic effect only.", response: "Do not clear the limb from the blood test." },
      { title: "Unreliable exam", why: "A compartment can be hard to feel.", whatCanGoWrong: "Equivocal findings are treated as reassuring.", detect: "Obesity, neuropathy, or an unclear exam.", response: "Ask the clinician to consider compartment pressure under the local orthopedic protocol." },
      { title: "Prophylaxis window", why: "Prophylaxis and infection treatment are different plans.", whatCanGoWrong: "Antibiotics continue only because an operation occurred.", detect: "Doses continue after the protocol window without an infection diagnosis.", response: "A doctor stops or converts the plan. Astra does not." },
    ],
  },
];

export interface Roadmap {
  preoperative: Record<string, string>;
  intraoperative: { skillId: string | null; lines: string[]; inventedTechnique: false };
  postoperative: Record<string, string>;
  criticalPoints: ApprovedSkill["criticalPoints"];
  ssi: string[];
  anesthesia: AnesthesiaSupport;
}

const SSI = [
  "correct prophylactic antibiotic timing when indicated",
  "appropriate redosing",
  "avoid unnecessary postoperative prophylaxis",
  "avoid razor shaving",
  "clip only when hair removal is necessary",
  "appropriate skin preparation",
  "glycemic management according to protocol",
  "perioperative normothermia",
  "proper sterile technique",
  "wound care",
  "appropriate drain and catheter management",
];

export interface AnesthesiaSupport {
  categories: Array<{ name: "local" | "regional" | "spinal/neuraxial" | "general" | "combined"; why: string }>;
  selectedPlan: null;
  owner: "responsible anesthetist";
}

export function anesthesiaSupport(text: string): AnesthesiaSupport {
  const categories: AnesthesiaSupport["categories"] = [
    { name: "local", why: "May be considered for a short superficial field when cooperation and the site allow it." },
    { name: "regional", why: "May be considered when the site can be covered by a nerve block and coagulation status is known." },
    { name: "spinal/neuraxial", why: "May be considered for suitable lower-body procedures after anticoagulation and hemodynamics are reviewed." },
    { name: "general", why: "May be considered when the airway, duration, or procedure makes wakeful anesthesia unsuitable." },
    { name: "combined", why: "May be considered when one technique does not cover the site and the duration." },
  ];
  return {
    categories: categories.filter(() => text.trim().length > 0),
    selectedPlan: null,
    owner: "responsible anesthetist",
  };
}

function known(value: string | undefined): string {
  return value?.trim() || "unknown";
}

export function surgicalRoadmap(input: { procedure?: string; allergy?: string; weight?: string; renal?: string; protocol?: string; comorbidity?: string }): Roadmap {
  const procedure = input.procedure?.trim() || "";
  const skill = APPROVED_SURGICAL_SKILLS.find((item) => procedure && item.procedureMatch.test(procedure)) ?? null;
  const prophylaxis = prophylaxisPlan(input);
  return {
    preoperative: {
      indication: "unknown",
      alternativeManagement: "unknown",
      reasonProcedureIsRequired: "unknown",
      urgency: "unknown",
      patientOptimization: "unknown",
      comorbidities: known(input.comorbidity),
      medications: "unknown",
      anticoagulants: "unknown",
      allergies: known(input.allergy),
      renalHepaticStatus: known(input.renal),
      relevantTests: "unknown",
      imaging: "unknown",
      bloodRequirement: "unknown",
      implantRequirement: "unknown",
      equipmentRequirement: "unknown",
      antibioticProphylaxisPlan: `${prophylaxis.duration} Protocol: ${prophylaxis.recommendedLocalProtocol}.`,
      anesthesiaAssessment: "The responsible anesthetist owns the plan.",
      consent: "unknown",
      siteSideVerification: "unknown",
    },
    intraoperative: skill
      ? { skillId: skill.id, lines: skill.intraoperative, inventedTechnique: false }
      : { skillId: null, lines: ["No approved procedure skill is loaded. Operative steps are not shown."], inventedTechnique: false },
    postoperative: {
      monitoring: "A doctor sets the interval.",
      painControl: "Record the analgesic trend. Astra does not prescribe.",
      fluids: "unknown",
      neurovascularObservations: procedure.match(/limb|fracture|compartment|tibia|leg/i) ? "Serial neurovascular examination where the limb is at risk." : "unknown",
      wound: "Follow the SSI wound-care item.",
      drains: "unknown",
      antibioticsIfIndicated: prophylaxis.duration,
      vte: "unknown until a local protocol is supplied",
      mobilization: "unknown",
      physiotherapy: "unknown",
      nutrition: "unknown",
      laboratoryMonitoring: "Use tests that already exist before adding one.",
      imaging: "Repeat imaging only when the result would change management.",
      complicationSurveillance: "Watch the approved critical points.",
      dischargeCriteria: "Clinical readiness is separate from billing and transport.",
      followUp: "unknown",
    },
    criticalPoints: skill?.criticalPoints ?? [],
    ssi: SSI,
    anesthesia: anesthesiaSupport(procedure || "procedure"),
  };
}
