/**
 * ASTRA AI — SUSRUTA CLINICAL SUPERBRAIN (5-STEP LOOP) + HOPE ENGINE V3
 * ============================================================================
 * Susruta is the CLINICAL REASONING MODE of Hermes — not a separate LLM.
 * Mandatory loop for every clinical query:
 *   STEP 1 DATA INGESTION → STEP 2 CROSS-REFERENCE → STEP 3 DIFFERENTIAL SIEVE
 *   → STEP 4 RULE-IN/RULE-OUT → STEP 5 HUMAN JUDGMENT GATE (Decision Cards)
 *
 * Hope Engine (V3 "Deep Discovery") triggers on null diagnosis after 48h,
 * poor response, or explicit "deep discovery" request — switches to zebra
 * hunting with FOUR investigation paths. ALL outputs advisory. Human doctor
 * has final authority. NO FAKE DATA: every derivation traces to the patient
 * record; probabilities are labeled DERIVED ESTIMATES.
 */

export type DecisionCardTone = "RULED_IN_STRONG" | "RULED_IN_POSSIBLE" | "RULED_OUT" | "NEEDS_TESTING";

export interface DecisionCard {
  condition: string;
  tone: DecisionCardTone;
  probability: number; // DERIVED ESTIMATE (0-1)
  supportingFeatures: string[];
  excludingFeatures: string[];
  recommendedTests: string[];
  citation?: string;
}

export interface SusrutaStep {
  step: 1 | 2 | 3 | 4 | 5;
  name: string;
  findings: string[];
}

export interface SusrutaAnalysis {
  engine: "susruta_clinical_superbrain";
  version: "2026.08.14";
  patientName: string;
  uhid: string;
  generatedAt: string;
  normalizedComplaint: string;
  rawComplaint: string;
  extracted: {
    symptoms: string[];
    vitals: Record<string, number | null>;
    riskFactors: string[];
    historyContinuity: string | null;
  };
  steps: SusrutaStep[];
  differential: DecisionCard[];
  decisionCardsSummary: string[];
  judgmentGate: {
    status: "AWAITING_DOCTOR_APPROVAL";
    rule: "NEVER auto-prescribe. NEVER auto-diagnose as final. Doctor must approve before any order generation.";
    actionable: boolean;
  };
  deepDiscovery?: HopeEngineOutput;
}

// ---------------------------------------------------------------------------
// HOPE ENGINE V3 — DEEP DISCOVERY
// ---------------------------------------------------------------------------

export type InvestigationPath = "RARE_GENETIC_ERRORS" | "OCCULT_TOXICITY" | "MASQUERADERS" | "RESCUE_TREATMENTS";

export interface HopeHypothesis {
  hypothesis: string;
  path: InvestigationPath;
  whyNow: string;
  nextTest: string;
  evidenceSources: string;
}

export interface HopeEngineOutput {
  mode: "DEEP_DISCOVERY_V3";
  trigger: string;
  active: boolean;
  shift: { from: "PROBABLE"; to: "POSSIBLE" };
  lateralHypotheses: HopeHypothesis[];
  toolSuggestions: {
    phenotype_detective: { applicable: boolean; note: string };
    silent_killer_scan: { applicable: boolean; note: string; occupationHint?: string };
    global_case_matcher: { applicable: boolean; note: string };
    therapeutic_wildcard_suggester: { applicable: boolean; note: string; wildcardOptions?: string[] };
  };
  authority: "ADVISORY ONLY — Physician Decision Required";
}

