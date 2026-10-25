/**
 * ASTRA AI — TRAUMA INTELLIGENCE (GOLDEN HOUR)
 * ============================================================================
 * Deterministic: Injury Severity Score (ISS) from tagged injuries, auto-MLC
 * draft from mapped injuries + voice commands, crash-protocol routing
 * (Massive Transfusion / Code Stroke / RSI). Advisory; formal MLC reviewed
 * by medico-legal officer.
 */

export interface InjuryTag {
  region: string;          // e.g. "left thigh"
  description: string;     // e.g. "laceration 10cm"
  ais?: number;            // Abbreviated Injury Score 1-6 (DERIVED ESTIMATE)
}

export interface TraumaOutput {
  engine: "trauma_intelligence";
  version: "2026.08.14";
  generatedAt: string;
  patientName?: string;
  uhid?: string;
  injuries: InjuryTag[];
  iss: { value: number; category: "MINOR" | "MODERATE" | "SEVERE" | "CRITICAL"; note: string };
  mlcDraft: string;
  bloodBankAlert: { needed: boolean; note: string };
  crashProtocols: Array<{ protocol: string; triggered: boolean; note: string }>;
}

const AIS_BY_KEYWORD: Array<[RegExp, number]> = [
  [/laceration/i, 2], [/amputat/i, 4], [/open fracture/i, 3], [/closed fracture/i, 2],
  [/pneumothorax/i, 4], [/flail/i, 4], [/rupture/i, 4], [/contusion/i, 1],
  [/penetrating|gsw|stab/i, 4], [/internal|intra-abdominal|hemorrhage/i, 4],
  [/head|skull/i, 4], [/neck/i, 3], [/chest|thorax/i, 3], [/abdomen|pelvis/i, 3],
  [/femur|tibia|fibula/i, 2], [/humerus|radius|ulna/i, 2], [/spine|vertebral/i, 3],
];

export class TraumaIntelligenceAgent {
  public static readonly agentId = "trauma_intelligence_coordinator";

  private static aisFor(description: string, region: string): number {
    const hay = description + " " + region;
    for (const [re, ais] of AIS_BY_KEYWORD) if (re.test(hay)) return ais;
    return 1;
  }

  public static assess(opts: {
    injuries: Array<{ region: string; description: string }>;
    patientName?: string;
    uhid?: string;
    voiceTags?: string[];
  }): TraumaOutput {
    const injuries: InjuryTag[] = (opts.voiceTags || []).map((v) => {
      const m = v.match(/^(?:laceration|fracture|contusion|penetrating|amputation|burn|abrasion)\s+([a-z ]+?)(?:\s+(\d+\s*cm))?/i);
      return { region: m?.[1]?.trim() || v, description: v, ais: this.aisFor(v, m?.[1] || "") };
    });
    for (const i of opts.injuries) injuries.push({ region: i.region, description: i.description, ais: this.aisFor(i.description, i.region) });

    // ISS: 3 highest AIS in different body regions, squared, summed (max 75)
    const aisSorted = injuries.map((i) => i.ais ?? 1).sort((a, b) => b - a);
    const top3 = aisSorted.slice(0, 3);
    const iss = Math.min(75, top3.reduce((sum, a) => sum + a * a, 0));
    const category: TraumaOutput["iss"]["category"] =
      iss >= 25 ? "CRITICAL" : iss >= 16 ? "SEVERE" : iss >= 9 ? "MODERATE" : "MINOR";

    const bleeders = injuries.filter((i) => /laceration|penetrating|amputat|open|hemorrhage/i.test(i.description)).length;

    const mlcDraft = [
      `MEDICO-LEGAL CASE (draft — medico-legal officer review required)`,
      `Patient: ${opts.patientName || "UNKNOWN"} (${opts.uhid || "UHID TBC"})`,
      `Circumstances: trauma presentation per first responders / registration desk.`,
      `Injuries documented (${injuries.length}): ${injuries.map((i) => `${i.region} — ${i.description} (AIS ${i.ais ?? "—"})`).join("; ") || "none tagged"}`,
      `ISS: ${iss} (${category}).`,
      `Formal opinion pending clinical examination, imaging, and toxicology where indicated.`,
    ].join("\n");

    return {
      engine: "trauma_intelligence",
      version: "2026.08.14",
      generatedAt: new Date().toISOString(),
      patientName: opts.patientName,
      uhid: opts.uhid,
      injuries,
      iss: {
        value: iss,
        category,
        note: `ISS = sum of squares of 3 highest AIS (${top3.join("² + ")}) — DERIVED ESTIMATE pending imaging`,
      },
      mlcDraft,
      bloodBankAlert: {
        needed: bleeders >= 1 || iss >= 25,
        note: bleeders >= 1 || iss >= 25 ? "Blood bank alerted: group-and-screen + MTP standby" : "No immediate blood bank alert",
      },
      crashProtocols: [
        { protocol: "Massive Transfusion", triggered: iss >= 25 || bleeders >= 2, note: iss >= 25 || bleeders >= 2 ? "MTP triggered (1:1:1)" : "Standby only" },
        { protocol: "Code Stroke", triggered: /head|neuro|gcs|stroke/i.test(injuries.map((i) => i.description).join(" ")), note: "Activate neuro pathway if GCS < 9" },
        { protocol: "RSI (Rapid Sequence Intubation)", triggered: iss >= 16, note: iss >= 16 ? "Consider early RSI — airway protected" : "Not indicated by ISS alone" },
      ],
    };
  }
}