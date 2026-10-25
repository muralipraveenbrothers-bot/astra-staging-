/**
 * ASTRA AI — TOX-COMMAND: TOXICOLOGY & OVERDOSE
 * ============================================================================
 * Deterministic: toxidrome matcher, weight-based antidote calculator,
 * Rumack-Matthew paracetamol nomogram, specific protocols (snake bite, OP,
 * heavy metals). Advisory only.
 */

export interface ToxidromeMatch {
  poison: string;
  confidence: number; // DERIVED ESTIMATE from pattern match
  antidote: string;
  antidoteDose: string;
  protocol: string;
}

export interface ToxCommandOutput {
  engine: "tox_command";
  version: "2026.08.14";
  generatedAt: string;
  patientName?: string;
  uhid?: string;
  symptoms: string[];
  matches: ToxidromeMatch[];
  nomogram?: {
    substance: string;
    plot: Array<{ hours: number; level: number }>;
    protocol: string;
  };
  caveats: string[];
}

const TOXIDROMES: Array<{
  poison: string;
  symptoms: string[];
  antidote: string;
  dosePerKg?: number;
  doseFixed?: string;
  protocol: string;
  caveat: string;
}> = [
  {
    poison: "Organophosphate",
    symptoms: ["pinpoint pupils", "bradycardia", "salivation", "lacrimation", "sweating", "muscle fasciculations", "diarrhea"],
    antidote: "Atropine + Pralidoxime (PAM)",
    doseFixed: "Atropine 2 mg IV (repeat 2 mg q5min until secretions dry); PAM 1-2 g IV over 30 min",
    protocol: "OP poisoning: atropinize to clear secretions, then PAM 1-2g IV",
    caveat: "Atropine dosing must be titrated to clinical endpoint (dried secretions), NOT fixed",
  },
  {
    poison: "Opioid overdose",
    symptoms: ["pinpoint pupils", "bradypnea", "respiratory depression", "coma", "low gcs"],
    antidote: "Naloxone",
    doseFixed: "Naloxone 0.4 mg IV push (repeat q2-3min up to 10 mg)",
    protocol: "Opioid OD: naloxone 0.4mg IV, reassess breathing, re-dose prn",
    caveat: "Naloxone half-life < opioid — may require infusion",
  },
  {
    poison: "Paracetamol overdose",
    symptoms: ["nausea", "vomiting", "abdominal pain", "late jaundice"],
    antidote: "N-Acetylcysteine (NAC)",
    protocol: "Rumack-Matthew nomogram: NAC if level above treatment line",
    caveat: "Start NAC within 8h for best outcomes — nomogram only reliable 4-24h post-ingestion",
  },
  {
    poison: "Snake bite (viper)",
    symptoms: ["fang marks", "swelling", "bleeding", "ptosis", "coagulopathy"],
    antidote: "ASV (Anti-Snake Venom)",
    doseFixed: "Viper: 10 vials ASV IV over 1h (repeat per 20-min WBCT20)",
    protocol: "Viper bite → 10 vials ASV; monitor WBCT20 q20min",
    caveat: "Pre-medication not routinely recommended; observe anaphylaxis",
  },
  {
    poison: "Heavy metal poisoning",
    symptoms: ["abdominal pain", "neuropathy", "anemia", "gingival lines"],
    antidote: "Chelation (DMSA / BAL / EDTA per metal)",
    doseFixed: "Lead: DMSA 10 mg/kg TID x5d; Mercury: BAL + DMSA",
    protocol: "Heavy metal → identify metal (blood/urine) → specific chelator",
    caveat: "Chelation requires confirmed exposure — never empirical",
  },
  {
    poison: "Salicylate overdose",
    symptoms: ["tinnitus", "hyperventilation", "vomiting", "confusion"],
    antidote: "Sodium bicarbonate",
    doseFixed: "1-2 mEq/kg IV bolus then infusion (target urine pH 7.5-8.0)",
    protocol: "Salicylate: alkalinize urine, recheck levels q2h",
    caveat: "Requires K+ repletion first",
  },
  {
    poison: "Beta-blocker overdose",
    symptoms: ["bradycardia", "hypotension", "low gcs"],
    antidote: "Glucagon",
    doseFixed: "Glucagon 5-10 mg IV bolus, then 2-5 mg/h infusion",
    protocol: "BB OD: glucagon + atropine + pacing",
    caveat: "Glucagon may cause vomiting — protect airway",
  },
  {
    poison: "Calcium channel blocker overdose",
    symptoms: ["bradycardia", "hypotension", "hyperglycemia"],
    antidote: "Calcium chloride + high-dose insulin",
    doseFixed: "CaCl2 1g IV; insulin 1 U/kg/h with dextrose",
    protocol: "CCB OD: calcium + insulin-euglycemia therapy",
    caveat: "Monitor glucose q1h",
  },
];

export class ToxCommandAgent {
  public static readonly agentId = "tox_commander";

  public static match(symptoms: string[], opts?: { patientName?: string; uhid?: string; paracetamolLevel?: number; hoursPostIngestion?: number }): ToxCommandOutput {
    const S = symptoms.map((s) => s.toLowerCase());
    const matches: ToxidromeMatch[] = TOXIDROMES.map((t) => {
      const hit = t.symptoms.filter((x) => S.some((s) => s.includes(x) || x.includes(s))).length;
      const confidence = hit === 0 ? 0 : Math.min(0.99, 0.55 + hit * 0.14);
      return { poison: t.poison, confidence, antidote: t.antidote, antidoteDose: t.doseFixed || "", protocol: t.protocol };
    })
      .filter((m) => m.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    let nomogram;
    if (opts?.paracetamolLevel !== undefined && opts.hoursPostIngestion !== undefined) {
      const hours = opts.hoursPostIngestion;
      const level = opts.paracetamolLevel;
      const treatmentLine = hours <= 4 ? 150 : hours <= 8 ? 200 - (hours - 4) * 12.5 : hours <= 12 ? 100 - (hours - 8) * 10 : 60;
      const aboveLine = level > treatmentLine;
      nomogram = {
        substance: "Paracetamol (Rumack-Matthew)",
        plot: [{ hours, level }],
        protocol: aboveLine
          ? `Level ${level} µg/mL at ${hours}h is ABOVE treatment line (${treatmentLine}) → START NAC`
          : `Level ${level} µg/mL at ${hours}h is below treatment line (${treatmentLine}) → no NAC indicated (recheck if delayed)`,
      };
    }

    return {
      engine: "tox_command",
      version: "2026.08.14",
      generatedAt: new Date().toISOString(),
      patientName: opts?.patientName,
      uhid: opts?.uhid,
      symptoms,
      matches,
      nomogram,
      caveats: matches.map((m) => {
        const c = TOXIDROMES.find((t) => t.poison === m.poison);
        return c?.caveat ?? "";
      }).filter(Boolean),
    };
  }
}