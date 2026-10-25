/**
 * Focused clinical specialists. Laya selects a subset. The full roster is not started.
 */

export const SPECIALISTS = [
  "symptom_mapper",
  "sign_interpreter",
  "age_context",
  "red_flag",
  "anatomical_localizer",
  "pathophysiology",
  "differential",
  "rule_in_out",
  "missing_information",
  "investigation_interpreter",
  "investigation_optimizer",
  "trend",
  "comorbidity",
  "drug_safety",
  "pk_pd",
  "medical_management",
  "surgical_management",
  "perioperative",
  "complication_forecast",
  "critical_care",
  "rehabilitation",
  "evidence_scientist",
  "resource",
  "value_cost",
  "documentation",
] as const;

export type SpecialistId = (typeof SPECIALISTS)[number];

export type Compatibility =
  | "highly compatible"
  | "compatible"
  | "possible"
  | "less compatible"
  | "cannot safely exclude";

export interface QualitativeGroup {
  group: string;
  compatibility: Compatibility;
  note: string;
}

export interface SpecialistReport {
  id: SpecialistId;
  status: "active" | "queued";
  findings: string[];
  questions: string[];
}

export interface DelegationPlan {
  active: SpecialistId[];
  queued: SpecialistId[];
  reports: SpecialistReport[];
  differential: QualitativeGroup[];
  examination: string[];
  imaging: { action: "no-routine-order" | "doctor-review-before-imaging"; reason: string };
  diagnosis: null;
  percentages: null;
}

const HISTORY_QUESTIONS = [
  "duration",
  "sudden or gradual onset",
  "back-dominant or leg-dominant pain",
  "dermatomal radiation",
  "pain below the knee",
  "numbness",
  "paresthesia",
  "weakness",
  "walking-induced symptoms",
  "cough or strain effect",
  "night pain",
  "fever",
  "weight loss",
  "history of malignancy",
  "trauma",
  "osteoporosis",
  "steroid use",
  "bladder disturbance",
  "bowel disturbance",
  "saddle sensory change",
  "progressive neurological deficit",
  "hip or groin symptoms",
];

const EXAMINATION = [
  "gait",
  "lumbar movement",
  "straight-leg raise when appropriate",
  "motor examination",
  "sensory examination",
  "reflexes",
  "hip examination",
  "vascular examination when indicated",
];

const BACK_GROUPS: Array<{ group: string; dangerous?: boolean }> = [
  { group: "lumbar radiculopathy" },
  { group: "degenerative foraminal disease" },
  { group: "lumbar spinal stenosis" },
  { group: "disc disease" },
  { group: "spondylolisthesis" },
  { group: "hip pathology" },
  { group: "sacroiliac pathology" },
  { group: "peripheral neuropathy" },
  { group: "vertebral fracture", dangerous: true },
  { group: "infection", dangerous: true },
  { group: "malignancy", dangerous: true },
  { group: "cauda equina / severe neural compression", dangerous: true },
];

const ANSWERED: Record<string, RegExp> = {
  "pain below the knee": /below the knee/i,
  numbness: /numbness|numb\b/i,
  paresthesia: /paresthes/i,
  weakness: /weakness/i,
  fever: /fever/i,
  "weight loss": /weight loss/i,
  trauma: /trauma|fall|accident/i,
  "bladder disturbance": /bladder|incontinence|retention/i,
  "saddle sensory change": /saddle/i,
};

function unanswered(text: string, questions: string[]): string[] {
  return questions.filter((question) => {
    const rule = ANSWERED[question];
    if (rule) return !rule.test(text);
    return !text.toLowerCase().includes(question.toLowerCase());
  });
}

export function redFlagsInText(text: string): string[] {
  const rules: Array<[RegExp, string]> = [
    [/bladder|incontinence|retention/i, "bladder disturbance"],
    [/bowel disturbance|fecal incontinence/i, "bowel disturbance"],
    [/saddle/i, "saddle sensory change"],
    [/fever/i, "fever"],
    [/weight loss/i, "weight loss"],
    [/malignan|cancer/i, "history of malignancy"],
    [/trauma|fall|accident/i, "trauma"],
    [/osteopor/i, "osteoporosis"],
    [/steroid/i, "steroid use"],
    [/night pain/i, "night pain"],
    [/progressive weakness|foot drop/i, "progressive neurological deficit"],
  ];
  return rules.filter(([re]) => re.test(text)).map(([, label]) => label);
}

function supportiveCount(text: string): number {
  const features = [/below the knee/i, /dermatom/i, /cough|strain/i, /numb/i, /paresthes/i, /weakness/i, /slr|straight-leg/i];
  return features.filter((re) => re.test(text)).length;
}