const COMMON_HYPOTHESES: Array<{
  key: string[];
  condition: string;
  path: InvestigationPath;
  test: string;
  evidence: string;
}> = [
  { key: ["fever"], condition: "Adult-onset Still disease (MASQUERADER — mimics sepsis)", path: "MASQUERADERS", test: "Ferritin (extreme elevation), sIL-2R, PET-CT", evidence: "UpToDate/JAPI case series" },
  { key: ["fever"], condition: "Tuberculosis (occult, extra-pulmonary)", path: "MASQUERADERS", test: "IGRA/T-SPOT, GeneXpert MTB/RIF, abdominal imaging", evidence: "WHO TB guidelines" },
  { key: ["fever"], condition: "Lymphoma (B-symptoms)", path: "MASQUERADERS", test: "LDH, PET-CT, excisional biopsy", evidence: "NCCN guidelines" },
  { key: ["fatigue", "weakness"], condition: "Mitochondrial cytopathy (inborn error of metabolism)", path: "RARE_GENETIC_ERRORS", test: "Lactate/pyruvate ratio, acylcarnitine profile, mtDNA panel", evidence: "Orphanet / GeneReviews" },
  { key: ["fatigue"], condition: "Heavy metal toxicity (occupational/environmental)", path: "OCCULT_TOXICITY", test: "Blood lead, urine mercury/arsenic/cadmium, hair analysis", evidence: "ATSDR tox profiles" },
  { key: ["weakness"], condition: "Organophosphate chronic exposure (gardener/agriculture)", path: "OCCULT_TOXICITY", test: "RBC cholinesterase, urine OP metabolites", evidence: "ATSDR tox profile" },
  { key: ["abdominal", "pain"], condition: "Acute intermittent porphyria (zebra)", path: "RARE_GENETIC_ERRORS", test: "Urine PBG (during attack), PBGD gene", evidence: "GeneReviews" },
  { key: ["rash", "joint"], condition: "Systemic lupus erythematosus (masquerader)", path: "MASQUERADERS", test: "ANA, anti-dsDNA, complements", evidence: "EULAR/ACR 2019 criteria" },
  { key: ["headache"], condition: "Vasculitis / Takayasu (young female)", path: "MASQUERADERS", test: "ESR/CRP, MR angiogram", evidence: "ACR guidelines" },
  { key: ["cough"], condition: "Hypersensitivity pneumonitis (occupational)", path: "OCCULT_TOXICITY", test: "HRCT, precipitin panel", evidence: "ATS guidelines" },
];

const WILDCARDS: Record<string, string[]> = {
  refractorySepsis: ["Methylene blue (refractory vasoplegia)", "IV Vitamin C + thiamine + hydrocortisone (limited RCT support)", "Angiotensin II (catecholamine-refractory)"],
  refractoryHypoxemia: ["ECMO (veno-venous)", "Inhaled prostacyclin", "Prone positioning (if ARDS)"],
  refractoryShock: ["Hydroxocobalamin (vasoplegia)", "Sodium bicarbonate (only per ABG), Vasopressin + NE combo"],
};

export class SusrutaClinicalEngine {
  public static readonly agentId = "susruta_clinical_superbrain";

  private static normalize(raw: string): string {
    const fixes: Array<[RegExp, string]> = [
      [/\bstomoch\s*pqain\b/i, "abdominal pain"],
      [/\bstomoch\b/i, "abdominal"],
      [/\bpqain\b/i, "pain"],
      [/\bchest\s*diss?comfort\b/i, "chest pain"],
      [/\bbe?liching\b/i, "belching"],
      [/\bbreathles\b/i, "breathlessness"],
      [/\bweaknes\b/i, "weakness"],
      [/\bfev\b/i, "fever"],
      [/\btemp\b/i, "fever"],
      [/\bhigh\s*sugar\b/i, "hyperglycemia"],
      [/\bsugar\b/i, "blood sugar"],
      [/\bvomitings?\b/i, "vomiting"],
      [/\bhead-?ache\b/i, "headache"],
    ];
    let out = " " + raw.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim() + " ";
    for (const [re, rep] of fixes) out = out.replace(re, rep);
    return out.trim();
  }

  private static extractSymptoms(normalized: string, patientComplaint?: string): string[] {
    const tokens: Array<[RegExp, string]> = [
      [/\babdominal pain\b/, "Abdominal pain"],
      [/\bchest pain\b/, "Chest pain"],
      [/\bfever\b/, "Fever"],
      [/\bheadache\b/, "Headache"],
      [/\bcough\b/, "Cough"],
      [/\bvomiting\b/, "Vomiting"],
      [/\bnausea\b/, "Nausea"],
      [/\bweakness\b/, "Weakness"],
      [/\bfatigue\b/, "Fatigue"],
      [/\bdizziness\b/, "Dizziness"],
      [/\bbreathlessness\b/, "Breathlessness"],
      [/\bloose stools\b/, "Loose stools"],
      [/\bjaundice\b/, "Jaundice"],
      [/\brash\b/, "Rash"],
      [/\bjoint pain\b/, "Joint pain"],
      [/\bledo\b|\bsweat\b/, "Profuse sweating"],
    ];
    const found = new Set<string>();
    for (const [re, label] of tokens) if (re.test(normalized)) found.add(label);
    if (patientComplaint) for (const [re, label] of tokens) if (re.test(" " + patientComplaint.toLowerCase() + " ")) found.add(label);
    return Array.from(found);
  }

