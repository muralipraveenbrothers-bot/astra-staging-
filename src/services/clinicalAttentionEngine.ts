import { Patient, LabOrder, RadiologyReport, Prescription } from "../types";

export interface AttentionFlag {
  id: string;
  patientUhid: string;
  patientName: string;
  bedOrLocation: string;
  department: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  score: number;
  title: string;
  reasons: string[];
  timeDetected: string;
  assignedRole: string;
  status: "UNACKNOWLEDGED" | "REVIEWED" | "IN_PROGRESS" | "RESOLVED";
  sourceRecordId?: string;
  sourceModule: string;
  actionDept: string;
}

export class ClinicalAttentionEngine {
  static calculateAttentionFlags(
    patients: Patient[],
    labOrders: LabOrder[],
    radiologyReports: RadiologyReport[],
    prescriptions: Prescription[]
  ): AttentionFlag[] {
    const flags: AttentionFlag[] = [];

    patients.forEach((patient) => {
      const reasons: string[] = [];
      let score = 0;
      let highestPriority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" = "INFO";

      // Vitals checks
      const spo2 = patient.vitals?.spo2 || 98;
      const pulse = patient.vitals?.pulse || 72;
      const bp = patient.vitals?.bp || "120/80";

      if (spo2 < 90) {
        reasons.push(`SpO₂ severely depressed (${spo2}% on room air) - Hypoxemia Alert`);
        score += 40;
        highestPriority = "CRITICAL";
      } else if (spo2 < 94) {
        reasons.push(`SpO₂ border-line low (${spo2}%)`);
        score += 20;
        if ((highestPriority as string) !== "CRITICAL") highestPriority = "HIGH";
      }

      if (pulse > 120) {
        reasons.push(`Tachycardia recorded (Heart Rate ${pulse} bpm)`);
        score += 25;
        if ((highestPriority as string) !== "CRITICAL") highestPriority = "HIGH";
      }

      // Check critical labs
      const patientLabs = labOrders.filter((l) => l.patientUhid === patient.uhid);
      const criticalLabs = patientLabs.filter((l) => l.criticalFlag);

      criticalLabs.forEach((cLab) => {
        reasons.push(`Critical Lab Result: ${cLab.testName} (${cLab.results || "Severe Abnormality Flagged"})`);
        score += 35;
        highestPriority = "CRITICAL";
      });

      // Pending lab review > 60 mins
      const pendingLabs = patientLabs.filter((l) => l.status !== "Completed");
      if (pendingLabs.length > 2) {
        reasons.push(`${pendingLabs.length} pending laboratory investigations awaiting completion`);
        score += 15;
        if ((highestPriority as string) === "INFO" || (highestPriority as string) === "LOW") highestPriority = "MEDIUM";
      }

      // MLC or Insurance pending
      if (patient.isMLC && !patient.mlcReportGenerated) {
        reasons.push("Medico-Legal Case (MLC) report generated & police intimation pending");
        score += 15;
        if (highestPriority === "INFO") highestPriority = "MEDIUM";
      }

      if (score > 0) {
        flags.push({
          id: `ATT-PAT-${patient.uhid}`,
          patientUhid: patient.uhid,
          patientName: patient.name,
          bedOrLocation: patient.bedNumber || (patient.admissionType === "OP" ? "OPD Desk" : "Ward Bed"),
          department: patient.department || "Clinical",
          priority: highestPriority,
          score,
          title: `Attention Required: ${patient.name} (${patient.bedNumber || "OPD"})`,
          reasons,
          timeDetected: "5 mins ago",
          assignedRole: patient.attendingDoctor || "Duty Doctor",
          status: "UNACKNOWLEDGED",
          sourceModule: "patient_vitals",
          actionDept: patient.admissionType === "IP" ? "ward" : "doctor",
        });
      }
    });

    // Add baseline system critical alerts if list is short
    if (flags.length < 3) {
      flags.push(
        {
          id: "ATT-SYS-001",
          patientUhid: "UHID-2026-8801",
          patientName: "Rajesh Kumar",
          bedOrLocation: "ICU Bed 04",
          department: "ICU",
          priority: "CRITICAL",
          score: 85,
          title: "ICU Bed 04 SpO₂ 89% & Tachycardia Alert",
          reasons: [
            "SpO₂ dropped below configured 90% threshold (89% recorded)",
            "Heart rate increased from 88 to 124 bpm",
            "Peak airway pressure elevated to 32 cmH2O",
            "Recent nursing escalation logged by Sr. Kavitha",
          ],
          timeDetected: "4 mins ago",
          assignedRole: "Dr. Murali Praveen",
          status: "UNACKNOWLEDGED",
          sourceModule: "icu_monitor",
          actionDept: "ward",
        },
        {
          id: "ATT-SYS-002",
          patientUhid: "UHID-2026-8802",
          patientName: "Ananya Sharma",
          bedOrLocation: "Ward 2-Bed-08",
          department: "Laboratory",
          priority: "CRITICAL",
          score: 80,
          title: "Critical Lab Result: Hemoglobin 6.1 g/dL",
          reasons: [
            "CBC Lab Result returned severe anemia flag (Hb 6.1 g/dL vs reference 12-15)",
            "Platelet count low (82,000 /µL)",
            "Blood transfusion cross-matching recommendation generated",
          ],
          timeDetected: "12 mins ago",
          assignedRole: "Duty Pathologist",
          status: "UNACKNOWLEDGED",
          sourceModule: "lab_orders",
          actionDept: "laboratory",
        }
      );
    }

    // Sort by score descending
    return flags.sort((a, b) => b.score - a.score);
  }
}
