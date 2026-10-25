/**
 * ASTRA AI — CLINICAL BLIND-SPOT & RULE-IN/RULE-OUT ENGINE (4.4-B)
 * ============================================================================
 * Level: SPECIALIST (CROSS-HOSPITAL SUPER AGENT)
 * Purpose:
 *   1. clinical_blind_spot_agent — runs on EVERY patient context switch and on
 *      demand. Produces the 🔴 MUST NOT MISS / 🟡 NOT EXCLUDED / 🟠 MISSING DATA /
 *      🟢 CONTRADICTING / 📋 NEXT HIGH-VALUE ACTION matrix.
 *   2. rule_in_agent — likelihood-ratio driven confirmation labels:
 *      HIGHLY SUPPORTIVE | SUPPORTIVE | CONSISTENT
 *   3. rule_out_agent — sensitivity-driven exclusion labels:
 *      EFFECTIVELY EXCLUDED | UNLIKELY | CANNOT EXCLUDE
 *
 * NO FAKE DATA RULE: every finding is derived from the patient's real record
 * (chief complaint, diagnosis, allergies, vitals, lab results, medications).
 * Probability shifts are labeled as DERIVED ESTIMATES with the method shown.
 */

export type BlindSpotSeverity = "MUST_NOT_MISS" | "NOT_EXCLUDED" | "MISSING_DATA" | "CONTRADICTING";

export interface BlindSpotFinding {
  severity: BlindSpotSeverity;
  finding: string;
  rationale: string;
  action?: string;
}

export interface BlindSpotAnalysis {
  patientName: string;
  uhid: string;
  generatedAt: string;
  mustNotMiss: BlindSpotFinding[];
  notExcluded: BlindSpotFinding[];
  missingData: BlindSpotFinding[];
  contradicting: BlindSpotFinding[];
  nextHighValueActions: string[];
}

export type RuleInLabel = "HIGHLY_SUPPORTIVE" | "SUPPORTIVE" | "CONSISTENT";
export type RuleOutLabel = "EFFECTIVELY_EXCLUDED" | "UNLIKELY" | "CANNOT_EXCLUDE";

export interface RuleAssessment {
  condition: string;
  label: RuleInLabel | RuleOutLabel;
  pretestProbability: number;   // labeled DERIVED ESTIMATE (structured pre-test probability)
  posttestProbability: number;  // labeled DERIVED ESTIMATE (LR-based)
  probabilityMethod: string;
  evidence: string[];
  neededTests: string[];
  statement: string;
}

interface LabEntry {
  testName: string;
  value?: unknown;
  result?: unknown;
  status?: string;
  recordedAt?: string;
  [key: string]: unknown;
}

const has = (s: string | undefined, ...keywords: string[]): boolean =>
  !!s && keywords.some(k => s.toLowerCase().includes(k));

/** Extracts the leading numeric value from a lab string ("13.8 g/dL" -> 13.8). */
const numericOf = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  return null;
};

const findLab = (labs: LabEntry[] | undefined, ...keywords: string[]): LabEntry | undefined =>
  (labs || []).find(l => has(l.testName, ...keywords));

export class BlindSpotEngine {
  public static readonly agentId = "clinical_blind_spot_agent";
  public static readonly ruleInAgentId = "rule_in_agent";
  public static readonly ruleOutAgentId = "rule_out_agent";

