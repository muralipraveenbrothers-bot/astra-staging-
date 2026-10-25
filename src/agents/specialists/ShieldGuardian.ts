/**
 * ASTRA AI — SHIELD AI: THE GUARDIAN & SAFETY ARCHITECTURE
 * ============================================================================
 * Five layers: (1) clinical watchdog, (2) DPO mode, (3) zero-loss,
 * (4) ORANGE SHIELD privacy-guarded corrections, (5) security self-defense.
 * Layer 4 is the interactive heart: HUMBLE INQUIRY (low-confidence anomaly),
 * SILENT WHISPER (minor interaction), HARD BLOCK (99% harm likelihood —
 * requires admin override). No fake blocks: rules are explicit.
 */

export type ShieldLevel = "HUMBLE_INQUIRY" | "SILENT_WHISPER" | "HARD_BLOCK" | "CLEAR";

export interface ShieldCheck {
  level: ShieldLevel;
  message: string;
  detail?: string;
  override?: { allowedFor: string[]; hint: string };
}

export interface ShieldOrderCheckInput {
  medication?: string;
  dose?: string | number;
  frequency?: string;
  patientMedications?: string[];
  allergies?: string[];
  bloodPressure?: { sys?: number; dia?: number };
}

const DOSES: Record<string, { typical: string; unit: string }> = {
  paracetamol: { typical: "500-1000 mg", unit: "mg" },
  amoxicillin: { typical: "250-500 mg", unit: "mg" },
  azithromycin: { typical: "500 mg", unit: "mg" },
  metformin: { typical: "500-850 mg", unit: "mg" },
  warfarin: { typical: "1-10 mg", unit: "mg" },
  metoprolol: { typical: "25-100 mg", unit: "mg" },
  insulin: { typical: "per sliding scale", unit: "units" },
  furosemide: { typical: "20-80 mg", unit: "mg" },
};

const INTERACTIONS: Array<{ pair: string[]; warning: string; severity: "MINOR" | "MAJOR" | "LETHAL" }> = [
  { pair: ["warfarin", "aspirin"], warning: "Warfarin + Aspirin: bleeding risk +2.3x. Consider alternative?", severity: "MAJOR" },
  { pair: ["warfarin", "metronidazole"], warning: "Warfarin + Metronidazole: INR ↑ significantly — reduce warfarin dose", severity: "MAJOR" },
  { pair: ["metformin", "contrast"], warning: "Metformin + IV contrast: hold metformin per contrast nephropathy protocol", severity: "MAJOR" },
  { pair: ["sildenafil", "nitroglycerin"], warning: "Sildenafil + Nitroglycerin: LETHAL hypotension", severity: "LETHAL" },
  { pair: ["potassium", "spironolactone"], warning: "Potassium + Spironolactone: hyperkalemia risk", severity: "MAJOR" },
  { pair: ["ciprofloxacin", "tizanidine"], warning: "Ciprofloxacin + Tizanidine: severe hypotension/arrhythmia risk", severity: "LETHAL" },
  { pair: ["clopidogrel", "omeprazole"], warning: "Clopidogrel + Omeprazole: reduced antiplatelet efficacy", severity: "MINOR" },
  { pair: ["statin", "clarithromycin"], warning: "Statin + Clarithromycin: myopathy/rhabdomyolysis risk", severity: "MAJOR" },
  { pair: ["levothyroxine", "calcium"], warning: "Levothyroxine + Calcium: take levothyroxine 30 min before food/calcium", severity: "MINOR" },
];

export class ShieldGuardian {
  public static readonly agentId = "shield_guardian";