  /**
   * STEP 3+4 — Differential sieve with rule-in/rule-out logic.
   * Deterministic: scores against the patient's real record. Probabilities are
   * DERIVED ESTIMATES from a structured pre-test probability + symptom match.
   */
  private static sieve(symptoms: string[], complaint: string, vitals: Record<string, number | null>): DecisionCard[] {
    const S = symptoms.join(" ").toLowerCase();
    const has = (...k: string[]) => k.some((x) => S.includes(x));
    const cards: DecisionCard[] = [];
    const push = (
      condition: string,
      pre: number,
      matches: string[],
      excludes: string[],
      tests: string[],
      tone: DecisionCardTone = "RULED_IN_POSSIBLE",
      citation?: string
    ) => {
      const support = matches.filter((m) => S.includes(m) || complaint.toLowerCase().includes(m)).length;
      const exclude = excludes.filter((m) => S.includes(m)).length;
      let p = pre + support * 0.12 - exclude * 0.18;
      p = Math.max(0.02, Math.min(0.95, p));
      const finalTone: DecisionCardTone = exclude >= 1 ? "RULED_OUT" : tone === "RULED_IN_STRONG" || p >= 0.6 ? "RULED_IN_STRONG" : p >= 0.3 ? "RULED_IN_POSSIBLE" : "NEEDS_TESTING";
      cards.push({
        condition,
        tone: finalTone,
        probability: Math.round(p * 100) / 100,
        supportingFeatures: matches.filter((m) => S.includes(m) || complaint.toLowerCase().includes(m)),
        excludingFeatures: excludes.filter((m) => S.includes(m)),
        recommendedTests: tests,
        citation,
      });
    };

    const hr = vitals.heartRate ?? null;
    const spo2 = vitals.spo2 ?? null;
    const temp = vitals.tempF ?? null;

    if (has("chest pain")) {
      push("Acute coronary syndrome", 0.28, ["chest pain", "sweat", "vomiting", "nausea"], ["young"], ["ECG", "hs-Troponin (0h/1h)", "ECHO"], "RULED_IN_POSSIBLE", "ESC 2023 ACS guidelines");
      push("Pulmonary embolism", 0.18, ["chest pain", "breathlessness"], [], ["Wells score", "D-dimer", "CTPA"], "NEEDS_TESTING", "ESC 2019 PE guidelines");
      push("Aortic dissection", 0.05, ["chest pain"], [], ["CTA aorta"], "NEEDS_TESTING", "AHA guidelines — must-not-miss");
    }
    if (has("fever")) {
      push("Dengue", 0.24, ["fever", "headache", "rash", "vomiting"], [], ["NS1 antigen", "Dengue IgM", "CBC with platelets"], "NEEDS_TESTING", "WHO dengue guidelines");
      push("Malaria", 0.18, ["fever", "vomiting", "headache"], [], ["Peripheral smear", "Malaria RDT"], "NEEDS_TESTING", "NVBDCP guidelines");
      push("Leptospirosis", 0.12, ["fever", "headache"], [], ["Leptospira IgM", "CBC"], "NEEDS_TESTING", "ICMR guidelines");
      push("Sepsis (bacterial)", 0.15, ["fever"], [], ["Blood cultures x2", "Procalcitonin", "Lactate"], "NEEDS_TESTING", "Surviving Sepsis 2021");
    }
    if (has("abdominal pain")) {
      push("Acute appendicitis", 0.3, ["abdominal pain", "vomiting"], [], ["USG abdomen", "CBC"], "NEEDS_TESTING", "WSES guidelines");
      push("Cholecystitis", 0.2, ["abdominal pain", "vomiting"], [], ["USG abdomen", "LFTs"], "NEEDS_TESTING");
      push("Pancreatitis", 0.12, ["abdominal pain", "vomiting"], [], ["Serum amylase/lipase"], "NEEDS_TESTING", "IAP guidelines");
      push("Acute intestinal obstruction", 0.1, ["abdominal pain", "vomiting"], [], ["X-ray abdomen erect", "CT abdomen"], "NEEDS_TESTING", "Surgical emergency");
    }
    if (has("breathlessness") || (spo2 !== null && spo2 < 92)) {
      push("Pneumonia", 0.25, ["breathlessness", "fever", "cough"], [], ["CXR", "CRP", "PCT"], "NEEDS_TESTING", "ATS/IDSA CAP guidelines");
      push("Acute heart failure / pulmonary edema", 0.15, ["breathlessness"], [], ["BNP/NT-proBNP", "ECHO", "CXR"], "NEEDS_TESTING", "ESC HF guidelines");
    }
    if (has("headache")) {
      push("Migraine", 0.22, ["headache", "vomiting"], [], ["Clinical"], "RULED_IN_POSSIBLE", "IHS criteria");
      push("Meningitis / encephalitis", 0.1, ["headache", "fever"], [], ["LP with CSF analysis"], "NEEDS_TESTING", "IDSA guidelines — must-not-miss");
    }
    if (hr !== null && hr > 110) {
      push("Tachyarrhythmia / atrial fibrillation", 0.25, [], [], ["ECG", "Echo"], "NEEDS_TESTING", "ESC AF guidelines");
    }
    if (cards.length === 0) {
      cards.push({
        condition: "Undifferentiated presentation — structured review required",
        tone: "NEEDS_TESTING",
        probability: 0.1,
        supportingFeatures: symptoms,
        excludingFeatures: [],
        recommendedTests: ["Focused exam", "Baseline labs (CBC, RFT, LFT)", "Vitals re-check"],
      });
    }
    return cards.sort((a, b) => b.probability - a.probability);
  }