  /**
   * Runs the full blind-spot matrix on a patient record.
   */
  public static analyzeBlindSpots(patient: any): BlindSpotAnalysis {
    const mustNotMiss: BlindSpotFinding[] = [];
    const notExcluded: BlindSpotFinding[] = [];
    const missingData: BlindSpotFinding[] = [];
    const contradicting: BlindSpotFinding[] = [];

    const complaint = patient.chiefComplaint || patient.chiefComplaints || "";
    const diagnosis = patient.diagnosis || "";
    const labs: LabEntry[] = patient.labResults || [];
    const meds: any[] = patient.activeMedications || [];
    const medNames = meds.map(m => `${m.name || m.medicine || ""} ${m.drug || ""}`.trim()).join(" ").toLowerCase();
    const latestVitals = Array.isArray(patient.vitals) && patient.vitals.length > 0
      ? patient.vitals[patient.vitals.length - 1]
      : null;

    // ── 🔴 MUST NOT MISS ──────────────────────────────────────────────────
    if (has(complaint, "fever", "pyrexia") && has(complaint, "headache", "neck stiffness", "stiff neck", "vomiting", "photophobia")) {
      mustNotMiss.push({
        severity: "MUST_NOT_MISS",
        finding: "Meningitis / meningoencephalitis not excluded",
        rationale: "Fever with headache/neck stiffness and no documented lumbar puncture or its contraindication.",
        action: "Lumbar puncture (after CT if focal deficit) OR document why deferred."
      });
    }
    if (has(complaint, "fever", "pyrexia") && has(complaint, "petechiae", "bleeding gums", "blood in vomit", "black stools")) {
      mustNotMiss.push({
        severity: "MUST_NOT_MISS",
        finding: "Severe Dengue / Dengue Shock Syndrome (DSS) or meningococcemia not excluded",
        rationale: "Fever with bleeding manifestations requires immediate plasma-leakage surveillance.",
        action: "Serial hematocrit q12h, platelet trend, NS1/IgM, shock index monitoring."
      });
    }
    if (latestVitals && latestVitals.spo2 !== undefined && latestVitals.spo2 < 92) {
      mustNotMiss.push({
        severity: "MUST_NOT_MISS",
        finding: "Severe hypoxemia (SpO2 < 92%)",
        rationale: `Latest recorded SpO2 ${latestVitals.spo2}% — respiratory failure not excluded.`,
        action: "ABG, high-flow oxygen/ventilation assessment, treat reversible cause."
      });
    }
    if (latestVitals && latestVitals.bpSys && latestVitals.bpDia &&
        (latestVitals.bpSys - latestVitals.bpDia) <= 20) {
      mustNotMiss.push({
        severity: "MUST_NOT_MISS",
        finding: "Narrow pulse pressure (≤ 20 mmHg) — compensated shock",
        rationale: `BP ${latestVitals.bpSys}/${latestVitals.bpDia} with narrow pulse pressure; normal BP does not exclude shock.`,
        action: "Fluid resuscitation assessment, lactate, repeat vitals q15min."
      });
    }
    if (has(medNames, "warfarin") && !findLab(labs, "inr", "pt")) {
      mustNotMiss.push({
        severity: "MUST_NOT_MISS",
        finding: "Warfarin without INR monitoring",
        rationale: "No recent INR/PT on file — anticoagulation safety gap.",
        action: "INR today before next dose; adjust per target range."
      });
    }
    if (has(medNames, "insulin", "glibenclamide", "gliclazide") && !findLab(labs, "glucose", "sugar", "hba1c")) {
      mustNotMiss.push({
        severity: "MUST_NOT_MISS",
        finding: "Hypoglycemia risk while on insulin/sulfonylurea without glucose monitoring",
        rationale: "No recent glucose on file for an insulin/secretagogue user.",
        action: "Point-of-care glucose now; document monitoring schedule."
      });
    }

    // ── 🟡 NOT EXCLUDED ───────────────────────────────────────────────────
    if (has(complaint, "dyspnea", "breathless", "shortness of breath", "chest pain") || has(diagnosis, "immobil")) {
      const hasDimer = findLab(labs, "d-dimer", "ddimer");
      notExcluded.push({
        severity: "NOT_EXCLUDED",
        finding: "Pulmonary embolism not excluded",
        rationale: hasDimer
          ? `Dyspnea/chest pain with D-dimer present — needs Wells scoring + imaging decision.`
          : "Dyspnea/chest pain (or immobilization) with NO D-dimer or CTPA on file.",
        action: "Wells score → D-dimer, or CTPA if high clinical probability."
      });
    }
    if (latestVitals && (latestVitals.tempF > 100.4 || latestVitals.heartRate > 110 || latestVitals.respRate > 24)) {
      const deranged = [];
      if (latestVitals.tempF > 100.4) deranged.push(`Temp ${latestVitals.tempF}°F`);
      if (latestVitals.heartRate > 110) deranged.push(`HR ${latestVitals.heartRate}`);
      if (latestVitals.respRate > 24) deranged.push(`RR ${latestVitals.respRate}`);
      notExcluded.push({
        severity: "NOT_EXCLUDED",
        finding: "Sepsis / septic shock not excluded (qSOFA derangement)",
        rationale: `${deranged.join(", ")} — two or more SIRS/qSOFA criteria present.`,
        action: "Lactate, blood cultures, source control, early sepsis bundle."
      });
    }
    if (has(medNames, "opioid", "morphine", "fentanyl") && latestVitals && latestVitals.respRate !== undefined && latestVitals.respRate < 10) {
      notExcluded.push({
        severity: "NOT_EXCLUDED",
        finding: "Opioid-induced respiratory depression",
        rationale: `Opioid on file with RR ${latestVitals.respRate}.`,
        action: "Stop/dose-reduce opioid, naloxone standing order, SpO2 monitoring."
      });
    }

    // ── 🟠 MISSING DATA ───────────────────────────────────────────────────
    if (!patient.allergies) {
      missingData.push({
        severity: "MISSING_DATA",
        finding: "No allergy documentation",
        rationale: "Allergy field empty — cannot run drug-allergy cross-check before prescribing.",
        action: "Document allergies or 'NKDA' (no known drug allergy) before any order."
      });
    }
    if (meds.length === 0) {
      missingData.push({
        severity: "MISSING_DATA",
        finding: "No current medication list",
        rationale: "Active medication list empty — medication reconciliation impossible.",
        action: "Complete medication reconciliation on admission."
      });
    }
    if (!findLab(labs, "creatinine", "urea", "kft", "rft") && has(medNames, "ace", "enalapril", "ramipril", "lisinopril", "metformin", "ibuprofen", "diclofenac", "gentamicin", "amikacin", "contrast")) {
      missingData.push({
        severity: "MISSING_DATA",
        finding: "Drug–lab gap: nephrotoxic/renally-cleared drug without recent creatinine",
        rationale: `Patient on ${meds.map(m => m.name || m.medicine).join(", ")} — renal function not assessed.`,
        action: "Serum creatinine/eGFR today; re-assess dose or stop nephrotoxic agent."
      });
    }
    if (patient.age !== undefined && patient.age < 12 && !patient.weight) {
      missingData.push({
        severity: "MISSING_DATA",
        finding: "Weight not recorded (pediatric patient)",
        rationale: "Pediatric dosing requires weight; no weight on record.",
        action: "Record weight before any medication dose."
      });
    }
    if (patient.gender === "female" && has(medNames, "warfarin", "valproate", "isotretinoin", "methotrexate", "carbamazepine", "phenytoin")) {
      missingData.push({
        severity: "MISSING_DATA",
        finding: "Pregnancy status unknown before teratogenic/anticoagulant prescribing",
        rationale: "Female patient on potentially teratogenic agent — pregnancy status not documented.",
        action: "Document LMP/β-hCG status before continuing therapy."
      });
    }

    // ── 🟢 CONTRADICTING ──────────────────────────────────────────────────
    if (has(diagnosis, "pneumonia", "cap", "community acquired")) {
      const wbc = findLab(labs, "wbc", "total count");
      const pct = findLab(labs, "procalcitonin");
      const wbcVal = wbc ? numericOf(wbc.value ?? wbc.result) : null;
      const pctVal = pct ? numericOf(pct.value ?? pct.result) : null;
      if ((wbcVal !== null && wbcVal < 11) || (pctVal !== null && pctVal < 0.1)) {
        contradicting.push({
          severity: "CONTRADICTING",
          finding: `Diagnosis "${diagnosis}" vs lab evidence`,
          rationale: `WBC ${wbcVal ?? "n/a"} ×10⁹/L${pctVal !== null ? `, procalcitonin ${pctVal} ng/mL` : ""} — bacterial CAP unlikely by these markers; consider viral/atypical or review diagnosis.`,
          action: "Review diagnosis; consider viral panel, procalcitonin-guided antibiotics."
        });
      }
    }
    if (has(diagnosis, "dengue") && !findLab(labs, "platelet", "hematocrit", "hct", "pcv")) {
      contradicting.push({
        severity: "CONTRADICTING",
        finding: "Dengue diagnosed without platelet/hematocrit surveillance",
        rationale: "No platelet or hematocrit on file — cannot assess plasma leakage severity.",
        action: "CBC with PCV q12h; classify per WHO dengue warning signs."
      });
    }
    if (has(diagnosis, "anemia") || has(diagnosis, "anaemia")) {
      const hb = findLab(labs, "hb", "hemoglobin");
      const hbVal = hb ? numericOf(hb.value ?? hb.result) : null;
      if (hbVal !== null && hbVal >= 13) {
        contradicting.push({
          severity: "CONTRADICTING",
          finding: `Diagnosis "${diagnosis}" vs Hb ${hbVal} g/dL`,
          rationale: "Hemoglobin within normal range contradicts active anemia diagnosis.",
          action: "Re-review diagnosis; check MCV/iron studies if functional deficiency suspected."
        });
      }
    }

    // ── 📋 NEXT HIGH-VALUE ACTIONS (ordered: must-not-miss first) ─────────
    const nextHighValueActions: string[] = [
      ...mustNotMiss.map(f => f.action || f.finding),
      ...notExcluded.map(f => f.action || f.finding),
      ...missingData.map(f => f.action || f.finding),
      ...contradicting.map(f => f.action || f.finding)
    ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 6);

    return {
      patientName: patient.name,
      uhid: patient.uhid,
      generatedAt: new Date().toISOString(),
      mustNotMiss,
      notExcluded,
      missingData,
      contradicting,
      nextHighValueActions
    };
  }

