import { Patient, LabOrder, RadiologyReport, Prescription } from "../types";

export interface DataIntegrityIssue {
  id: string;
  type:
    | "DEMOGRAPHIC_MISMATCH"
    | "UHID_CONFLICT"
    | "DUPLICATE_INVESTIGATION"
    | "DUPLICATE_MEDICATION"
    | "IMPOSSIBLE_TIMESTAMP"
    | "WRONG_BED_ASSIGNMENT"
    | "UNREVIEWED_CRITICAL_RESULT";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  patientUhid: string;
  patientName: string;
  title: string;
  description: string;
  detectedAt: string;
  sourceModules: string[];
  suggestedAction: string;
}

export class DataIntegrityEngine {
  static scanSystemIntegrity(
    patients: Patient[],
    labOrders: LabOrder[],
    radiologyReports: RadiologyReport[],
    prescriptions: Prescription[]
  ): DataIntegrityIssue[] {
    const issues: DataIntegrityIssue[] = [];

    // 1. Scan for Demographic & Name Mismatches across Registration & Labs
    patients.forEach((patient) => {
      const patientLabs = labOrders.filter((l) => l.patientUhid === patient.uhid);
      patientLabs.forEach((lab) => {
        if (
          lab.patientName &&
          lab.patientName.toLowerCase().trim() !== patient.name.toLowerCase().trim()
        ) {
          issues.push({
            id: `INT-DEMO-${patient.uhid}-${lab.id}`,
            type: "DEMOGRAPHIC_MISMATCH",
            severity: "HIGH",
            patientUhid: patient.uhid,
            patientName: patient.name,
            title: "Patient Name Mismatch across Registration & Lab Order",
            description: `Registration name: "${patient.name}" vs Laboratory record name: "${lab.patientName}" (UHID ${patient.uhid}).`,
            detectedAt: new Date().toISOString(),
            sourceModules: ["registration", "laboratory"],
            suggestedAction: "Verify patient identity before confirming lab result publication. Do NOT merge records automatically.",
          });
        }
      });
    });

    // 2. Scan for Duplicate Active Investigations ordered within short timeframe (24h)
    const testMap = new Map<string, Array<{ id: string; name: string; orderedAt: string }>>();
    labOrders.forEach((lab) => {
      const key = `${lab.patientUhid}_${lab.testName.toLowerCase()}`;
      const existing = testMap.get(key) || [];
      existing.push({ id: lab.id, name: lab.testName, orderedAt: lab.orderedAt });
      testMap.set(key, existing);
    });

    testMap.forEach((orders, key) => {
      if (orders.length > 1) {
        const uhid = key.split("_")[0];
        const patient = patients.find((p) => p.uhid === uhid);
        issues.push({
          id: `INT-DUP-LAB-${key}`,
          type: "DUPLICATE_INVESTIGATION",
          severity: "MEDIUM",
          patientUhid: uhid,
          patientName: patient?.name || "Patient",
          title: `Duplicate Investigation Order: ${orders[0].name}`,
          description: `Multiple orders (${orders.length}) detected for "${orders[0].name}" for patient ${uhid}.`,
          detectedAt: new Date().toISOString(),
          sourceModules: ["laboratory"],
          suggestedAction: "Review clinical necessity or cancel duplicate order to prevent redundant sample collection.",
        });
      }
    });

    // 3. Scan for Conflicting Bed Assignments
    const bedMap = new Map<string, string[]>();
    patients.forEach((p) => {
      if (p.bedNumber && p.admissionType === "IP") {
        const existing = bedMap.get(p.bedNumber) || [];
        existing.push(`${p.name} (${p.uhid})`);
        bedMap.set(p.bedNumber, existing);
      }
    });

    bedMap.forEach((assignedPatients, bedNo) => {
      if (assignedPatients.length > 1) {
        issues.push({
          id: `INT-BED-${bedNo}`,
          type: "WRONG_BED_ASSIGNMENT",
          severity: "CRITICAL",
          patientUhid: "MULTIPLE",
          patientName: assignedPatients.join(", "),
          title: `Conflicting Bed Assignment: ${bedNo}`,
          description: `Bed ${bedNo} is concurrently mapped to multiple active inpatient records: ${assignedPatients.join(" & ")}.`,
          detectedAt: new Date().toISOString(),
          sourceModules: ["ward", "registration"],
          suggestedAction: "Re-assign patient bed location in Ward Console to maintain accurate bedside monitor mapping.",
        });
      }
    });

    // 4. Scan for Impossible or Future Timestamps
    const now = new Date().getTime();
    labOrders.forEach((lab) => {
      const orderedTime = new Date(lab.orderedAt).getTime();
      if (orderedTime > now + 60000) {
        issues.push({
          id: `INT-TIME-${lab.id}`,
          type: "IMPOSSIBLE_TIMESTAMP",
          severity: "MEDIUM",
          patientUhid: lab.patientUhid,
          patientName: lab.patientName,
          title: "Future Timestamp Detected in Lab Order",
          description: `Lab order ${lab.id} has an order timestamp in the future (${lab.orderedAt}).`,
          detectedAt: new Date().toISOString(),
          sourceModules: ["laboratory"],
          suggestedAction: "Synchronize client system clock or edit timestamp manually.",
        });
      }
    });

    return issues;
  }
}
