import type { ClinicalCompleteness } from "./types";

const FAMILY_FIELDS: Record<string, string[]> = {
  chest_pain: ["onset", "duration", "severity", "radiation", "ecg", "troponin", "vitals"],
  fever: ["duration", "temperature", "source symptoms", "travel or exposure", "cbc", "vitals"],
  abdominal_pain: ["onset", "site", "migration", "vomiting", "pregnancy status", "focused abdomen exam", "urine or glucose"],
  breathlessness: ["onset", "spo2", "respiratory rate", "chest exam", "ecg", "xray"],
  generic: ["chief complaint", "duration", "vitals", "allergies", "active medications"],
};

function familyFor(text: string): string {
  if (/chest pain|retrosternal|angina/i.test(text)) return "chest_pain";
  if (/fever|chills|pyrexia/i.test(text)) return "fever";
  if (/abdominal pain|abdomen|vomiting|right upper quadrant|epigastric/i.test(text)) return "abdominal_pain";
  if (/breathless|shortness of breath|dyspnea|spo2|cough/i.test(text)) return "breathlessness";
  return "generic";
}

function hasField(text: string, field: string): boolean {
  const re: Record<string, RegExp> = {
    onset: /onset|started|sudden|gradual|since/i,
    duration: /duration|for \d+|days?|hours?|weeks?|months?/i,
    severity: /severity|mild|moderate|severe|\/10/i,
    radiation: /radiat|left arm|jaw|back/i,
    ecg: /\becg\b|ekg/i,
    troponin: /troponin/i,
    vitals: /bp|hr|pulse|spo2|rr|temp|vitals/i,
    temperature: /temp|fever|101|102|103|38\./i,
    "source symptoms": /cough|urinary|abdomen|rash|wound|diarrhea/i,
    "travel or exposure": /travel|exposure|contact|mosquito|water/i,
    cbc: /\bcbc\b|wbc|platelet|hb/i,
    site: /site|right|left|epigastric|umbilical|quadrant/i,
    migration: /migrat|radiat/i,
    vomiting: /vomit|nausea/i,
    "pregnancy status": /pregnan|hcg|lmp/i,
    "focused abdomen exam": /guarding|rebound|tender|abdomen soft/i,
    "urine or glucose": /urine|glucose|sugar|ketone/i,
    spo2: /spo2|saturation/i,
    "respiratory rate": /\brr\b|respiratory rate/i,
    "chest exam": /crepitation|wheeze|air entry|chest/i,
    xray: /x-?ray|cxr/i,
    "chief complaint": /complaint/i,
    allergies: /allerg/i,
    "active medications": /medication|active_medications|active meds/i,
  };
  return (re[field] ?? new RegExp(field, "i")).test(text);
}

export function evaluateCompleteness(stateText: string): ClinicalCompleteness {
  const family = familyFor(stateText);
  const required = FAMILY_FIELDS[family] ?? FAMILY_FIELDS.generic;
  const missing = required.filter((field) => !hasField(stateText, field));
  return { family, missing, score: Math.round(((required.length - missing.length) / required.length) * 100) };
}
