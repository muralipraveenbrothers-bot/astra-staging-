import { Patient, LabOrder, RadiologyReport, Prescription, PharmacyItem } from "../types";

export interface StandardPatientData {
  uhid: string;
  name: string;
  age: number;
  gender: string;
  location: string;
  admissionType: string;
  attendingDoctor: string;
  vitals: {
    bp: string;
    pulse: number;
    temp: number;
    spo2: number;
    respRate: number;
  };
  chiefComplaints: string;
  symptoms: string[];
  bedNumber?: string;
  admittedDate?: string;
  insuranceProvider?: string;
  abhaId?: string;
  isMLC?: boolean;
}

export class PatientDataAdapter {
  static adapt(patient: Patient): StandardPatientData {
    return {
      uhid: patient.uhid || "UNKNOWN",
      name: patient.name || "Unnamed Patient",
      age: patient.age || 0,
      gender: patient.gender || "Other",
      location: patient.bedNumber || (patient.admissionType === "OP" ? "OPD Clinic" : "Ward Bed"),
      admissionType: patient.admissionType || "OP",
      attendingDoctor: patient.attendingDoctor || "Duty Medical Officer",
      vitals: patient.vitals || { bp: "120/80", pulse: 72, temp: 98.6, spo2: 98, respRate: 16 },
      chiefComplaints: patient.chiefComplaints || "Routine evaluation",
      symptoms: patient.symptoms || [],
      bedNumber: patient.bedNumber,
      admittedDate: patient.admittedDate || patient.registrationDate,
      insuranceProvider: patient.insuranceProvider,
      abhaId: patient.abhaId,
      isMLC: patient.isMLC,
    };
  }
}

export class ClinicalDataAdapter {
  static getPatientSummary(patient: Patient, labOrders: LabOrder[], radiologyReports: RadiologyReport[], prescriptions: Prescription[]) {
    const patientLabs = labOrders.filter((l) => l.patientUhid === patient.uhid);
    const patientRad = radiologyReports.filter((r) => r.patientUhid === patient.uhid);
    const patientRx = prescriptions.filter((p) => p.patientUhid === patient.uhid);

    const criticalLabs = patientLabs.filter((l) => l.criticalFlag || l.status === "Processing");
    const activeMeds = patientRx.flatMap((p) => p.medicines);

    return {
      patient: PatientDataAdapter.adapt(patient),
      labCount: patientLabs.length,
      criticalLabCount: criticalLabs.length,
      radiologyCount: patientRad.length,
      prescriptionCount: patientRx.length,
      activeMedsCount: activeMeds.length,
    };
  }
}

export class LabDataAdapter {
  static getPendingAndCritical(labOrders: LabOrder[]) {
    return {
      pending: labOrders.filter((l) => l.status !== "Completed"),
      critical: labOrders.filter((l) => l.criticalFlag),
      completed: labOrders.filter((l) => l.status === "Completed"),
    };
  }
}

export class RadiologyDataAdapter {
  static getReportsByPatient(radiologyReports: RadiologyReport[], uhid: string) {
    return radiologyReports.filter((r) => r.patientUhid === uhid);
  }
}

export class MedicationDataAdapter {
  static getActivePrescriptions(prescriptions: Prescription[], uhid: string) {
    return prescriptions.filter((p) => p.patientUhid === uhid);
  }
}

export class OTDataAdapter {
  static getOTCasesForDoctor(doctorName: string) {
    return [
      {
        id: "OT-2026-001",
        procedure: "Total Knee Replacement (TKR)",
        patientUhid: "UHID-2026-8801",
        patientName: "Rajesh Kumar",
        surgeon: doctorName,
        otNumber: "OT-01",
        status: "Recovery",
        progress: 85,
        delayMins: 0,
      },
      {
        id: "OT-2026-002",
        procedure: "Laparoscopic Cholecystectomy",
        patientUhid: "UHID-2026-8802",
        patientName: "Ananya Sharma",
        surgeon: doctorName,
        otNumber: "OT-02",
        status: "Surgery",
        progress: 60,
        delayMins: 15,
      },
    ];
  }
}

export class NursingDataAdapter {
  static getNursingObservations(uhid: string) {
    return [
      {
        timestamp: "07:30 AM",
        nurseName: "Sr. Kavitha",
        note: "Patient reported mild dyspnea overnight. SpO2 recorded 91% on room air, placed on 2L O2 nasal cannula.",
        vitalSnapshot: "BP 130/85, HR 92, SpO2 95% on 2L O2",
      },
      {
        timestamp: "03:15 AM",
        nurseName: "Sr. Anitha",
        note: "Slept well after analgesia. No complaints of severe pain.",
        vitalSnapshot: "BP 122/78, HR 78, SpO2 97%",
      },
    ];
  }
}

export class TaskDataAdapter {
  static getTaskSummary() {
    return {
      totalActive: 6,
      criticalOverdue: 2,
      highPriority: 3,
      routine: 1,
    };
  }
}

export class BillingDataAdapter {
  static getDischargeClearanceStatus(patient: Patient) {
    return {
      uhid: patient.uhid,
      name: patient.name,
      doctorClearance: true,
      nursingClearance: true,
      pharmacyClearance: patient.billStatus === "Paid",
      labClearance: true,
      finalBillStatus: patient.billStatus,
      isPmjayCashless: !!patient.insuranceProvider?.includes("PMJAY"),
    };
  }
}
