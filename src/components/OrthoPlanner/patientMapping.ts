import type { Patient } from "@/types";
import type { PatientRecord } from "@/lib/types";

function normalizeGender(gender?: string): Patient["gender"] {
  if (gender === "Male" || gender === "Female" || gender === "Other") return gender;
  return "Other";
}

export function patientRecordToPatient(record: PatientRecord): Patient {
  return {
    uhid: record.id,
    mrNumber: record.id,
    opIpNumber: record.id,
    name: record.name,
    age: record.age ?? 0,
    gender: normalizeGender(record.gender),
    phone: record.phone ?? "",
    email: record.email,
    address: record.address ?? "",
    admissionType: record.admissionStatus === "inpatient" ? "IP" : "OP",
    department: record.department ?? "Orthopedics",
    attendingDoctor: record.linkedDoctor ?? "Orthopedics",
    queueNumber: 0,
    chiefComplaints: record.complaint ?? "",
    symptoms: record.complaint ? [record.complaint] : [],
    vitals: { bp: "", pulse: 0, temp: 0, spo2: 0, respRate: 0 },
    registrationDate: record.registeredAt,
    billStatus: "Pending",
    consultationFee: 0,
    aadhaarNumber: record.aadhaar,
    insuranceProvider: record.insurance,
  };
}
