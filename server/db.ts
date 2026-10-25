/**
 * Astra AI — Canonical Hospital Data Fabric & Audit Engine
 * ==========================================================
 * Single source of truth for hospital operations.
 * Thread-safe persistent file store under data/hospital.json & data/hospital_profile.json.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = process.env.ASTRA_DATA_DIR?.trim()
  || path.join(process.cwd(), "data");
const DB_FILE = process.env.ASTRA_HOSPITAL_DB_PATH?.trim()
  || path.join(DATA_DIR, "hospital.json");
const PROFILE_FILE = process.env.ASTRA_HOSPITAL_PROFILE_PATH?.trim()
  || path.join(DATA_DIR, "hospital_profile.json");
const AUDIT_FILE = process.env.ASTRA_AUDIT_PATH?.trim()
  || path.join(DATA_DIR, "audit.jsonl");
const SEED_DB_FILE = path.join(process.cwd(), "data", "seed", "hospital.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  category: string;
  status: "SUCCESS" | "DENIED" | "FAILED" | "CONFIRMATION_REQUIRED";
  details: string;
  patientId?: string;
  ip?: string;
}

export interface HospitalProfile {
  name: string;
  tagline: string;
  logoUrl?: string;
  address: string;
  district: string;
  state: string;
  pin: string;
  phone: string;
  email: string;
  website: string;
  hospitalType: "Multi-Speciality" | "Tertiary Care" | "Teaching Hospital" | "Community Hospital" | "Single-Speciality";
  hfrId: string;
  rohiniCode: string;
  abdmFacilityId: string;
  pmjayProviderId: string;
  nabhStatus: "Accredited (Full)" | "Entry-Level" | "In-Process" | "Not Applicable";
  cmrfStatus: "Empaneled" | "Non-Empaneled";
  gstin: string;
  pan: string;
  mode: "PRODUCTION" | "DEMO";
  workingHours: {
    opHours: string;
    ipVisitingHours: string;
    emergency24x7: boolean;
  };
  departments: string[];
  bedCapacity: {
    general: number;
    semiPrivate: number;
    private: number;
    icu: number;
    emergency: number;
    total: number;
  };
  otTheatres: {
    id: string;
    name: string;
    type: string;
    laminarFlow: boolean;
  }[];
  activeDoctors: {
    id: string;
    name: string;
    qualifications: string;
    speciality: string;
    regNumber: string;
  }[];
}

export const DEFAULT_HOSPITAL_PROFILE: HospitalProfile = {
  name: "PM BROTHERS MULTI SPECIALITY HOSPITAL",
  tagline: "Centre for Clinical Excellence, Robotic Surgery & Advanced Critical Care",
  address: "Plot 12-14, Health City Corridor, Kothagudem Road",
  district: "Bhadradri Kothagudem",
  state: "Telangana",
  pin: "507101",
  phone: "+91 98480 23456 / 08744-245678",
  email: "care@pmbrothershospital.com",
  website: "https://pmbrothershospital.com",
  hospitalType: "Multi-Speciality",
  hfrId: "HFR123456",
  rohiniCode: "ROHINI-PMB-HYD-500038",
  abdmFacilityId: "IN3600084920",
  pmjayProviderId: "PMJAY-TS-2026-000123",
  nabhStatus: "Accredited (Full)",
  cmrfStatus: "Empaneled",
  gstin: "36AAACP9842M1Z4",
  pan: "AAACP9842M",
  mode: "PRODUCTION",
  workingHours: {
    opHours: "08:00 AM - 08:00 PM (Mon-Sat)",
    ipVisitingHours: "04:00 PM - 07:00 PM",
    emergency24x7: true,
  },
  departments: [
    "General Medicine & Critical Care",
    "Cardiology & Interventional",
    "Orthopaedics & Joint Replacement",
    "General & Laparoscopic Surgery",
    "Obstetrics & Gynaecology",
    "Paediatrics & Neonatology",
    "Radiology & Imaging",
    "Clinical Laboratory",
    "Emergency & Trauma",
    "Dialysis & Nephrology",
  ],
  bedCapacity: {
    general: 20,
    semiPrivate: 12,
    private: 8,
    icu: 6,
    emergency: 4,
    total: 50,
  },
  otTheatres: [
    { id: "OT-01", name: "Major OT 1 (Orthopaedics / Joint Replacement)", type: "Major", laminarFlow: true },
    { id: "OT-02", name: "Major OT 2 (Laparoscopy / General Surgery)", type: "Major", laminarFlow: true },
    { id: "OT-03", name: "Emergency / Septic OT", type: "Emergency", laminarFlow: false },
  ],
  activeDoctors: [
    { id: "DOC-01", name: "Dr. Murali Praveen, M.D.", qualifications: "MBBS, MD (General Medicine), FCCP", speciality: "Internal Medicine & Critical Care", regNumber: "TSMC-64821" },
    { id: "DOC-02", name: "Dr. S. Reddy, M.S.", qualifications: "MBBS, MS (Orthopaedics), M.Ch", speciality: "Orthopaedics & Joint Replacement", regNumber: "TSMC-52119" },
    { id: "DOC-03", name: "Dr. Ananya Rao, M.D.", qualifications: "MBBS, MD (Pulmonology)", speciality: "Pulmonary Medicine & ICU", regNumber: "TSMC-78904" },
    { id: "DOC-04", name: "Dr. Nitin Deshmukh, M.D.", qualifications: "MBBS, MD (Radiodiagnosis)", speciality: "Radiology & Imaging", regNumber: "TSMC-49231" },
  ],
};

export interface Patient {
  id: string;
  uhid: string;
  name: string;
  age: number;
  gender: "male" | "female" | "other";
  phone: string;
  department: string;
  admissionStatus: "outpatient" | "inpatient" | "emergency" | "discharged";
  /** Casualty flag used by the workflow emergency override. */
  casualty?: boolean;
  bedNumber?: string;
  ward?: string;
  registeredAt: string;
  chiefComplaint: string;
  diagnosis?: string;
  allergies?: string[];
  pmjayBeneficiary?: boolean;
  abhaId?: string;
  insuranceProvider?: string;
  insurancePolicyNo?: string;
  vitals?: {
    spo2: number;
    heartRate: number;
    bpSys: number;
    bpDia: number;
    tempF: number;
    respRate: number;
    recordedAt: string;
  }[];
}

