/**
 * ASTRA AI — VENT-BRAIN: AI VENTILATOR CO-PILOT
 * ============================================================================
 * Deterministic ICU tool: driving-pressure safety, RSBI weaning predictor,
 * ABG interpreter. No LLM. All outputs advisory.
 */

export interface AbgInput {
  ph: number;
  pco2: number;
  po2: number;
  hco3: number;
  fiO2?: number;
  peep?: number;
}

export interface VentBrainOutput {
  engine: "vent_brain";
  version: "2026.08.14";
  patientName?: string;
  uhid?: string;
  generatedAt: string;
  abg: {
    primaryAcidBase: "RESPIRATORY_ACIDOSIS" | "RESPIRATORY_ALKALOSIS" | "METABOLIC_ACIDOSIS" | "METABOLIC_ALKALOSIS" | "NORMAL" | "MIXED";
    interpretation: string;
    suggestions: string[];
  };
  drivingPressure: { value: number; alert: boolean; suggestion: string };
  weaning: { rsbi: number | null; readiness: "READY" | "PENDING" | "NOT_READY"; score: number };
  asynchrony: { detected: boolean; note: string };
}

export class VentBrainAgent {
  public static readonly agentId = "vent_brain";

  public static assess(opts: {
    abg?: AbgInput;
    peep?: number;
    plateauPressure?: number;
    tidalVolume?: number;
    respiratoryRate?: number;
    spontaneousRate?: number;
    patientName?: string;
    uhid?: string;
  }): VentBrainOutput {
    const peep = opts.peep ?? 5;
    const plat = opts.plateauPressure ?? 22;
    const driving = plat - peep;
    const rr = opts.respiratoryRate ?? 16;
    const sr = opts.spontaneousRate ?? 0;

    let primaryAcidBase: VentBrainOutput["abg"]["primaryAcidBase"] = "NORMAL";
    const suggestions: string[] = [];
    let interpretation = "";
    if (opts.abg) {
      const { ph, pco2, hco3 } = opts.abg;
      if (ph < 7.35) {
        if (pco2 > 45) {
          primaryAcidBase = "RESPIRATORY_ACIDOSIS";
          interpretation = `pH ${ph} with pCO2 ${pco2} → respiratory acidosis`;
          suggestions.push(`Increase RR to ${Math.max(rr + 4, 24)} to correct CO2 (or ↑ TV if compliance allows)`);
        } else if (hco3 < 22) {
          primaryAcidBase = "METABOLIC_ACIDOSIS";
          interpretation = `pH ${ph} with HCO3 ${hco3} → metabolic acidosis (check lactate)`;
          suggestions.push("Address underlying acidosis — ventilatory compensation: hyperventilate cautiously");
        } else {
          primaryAcidBase = "MIXED";
          interpretation = "Mixed acid-base disturbance — review both respiratory and metabolic components";
        }
      } else if (ph > 7.45) {
        if (pco2 < 35) {
          primaryAcidBase = "RESPIRATORY_ALKALOSIS";
          interpretation = `pH ${ph} with pCO2 ${pco2} → respiratory alkalosis (hyperventilation)`;
          suggestions.push(`Reduce RR to ${Math.max(rr - 4, 10)} or lower TV`);
        } else if (hco3 > 26) {
          primaryAcidBase = "METABOLIC_ALKALOSIS";
          interpretation = `pH ${ph} with HCO3 ${hco3} → metabolic alkalosis`;
          suggestions.push("Correct hypokalemia/hypochloremia; review diuretics");
        } else {
          primaryAcidBase = "MIXED";
          interpretation = "Mixed alkalosis — review ventilation and electrolyte state";
        }
      } else {
        interpretation = `pH ${ph} within reference — compensated/normal gas exchange`;
      }
    }

    return {
      engine: "vent_brain",
      version: "2026.08.14",
      patientName: opts.patientName,
      uhid: opts.uhid,
      generatedAt: new Date().toISOString(),
      abg: {
        primaryAcidBase,
        interpretation,
        suggestions,
      },
      drivingPressure: {
        value: driving,
        alert: driving > 15,
        suggestion: driving > 15
          ? "⚠️ Driving pressure > 15 cmH2O — suggest lower tidal volume (4-6 mL/kg PBW) to reduce VILI risk"
          : `Driving pressure ${driving} cmH2O — within lung-protective range`,
      },
      weaning: {
        rsbi: rr > 0 ? Math.round((rr / Math.max(opts.tidalVolume ?? 400, 100)) * 1000) : null,
        readiness: sr >= 8 && driving <= 15 ? "READY" : "PENDING",
        score: Math.round((sr >= 8 ? 40 : 0) + (driving <= 15 ? 30 : 0) + (opts.abg ? (opts.abg.ph >= 7.35 && opts.abg.ph <= 7.45 ? 30 : 10) : 20)),
      },
      asynchrony: {
        detected: sr > rr + 5,
        note: sr > rr + 5
          ? "Patient-ventilator asynchrony suspected — consider sedation adjustment or mode change (PSV/APRV)"
          : "No asynchrony pattern detected",
      },
    };
  }
}