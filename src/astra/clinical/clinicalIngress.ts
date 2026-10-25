import {
  CLINICAL_INGRESS_THRESHOLDS,
  RED_FLAG_RULE_OUTS,
  SYMPTOM_NORMALIZATION_TERMS,
  type ClinicalRiskLevel,
  type OrganSafetyLevel,
} from "./clinicalIngressConfig";

export interface ClinicalIngressPatient {
  name?: string;
  age?: number;
  gender?: string;
  sex?: string;
  uhid?: string;
  chiefComplaints?: string;
  chiefComplaint?: string;
  symptoms?: string[];
  diagnosis?: string;
  vitals?: {
    bp?: string;
    pulse?: number;
    heartRate?: number;
    temp?: number;
    tempF?: number;
    spo2?: number;
    respRate?: number;
    gcs?: number;
    urineOutputMlHr?: number;
  };
  labs?: Record<string, string | number | undefined>;
}

export interface NormalizedVitals {
  hr?: number;
  sbp?: number;
  dbp?: number;
  spo2?: number;
  rr?: number;
  tempF?: number;
  gcs?: number;
  urineOutputMlHr?: number;
}

export interface ClinicalIngressSummary {
  risk: ClinicalRiskLevel;
  statusBadge: "Emergency Mode" | "Clinical Review";
  firedRules: string[];
  emergencyReasons: string[];
  problemRepresentation: string;
  normalizedSymptoms: Array<{ original: string; normalized: string }>;
  redFlags: Array<{ name: string; status: "not yet assessed" | "ruled out" | "cannot rule out"; source: "rules" | "scientist" }>;
  directions: Array<{ label: string; percent: number }>;
  abnormalVitals: Array<{ label: string; value: string; trend: "up" | "down" | "flat"; severity: ClinicalRiskLevel }>;
  organSafety: Array<{ organ: "Kidney" | "Heart" | "Brain"; level: OrganSafetyLevel; detail: string }>;
  missingVitals: string[];
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return undefined;
}

export function parseBp(bp: unknown): { sbp?: number; dbp?: number } {
  if (typeof bp !== "string") return {};
  const match = bp.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  return match ? { sbp: Number(match[1]), dbp: Number(match[2]) } : {};
}

export function normalizeVitals(patient: ClinicalIngressPatient): NormalizedVitals {
  const raw = patient.vitals ?? {};
  const bp = parseBp(raw.bp);
  return {
    hr: numberFrom(raw.pulse ?? raw.heartRate),
    sbp: numberFrom(bp.sbp),
    dbp: numberFrom(bp.dbp),
    spo2: numberFrom(raw.spo2),
    rr: numberFrom(raw.respRate),
    tempF: numberFrom(raw.temp ?? raw.tempF),
    gcs: numberFrom(raw.gcs),
    urineOutputMlHr: numberFrom(raw.urineOutputMlHr),
  };
}

function complaintText(patient: ClinicalIngressPatient): string {
  return [patient.chiefComplaints, patient.chiefComplaint, patient.diagnosis, ...(patient.symptoms ?? [])].filter(Boolean).join(". ");
}

export function normalizeSymptoms(patient: ClinicalIngressPatient): Array<{ original: string; normalized: string }> {
  const originals = [patient.chiefComplaints, patient.chiefComplaint, ...(patient.symptoms ?? [])].filter((x): x is string => Boolean(x));
  const out: Array<{ original: string; normalized: string }> = [];
  for (const original of originals) {
    for (const term of SYMPTOM_NORMALIZATION_TERMS) {
      if (term.patterns.some((pattern) => pattern.test(original))) {
        out.push({ original, normalized: term.canonical });
      }
    }
  }
  return out;
}

function hasSepsisTriad(text: string, vitals: NormalizedVitals): boolean {
  const infection = /sepsis|infection|cellulitis|pneumonia|fever|chills|erythema/.test(text);
  const temp = typeof vitals.tempF === "number" && (vitals.tempF > 100.4 || vitals.tempF < 96.8);
  const tachy = (typeof vitals.hr === "number" && vitals.hr > 100) || (typeof vitals.rr === "number" && vitals.rr > 20);
  return infection && temp && tachy;
}