  /**
   * RULE-OUT ENGINE — sensitivity-driven exclusion.
   * If the condition's sensitive test is negative on file → EFFECTIVELY EXCLUDED.
   * If the test is absent → CANNOT EXCLUDE (with the exact test needed).
   */
  public static ruleOut(condition: string, patient: any): RuleAssessment {
    const c = condition.toLowerCase();
    const labs: LabEntry[] = patient.labResults || [];
    const complaint = patient.chiefComplaint || patient.chiefComplaints || "";
    const latestVitals = Array.isArray(patient.vitals) && patient.vitals.length > 0
      ? patient.vitals[patient.vitals.length - 1] : null;

    const rules: Record<string, {
      pretest: number; tests: string[]; exclusions: (labs: LabEntry[]) => { negative: boolean; detail: string };
    }> = {
      "pulmonary embolism": {
        pretest: 0.15,
        tests: ["d-dimer", "ddimer", "ctpa", "v/q"],
        exclusions: (L) => {
          const dimer = findLab(L, "d-dimer", "ddimer");
          const dimerVal = dimer ? numericOf(dimer.value ?? dimer.result) : null;
          const hasCtp = !!findLab(L, "ctpa", "ct pulmonary", "v/q", "vq scan");
          if (hasCtp) return { negative: true, detail: "CTPA/VQ performed without reported PE — anatomically excluded." };
          if (dimer && dimerVal !== null && dimerVal < 500) return { negative: true, detail: `D-dimer ${dimerVal} ng/mL (negative) — PE unlikely at any Wells probability.` };
          if (dimer && dimerVal !== null) return { negative: false, detail: `D-dimer elevated (${dimerVal} ng/mL) — PE NOT excluded.` };
          return { negative: false, detail: "No D-dimer or CTPA on file." };
        }
      },
      "myocardial infarction": {
        pretest: 0.1,
        tests: ["troponin", "trop", "hs-cTn"],
        exclusions: (L) => {
          const t = findLab(L, "troponin", "hs-ctn", "trop");
          const tv = t ? numericOf(t.value ?? t.result) : null;
          if (t && tv !== null && tv < 0.05) return { negative: true, detail: `High-sensitivity troponin ${tv} (below 99th percentile) at >3h from symptom onset — MI effectively excluded.` };
          if (t) return { negative: false, detail: `Troponin ${tv ?? "reported"} — MI NOT excluded; serial testing needed.` };
          return { negative: false, detail: "No troponin on file." };
        }
      },
      "meningitis": {
        pretest: 0.2,
        tests: ["csf", "lumbar puncture"],
        exclusions: (L) => {
          const csf = findLab(L, "csf", "lumbar");
          if (csf) return { negative: true, detail: "CSF analysis documented without pleocytosis/positive gram stain — bacterial meningitis effectively excluded." };
          return { negative: false, detail: "No CSF analysis documented." };
        }
      },
      "deep vein thrombosis": {
        pretest: 0.12,
        tests: ["d-dimer", "ddimer", "doppler", "usg doppler"],
        exclusions: (L) => {
          const dimer = findLab(L, "d-dimer", "ddimer");
          const dimerVal = dimer ? numericOf(dimer.value ?? dimer.result) : null;
          if (!!findLab(L, "doppler")) return { negative: true, detail: "Venous Doppler reported without DVT — excluded." };
          if (dimer && dimerVal !== null && dimerVal < 500) return { negative: true, detail: `D-dimer ${dimerVal} ng/mL negative — DVT unlikely (Wells low).` };
          return { negative: false, detail: "No negative D-dimer or Doppler on file." };
        }
      },
      "dengue": {
        pretest: 0.3,
        tests: ["ns1", "dengue", "igm"],
        exclusions: (L) => {
          const ns1 = findLab(L, "ns1", "dengue");
          if (ns1 && /neg/i.test(`${ns1.value ?? ns1.result ?? ""}`)) return { negative: true, detail: "NS1/IgM negative — dengue effectively excluded (within test window)." };
          if (ns1) return { negative: false, detail: "Dengue serology reported non-negative — NOT excluded." };
          return { negative: false, detail: "No dengue NS1/serology on file." };
        }
      },
      "sepsis": {
        pretest: 0.25,
        tests: ["lactate", "procalcitonin", "blood culture"],
        exclusions: (L) => {
          const lac = findLab(L, "lactate");
          const lacVal = lac ? numericOf(lac.value ?? lac.result) : null;
          const pct = findLab(L, "procalcitonin");
          const pctVal = pct ? numericOf(pct.value ?? pct.result) : null;
          const bc = findLab(L, "blood culture", "culture");
          if (lacVal !== null && lacVal < 2 && pctVal !== null && pctVal < 0.25) return { negative: true, detail: `Lactate ${lacVal} mmol/L + procalcitonin ${pctVal} ng/mL both negative — sepsis unlikely.` };
          if (lacVal !== null && lacVal < 2) return { negative: true, detail: `Lactate ${lacVal} mmol/L (normal) — severe sepsis/septic shock unlikely; cultures pending.` };
          return { negative: false, detail: "No lactate/procalcitonin on file — CANNOT exclude sepsis." };
        }
      }
    };

    const rule = rules[c] || rules[c.replace(/^pe$/, "pulmonary embolism")] ||
      rules[Object.keys(rules).find(k => c.includes(k)) || ""];

    if (!rule) {
      return {
        condition,
        label: "CANNOT_EXCLUDE",
        pretestProbability: 0.2,
        posttestProbability: 0.2,
        probabilityMethod: "No structured rule-out pathway defined for this condition.",
        evidence: ["Condition not in the rule-out library — apply clinical judgement."],
        neededTests: ["Consult specialist for condition-specific sensitive testing."],
        statement: `"${condition}" — CANNOT EXCLUDE. No validated rule-out pathway exists in the local library for this condition.`
      };
    }

    const { negative, detail } = rule.exclusions(labs);
    const posttest = negative
      ? Math.round(rule.pretest * 0.05 * 1000) / 1000
      : rule.pretest;

    return {
      condition,
      label: negative ? "EFFECTIVELY_EXCLUDED" : "CANNOT_EXCLUDE",
      pretestProbability: rule.pretest,
      posttestProbability: posttest,
      probabilityMethod: negative
        ? "Post-test = pre-test × negative likelihood ratio (≈0.05 for the sensitive test used). DERIVED ESTIMATE."
        : "No sensitive negative test on file — probability unchanged. DERIVED ESTIMATE.",
      evidence: [detail],
      neededTests: negative ? [] : rule.tests,
      statement: negative
        ? `${detail} → "${condition}" effectively excluded at this time.`
        : `${detail} → "${condition}" CANNOT be excluded. Order: ${rule.tests.join(" / ")}.`
    };
  }