  public static checkOrder(input: ShieldOrderCheckInput): ShieldCheck {
    const med = (input.medication || "").toLowerCase();
    const doseNum = typeof input.dose === "number" ? input.dose : parseFloat(String(input.dose || "").replace(/[^\d.]/g, ""));
    const doseText = String(input.dose || "");
    const currentMeds = (input.patientMedications || []).map((m) => m.toLowerCase());

    // HARD BLOCK: lethal combinations
    for (const ix of INTERACTIONS) {
      if (ix.severity === "LETHAL" && ix.pair.every((p) => med.includes(p) || currentMeds.some((m) => m.includes(p))) && (med.includes(ix.pair[0]) && currentMeds.some((m) => m.includes(ix.pair[1])) || med.includes(ix.pair[1]) && currentMeds.some((m) => m.includes(ix.pair[0])))) {
        return {
          level: "HARD_BLOCK",
          message: `HARD BLOCK — ${ix.warning}`,
          detail: `Lethal drug combination risk. Submission blocked.`,
          override: { allowedFor: ["admin"], hint: "Admin override required to proceed" },
        };
      }
    }

    // HARD BLOCK: physiologically impossible BP
    const sys = input.bloodPressure?.sys;
    const dia = input.bloodPressure?.dia;
    if (sys !== undefined && sys > 250) {
      return {
        level: "HARD_BLOCK",
        message: `HARD BLOCK — Systolic BP ${sys} is physiologically impossible (>250 mmHg). Verify measurement.`,
        detail: "Physiologically impossible vital. Submission blocked.",
        override: { allowedFor: ["admin"], hint: "Admin override required after re-verification" },
      };
    }
    if (dia !== undefined && dia > 140) {
      return {
        level: "HARD_BLOCK",
        message: `HARD BLOCK — Diastolic BP ${dia} is physiologically impossible (>140 mmHg). Verify measurement.`,
        detail: "Physiologically impossible vital. Submission blocked.",
        override: { allowedFor: ["admin"], hint: "Admin override required after re-verification" },
      };
    }

    // HARD BLOCK: allergy match
    if (input.allergies && input.allergies.some((a) => med.includes(a.toLowerCase()))) {
      return {
        level: "HARD_BLOCK",
        message: `HARD BLOCK — Allergy match: ${input.allergies.find((a) => med.includes(a.toLowerCase()))} is on this patient's allergy list.`,
        detail: "Known allergy. Submission blocked.",
        override: { allowedFor: ["admin"], hint: "Admin override required (document rationale)" },
      };
    }

    // HUMBLE INQUIRY: dose anomaly (low confidence)
    const known = DOSES[med];
    if (known && doseNum > 0 && !doseText.toLowerCase().includes("mg per") && !doseText.toLowerCase().includes("per kg")) {
      const typicalMax = parseFloat(known.typical.match(/\d+/)![0]) * 4;
      if (doseNum > typicalMax) {
        return {
          level: "HUMBLE_INQUIRY",
          message: `Typical dose is ${known.typical}. You entered ${doseNum}${known.unit}. Continue?`,
          detail: "Dose anomaly detected — silent orange shield, no public announcement.",
        };
      }
    }

    // SILENT WHISPER: interactions (minor/major, non-lethal)
    for (const ix of INTERACTIONS) {
      if (ix.severity !== "LETHAL" && ((med.includes(ix.pair[0]) && currentMeds.some((m) => m.includes(ix.pair[1]))) || (med.includes(ix.pair[1]) && currentMeds.some((m) => m.includes(ix.pair[0]))))) {
        return { level: "SILENT_WHISPER", message: ix.warning, detail: "Minor/important interaction — orange shield, tap to reveal" };
      }
    }

    return { level: "CLEAR", message: "Compliant with SOP — green glow" };
  }

  /** Watchdog: vital stream threshold crossings. */
  public static checkVitals(vitals: { spo2?: number; heartRate?: number; tempF?: number; respRate?: number; bpSys?: number }): ShieldCheck[] {
    const alerts: ShieldCheck[] = [];
    if (vitals.spo2 !== undefined && vitals.spo2 < 90) alerts.push({ level: "HARD_BLOCK", message: `SpO2 ${vitals.spo2}% — CRITICAL desaturation`, detail: "Immediate clinical review" });
    else if (vitals.spo2 !== undefined && vitals.spo2 < 94) alerts.push({ level: "SILENT_WHISPER", message: `SpO2 ${vitals.spo2}% — monitor`, detail: "Threshold < 94%" });
    if (vitals.heartRate !== undefined && vitals.heartRate > 130) alerts.push({ level: "SILENT_WHISPER", message: `HR ${vitals.heartRate} — tachycardic`, detail: "Threshold > 130" });
    if (vitals.tempF !== undefined && vitals.tempF > 102) alerts.push({ level: "SILENT_WHISPER", message: `Temp ${vitals.tempF}°F — high`, detail: "Threshold > 102°F" });
    return alerts;
  }
}