export function evaluateRiskRadar(patient: ClinicalIngressPatient): Pick<ClinicalIngressSummary, "risk" | "firedRules" | "emergencyReasons" | "statusBadge"> {
  const t = CLINICAL_INGRESS_THRESHOLDS;
  const vitals = normalizeVitals(patient);
  const text = complaintText(patient).toLowerCase();
  const firedRules: string[] = [];
  const emergencyReasons: string[] = [];

  if (typeof vitals.rr === "number" && vitals.rr > t.high.respiratoryRateGreaterThan) firedRules.push(`High: RR > ${t.high.respiratoryRateGreaterThan}`);
  if (typeof vitals.spo2 === "number" && vitals.spo2 < t.high.spo2LessThan) firedRules.push(`High: SpO2 < ${t.high.spo2LessThan}%`);
  if (typeof vitals.sbp === "number" && vitals.sbp < t.high.systolicBpLessThan) firedRules.push(`High: SBP < ${t.high.systolicBpLessThan} mmHg`);
  if (typeof vitals.urineOutputMlHr === "number" && vitals.urineOutputMlHr < t.high.urineOutputMlHrLessThan) firedRules.push(`High: urine output < ${t.high.urineOutputMlHrLessThan} ml/hr`);
  if (hasSepsisTriad(text, vitals)) firedRules.push("High: sepsis triad");
  if (/altered sensorium|confusion|drowsy|unresponsive/.test(text)) firedRules.push("High: altered sensorium");

  if (typeof vitals.sbp === "number" && vitals.sbp < t.emergencyPathway.systolicBpLessThan) {
    emergencyReasons.push(`SBP < ${t.emergencyPathway.systolicBpLessThan} mmHg`);
  }
  const platelets = numberFrom(patient.labs?.platelets ?? patient.labs?.Platelets);
  if (typeof platelets === "number" && platelets < t.emergencyPathway.plateletsLessThan) {
    emergencyReasons.push(`Platelets < ${t.emergencyPathway.plateletsLessThan}/uL`);
  }

  if (firedRules.length > 0) return { risk: "High", firedRules, emergencyReasons, statusBadge: emergencyReasons.length ? "Emergency Mode" : "Clinical Review" };

  const borderline: string[] = [];
  if (typeof vitals.rr === "number" && vitals.rr > t.borderline.respiratoryRateGreaterThan) borderline.push(`Borderline: RR > ${t.borderline.respiratoryRateGreaterThan}`);
  if (typeof vitals.spo2 === "number" && vitals.spo2 < t.borderline.spo2LessThan) borderline.push(`Borderline: SpO2 < ${t.borderline.spo2LessThan}%`);
  if (typeof vitals.sbp === "number" && vitals.sbp < t.borderline.systolicBpLessThan) borderline.push(`Borderline: SBP < ${t.borderline.systolicBpLessThan} mmHg`);
  if (typeof vitals.hr === "number" && vitals.hr > t.borderline.heartRateGreaterThan) borderline.push(`Borderline: HR > ${t.borderline.heartRateGreaterThan}`);
  if (typeof vitals.tempF === "number" && vitals.tempF > t.borderline.temperatureFGreaterThan) borderline.push(`Borderline: Temp > ${t.borderline.temperatureFGreaterThan} F`);

  return {
    risk: borderline.length ? "Borderline" : "Low",
    firedRules: borderline.length ? borderline : ["Low: no high or borderline rule fired"],
    emergencyReasons,
    statusBadge: emergencyReasons.length ? "Emergency Mode" : "Clinical Review",
  };
}

export function buildProblemRepresentation(patient: ClinicalIngressPatient): string {
  const age = patient.age ? `${patient.age}-year-old` : "Age not recorded";
  const sex = patient.sex ?? patient.gender ?? "sex not recorded";
  const complaint = patient.chiefComplaints ?? patient.chiefComplaint ?? patient.symptoms?.join(", ") ?? "presenting complaint not recorded";
  return `${age} ${sex.toLowerCase()} with ${complaint}`;
}

function abnormalVitals(v: NormalizedVitals): ClinicalIngressSummary["abnormalVitals"] {
  const rows: ClinicalIngressSummary["abnormalVitals"] = [];
  const add = (label: string, value: string, severity: ClinicalRiskLevel, trend: "up" | "down" | "flat" = "flat") => rows.push({ label, value, severity, trend });
  if (typeof v.rr === "number" && v.rr > 20) add("RR", `${v.rr}/min`, v.rr > 25 ? "High" : "Borderline", "up");
  if (typeof v.spo2 === "number" && v.spo2 < 94) add("SpO2", `${v.spo2}%`, v.spo2 < 92 ? "High" : "Borderline", "down");
  if (typeof v.sbp === "number" && v.sbp < 100) add("SBP", `${v.sbp} mmHg`, v.sbp < 90 ? "High" : "Borderline", "down");
  if (typeof v.hr === "number" && v.hr > 100) add("HR", `${v.hr}/min`, v.hr > 130 ? "High" : "Borderline", "up");
  if (typeof v.tempF === "number" && v.tempF > 100.4) add("Temp", `${v.tempF} F`, "Borderline", "up");
  return rows.slice(0, 3);
}