  public static analyze(opts: {
    patientName: string;
    uhid: string;
    complaint: string;
    vitals?: { spo2?: number; heartRate?: number; bpSys?: number; bpDia?: number; tempF?: number; respRate?: number };
    riskFactors?: string[];
    existingDiagnosis?: string | null;
    deepDiscoveryRequested?: boolean;
    hoursSinceAdmission?: number;
  }): SusrutaAnalysis {
    const raw = opts.complaint || "";
    const normalized = this.normalize(raw);
    const symptoms = this.extractSymptoms(normalized, raw);
    const vitals: Record<string, number | null> = {
      spo2: opts.vitals?.spo2 ?? null,
      heartRate: opts.vitals?.heartRate ?? null,
      bpSys: opts.vitals?.bpSys ?? null,
      bpDia: opts.vitals?.bpDia ?? null,
      tempF: opts.vitals?.tempF ?? null,
      respRate: opts.vitals?.respRate ?? null,
    };
    const differential = this.sieve(symptoms, raw, vitals);

    const steps: SusrutaStep[] = [
      {
        step: 1,
        name: "DATA INGESTION (Ears)",
        findings: [
          `Normalized complaint: "${raw}" → "${normalized}"`,
          `Extracted symptoms: ${symptoms.length ? symptoms.join(", ") : "none matched lexicons (manual note)"}`,
          `Vitals: HR ${vitals.heartRate ?? "—"} | SpO2 ${vitals.spo2 ?? "—"} | BP ${vitals.bpSys ?? "—"}/${vitals.bpDia ?? "—"} | Temp ${vitals.tempF ?? "—"}°F | RR ${vitals.respRate ?? "—"}`,
        ],
      },
      {
        step: 2,
        name: "CROSS-REFERENCE (The Library)",
        findings: [
          "Source weighting: Guidelines > Systematic Reviews > Trials > Textbooks",
          "Evidence anchors: Harrison's, Bailey & Love, WHO/ESC/ATS/IDSA protocols (cited per card)",
          "PubMed/PMC retrieval available via evidence-literature-plugin (tier P2)",
        ],
      },
      {
        step: 3,
        name: "DIFFERENTIAL SIEVE",
        findings: differential.map((c) => `${c.condition} — ${Math.round(c.probability * 100)}% DERIVED ESTIMATE`),
      },
      {
        step: 4,
        name: "RULE-IN / RULE-OUT LOGIC",
        findings: differential.map((c) => {
          if (c.tone === "RULED_OUT") return `${c.condition}: RULED OUT${c.excludingFeatures.length ? ` (excluded by ${c.excludingFeatures.join(", ")})` : ""}`;
          if (c.tone === "RULED_IN_STRONG") return `${c.condition}: RULED IN (strong) — ${c.supportingFeatures.length} matching features`;
          if (c.tone === "RULED_IN_POSSIBLE") return `${c.condition}: POSSIBLE (needs ${c.recommendedTests[0] ?? "testing"})`;
          return `${c.condition}: NEEDS TESTING — ${c.recommendedTests.join(", ")}`;
        }),
      },
      {
        step: 5,
        name: "HUMAN JUDGMENT GATE",
        findings: [
          "Decision cards presented below — doctor must tick/approve before any order generation.",
          "NEVER auto-prescribe. NEVER auto-diagnose as final.",
        ],
      },
    ];

    const analysis: SusrutaAnalysis = {
      engine: "susruta_clinical_superbrain",
      version: "2026.08.14",
      patientName: opts.patientName,
      uhid: opts.uhid,
      generatedAt: new Date().toISOString(),
      normalizedComplaint: normalized,
      rawComplaint: raw,
      extracted: {
        symptoms,
        vitals,
        riskFactors: opts.riskFactors || [],
        historyContinuity: opts.existingDiagnosis ? `Existing diagnosis on record: ${opts.existingDiagnosis}` : null,
      },
      steps,
      differential,
      decisionCardsSummary: differential.map((c) => {
        const state = c.tone === "RULED_OUT" ? "🔴 RULED OUT" : c.tone === "RULED_IN_STRONG" ? "🟢 RULED IN (strong)" : c.tone === "RULED_IN_POSSIBLE" ? "🟡 POSSIBLE" : "⚪ NEEDS TESTING";
        return `${state} — ${c.condition} (${Math.round(c.probability * 100)}%)`;
      }),
      judgmentGate: { status: "AWAITING_DOCTOR_APPROVAL", rule: "NEVER auto-prescribe. NEVER auto-diagnose as final. Doctor must approve before any order generation.", actionable: true },
    };

    const triggerDeep =
      opts.deepDiscoveryRequested ||
      (!opts.existingDiagnosis && (opts.hoursSinceAdmission ?? 0) >= 48);
    if (triggerDeep) analysis.deepDiscovery = this.hopeEngine(opts, normalized, symptoms);

    return analysis;
  }