export type BillingServiceCategory = "registration" | "consultation" | "pharmacy" | "laboratory" | "radiology" | "ward" | "procedure" | "surgery" | "dressing" | "other";
export interface BillingCharge { id: string; category: BillingServiceCategory; description: string; amount: number; department: string; sourceRef?: string; createdAt: string; createdBy: string }
export interface BillingPayment { id: string; amount: number; mode: "cash" | "upi" | "card" | "bank" | "insurance"; reference?: string; receivedAt: string; receivedBy: string }
export interface BillingAdjustment { id: string; amount: number; reason: string; createdAt: string; createdBy: string }
export interface BillingReminder { id: string; channel: "in_app"; message: string; createdAt: string; createdBy: string; status: "delivered" }
export interface BillingRecord {
  id: string; billNumber: string; patientId: string; patientName: string; uhid: string;
  totalAmount: number; paidAmount: number; status: "pending" | "cleared" | "insurance_pending";
  /** Set when care proceeds before payment. Display text is "pending – emergency". */
  settlementLabel?: string;
  pharmacyCleared: boolean; labCleared: boolean; doctorCleared: boolean; isPmjayCashless: boolean;
  createdAt: string; updatedAt?: string; charges?: BillingCharge[]; payments?: BillingPayment[]; adjustments?: BillingAdjustment[]; reminders?: BillingReminder[];
}

export interface HospitalOrder {
  id: string;
  patientId: string;
  patientName: string;
  uhid: string;
  category: "pharmacy" | "laboratory" | "radiology" | "nursing" | "diet";
  item: string;
  dosageOrSpec?: string;
  frequency?: string;
  priority: "routine" | "urgent" | "stat";
  status:
    | "pending"
    | "sample_collected"
    | "processing"
    | "completed"
    | "dispensed"
    | "cancelled"
    // n8n hospital-bus states (golden path): CREATED→SENT→RECEIVED→ACKNOWLEDGED→IN_PROGRESS→COMPLETED
    | "sent"
    | "received"
    | "acknowledged"
    | "in_progress";
  orderedBy: string;
  orderedAt: string;
  completedAt?: string;
  result?: string;
  isCritical?: boolean;
  // n8n acknowledgement provenance (idempotent consumer record)
  sentAt?: string;
  receivedAt?: string;
  acknowledgedAt?: string;
  ackSource?: string;
  correlationId?: string;
  idempotencyKey?: string;
}

export interface Bed {
  id: string;
  bedNumber: string;
  ward: string;
  type: "general" | "semi-private" | "private" | "icu" | "emergency";
  status: "vacant" | "occupied" | "cleaning" | "maintenance";
  patientId?: string;
  patientName?: string;
  assignedAt?: string;
  ventilatorActive?: boolean;
  ventilatorMode?: string;
  nurseCallActive?: boolean;
}

export interface PharmacyItem {
  id: string;
  name: string;
  brand: string;
  salt: string;
  category: string;
  stock: number;
  reorderLevel: number;
  unitPrice: number;
  mrp: number;
  batchNo: string;
  expiryDate: string;
  supplier: string;
  rack: string;
}

export interface OTCase {
  id: string;
  uhid: string;
  patientName: string;
  age: number;
  gender: string;
  procedureName: string;
  icd10Code: string;
  theatreId: string;
  theatreName: string;
  surgeon: string;
  anesthetist: string;
  scheduledTime: string;
  stage: "scheduled" | "pre_op_ready" | "patient_ready" | "in_ot" | "anaesthesia" | "surgery" | "recovery" | "transferred";
  checklistVerified: boolean;
  delayMinutes: number;
  delayReason?: string;
  turnoverMinutes: number;
  startedAt?: string;
  endedAt?: string;
}

export interface AttentionItem {
  id: string;
  severity: "critical" | "high" | "warning" | "info";
  category: "clinical" | "pharmacy" | "billing" | "ot" | "lab" | "insurance";
  title: string;
  detail: string;
  patientName?: string;
  uhid?: string;
  bed?: string;
  ageText: string;
  owner: string;
  recommendedAction: string;
  status: "UNRESOLVED" | "ACKNOWLEDGED" | "ASSIGNED" | "ESCALATED" | "RESOLVED";
}

export interface HospitalStore {
  patients: Patient[];
  beds: Bed[];
  orders: HospitalOrder[];
  pharmacyInventory: PharmacyItem[];
  otCases: OTCase[];
  tasks: {
    id: string;
    title: string;
    description: string;
    department: string;
    assignedToRole: string;
    patientId?: string;
    priority: "low" | "medium" | "high" | "urgent";
    status: "pending" | "in_progress" | "completed";
    createdAt: string;
  }[];
  bills: BillingRecord[];
  attentionItems: AttentionItem[];
}