function buildDirections(patient: ClinicalIngressPatient): ClinicalIngressSummary["directions"] {
  const text = complaintText(patient).toLowerCase();
  if (/cellulitis|erythema|red swollen painful.*leg|fever|sepsis|pneumonia/.test(text)) {
    return [
      { label: "Infectious/Inflammatory", percent: 85 },
      { label: "Vascular/Thrombotic", percent: 10 },
      { label: "Traumatic/Other", percent: 5 },
    ];
  }
  if (/chest pain|retrosternal/.test(text)) {
    return [
      { label: "Cardiovascular", percent: 70 },
      { label: "Pulmonary/Vascular", percent: 20 },
      { label: "GI/Musculoskeletal", percent: 10 },
    ];
  }
  return [
    { label: "Needs more data", percent: 50 },
    { label: "Infectious/Inflammatory", percent: 30 },
    { label: "Metabolic/Other", percent: 20 },
  ];
}

function buildRedFlags(patient: ClinicalIngressPatient, scientistRedFlags: string[] = []): ClinicalIngressSummary["redFlags"] {
  const text = complaintText(patient);
  const names = new Map<string, "rules" | "scientist">();
  for (const rule of RED_FLAG_RULE_OUTS) {
    if (rule.complaint.test(text)) for (const flag of rule.flags) names.set(flag, "rules");
  }
  for (const flag of scientistRedFlags) names.set(flag, "scientist");
  return [...names.entries()].map(([name, source]) => ({ name, source, status: "not yet assessed" as const }));
}

function buildOrganSafety(patient: ClinicalIngressPatient, vitals: NormalizedVitals): ClinicalIngressSummary["organSafety"] {
  const t = CLINICAL_INGRESS_THRESHOLDS.organSafety;
  const creatinine = numberFrom(patient.labs?.creatinine ?? patient.labs?.Creatinine);
  const kidney: OrganSafetyLevel = typeof creatinine !== "number" ? "Safe" : creatinine > t.kidney.creatinineHighGreaterThan ? "High" : creatinine > t.kidney.creatinineBorderlineGreaterThan ? "Borderline" : "Safe";
  const heart: OrganSafetyLevel = typeof vitals.hr !== "number" ? "Safe" : vitals.hr > t.heart.heartRateHighGreaterThan ? "High" : vitals.hr > t.heart.heartRateBorderlineGreaterThan ? "Borderline" : "Safe";
  const brain: OrganSafetyLevel = typeof vitals.gcs !== "number" ? "Safe" : vitals.gcs < t.brain.gcsHighLessThan ? "High" : vitals.gcs < t.brain.gcsBorderlineLessThan ? "Borderline" : "Safe";
  return [
    { organ: "Kidney", level: kidney, detail: typeof creatinine === "number" ? `Cr ${creatinine}` : "Cr not recorded" },
    { organ: "Heart", level: heart, detail: typeof vitals.hr === "number" ? `HR ${vitals.hr}` : "HR not recorded" },
    { organ: "Brain", level: brain, detail: typeof vitals.gcs === "number" ? `GCS ${vitals.gcs}` : "GCS not recorded" },
  ];
}

export function buildClinicalIngressSummary(patient: ClinicalIngressPatient, scientistRedFlags: string[] = []): ClinicalIngressSummary {
  const vitals = normalizeVitals(patient);
  const risk = evaluateRiskRadar(patient);
  const missingVitals = [
    ["RR", vitals.rr],
    ["SpO2", vitals.spo2],
    ["SBP", vitals.sbp],
    ["HR", vitals.hr],
  ].filter(([, value]) => typeof value !== "number").map(([label]) => String(label));
  return {
    ...risk,
    problemRepresentation: buildProblemRepresentation(patient),
    normalizedSymptoms: normalizeSymptoms(patient),
    redFlags: buildRedFlags(patient, scientistRedFlags),
    directions: buildDirections(patient),
    abnormalVitals: abnormalVitals(vitals),
    organSafety: buildOrganSafety(patient, vitals),
    missingVitals,
  };
}