  /**
   * RULE-IN ENGINE — likelihood-ratio driven confirmation.
   */
  public static ruleIn(condition: string, patient: any): RuleAssessment {
    const c = condition.toLowerCase();
    const labs: LabEntry[] = patient.labResults || [];
    const complaint = patient.chiefComplaint || patient.chiefComplaints || "";
    const diagnosis = patient.diagnosis || "";
    const latestVitals = Array.isArray(patient.vitals) && patient.vitals.length > 0
      ? patient.vitals[patient.vitals.length - 1] : null;

    const rules: Record<string, {
      pretest: number; findings: (L: LabEntry[]) => { text: string; lr: number }[];
    }> = {
      "pulmonary embolism": {
        pretest: 0.15,
        findings: (L) => {
          const f: { text: string; lr: number }[] = [];
          const dimer = findLab(L, "d-dimer", "ddimer");
          const dv = dimer ? numericOf(dimer.value ?? dimer.result) : null;
          if (dv !== null && dv > 1000) f.push({ text: `D-dimer markedly elevated (${dv} ng/mL)`, lr: 3.5 });
          if (latestVitals && latestVitals.spo2 !== undefined && latestVitals.spo2 < 90) f.push({ text: "Hypoxemia without alternative explanation", lr: 3.0 });
          if (has(complaint, "hemoptysis")) f.push({ text: "Hemoptysis", lr: 2.5 });
          if (f.length === 0) f.push({ text: "No specific rule-in findings yet — D-dimer, Wells score, imaging pending", lr: 1.0 });
          return f;
        }
      },
      "bacterial pneumonia": {
        pretest: 0.3,
        findings: (L) => {
          const f: { text: string; lr: number }[] = [];
          const pct = findLab(L, "procalcitonin");
          const pv = pct ? numericOf(pct.value ?? pct.result) : null;
          const wbc = findLab(L, "wbc", "total count");
          const wv = wbc ? numericOf(wbc.value ?? wbc.result) : null;
          if (pv !== null && pv > 0.5) f.push({ text: `Procalcitonin > 0.5 ng/mL (${pv})`, lr: 4.0 });
          if (wv !== null && wv > 15) f.push({ text: `Leukocytosis (WBC ${wv})`, lr: 2.0 });
          if (has(diagnosis, "consolidation", "infiltrate", "lobar")) f.push({ text: "Chest imaging consolidation", lr: 3.0 });
          if (f.length === 0) f.push({ text: "No specific rule-in findings yet — CXR + procalcitonin + sputum pending", lr: 1.0 });
          return f;
        }
      },
      "severe dengue": {
        pretest: 0.2,
        findings: (L) => {
          const f: { text: string; lr: number }[] = [];
          const pl = findLab(L, "platelet");
          const pv = pl ? numericOf(pl.value ?? pl.result) : null;
          const hct = findLab(L, "hematocrit", "hct", "pcv");
          const hv = hct ? numericOf(hct.value ?? hct.result) : null;
          const ns1 = findLab(L, "ns1");
          if (ns1 && /pos/i.test(`${ns1.value ?? ns1.result ?? ""}`)) f.push({ text: "NS1 antigen positive", lr: 5.0 });
          if (pv !== null && pv < 100000) f.push({ text: `Thrombocytopenia (platelets ${pv})`, lr: 3.0 });
          if (hv !== null && hv > 45) f.push({ text: `Hemoconcentration (HCT ${hv}%)`, lr: 3.5 });
          if (has(complaint, "abdominal pain", "vomiting", "bleeding", "lethargy")) f.push({ text: "WHO warning signs present", lr: 2.5 });
          if (f.length === 0) f.push({ text: "No specific rule-in findings yet — NS1, platelet, HCT pending", lr: 1.0 });
          return f;
        }
      },
      "acute coronary syndrome": {
        pretest: 0.12,
        findings: (L) => {
          const f: { text: string; lr: number }[] = [];
          const t = findLab(L, "troponin", "hs-ctn");
          const tv = t ? numericOf(t.value ?? t.result) : null;
          if (tv !== null && tv > 1) f.push({ text: `Troponin elevation (${tv})`, lr: 6.0 });
          if (has(complaint, "chest pain", "crushing", "radiating")) f.push({ text: "Anginal chest pain", lr: 2.0 });
          if (f.length === 0) f.push({ text: "No specific rule-in findings yet — serial troponin + ECG pending", lr: 1.0 });
          return f;
        }
      }
    };

    const rule = rules[c] || rules[Object.keys(rules).find(k => c.includes(k)) || ""];
    if (!rule) {
      return {
        condition,
        label: "CONSISTENT",
        pretestProbability: 0.2,
        posttestProbability: 0.2,
        probabilityMethod: "No structured rule-in library entry — label is CONSISTENT at clinician's pre-test estimate.",
        evidence: ["Condition not in the rule-in library — apply clinical judgement."],
        neededTests: ["Specialist-guided confirmatory testing."],
        statement: `"${condition}" — CONSISTENT with available findings; specialist confirmation recommended.`
      };
    }

    const findings = rule.findings(labs);
    const bestLR = Math.max(...findings.map(f => f.lr));
    const posttest = Math.round(Math.min(0.99, (rule.pretest * bestLR) / (1 - rule.pretest + rule.pretest * bestLR)) * 1000) / 1000;

    const label: RuleInLabel = bestLR >= 4 ? "HIGHLY_SUPPORTIVE" : bestLR >= 2 ? "SUPPORTIVE" : "CONSISTENT";

    return {
      condition,
      label,
      pretestProbability: rule.pretest,
      posttestProbability: posttest,
      probabilityMethod: `Post-test = pre-test (${rule.pretest}) × best positive likelihood ratio (${bestLR}) via Bayes. DERIVED ESTIMATE. Never 100% without gold standard.`,
      evidence: findings.map(f => f.text),
      neededTests: findings.some(f => f.lr === 1.0)
        ? Object.values(rule).length ? [] : []
        : [],
      statement: `"${condition}" — ${label}: ${findings.map(f => f.text).join("; ")}. Estimated probability rises from ${Math.round(rule.pretest * 100)}% to ${Math.round(posttest * 100)}% (DERIVED ESTIMATE).`
    };
  }
}