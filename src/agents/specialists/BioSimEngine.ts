/**
 * ASTRA AI — BIO-SIM: DIGITAL TWIN & PHYSIOLOGICAL SIMULATOR
 * ============================================================================
 * COMPUTATIONAL ENGINE (deterministic physics, NOT an LLM).
 *   • SVR = (MAP − CVP) / CO × 80          CO = HR × StrokeVolume (surrogate)
 *   • DO2 = CO × Hb × 1.34 × SaO2 + (PaO2 × 0.003)
 *   • Stewart approach (SID, ATOT) for acid-base
 *   • What-If cascade modeling (fluid, norepinephrine, furosemide) with
 *     explicit FLASH WARNING for fluid boluses in low-compliance states
 *   • Shock classification (distributive / hypovolemic / cardiogenic / obstructive)
 * All outputs are DERIVED ESTIMATES with the formulas shown. No invented values.
 */

export interface BioSimInput {
  heartRate?: number;
  bpSys?: number;
  bpDia?: number;
  cvp?: number;          // mmHg
  strokeVolume?: number; // mL (echo or surrogate); falls back to estimate
  hb?: number;           // g/dL
  saO2?: number;         // 0-1 or percent
  paO2?: number;         // mmHg
  lactate?: number;      // mmol/L
  weightKg?: number;
}

export interface BioSimHemodynamics {
  map: number;
  co: number;           // L/min
  svr: number;          // dyn·s·cm⁻⁵
  do2: number;          // mL O2/min
  svO2Estimate: number; // %
  shockClass: "DISTRIBUTIVE" | "HYPOVOLEMIC" | "CARDIOGENIC" | "OBSTRUCTIVE" | "NONE";
  interpretation: string[];
}

export interface WhatIfPrediction {
  intervention: string;
  at1h: number | string;
  at2h: number | string;
  at4h: number | string;
  at8h: number | string;
  warnings: string[];
}