const DEFAULT_STORE: HospitalStore = {
  patients: [
    {
      id: "P001",
      uhid: "UHID-2026-8801",
      name: "Rajesh Kumar",
      age: 48,
      gender: "male",
      phone: "+91 98480 12345",
      department: "Internal Medicine & Critical Care",
      admissionStatus: "inpatient",
      bedNumber: "ICU-03",
      ward: "Intensive Care Unit",
      registeredAt: new Date(Date.now() - 36 * 3600000).toISOString(),
      chiefComplaint: "High grade fever for 3 days, productive cough, severe retro-orbital headache, chills, SpO2 91%.",
      diagnosis: "Severe Community Acquired Pneumonia & Dengue Screening",
      allergies: ["Penicillin"],
      pmjayBeneficiary: true,
      abhaId: "ABHA-9876543210",
      insuranceProvider: "PMJAY Ayushman Bharat / Star Health",
      vitals: [
        {
          spo2: 91,
          heartRate: 104,
          bpSys: 110,
          bpDia: 70,
          tempF: 101.8,
          respRate: 26,
          recordedAt: new Date(Date.now() - 15 * 60000).toISOString(),
        },
      ],
    },
    {
      id: "P002",
      uhid: "UHID-2026-8802",
      name: "Ananya Sharma",
      age: 38,
      gender: "female",
      phone: "+91 98481 67890",
      department: "Pulmonology & ICU",
      admissionStatus: "inpatient",
      bedNumber: "ICU-04",
      ward: "Intensive Care Unit",
      registeredAt: new Date(Date.now() - 18 * 3600000).toISOString(),
      chiefComplaint: "Acute shortness of breath, bilateral lower lobe crepitations, desaturating on room air.",
      diagnosis: "Acute Respiratory Distress Syndrome (ARDS) secondary to Atypical Pneumonitis",
      allergies: ["Sulfa Drugs"],
      pmjayBeneficiary: false,
      insuranceProvider: "Star Health Insurance",
      vitals: [
        {
          spo2: 88,
          heartRate: 118,
          bpSys: 95,
          bpDia: 60,
          tempF: 103.1,
          respRate: 30,
          recordedAt: new Date(Date.now() - 4 * 60000).toISOString(),
        },
      ],
    },
    {
      id: "P003",
      uhid: "UHID-2026-8803",
      name: "Vikram Reddy",
      age: 29,
      gender: "male",
      phone: "+91 98482 11223",
      department: "Orthopaedics & Trauma",
      admissionStatus: "inpatient",
      bedNumber: "Ward-B-02",
      ward: "General Surgical Ward",
      registeredAt: new Date(Date.now() - 8 * 3600000).toISOString(),
      chiefComplaint: "Road traffic accident, closed fracture right femur, multiple soft tissue contusions.",
      diagnosis: "Fracture Shaft of Femur (Right) - Pre-Op ORIF",
      allergies: [],
      pmjayBeneficiary: true,
      vitals: [
        {
          spo2: 98,
          heartRate: 84,
          bpSys: 124,
          bpDia: 80,
          tempF: 98.6,
          respRate: 18,
          recordedAt: new Date(Date.now() - 60 * 60000).toISOString(),
        },
      ],
    },
    {
      id: "P004",
      uhid: "UHID-2026-8804",
      name: "Sunita Reddy",
      age: 52,
      gender: "female",
      phone: "+91 98483 33445",
      department: "Gastroenterology & Endoscopy",
      admissionStatus: "outpatient",
      registeredAt: new Date().toISOString(),
      chiefComplaint: "Post-prandial right upper quadrant pain, dyspepsia, intermittent nausea.",
      diagnosis: "Cholelithiasis with Chronic Cholecystitis",
      allergies: [],
      vitals: [
        {
          spo2: 99,
          heartRate: 76,
          bpSys: 130,
          bpDia: 85,
          tempF: 98.4,
          respRate: 16,
          recordedAt: new Date().toISOString(),
        },
      ],
    },
  ],
  beds: [
    { id: "B01", bedNumber: "ICU-01", ward: "Intensive Care Unit", type: "icu", status: "vacant" },
    { id: "B02", bedNumber: "ICU-02", ward: "Intensive Care Unit", type: "icu", status: "vacant" },
    { id: "B03", bedNumber: "ICU-03", ward: "Intensive Care Unit", type: "icu", status: "occupied", patientId: "P001", patientName: "Rajesh Kumar", assignedAt: "2026-08-12T10:00:00Z", ventilatorActive: true, ventilatorMode: "High Flow Nasal Cannula (HFNC)" },
    { id: "B04", bedNumber: "ICU-04", ward: "Intensive Care Unit", type: "icu", status: "occupied", patientId: "P002", patientName: "Ananya Sharma", assignedAt: "2026-08-13T04:00:00Z", ventilatorActive: true, ventilatorMode: "SIMV (Pressure Regulated)" },
    { id: "B05", bedNumber: "Ward-B-01", ward: "General Surgical Ward", type: "general", status: "vacant" },
    { id: "B06", bedNumber: "Ward-B-02", ward: "General Surgical Ward", type: "general", status: "occupied", patientId: "P003", patientName: "Vikram Reddy", assignedAt: "2026-08-13T14:00:00Z" },
    { id: "B07", bedNumber: "Suite-301", ward: "Private Deluxe Suite", type: "private", status: "cleaning" },
    { id: "B08", bedNumber: "Suite-302", ward: "Private Deluxe Suite", type: "private", status: "vacant" },
  ],
  orders: [
    {
      id: "ORD-101",
      patientId: "P001",
      patientName: "Rajesh Kumar",
      uhid: "UHID-2026-8801",
      category: "laboratory",
      item: "Complete Blood Count (CBC) + Platelet Count",
      priority: "stat",
      status: "completed",
      result: "WBC: 14,800/uL (Elevated), Platelets: 82,000/uL (Thrombocytopenia), Hb: 13.2 g/dL",
      isCritical: true,
      orderedBy: "Dr. Murali Praveen, M.D.",
      orderedAt: new Date(Date.now() - 120 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 30 * 60000).toISOString(),
    },
    {
      id: "ORD-102",
      patientId: "P001",
      patientName: "Rajesh Kumar",
      uhid: "UHID-2026-8801",
      category: "laboratory",
      item: "Dengue NS1 Antigen & IgM/IgG Antibody Combo",
      priority: "urgent",
      status: "completed",
      result: "Dengue NS1 Antigen: POSITIVE (Reactive), Dengue IgM: Negative",
      isCritical: true,
      orderedBy: "Dr. Murali Praveen, M.D.",
      orderedAt: new Date(Date.now() - 120 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 25 * 60000).toISOString(),
    },
    {
      id: "ORD-103",
      patientId: "P002",
      patientName: "Ananya Sharma",
      uhid: "UHID-2026-8802",
      category: "laboratory",
      item: "STAT Arterial Blood Gas (ABG) + Serum Electrolytes",
      priority: "stat",
      status: "processing",
      orderedBy: "Dr. Ananya Rao, M.D.",
      orderedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    },
    {
      id: "ORD-104",
      patientId: "P004",
      patientName: "Sunita Reddy",
      uhid: "UHID-2026-8804",
      category: "radiology",
      item: "USG Whole Abdomen & Pelvis",
      priority: "routine",
      status: "completed",
      result: "Cholelithiasis with 6.2 mm solitary calculus in gallbladder neck. Grade 1 Hepatic Steatosis.",
      orderedBy: "Dr. Murali Praveen, M.D.",
      orderedAt: new Date(Date.now() - 180 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 40 * 60000).toISOString(),
    },
  ],
  pharmacyInventory: [
    { id: "MED-01", name: "Inj. Ceftriaxone 1g", brand: "Monocef 1g IV", salt: "Ceftriaxone Sodium", category: "Antibiotic (Cephalosporin)", stock: 140, reorderLevel: 50, unitPrice: 58, mrp: 72, batchNo: "MNC-2026-08", expiryDate: "2027-11-30", supplier: "Aristo Pharmaceuticals", rack: "RACK-A1" },
    { id: "MED-02", name: "Inj. Paracetamol 100ml IV", brand: "Perfalgan / Febrinil IV", salt: "Paracetamol 10mg/ml", category: "Antipyretic / Analgesic", stock: 12, reorderLevel: 40, unitPrice: 85, mrp: 110, batchNo: "PB-9421", expiryDate: "2027-04-30", supplier: "Micro Labs", rack: "RACK-A3" },
    { id: "MED-03", name: "Inj. Deriphyllin 2ml", brand: "Deriphyllin Retard", salt: "Theophylline + Etofylline", category: "Bronchodilator", stock: 8, reorderLevel: 30, unitPrice: 14, mrp: 18, batchNo: "DER-1102", expiryDate: "2026-10-30", supplier: "Zydus Healthcare", rack: "RACK-B2" },
    { id: "MED-04", name: "Tab. Dolo 650mg", brand: "Dolo 650", salt: "Paracetamol 650mg", category: "Antipyretic", stock: 850, reorderLevel: 200, unitPrice: 2.1, mrp: 3.5, batchNo: "DOL-8812", expiryDate: "2028-01-31", supplier: "Micro Labs", rack: "RACK-C1" },
    { id: "MED-05", name: "Inj. Ondansetron 4mg/2ml", brand: "Emeset 2ml", salt: "Ondansetron HCl", category: "Antiemetic", stock: 18, reorderLevel: 50, unitPrice: 12, mrp: 16, batchNo: "EMT-7721", expiryDate: "2027-06-30", supplier: "Cipla Ltd", rack: "RACK-A2" },
  ],
  otCases: [
    {
      id: "OT-CASE-01",
      uhid: "UHID-2026-8801",
      patientName: "Rajesh Kumar",
      age: 48,
      gender: "Male",
      procedureName: "Total Knee Replacement (TKR - Right)",
      icd10Code: "ICD10-TKR-004",
      theatreId: "OT-01",
      theatreName: "Major OT 1 (Laminar Flow)",
      surgeon: "Dr. Murali Praveen / Dr. S. Reddy",
      anesthetist: "Dr. S. Reddy, M.D. (Anaesthesia)",
      scheduledTime: "09:00 AM",
      stage: "recovery",
      checklistVerified: true,
      delayMinutes: 0,
      turnoverMinutes: 22,
      startedAt: "09:15 AM",
      endedAt: "10:45 AM",
    },
    {
      id: "OT-CASE-02",
      uhid: "UHID-2026-8802",
      patientName: "Ananya Sharma",
      age: 38,
      gender: "Female",
      procedureName: "Laparoscopic Cholecystectomy",
      icd10Code: "ICD10-LAP-002",
      theatreId: "OT-02",
      theatreName: "Major OT 2",
      surgeon: "Dr. Murali Praveen",
      anesthetist: "Dr. S. Reddy, M.D.",
      scheduledTime: "11:30 AM",
      stage: "surgery",
      checklistVerified: true,
      delayMinutes: 15,
      delayReason: "PAC clearance & pre-op electrolyte stabilization delay (Resolved)",
      turnoverMinutes: 25,
      startedAt: "11:45 AM",
    },
    {
      id: "OT-CASE-03",
      uhid: "UHID-2026-8803",
      patientName: "Vikram Reddy",
      age: 29,
      gender: "Male",
      procedureName: "Open Reduction & Internal Fixation (ORIF Femur)",
      icd10Code: "ICD10-ORIF-009",
      theatreId: "OT-01",
      theatreName: "Major OT 1",
      surgeon: "Dr. S. Reddy, M.S.",
      anesthetist: "Dr. S. Reddy, M.D.",
      scheduledTime: "02:00 PM",
      stage: "pre_op_ready",
      checklistVerified: true,
      delayMinutes: 0,
      turnoverMinutes: 20,
    },
  ],
  tasks: [
    {
      id: "TSK-01",
      title: "Stat Arterial Blood Gas (ABG) for Ananya Sharma",
      description: "Draw arterial blood from right radial artery, analyze on GEM-Premier analyzer immediately.",
      department: "laboratory",
      assignedToRole: "lab",
      patientId: "P002",
      priority: "urgent",
      status: "in_progress",
      createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
    },
    {
      id: "TSK-02",
      title: "Reorder Injectable Paracetamol & Deriphyllin",
      description: "Stock coverage under 2 days. Generate purchase order to Micro Labs & Zydus.",
      department: "pharmacy",
      assignedToRole: "pharmacy",
      priority: "high",
      status: "pending",
      createdAt: new Date(Date.now() - 60 * 60000).toISOString(),
    },
  ],
  bills: [
    {
      id: "BILL-01",
      billNumber: "INV-2026-8801",
      patientId: "P001",
      patientName: "Rajesh Kumar",
      uhid: "UHID-2026-8801",
      totalAmount: 150000,
      paidAmount: 150000,
      status: "cleared",
      pharmacyCleared: true,
      labCleared: true,
      doctorCleared: true,
      isPmjayCashless: true,
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    },
    {
      id: "BILL-02",
      billNumber: "INV-2026-8802",
      patientId: "P002",
      patientName: "Ananya Sharma",
      uhid: "UHID-2026-8802",
      totalAmount: 45000,
      paidAmount: 0,
      status: "insurance_pending",
      pharmacyCleared: true,
      labCleared: true,
      doctorCleared: false,
      isPmjayCashless: false,
      createdAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    },
    {
      id: "BILL-03",
      billNumber: "INV-2026-8804",
      patientId: "P004",
      patientName: "Sunita Reddy",
      uhid: "UHID-2026-8804",
      totalAmount: 12500,
      paidAmount: 0,
      status: "pending",
      pharmacyCleared: false,
      labCleared: true,
      doctorCleared: true,
      isPmjayCashless: false,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
  ],
  attentionItems: [
    {
      id: "ATTN-01",
      severity: "critical",
      category: "clinical",
      title: "Patient UHID-2026-8802 (Ananya Sharma) SpO2 88% Alert",
      detail: "Bed ICU-04: SpO2 dropped below configured 90% threshold (88% recorded). Tachycardia 118 bpm.",
      patientName: "Ananya Sharma",
      uhid: "UHID-2026-8802",
      bed: "ICU-04",
      ageText: "4 mins ago",
      owner: "Nurse Mary (ICU) & Dr. Ananya Rao",
      recommendedAction: "STAT Arterial Blood Gas (ABG), Increase FiO2 on ventilator to 60%, check chest PA view.",
      status: "RESOLVED",
    },
    {
      id: "ATTN-02",
      severity: "critical",
      category: "lab",
      title: "Critical Thrombocytopenia in Rajesh Kumar (UHID-2026-8801)",
      detail: "Platelets dropped to 82,000/uL with positive Dengue NS1 Antigen. Bleeding precaution protocol active.",
      patientName: "Rajesh Kumar",
      uhid: "UHID-2026-8801",
      bed: "ICU-03",
      ageText: "25 mins ago",
      owner: "Dr. Murali Praveen, M.D.",
      recommendedAction: "Repeat Platelet count in 8 hours, cross-match 4 units Platelet Concentrates (RDP).",
      status: "RESOLVED",
    },
    {
      id: "ATTN-03",
      severity: "warning",
      category: "pharmacy",
      title: "3 Essential Medications Below Reorder Level",
      detail: "Injectable Paracetamol (12 left) & Deriphyllin (8 left) stock coverage < 2 days.",
      ageText: "1 hr ago",
      owner: "Pharmacy Manager (M. Ramakrishna)",
      recommendedAction: "Auto-generate Purchase Orders to Micro Labs & Zydus.",
      status: "UNRESOLVED",
    },
    {
      id: "ATTN-04",
      severity: "info",
      category: "insurance",
      title: "4 PMJAY Claims Awaiting Surgeon Discharge Notes",
      detail: "SHA Telangana portal claims flagged missing OT notes and implant sticker verification.",
      ageText: "1.5 hrs ago",
      owner: "Insurance Desk (PMJAY Mitra)",
      recommendedAction: "Escalate to Chief Radiologist. Prioritize ICU and ER scans. Auto-dispatch SMS to patients regarding delay.",
      status: "RESOLVED",
    },
    {
      id: "ATTN-05",
      severity: "info",
      category: "billing",
      title: "Discharge Billing Bottleneck in Ward 2",
      detail: "Patient Sunita Reddy awaiting Pharmacy clearance for final bill compilation (> 45 mins).",
      patientName: "Sunita Reddy",
      uhid: "UHID-2026-8804",
      bed: "Room-302",
      ageText: "45 mins ago",
      owner: "Billing Desk (Ramesh Gupta)",
      recommendedAction: "Push override alert to Pharmacy Manager. Dispense immediately without clearance if essential.",
      status: "RESOLVED",
    },
  ],
};

class HospitalDataFabric {
  private store: HospitalStore;
  private profile: HospitalProfile;

  constructor() {
    this.store = this.loadStore();
    this.profile = this.loadProfile();
  }

  private loadProfile(): HospitalProfile {
    try {
      if (fs.existsSync(PROFILE_FILE)) {
        return JSON.parse(fs.readFileSync(PROFILE_FILE, "utf-8"));
      }
    } catch {
      // fallback
    }
    this.saveProfile(DEFAULT_HOSPITAL_PROFILE);
    return DEFAULT_HOSPITAL_PROFILE;
  }

  public saveProfile(profile: HospitalProfile): void {
    this.profile = profile;
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(profile, null, 2), "utf-8");
  }

  public getProfile(): HospitalProfile {
    return this.profile;
  }

  private loadStore(): HospitalStore {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_STORE,
          ...parsed,
          patients: parsed.patients?.length ? parsed.patients : DEFAULT_STORE.patients,
          beds: parsed.beds?.length ? parsed.beds : DEFAULT_STORE.beds,
          orders: parsed.orders?.length ? parsed.orders : DEFAULT_STORE.orders,
          pharmacyInventory: parsed.pharmacyInventory?.length ? parsed.pharmacyInventory : DEFAULT_STORE.pharmacyInventory,
          otCases: parsed.otCases?.length ? parsed.otCases : DEFAULT_STORE.otCases,
          tasks: parsed.tasks?.length ? parsed.tasks : DEFAULT_STORE.tasks,
          bills: parsed.bills?.length ? parsed.bills : DEFAULT_STORE.bills,
          attentionItems: parsed.attentionItems?.length ? parsed.attentionItems : DEFAULT_STORE.attentionItems,
        };
      }
      if (fs.existsSync(SEED_DB_FILE)) {
        const seeded = JSON.parse(fs.readFileSync(SEED_DB_FILE, "utf-8")) as HospitalStore;
        const store = { ...DEFAULT_STORE, ...seeded };
        this.saveStore(store);
        return store;
      }
    } catch (err) {
      console.error("[DataFabric] Error reading database, using default store:", err);
    }
    this.saveStore(DEFAULT_STORE);
    return DEFAULT_STORE;
  }

  private saveStore(store: HospitalStore): void {
    try {
      const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), "utf-8");
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error("[DataFabric] Failed atomic write:", err);
    }
  }

  public getStore(): HospitalStore {
    return this.store;
  }

  // Patients
  public getPatients(): Patient[] {
    return this.store.patients;
  }

  public getPatientById(id: string): Patient | undefined {
    const clean = id.trim().toLowerCase();
    return this.store.patients.find(
      (p) =>
        p.id.toLowerCase() === clean ||
        p.uhid.toLowerCase() === clean ||
        p.name.toLowerCase().includes(clean)
    );
  }

  public createPatient(p: Omit<Patient, "id">): Patient {
    const id = `P${String(this.store.patients.length + 1).padStart(3, "0")}`;
    const newP: Patient = { ...p, id };
    this.store.patients.push(newP);
    this.saveStore(this.store);
    return newP;
  }

  public updatePatient(id: string, updates: Partial<Patient>): Patient | undefined {
    const idx = this.store.patients.findIndex((p) => p.id === id || p.uhid === id);
    if (idx === -1) return undefined;
    this.store.patients[idx] = { ...this.store.patients[idx], ...updates };
    this.saveStore(this.store);
    return this.store.patients[idx];
  }

  // Beds
  public getBeds(): Bed[] {
    return this.store.beds;
  }

  public updateBed(bedId: string, updates: Partial<Bed>): Bed | undefined {
    const idx = this.store.beds.findIndex((b) => b.id === bedId || b.bedNumber === bedId);
    if (idx === -1) return undefined;
    this.store.beds[idx] = { ...this.store.beds[idx], ...updates };
    this.saveStore(this.store);
    return this.store.beds[idx];
  }

  // Orders (CPOE)
  public getOrders(category?: string, patientId?: string): HospitalOrder[] {
    return this.store.orders.filter((o) => {
      if (category && o.category !== category) return false;
      if (patientId && o.patientId !== patientId && o.uhid !== patientId) return false;
      return true;
    });
  }

  public createOrder(order: Omit<HospitalOrder, "id" | "orderedAt" | "status">): HospitalOrder {
    let id = "";
    do {
      id = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    } while (this.store.orders.some((existing) => existing.id === id));
    const newOrder: HospitalOrder = {
      ...order,
      id,
      status: "pending",
      orderedAt: new Date().toISOString(),
    };
    this.store.orders.push(newOrder);
    this.saveStore(this.store);
    return newOrder;
  }

  public updateOrderStatus(
    orderId: string,
    status: HospitalOrder["status"],
    result?: string,
    isCritical?: boolean
  ): HospitalOrder | undefined {
    const idx = this.store.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return undefined;
    this.store.orders[idx].status = status;
    if (result !== undefined) this.store.orders[idx].result = result;
    if (isCritical !== undefined) this.store.orders[idx].isCritical = isCritical;
    if (status === "completed" || status === "dispensed") {
      this.store.orders[idx].completedAt = new Date().toISOString();
    }
    this.saveStore(this.store);
    return this.store.orders[idx];
  }

  public setBillSettlementLabel(patientKey: string, label: string): BillingRecord | undefined {
    const bill = this.store.bills.find((candidate) => candidate.uhid === patientKey || candidate.patientId === patientKey || candidate.id === patientKey || candidate.billNumber === patientKey);
    if (!bill) return undefined;
    bill.settlementLabel = label;
    bill.updatedAt = new Date().toISOString();
    this.saveStore(this.store);
    return bill;
  }

  /**
   * Record a lab/order ACKNOWLEDGEMENT from the hospital bus (n8n).
   * Golden path: CREATED→SENT→RECEIVED→ACKNOWLEDGED→IN_PROGRESS→COMPLETED.
   * Idempotent consumer: re-delivery with the SAME idempotencyKey is a no-op
   * that returns the already-acknowledged order (at-least-once delivery).
   * Unknown orderId / no idempotencyKey → undefined (fail closed, no guessing).
   */
  public recordOrderAck(
    orderId: string,
    meta: { idempotencyKey: string; acknowledgedAt: string; receivedAt?: string; ackSource?: string; correlationId?: string },
  ): { order: HospitalOrder; idempotent: boolean } | undefined {
    const order = this.store.orders.find((o) => o.id === orderId || (Boolean(meta.correlationId) && o.correlationId === meta.correlationId));
    if (!order) return undefined;
    const alreadyAcked = order.acknowledgedAt !== undefined;
    if (alreadyAcked && order.idempotencyKey === meta.idempotencyKey) {
      return { order, idempotent: true }; // exactly-once effect on re-delivery
    }
    if (alreadyAcked && order.idempotencyKey !== meta.idempotencyKey) {
      return undefined; // conflicting ack for an already-acknowledged order — refuse
    }
    order.status = "acknowledged";
    order.acknowledgedAt = meta.acknowledgedAt;
    order.receivedAt = meta.receivedAt ?? meta.acknowledgedAt;
    order.ackSource = meta.ackSource;
    order.correlationId = meta.correlationId;
    order.idempotencyKey = meta.idempotencyKey;
    this.saveStore(this.store);
    return { order, idempotent: false };
  }

  // Pharmacy Inventory
  public getPharmacyInventory(): PharmacyItem[] {
    return this.store.pharmacyInventory || [];
  }

  public updatePharmacyStock(id: string, delta: number): PharmacyItem | undefined {
    const item = this.store.pharmacyInventory.find((p) => p.id === id);
    if (!item) return undefined;
    item.stock = Math.max(0, item.stock + delta);
    this.saveStore(this.store);
    return item;
  }

  // Billing Command Ledger — append-only charges, payments and corrections.
  public getBills(): BillingRecord[] {
    return this.store.bills || [];
  }

  public createBillForPatient(patient: Patient): BillingRecord {
    const existing = this.store.bills.find((bill) => bill.patientId === patient.id && bill.status !== "cleared");
    if (existing) return existing;
    const now = new Date().toISOString();
    const bill: BillingRecord = {
      id: `BILL-${Date.now()}`,
      billNumber: `INV-${now.slice(0, 4)}-${patient.uhid.split("-").pop()}`,
      patientId: patient.id,
      patientName: patient.name,
      uhid: patient.uhid,
      totalAmount: 0,
      paidAmount: 0,
      status: "pending",
      pharmacyCleared: false,
      labCleared: false,
      doctorCleared: false,
      isPmjayCashless: Boolean(patient.pmjayBeneficiary),
      createdAt: now,
      updatedAt: now,
      charges: [], payments: [], adjustments: [], reminders: [],
    };
    this.store.bills.unshift(bill);
    this.saveStore(this.store);
    return bill;
  }

  public addBillCharge(billId: string, charge: Omit<BillingCharge, "id" | "createdAt">): BillingRecord | undefined {
    const bill = this.store.bills.find((candidate) => candidate.id === billId || candidate.billNumber === billId);
    if (!bill || !Number.isFinite(charge.amount) || charge.amount <= 0) return undefined;
    bill.charges ??= [];
    if (charge.sourceRef && bill.charges.some((item) => item.sourceRef === charge.sourceRef)) return undefined;
    bill.charges.push({ ...charge, id: `CHG-${Date.now()}`, createdAt: new Date().toISOString() });
    bill.totalAmount = Math.round((bill.totalAmount + charge.amount) * 100) / 100;
    bill.status = "pending";
    bill.updatedAt = new Date().toISOString();
    this.saveStore(this.store);
    return bill;
  }

  public recordBillPayment(billId: string, payment: Omit<BillingPayment, "id" | "receivedAt">): BillingRecord | undefined {
    const bill = this.store.bills.find((candidate) => candidate.id === billId || candidate.billNumber === billId);
    const balance = bill ? Math.max(0, bill.totalAmount - bill.paidAmount) : 0;
    if (!bill || !Number.isFinite(payment.amount) || payment.amount <= 0 || payment.amount > balance) return undefined;
    bill.payments ??= [];
    bill.payments.push({ ...payment, id: `PAY-${Date.now()}`, receivedAt: new Date().toISOString() });
    bill.paidAmount = Math.round((bill.paidAmount + payment.amount) * 100) / 100;
    bill.status = bill.paidAmount >= bill.totalAmount ? "cleared" : "pending";
    if (bill.status === "cleared" && bill.settlementLabel) bill.settlementLabel = undefined;
    bill.updatedAt = new Date().toISOString();
    this.saveStore(this.store);
    return bill;
  }

  public adjustBill(billId: string, adjustment: Omit<BillingAdjustment, "id" | "createdAt">): BillingRecord | undefined {
    const bill = this.store.bills.find((candidate) => candidate.id === billId || candidate.billNumber === billId);
    if (!bill || !Number.isFinite(adjustment.amount) || !adjustment.amount || adjustment.reason.trim().length < 8) return undefined;
    const nextTotal = Math.round((bill.totalAmount + adjustment.amount) * 100) / 100;
    if (nextTotal < bill.paidAmount || nextTotal < 0) return undefined;
    bill.adjustments ??= [];
    bill.adjustments.push({ ...adjustment, id: `ADJ-${Date.now()}`, createdAt: new Date().toISOString() });
    bill.totalAmount = nextTotal;
    bill.status = bill.paidAmount >= bill.totalAmount ? "cleared" : "pending";
    bill.updatedAt = new Date().toISOString();
    this.saveStore(this.store);
    return bill;
  }

  public recordBillReminder(billId: string, reminder: Omit<BillingReminder, "id" | "createdAt" | "status">): BillingRecord | undefined {
    const bill = this.store.bills.find((candidate) => candidate.id === billId || candidate.billNumber === billId);
    const balance = bill ? Math.max(0, bill.totalAmount - bill.paidAmount) : 0;
    if (!bill || balance <= 0 || reminder.message.trim().length < 4) return undefined;
    bill.reminders ??= [];
    bill.reminders.push({ ...reminder, id: `REM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), status: "delivered" });
    bill.updatedAt = new Date().toISOString();
    this.saveStore(this.store);
    return bill;
  }

  // OT Cases
  public getOTCases(): OTCase[] {
    return this.store.otCases || [];
  }

  public updateOTStage(caseId: string, stage: OTCase["stage"], delayMinutes?: number, delayReason?: string): OTCase | undefined {
    const otCase = this.store.otCases.find((c) => c.id === caseId);
    if (!otCase) return undefined;
    otCase.stage = stage;
    if (delayMinutes !== undefined) otCase.delayMinutes = delayMinutes;
    if (delayReason !== undefined) otCase.delayReason = delayReason;
    if (stage === "surgery" && !otCase.startedAt) otCase.startedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (stage === "recovery" && !otCase.endedAt) otCase.endedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    this.saveStore(this.store);
    return otCase;
  }

  // Attention Items
  public getAttentionItems(): AttentionItem[] {
    return this.store.attentionItems || [];
  }

  public updateAttentionStatus(id: string, status: AttentionItem["status"]): AttentionItem | undefined {
    const item = this.store.attentionItems.find((a) => a.id === id);
    if (!item) return undefined;
    item.status = status;
    this.saveStore(this.store);
    return item;
  }

  // Hospital Pulse Real Calculation
  public getHospitalPulseMetrics() {
    const patients = this.store.patients || [];
    const beds = this.store.beds || [];
    const orders = this.store.orders || [];
    const bills = this.store.bills || [];
    const pharmacyInventory = this.store.pharmacyInventory || [];
    const otCases = this.store.otCases || [];
    const attentionItems = this.store.attentionItems || [];

    const opToday = patients.filter((p) => p.admissionStatus === "outpatient").length;
    const ipCensus = patients.filter((p) => p.admissionStatus === "inpatient").length;
    const icuBeds = beds.filter((b) => b.type === "icu" && b.status === "occupied");
    const icuCensus = icuBeds.length;
    const otToday = otCases.length;
    const admissionsToday = patients.filter((p) => p.admissionStatus === "inpatient").length;
    const dischargesToday = patients.filter((p) => p.admissionStatus === "discharged").length;
    const pendingLab = orders.filter((o) => o.category === "laboratory" && o.status !== "completed").length;
    const pendingBills = bills.filter((b) => b.status === "pending" || b.status === "insurance_pending").length;
    const pharmacyAlerts = pharmacyInventory.filter((p) => p.stock <= p.reorderLevel).length;
    const pmjayClaimsInReview = bills.filter((b) => b.status === "insurance_pending").length;
    const criticalAlerts = attentionItems.filter((a) => a.severity === "critical" && a.status !== "RESOLVED").length;

    // -- Census: a pure count of what is stored -----------------------------
    // An earlier revision added fixed offsets here (+ 107 to the outpatient
    // count, + 28 to the inpatient/occupied-bed count), so a three-patient
    // store reported a nearly-full ward. Never add an offset: when the store
    // is small the dashboard must say the store is small (audit 2026-09-26 40).
    const totalBeds = this.profile?.bedCapacity?.total || 50;
    const occupiedBeds = beds.filter((b) => b.status === "occupied").length;

    // -- Hospital pulse: a deterministic penalty model over stored exceptions.
    // 100 means "no stored exception is open". This used to be the literal 100
    // captioned "Flawless Operations", printed even while critical alerts sat
    // unresolved. The weights are a published, fixed policy - not data.
    const penalties =
      criticalAlerts * 8 +
      Math.min(pendingLab, 10) +
      Math.min(pendingBills, 5) +
      Math.min(pharmacyAlerts, 5);
    const pulseScore = Math.max(0, Math.min(100, 100 - penalties));
    const pulseDrivers = [
      criticalAlerts ? `${criticalAlerts} critical alert(s)` : null,
      pendingLab ? `${pendingLab} pending lab order(s)` : null,
      pendingBills ? `${pendingBills} pending bill(s)` : null,
      pharmacyAlerts ? `${pharmacyAlerts} low-stock item(s)` : null,
    ].filter((driver): driver is string => driver !== null);
    const whyPulseScore = pulseDrivers.length
      ? `-${penalties} for ${pulseDrivers.join(", ")}`
      : "No open exceptions in the store";
    const occupancyRatePct =
      totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // Collections are the paid part of the bills touched today - never a target.
    const isToday = (iso?: string): boolean => {
      if (!iso) return false;
      const d = new Date(iso);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    };
    const todayCollectionsINR = bills
      .filter((b) => isToday(b.createdAt) || isToday(b.updatedAt))
      .reduce((sum, b) => sum + (typeof b.paidAmount === "number" ? b.paidAmount : 0), 0);

    // Theatre throughput from the stored OT records. There is no verified
    // tariff or benchmark table, so nothing here is projected or estimated.
    const turnoverSamples = otCases
      .map((c) => c.turnoverMinutes)
      .filter((n) => typeof n === "number" && Number.isFinite(n));
    const avgTurnoverMinutes = turnoverSamples.length
      ? Math.round(turnoverSamples.reduce((sum, n) => sum + n, 0) / turnoverSamples.length)
      : 0;
    const ACTIVE_OT_STAGES = new Set<OTCase["stage"]>(["in_ot", "anaesthesia", "surgery", "recovery"]);
    const theatresInUse = new Set(
      otCases.filter((c) => ACTIVE_OT_STAGES.has(c.stage)).map((c) => c.theatreId),
    );
    const theatresConfigured = this.profile?.otTheatres?.length ?? 0;
    const otUtilizationPct = theatresConfigured
      ? Math.round((theatresInUse.size / theatresConfigured) * 100)
      : 0;

    return {
      hospitalPulseIndex: pulseScore,
      whyPulseScore,
      opToday,
      ipCensus,
      icuCensus,
      otToday,
      admissionsToday,
      dischargesToday,
      pendingLab,
      pendingBills,
      pharmacyAlerts,
      pmjayClaimsInReview,
      criticalAlerts,
      totalBeds,
      occupiedBeds,
      occupancyRatePct,
      todayCollectionsINR,
      // No verified tariff or FX table exists, so the USD figure stays empty
      // rather than invented (audit 2026-09-26 34).
      todayRevenueUSD: null,
      avgTurnoverMinutes,
      otUtilizationPct,
    };
  }

  // Audit Log
  public logAudit(entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
    const newEntry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    try {
      fs.appendFileSync(AUDIT_FILE, JSON.stringify(newEntry) + "\n", "utf-8");
    } catch (err) {
      console.error("[DataFabric] Failed to append audit log:", err);
    }
    return newEntry;
  }

  public getAuditTrail(limit = 100): AuditEntry[] {
    try {
      if (!fs.existsSync(AUDIT_FILE)) return [];
      const lines = fs.readFileSync(AUDIT_FILE, "utf-8").trim().split("\n");
      return lines
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .reverse()
        .slice(0, limit);
    } catch {
      return [];
    }
  }
}

export const db = new HospitalDataFabric();