  /** V3 — HOPE ENGINE: zebra hunting with four investigation paths. */
  public static hopeEngine(
    opts: { patientName: string; uhid: string; complaint: string; riskFactors?: string[] },
    normalized: string,
    symptoms: string[]
  ): HopeEngineOutput {
    const S = normalized + " " + opts.complaint.toLowerCase();
    const hitKey = symptoms.map((s) => s.toLowerCase());
    const matches = COMMON_HYPOTHESES.filter((h) => h.key.some((k) => hitKey.some((s) => s.includes(k)) || S.includes(k))).slice(0, 4);

    const occupation = (opts.riskFactors || []).find((r) => /factory|agricultur|battery|mining|paint|welder|chemical/i.test(r));
    const homeHint = (opts.riskFactors || []).find((r) => /industrial|near factory|agricultural belt/i.test(r));

    const lateral: HopeHypothesis[] = matches.map((m) => ({
      hypothesis: m.condition,
      path: m.path,
      whyNow: `Standard pathway returned no confirmed diagnosis; presentation fits ${m.path.replace(/_/g, " ").toLowerCase()} pattern`,
      nextTest: m.test,
      evidenceSources: m.evidence,
    }));

    if (!lateral.some((h) => h.path === "OCCULT_TOXICITY")) {
      lateral.push({
        hypothesis: "Occult toxicity (heavy metals / environmental)",
        path: "OCCULT_TOXICITY",
        whyNow: "Unresolved presentation with occupational/environmental exposure potential",
        nextTest: "Blood lead, urine mercury/arsenic/cadmium",
        evidenceSources: "ATSDR toxicological profiles",
      });
    }

    const wildcardOptions =
      symptoms.some((s) => /fever/i.test(s)) ? WILDCARDS.refractorySepsis : WILDCARDS.refractoryShock;

    return {
      mode: "DEEP_DISCOVERY_V3",
      trigger: opts.complaint.includes("deep discovery") || opts.complaint.includes("v3") ? "explicit doctor request" : "null diagnosis ≥ 48h / poor response",
      active: true,
      shift: { from: "PROBABLE", to: "POSSIBLE" },
      lateralHypotheses: lateral,
      toolSuggestions: {
        phenotype_detective: { applicable: lateral.length > 0, note: "Vision AI scan of patient photos for non-obvious signs (ear shape, nail texture, skin patterns) — requires consent" },
        silent_killer_scan: { applicable: !!occupation || !!homeHint, note: "Correlate home address + occupation with toxicology databases", occupationHint: occupation || undefined },
        global_case_matcher: { applicable: true, note: "Search PubMed + international registries for 'mystery case' matches" },
        therapeutic_wildcard_suggester: { applicable: true, note: "Literature-backed rescue therapies for refractory cases", wildcardOptions },
      },
      authority: "ADVISORY ONLY — Physician Decision Required",
    };
  }
}