export function qualitativeDifferential(text: string): QualitativeGroup[] {
  const flags = redFlagsInText(text);
  const support = supportiveCount(text);
  const exam = /reflex|straight-leg|slr|power\s*[0-5]/i.test(text);
  return BACK_GROUPS.map((item) => {
    if (item.dangerous) {
      const named = flags.some((flag) => item.group.toLowerCase().includes(flag.split(" ")[0] ?? ""));
      return {
        group: item.group,
        compatibility: named ? "possible" : "cannot safely exclude",
        note: "Dangerous categories stay open until the history and examination address them.",
      };
    }
    let compatibility: Compatibility = "possible";
    if (item.group === "lumbar radiculopathy") {
      if (support >= 4 && exam) compatibility = "highly compatible";
      else if (support >= 2) compatibility = "compatible";
    }
    return {
      group: item.group,
      compatibility,
      note: "Qualitative fit only. No probability is assigned.",
    };
  });
}

export function selectSpecialists(text: string): { active: SpecialistId[]; queued: SpecialistId[] } {
  const said = text ?? "";
  if (/\b(back pain|lower back|radiat\w+|sciatica)\b/i.test(said)) {
    return {
      active: ["symptom_mapper", "red_flag", "anatomical_localizer", "age_context", "differential"],
      queued: ["sign_interpreter", "investigation_optimizer", "missing_information"],
    };
  }
  const active: SpecialistId[] = [];
  const queued: SpecialistId[] = [];
  if (/\b(pain|fever|cough|breath|weakness|vomit|swelling)\b/i.test(said)) {
    active.push("symptom_mapper", "red_flag", "missing_information");
  }
  if (/\b(drug|dose|medication|mg)\b/i.test(said)) active.push("drug_safety", "pk_pd");
  if (/\b(surgery|operative|theatre|\bot\b)\b/i.test(said)) active.push("surgical_management", "perioperative");
  if (/\b(icu|ventilat|shock|sepsis)\b/i.test(said)) active.push("critical_care");
  if (/\b(pubmed|guideline|evidence|literature)\b/i.test(said)) active.push("evidence_scientist");
  if (/\b(cost|length of stay|\blos\b)\b/i.test(said)) queued.push("value_cost", "resource");
  if (/\brehab/i.test(said)) queued.push("rehabilitation");
  return {
    active: active.length ? active : [],
    queued,
  };
}

export function buildDelegation(text: string): DelegationPlan | null {
  const selected = selectSpecialists(text);
  if (selected.active.length === 0) return null;
  const flags = redFlagsInText(text);
  const radicular = selected.active.includes("anatomical_localizer");
  const age = text.match(/(\d{1,3})\s*-?\s*year/i);
  const reports: SpecialistReport[] = [];

  if (selected.active.includes("symptom_mapper") || selected.queued.includes("symptom_mapper")) {
    reports.push({
      id: "symptom_mapper",
      status: selected.active.includes("symptom_mapper") ? "active" : "queued",
      findings: radicular ? ["Lower back pain with radiation into a lower limb. The pattern is radicular until examination says otherwise."] : ["Symptoms recorded without a diagnosis."],
      questions: radicular ? unanswered(text, HISTORY_QUESTIONS) : ["onset", "severity", "associated symptoms"],
    });
  }
  if (selected.active.includes("red_flag")) {
    reports.push({
      id: "red_flag",
      status: "active",
      findings: flags.length ? flags.map((flag) => `Stated in the text: ${flag}`) : ["No red flag is stated in this text. That does not exclude one."],
      questions: unanswered(text, ["fever", "weight loss", "history of malignancy", "trauma", "bladder disturbance", "saddle sensory change"]),
    });
  }
  if (selected.active.includes("anatomical_localizer")) {
    reports.push({
      id: "anatomical_localizer",
      status: "active",
      findings: ["Region: lumbar spine and the symptomatic lower limb. A root level is not assigned from this text."],
      questions: [],
    });
  }
  if (selected.active.includes("age_context")) {
    reports.push({
      id: "age_context",
      status: "active",
      findings: [age ? `Age stated: ${age[1]} years.` : "Age was not stated.", /woman|female/i.test(text) ? "Sex stated: female." : "Sex was not stated."],
      questions: age ? [] : ["age"],
    });
  }
  const differential = radicular ? qualitativeDifferential(text) : [];
  if (selected.active.includes("differential")) {
    reports.push({
      id: "differential",
      status: "active",
      findings: differential.map((item) => `${item.group}: ${item.compatibility}`),
      questions: ["Information still required before any group can be called highly compatible."],
    });
  }
  const imaging = !radicular
    ? {
        action: "no-routine-order" as const,
        reason: "This request does not create an imaging order.",
      }
    : flags.length
      ? {
          action: "doctor-review-before-imaging" as const,
          reason: "Red-flag language is present. Imaging still waits for the doctor, the deficit, and whether the result would change management.",
        }
      : {
          action: "no-routine-order" as const,
          reason: "Routine imaging is not ordered because back pain is present. It depends on red flags, neurological deficit, trauma or osteoporosis risk, suspected infection or cancer, and whether the result would change management.",
        };
  if (radicular) {
    reports.push({
      id: "investigation_optimizer",
      status: "queued",
      findings: [imaging.reason],
      questions: [],
    });
  }

  return {
    active: selected.active,
    queued: selected.queued,
    reports,
    differential,
    examination: radicular ? EXAMINATION : [],
    imaging,
    diagnosis: null,
    percentages: null,
  };
}
