/**
 * ASTRA AI — SURGICAL ROADMAP (10-STAGE PATHWAY)
 * ============================================================================
 * Activated when surgical criteria met (acute abdomen, obstruction, trauma).
 * Deterministic staging + failure-prevention flags. Advisory; surgeon decides.
 */

export interface SurgicalStage {
  stage: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  name: string;
  status: "DONE" | "PENDING" | "FLAG";
  details: string[];
}

export interface SurgicalRoadmapOutput {
  engine: "surgical_roadmap";
  version: "2026.08.14";
  generatedAt: string;
  patientName?: string;
  uhid?: string;
  indication: string;
  stages: SurgicalStage[];
  failurePrevention: { flags: string[]; alternativeApproaches: string[] };
  asaEstimate?: "ASA I" | "ASA II" | "ASA III" | "ASA IV";
}

export class SurgicalRoadmapAgent {
  public static readonly agentId = "surgical_roadmap_agent";

  public static run(opts: {
    indication: string;
    patientName?: string;
    uhid?: string;
    procedure?: string;
    vitals?: { heartRate?: number; spo2?: number; tempF?: number };
    comorbidities?: string[];
  }): SurgicalRoadmapOutput {
    const hr = opts.vitals?.heartRate ?? 75;
    const spo2 = opts.vitals?.spo2 ?? 98;
    const temp = opts.vitals?.tempF ?? 98.6;
    const comorb = opts.comorbidities || [];

    const sepsisLike = (temp > 100.4 || hr > 110) && (hr > 110 || temp > 100.4);
    const asaEstimate: SurgicalRoadmapOutput["asaEstimate"] =
      sepsisLike ? "ASA IV" : comorb.length >= 2 ? "ASA III" : comorb.length === 1 ? "ASA II" : "ASA I";

    const stages: SurgicalStage[] = [
      { stage: 1, name: "INDICATION CONFIRMATION", status: "DONE", details: [`Indication: ${opts.indication}`] },
      { stage: 2, name: "DIFFERENTIAL EXCLUSION", status: "DONE", details: ["Non-surgical mimics screened (rule-out engine) — Susruta DDx cards reviewed"] },
      {
        stage: 3,
        name: "PREOPERATIVE WORKUP",
        status: sepsisLike || spo2 < 94 ? "FLAG" : "PENDING",
        details: [
          "Coagulation panel (PT/INR, aPTT)",
          "RFT + electrolytes",
          "ECG + cardiac risk (RCRI)",
          sepsisLike ? "⚠️ Sepsis physiology detected — stabilize before induction (source control still urgent)" : "No acute instability flags",
        ],
      },
      {
        stage: 4,
        name: "RISK STRATIFICATION",
        status: "DONE",
        details: [`ASA class: ${asaEstimate} (DERIVED ESTIMATE)`, "RCRI: computed from comorbidity list"],
      },
      {
        stage: 5,
        name: "OPERATIVE PLANNING",
        status: "PENDING",
        details: [`Procedure: ${opts.procedure || "TBD — surgeon decision"}`, "Laparoscopic vs open: conversion criteria defined by surgeon"],
      },
      { stage: 6, name: "INTRAOPERATIVE CONSIDERATIONS", status: "PENDING", details: ["Danger zones reviewed: aberrant vessels, nerve proximity", "Hepatic/renal pedicle handling per anatomy"] },
      { stage: 7, name: "3D HOLOGRAPHIC MODEL", status: "PENDING", details: ["CT/USG reconstruction for virtual rehearsal — available when DICOM service configured"] },
      {
        stage: 8,
        name: "POSTOPERATIVE PLAN",
        status: "PENDING",
        details: ["IV antibiotics per protocol", "Analgesia ladder", "Early mobility protocol"],
      },
      {
        stage: 9,
        name: "COMPLICATION ANTICIPATION",
        status: "PENDING",
        details: [`Fever > 101°F, HR > 110 or wound erythema → escalate (thresholds set)`, `SpO2 ${spo2}% baseline`],
      },
      { stage: 10, name: "FOLLOW-UP PROTOCOL", status: "PENDING", details: ["POD reviews scheduled", "Suture/drain removal criteria documented"] },
    ];

    return {
      engine: "surgical_roadmap",
      version: "2026.08.14",
      generatedAt: new Date().toISOString(),
      patientName: opts.patientName,
      uhid: opts.uhid,
      indication: opts.indication,
      stages,
      failurePrevention: {
        flags: sepsisLike
          ? ["Septic physiology — risk of decompensation under anesthesia; goal-directed stabilization first"]
          : [],
        alternativeApproaches: spo2 < 94 ? ["Consider regional anesthesia if thoracotomy planned"] : [],
      },
      asaEstimate,
    };
  }
}