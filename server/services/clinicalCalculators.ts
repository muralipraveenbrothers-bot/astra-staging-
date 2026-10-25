/**
 * ASTRA AI — CLINICAL CALCULATORS (Deterministic, validated, source-cited)
 * Evidence-based formulas with range checking and severity grading.
 */
export interface CalcResult { id: string; name: string; value: string | number; unit?: string; interpretation: string; severity?: "normal" | "mild" | "moderate" | "severe" | "critical"; formula?: string; source: string; }

function num(v: unknown, name: string, min: number, max: number): number {
  const n = Number(v); if (!isFinite(n)) throw new Error(`${name} must be a number`); if (n < min || n > max) throw new Error(`${name} out of range [${min},${max}], got ${n}`); return n;
}

export function bmi(weightKg: unknown, heightCm: unknown): CalcResult {
  const w = num(weightKg, "weightKg", 1, 500); const h = num(heightCm, "heightCm", 30, 300) / 100;
  const r = Math.round(w / (h * h) * 10) / 10;
  let s: CalcResult["severity"] = "normal", i = "Normal";
  if (r < 18.5) { s = "mild"; i = "Underweight"; } else if (r >= 25 && r < 30) { s = "mild"; i = "Overweight"; } else if (r >= 30 && r < 35) { s = "moderate"; i = "Obese I"; } else if (r >= 35 && r < 40) { s = "severe"; i = "Obese II"; } else if (r >= 40) { s = "critical"; i = "Obese III"; }
  return { id: "bmi", name: "BMI", value: r, unit: "kg/m²", interpretation: i, severity: s, formula: "kg/m²", source: "WHO" };
}

export function bsa(weightKg: unknown, heightCm: unknown): CalcResult {
  const w = num(weightKg, "weightKg", 1, 500); const h = num(heightCm, "heightCm", 30, 300);
  return { id: "bsa", name: "BSA (Mosteller)", value: Math.round(Math.sqrt((w * h) / 3600) * 100) / 100, unit: "m²", interpretation: "Body surface area", formula: "√(kg×cm/3600)", source: "Mosteller 1987" };
}

export function curb65(confusion: boolean, bunMm: unknown, respRate: unknown, sbp: unknown, dbp: unknown, age: unknown): CalcResult {
  let s = 0; if (confusion) s++; if (num(bunMm, "bun", 1, 100) > 7) s++; if (num(respRate, "rr", 5, 60) >= 30) s++; if (num(sbp, "sbp", 40, 300) < 90 || num(dbp, "dbp", 20, 200) <= 60) s++; if (num(age, "age", 0, 130) >= 65) s++;
  const i = s <= 1 ? "Low risk — home treatment" : s === 2 ? "Moderate — short inpatient" : s === 3 ? "Severe — hospital admission" : "Critical — urgent ICU";
  return { id: "curb65", name: "CURB-65", value: s, interpretation: i, severity: s <= 1 ? "normal" : s === 2 ? "moderate" : s === 3 ? "severe" : "critical", formula: "Confusion+BUN7+RR30+BP60+Age65", source: "Lim 2003" };
}

export function gcs(eye: unknown, verbal: unknown, motor: unknown): CalcResult {
  const s = num(eye, "eye", 1, 4) + num(verbal, "verbal", 1, 5) + num(motor, "motor", 1, 6);
  const i = s === 15 ? "Fully alert" : s >= 13 ? "Mild injury" : s >= 9 ? "Moderate injury" : "Severe (coma ≤8)";
  return { id: "gcs", name: "GCS", value: s, interpretation: i, severity: s === 15 ? "normal" : s >= 13 ? "mild" : s >= 9 ? "moderate" : "severe", formula: "E+V+M", source: "Teasdale 1974" };
}

export function egfr(cr: unknown, age: unknown, sex: "male" | "female"): CalcResult {
  const c = num(cr, "cr", 0.1, 30); const a = num(age, "age", 1, 120); const k = sex === "female" ? 0.7 : 0.9;
  let g = 142 * Math.pow(Math.min(c / k, 1), sex === "female" ? -0.241 : -0.302) * Math.pow(Math.max(c / k, 1), -1.2) * Math.pow(0.9938, a);
  if (sex === "female") g *= 1.012; g = Math.round(g * 10) / 10;
  const i = g >= 90 ? "G1 Normal" : g >= 60 ? "G2 Mild" : g >= 45 ? "G3a Mild-Mod" : g >= 30 ? "G3b Mod-Severe" : g >= 15 ? "G4 Severe" : "G5 Kidney failure";
  return { id: "egfr", name: "eGFR", value: g, unit: "mL/min/1.73m²", interpretation: i, severity: g >= 60 ? "normal" : g >= 30 ? "moderate" : g >= 15 ? "severe" : "critical", formula: "CKD-EPI 2021", source: "Inker 2021" };
}

export function anionGap(na: unknown, cl: unknown, hco3: unknown): CalcResult {
  const ag = Math.round((num(na, "na", 80, 200) - (num(cl, "cl", 40, 160) + num(hco3, "hco3", 2, 50))) * 10) / 10;
  const i = ag >= 4 && ag <= 12 ? "Normal" : ag > 12 ? "High — metabolic acidosis" : "Low — check albumin";
  return { id: "anionGap", name: "Anion Gap", value: ag, unit: "mEq/L", interpretation: i, severity: ag >= 4 && ag <= 12 ? "normal" : "moderate", formula: "Na-(Cl+HCO3)", source: "Kraut 2010" };
}

export function qsofa(rr: unknown, sbp: unknown, gcsVal: unknown): CalcResult {
  let s = 0; if (num(rr, "rr", 5, 60) >= 22) s++; if (num(sbp, "sbp", 40, 300) <= 100) s++; if (num(gcsVal, "gcs", 3, 15) < 15) s++;
  return { id: "qsofa", name: "qSOFA", value: s, interpretation: s < 2 ? "Low risk" : "HIGH — sepsis likely", severity: s < 2 ? "normal" : "severe", formula: "RR22+SBP100+GCS15", source: "Singer 2016" };
}
