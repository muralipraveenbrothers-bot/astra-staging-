// Synthetic fixtures for the isolated ASTRA staging UI. These are not copied
// from production and must never be used for clinical care or decisions.
import type { LabOrder, Patient, Prescription, RadiologyReport } from "@/types";

export const initialPatients: Patient[] = [{
  uhid: "STAGING-DEMO-001",
  mrNumber: "DEMO-MR-001",
  opIpNumber: "DEMO-OP-001",
  name: "Demo Patient",
  age: 40,
  gender: "Other",
  phone: "0000000000",
  address: "Staging fixture — no address",
  admissionType: "OP",
  department: "Demo Clinical Workspace",
  attendingDoctor: "Demo Doctor",
  queueNumber: 1,
  chiefComplaints: "Synthetic staging record",
  symptoms: ["Demo only"],
  vitals: { bp: "120/80", pulse: 72, temp: 36.8, spo2: 99, respRate: 16 },
  registrationDate: "2026-10-11",
  billStatus: "Pending",
  consultationFee: 0,
  diagnosis: "Not for clinical use",
  status: "Demo",
}];

export const initialLabOrders: LabOrder[] = [{
  id: "DEMO-LAB-001",
  patientUhid: "STAGING-DEMO-001",
  patientName: "Demo Patient",
  testName: "Staging sample order",
  category: "Hematology",
  status: "Ordered",
  orderedBy: "Demo Doctor",
  orderedAt: "2026-10-11T00:00:00.000Z",
}];

export const initialRadiologyReports: RadiologyReport[] = [{
  id: "DEMO-RAD-001",
  patientUhid: "STAGING-DEMO-001",
  patientName: "Demo Patient",
  patientAge: 40,
  patientGender: "Other",
  procedureType: "X-Ray",
  procedureName: "Staging image placeholder",
  status: "Scheduled",
  orderedAt: "2026-10-11T00:00:00.000Z",
  radiologistName: "Demo Radiology",
  templateUsed: "Staging",
  findings: "No clinical content.",
  impression: "Staging-only fixture.",
  billingAmount: 0,
}];

export const initialPrescriptions: Prescription[] = [{
  id: "DEMO-RX-001",
  patientUhid: "STAGING-DEMO-001",
  patientName: "Demo Patient",
  doctorName: "Demo Doctor",
  medicines: [],
  whoProtocolRef: "Staging only",
  evidenceCitation: "Not for clinical use",
  status: "Prescribed",
  prescribedAt: "2026-10-11T00:00:00.000Z",
  totalAmount: 0,
}];