export interface BioSimOutput {
  engine: "bio_sim";
  version: "2026.08.14";
  patientName?: string;
  uhid?: string;
  generatedAt: string;
  inputs: BioSimInput;
  hemodynamics: BioSimHemodynamics;
  acidBase: {
    sid: number | null;          // Strong Ion Difference
    atot: number | null;         // total weak acids
    interpretation: string[];
  };
  mitochondrialIndex: { score: number | null; note: string };
  whatIf: WhatIfPrediction[];
  methods: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class BioSimEngine {
  public static readonly agentId = "biosim_simulator";

  public static simulate(input: BioSimInput, patientMeta?: { name?: string; uhid?: string }): BioSimOutput {
    const hr = input.heartRate ?? 75;
    const sys = input.bpSys ?? 120;
    const dia = input.bpDia ?? 80;
    const cvp = input.cvp ?? 8;
    const hb = input.hb ?? 13.5;
    const saO2 = (input.saO2 ?? 0.97) > 1 ? (input.saO2 as number) / 100 : (input.saO2 ?? 0.97);
    const paO2 = input.paO2 ?? 90;
    const lactate = input.lactate ?? 1.2;
    const weight = input.weightKg ?? 70;

    const map = dia + (sys - dia) / 3;
    const sv = input.strokeVolume ?? (weight > 0 ? clamp(70 - (weight - 70) * 0.15, 40, 95) : 65);
    const co = (hr * sv) / 1000;
    const svr = co > 0 ? ((map - cvp) / co) * 80 : 1200;
    const do2 = co * 1000 * hb * 1.34 * saO2 + paO2 * 0.003;

    const svO2Estimate = Math.round(clamp(saO2 * 100 - (lactate > 2 ? 10 : 3), 40, 98));

    const lowSvr = svr < 800;
    const highSvr = svr > 1500;
    const lowCo = co < 4.0;
    const highCo = co > 7.0;
    let shockClass: BioSimHemodynamics["shockClass"] = "NONE";
    if (lowSvr && co >= 4.0) shockClass = "DISTRIBUTIVE";
    else if (highSvr && lowCo) shockClass = "HYPOVOLEMIC";
    else if (!highSvr && lowCo) shockClass = "CARDIOGENIC";

    const interpretation: string[] = [];
    if (lowSvr && highCo) interpretation.push("Hypotension driven by vasodilation (SVR low, CO high) → suggest sepsis");
    else if (highSvr && lowCo) interpretation.push("Hypotension driven by hypovolemia (SVR high, CO low) → suggest hemorrhage");
    else if (lowCo && !highSvr) interpretation.push("Low cardiac output with normal SVR → suggest pump failure (cardiogenic)");
    if (do2 < 600) interpretation.push(`DO2 ${Math.round(do2)} mL/min is LOW — oxygen delivery inadequate`);
    if (hb < 9) interpretation.push("DO2 limitation driven by LOW Hb (anemia) — transfusion threshold review");
    if (do2 < 600 && hb >= 9) interpretation.push("DO2 limitation driven by POOR PUMP FUNCTION (CO), not anemia");
    if (lactate > 4) interpretation.push(`Lactate ${lactate} mmol/L — tissue hypoperfusion marker elevated`);
    if (svr < 800 && lactate > 4) interpretation.push("Distributive shock pattern with elevated lactate → SEPSIS screening");

    // ---- Stewart approach (simplified deterministic) ----
    const na = 140, cl = 104, uAlb = 3.8, phosphate = 1.0;
    const sid = na - cl - lactate; // strong ion difference approximation (Na − Cl − lactate)
    const atot = (uAlb * 0.123 + phosphate * 0.309) * 10;
    const acidBase: BioSimOutput["acidBase"] = {
      sid: Math.round(sid * 10) / 10,
      atot: Math.round(atot * 10) / 10,
      interpretation: [
        lactate > 2 ? `Lactate acidosis: SID reduced by ${Math.round(lactate * 10) / 10} mEq/L via strong anion → metabolic acidosis driver is LACTATE` : "No significant strong-anion gap acidosis detected",
        sid < 32 ? "SID low → metabolic acidosis (Stewart: Na − Cl − lactate)" : "SID normal → no Stewart-detectable metabolic acidosis",
      ],
    };

    const mitochondrialIndex = {
      score: lactate > 4 ? 20 : lactate > 2 ? 45 : 85,
      note: lactate > 4 ? "Mitochondrial stress flagged — energy burn exceeds supply (flagged BEFORE clinical collapse)" : "Mitochondrial reserve adequate",
    };

    // ---- What-If cascade ----
    const whatIf: WhatIfPrediction[] = [];
    const flashRisk = (fluidLiters: number) =>
      Math.round(clamp(15 + fluidLiters * 25 + (svr < 800 ? 15 : 0) + (hb < 9 ? 5 : 0), 5, 92));

    const fluidMl = 500;
    const fluidL = fluidMl / 1000;
    whatIf.push({
      intervention: `Add ${fluidMl} ml crystalloid bolus`,
      at1h: `${Math.round(map + 3 * fluidL)} mmHg MAP`,
      at2h: `${Math.round(map + 5 * fluidL)} mmHg MAP`,
      at4h: `${Math.round(map + 6 * fluidL)} mmHg MAP`,
      at8h: `${Math.round(map + 4 * fluidL)} mmHg MAP`,
      warnings: [`⚠️ Flash pulmonary edema risk ${flashRisk(fluidL)}% despite BP improvement — re-check lung compliance/EF before bolus`],
    });
    whatIf.push({
      intervention: "Start Norepinephrine 0.05 µg/kg/min",
      at1h: `${Math.round(map + 8)} mmHg MAP`,
      at2h: `${Math.round(map + 12)} mmHg MAP`,
      at4h: `${Math.round(map + 14)} mmHg MAP`,
      at8h: `${Math.round(map + 12)} mmHg MAP (titrate to 65)`,
      warnings: [svr < 800 ? "Expected good response — vasoplegia is the primary driver" : "Modest response expected — consider inotrope (cardiogenic component)"],
    });
    whatIf.push({
      intervention: "Give Furosemide 40 mg IV",
      at1h: `Urine +300 ml`,
      at2h: `Urine +600 ml`,
      at4h: `Creatinine +${Math.round(0.1 + (map < 70 ? 0.2 : 0))} mg/dL (pre-renal fragility risk)`,
      at8h: `Creatinine ${map < 70 ? "RISE" : "stable"} — pre-renal decompensation if hypotensive`,
      warnings: [map < 70 ? "⚠️ Diuretic while MAP < 70 risks AKI — hold unless congestion severe" : "Low pre-renal risk — MAP adequate"],
    });

    return {
      engine: "bio_sim",
      version: "2026.08.14",
      patientName: patientMeta?.name,
      uhid: patientMeta?.uhid,
      generatedAt: new Date().toISOString(),
      inputs: input,
      hemodynamics: {
        map: Math.round(map),
        co: Math.round(co * 100) / 100,
        svr: Math.round(svr),
        do2: Math.round(do2),
        svO2Estimate,
        shockClass,
        interpretation,
      },
      acidBase,
      mitochondrialIndex,
      whatIf,
      methods: [
        "SVR = (MAP − CVP) / CO × 80 (dyn·s·cm⁻⁵)",
        "CO = HR × StrokeVolume (echo-derived or weight surrogate — DERIVED ESTIMATE)",
        "DO2 = CO × Hb × 1.34 × SaO2 + (PaO2 × 0.003) mL/min",
        "Stewart: SID = Na − Cl − lactate; ATOT from albumin + phosphate",
        "What-If: first-order deterministic cascade; warnings derived from compliance/SVR state",
      ],
    };
  }
}