import { Patient, LabOrder, RadiologyReport, Prescription } from "../types";

export interface BlindSpotGap {
  category: "PATIENT_IDENTITY" | "HISTORY" | "CLINICAL" | "INVESTIGATION" | "MEDICATION" | "SAFETY" | "DOCUMENTATION";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  actionRequired: string;
}

export interface BlindSpotScanResult {
  patientUhid: string;
  patientName: string;
  scannedAt: string;
  totalGaps: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  gaps: BlindSpotGap[];
}

export class BlindSpotScanner {
  static checkPatientBlindSpots(
    patient: Patient,
    labOrders: LabOrder[] = [],
    radiologyReports: RadiologyReport[] = [],
    prescriptions: Prescription[] = []
  ): BlindSpotScanResult {
    const gaps: BlindSpotGap[] = [];

    // 1. PATIENT IDENTITY
    if (!patient.dob && !patient.age) {
      gaps.push({
        category: "PATIENT_IDENTITY",
        severity: "HIGH",
        title: "Missing Date of Birth / Age Verification",
        description: "Neither DOB nor age is fully confirmed in registration profile.",
        actionRequired: "Verify DOB during clinician bedside round.",
      });
    }
    if (!patient.abhaId) {
      gaps.push({
        category: "PATIENT_IDENTITY",
        severity: "LOW",
        title: "ABHA Health ID Not Linked",
        description: "Patient profile is not linked to an ABHA (Ayushman Bharat Health Account) ID.",
        actionRequired: "Prompt patient for ABHA linking at reception or billing.",
      });
    }

    // 2. HISTORY
    if (!patient.symptoms || patient.symptoms.length === 0) {
      gaps.push({
        category: "HISTORY",
        severity: "MEDIUM",
        title: "Potential documentation gap: Specific Symptoms Unrecorded",
        description: "Symptom checklist is empty in active consultation entry.",
        actionRequired: "Document structured clinical symptoms in EMR.",
      });
    }

    // 3. CLINICAL VITALS
    const v = patient.vitals;
    if (!v || v.spo2 === 0 || !v.bp) {
      gaps.push({
        category: "CLINICAL",
        severity: "HIGH",
        title: "Incomplete Vital Signs Documentation",
        description: "SpO2 or Blood Pressure measurements are unrecorded or default.",
        actionRequired: "Request nursing staff to record fresh bedside vitals.",
      });
    }

    // 4. INVESTIGATIONS
    const patientLabs = labOrders.filter((l) => l.patientUhid === patient.uhid);
    const unreviewedCritical = patientLabs.filter((l) => l.criticalFlag && l.status !== "Completed");
    if (unreviewedCritical.length > 0) {
      gaps.push({
        category: "INVESTIGATION",
        severity: "CRITICAL",
        title: "Unreviewed Critical Laboratory Flag",
        description: `${unreviewedCritical.length} critical lab orders pending clinician validation.`,
        actionRequired: "Open Laboratory Console to review critical values.",
      });
    }

    // 5. MEDICATIONS
    const patientRx = prescriptions.filter((p) => p.patientUhid === patient.uhid);
    if (patientRx.length === 0 && patient.admissionType === "IP") {
      gaps.push({
        category: "MEDICATION",
        severity: "HIGH",
        title: "Potential documentation gap: Inpatient Medication Reconciliation Pending",
        description: "No active prescription order found for admitted inpatient.",
        actionRequired: "Review and record inpatient medication chart or home medications.",
      });
    }

    // 6. SAFETY
    if (patient.age > 65) {
      gaps.push({
        category: "SAFETY",
        severity: "MEDIUM",
        title: "Fall Risk Assessment Recommended",
        description: "Patient age > 65 years. High risk for fall in inpatient ward.",
        actionRequired: "Apply fall risk protocol & side-rail warning badge.",
      });
    }

    // 7. DOCUMENTATION
    if (patient.admissionType === "IP" && !patient.insuranceProvider && !patient.icdCodeDisease) {
      gaps.push({
        category: "DOCUMENTATION",
        severity: "MEDIUM",
        title: "Potential documentation gap: ICD-10 Primary Diagnosis Code Unspecified",
        description: "Primary ICD-10 disease code is blank on admission record.",
        actionRequired: "Select appropriate ICD-10 code in Doctor EMR.",
      });
    }

    const criticalCount = gaps.filter((g) => g.severity === "CRITICAL").length;
    const highCount = gaps.filter((g) => g.severity === "HIGH").length;
    const mediumCount = gaps.filter((g) => g.severity === "MEDIUM").length;

    return {
      patientUhid: patient.uhid,
      patientName: patient.name,
      scannedAt: new Date().toISOString(),
      totalGaps: gaps.length,
      criticalCount,
      highCount,
      mediumCount,
      gaps,
    };
  }
}
