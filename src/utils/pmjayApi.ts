// PMJAY, CM Relief Fund & ABDM/ABHA API Interface Module
// Implements exact JSON API schema specifications for Telangana SHA / NHA / ABDM integration

export interface AbhaCreateRequest {
  aadhaar: string;
  mobile: string;
  hospital_hfr_id: string;
  consent: boolean;
}

export interface AbhaCreateResponse {
  abha_id: string;
  status: "success" | "failed";
  patientName?: string;
  qrPayload?: string;
  created_at: string;
}

export interface PmjayEligibilityRequest {
  abha_id: string;
  ration_card?: string;
  aadhaar?: string;
}

export interface PmjayEligibilityResponse {
  eligible: boolean;
  family_id: string;
  card_status: "generated" | "not_generated";
  headOfFamily?: string;
  schemeName: string;
  stateCode: string;
  benefitAmountTotal: number;
  benefitAmountRemaining: number;
}

export interface PmjayCardGenerateRequest {
  family_id: string;
  hospital_hfr_id: string;
  abha_id: string;
  patientName?: string;
  gender?: string;
  age?: number;
}

export interface PmjayCardGenerateResponse {
  pmjay_card_number: string;
  status: "generated";
  valid_till: string;
  qrCodeUrl?: string;
  issued_by: string;
}

export interface PmjayClaimSubmitRequest {
  pmjay_card_number: string;
  hospital_hfr_id: string;
  patient_name: string;
  abha_id: string;
  procedure_code: string;
  procedure_name: string;
  amount: number;
  documents: {
    discharge_summary: string;
    lab_reports: string[];
    surgery_notes: string;
  };
}

export interface PmjayClaimSubmitResponse {
  claim_id: string;
  status: "submitted" | "under_review" | "approved" | "credited" | "rejected";
  expected_settlement_days: number;
  submitted_at: string;
}

export interface PmjayClaimStatusResponse {
  claim_id: string;
  patient_name: string;
  status: "submitted" | "under_review" | "approved" | "credited" | "rejected";
  amount_requested: number;
  amount_credited: number;
  credited_on?: string;
  missing_documents?: string[];
  nabh_priority_bonus?: boolean;
}

export interface CmrfClaimSubmitRequest {
  patient_name: string;
  abha_id: string;
  hospital_hfr_id: string;
  procedure: string;
  amount_requested: number;
  documents: {
    income_certificate: string;
    discharge_summary: string;
    doctor_certificate: string;
  };
}

export interface CmrfClaimSubmitResponse {
  cmrf_claim_id: string;
  status: "submitted" | "under_review" | "approved" | "credited" | "rejected";
  submitted_at: string;
}

export interface PmjayClaimRecord {
  claim_id: string;
  patient_name: string;
  abha_id: string;
  pmjay_card_number: string;
  procedure: string;
  procedure_code: string;
  package_rate: number;
  claim_status: "Pending Submission" | "Submitted" | "Under Review" | "Approved" | "Credited" | "Rejected";
  amount_credited: number;
  credited_on?: string;
  submitted_on: string;
  missing_docs: string[];
  alert_level: "red" | "orange" | "green";
  cmrf_linked_id?: string;
}

export interface CmrfClaimRecord {
  cmrf_claim_id: string;
  patient_name: string;
  abha_id: string;
  procedure: string;
  amount_requested: number;
  amount_credited: number;
  status: "Under Review" | "Approved" | "Credited" | "Rejected";
  credited_on?: string;
  submitted_on: string;
  income_cert_verified: boolean;
  doctor_cert_verified: boolean;
}

export const HOSPITAL_HFR_ID = "HFR-TS-2026-542719";
export const HOSPITAL_ROHINI_ID = "ROHINI-PMB-HYD-500038";

export const initialPmjayClaims: PmjayClaimRecord[] = [
  {
    claim_id: "CLAIM-TS-2026-000789",
    patient_name: "Ravi Kumar",
    abha_id: "ABHA-9876543210",
    pmjay_card_number: "PMJAY-TS-2026-000123",
    procedure: "Coronary Artery Bypass Grafting (CABG)",
    procedure_code: "ICD10-CABG-001",
    package_rate: 150000,
    claim_status: "Credited",
    amount_credited: 150000,
    credited_on: "2026-08-10",
    submitted_on: "2026-08-02",
    missing_docs: [],
    alert_level: "green",
    cmrf_linked_id: "CMRF-TS-2026-000456",
  },
  {
    claim_id: "CLAIM-TS-2026-000790",
    patient_name: "Sita Devi",
    abha_id: "ABHA-9876543211",
    pmjay_card_number: "PMJAY-TS-2026-000124",
    procedure: "Total Knee Replacement (TKR)",
    procedure_code: "ICD10-TKR-004",
    package_rate: 120000,
    claim_status: "Under Review",
    amount_credited: 0,
    submitted_on: "2026-08-08",
    missing_docs: ["Lab reports incomplete (CBC post-op)"],
    alert_level: "orange",
  },
  {
    claim_id: "CLAIM-TS-2026-000791",
    patient_name: "Ananya Sharma",
    abha_id: "ABHA-9876543212",
    pmjay_card_number: "PMJAY-TS-2026-000125",
    procedure: "Emergency Laparoscopic Appendectomy",
    procedure_code: "ICD10-APP-002",
    package_rate: 45000,
    claim_status: "Pending Submission",
    amount_credited: 0,
    submitted_on: "2026-08-11",
    missing_docs: ["Missing signed discharge summary", "Surgeon OT notes pending"],
    alert_level: "red",
  },
  {
    claim_id: "CLAIM-TS-2026-000792",
    patient_name: "Rajesh Varma",
    abha_id: "ABHA-9876543213",
    pmjay_card_number: "PMJAY-TS-2026-000126",
    procedure: "Laparoscopic Cholecystectomy",
    procedure_code: "ICD10-CHOL-001",
    package_rate: 65000,
    claim_status: "Approved",
    amount_credited: 65000,
    credited_on: "2026-08-11",
    submitted_on: "2026-08-05",
    missing_docs: [],
    alert_level: "green",
  },
  {
    claim_id: "CLAIM-TS-2026-000793",
    patient_name: "Venkat Rao",
    abha_id: "ABHA-9876543214",
    pmjay_card_number: "PMJAY-TS-2026-000127",
    procedure: "Dialysis & Renal Management Package",
    procedure_code: "ICD10-RENAL-003",
    package_rate: 35000,
    claim_status: "Submitted",
    amount_credited: 0,
    submitted_on: "2026-08-10",
    missing_docs: [],
    alert_level: "green",
  },
];

export const initialCmrfClaims: CmrfClaimRecord[] = [
  {
    cmrf_claim_id: "CMRF-TS-2026-000456",
    patient_name: "Ravi Kumar",
    abha_id: "ABHA-9876543210",
    procedure: "Liver Transplant Support / Specialized Care",
    amount_requested: 300000,
    amount_credited: 0,
    status: "Under Review",
    submitted_on: "2026-08-04",
    income_cert_verified: true,
    doctor_cert_verified: true,
  },
  {
    cmrf_claim_id: "CMRF-TS-2026-000457",
    patient_name: "Laxmi Narayana",
    abha_id: "ABHA-9876543218",
    procedure: "Oncology Chemotherapy & Surgical Relief",
    amount_requested: 250000,
    amount_credited: 250000,
    status: "Credited",
    credited_on: "2026-08-09",
    submitted_on: "2026-07-28",
    income_cert_verified: true,
    doctor_cert_verified: true,
  },
];

// Helper API simulation functions
export async function apiCreateAbhaId(req: AbhaCreateRequest): Promise<AbhaCreateResponse> {
  await new Promise((res) => setTimeout(res, 800));
  const cleanedPhone = req.mobile.replace(/\D/g, "") || "9876543210";
  const abhaId = `ABHA-${cleanedPhone}`;
  return {
    abha_id: abhaId,
    status: "success",
    patientName: "Verified Patient",
    created_at: new Date().toISOString(),
    qrPayload: `ABDM:ABHA:${abhaId}:HFR:${req.hospital_hfr_id}:TS-2026`,
  };
}

export async function apiCheckPmjayEligibility(req: PmjayEligibilityRequest): Promise<PmjayEligibilityResponse> {
  await new Promise((res) => setTimeout(res, 700));
  return {
    eligible: true,
    family_id: `PMJAY-FAM-${Math.floor(10000 + Math.random() * 90000)}`,
    card_status: "not_generated",
    headOfFamily: "Rameshwar Rao",
    schemeName: "Ayushman Bharat PM-JAY & Aarogyasri Telangana",
    stateCode: "TS",
    benefitAmountTotal: 500000,
    benefitAmountRemaining: 465000,
  };
}

export async function apiGeneratePmjayCard(req: PmjayCardGenerateRequest): Promise<PmjayCardGenerateResponse> {
  await new Promise((res) => setTimeout(res, 900));
  const randSeq = Math.floor(100000 + Math.random() * 900000);
  const cardNum = `PMJAY-TS-2026-${randSeq}`;
  return {
    pmjay_card_number: cardNum,
    status: "generated",
    valid_till: "2030-12-31",
    issued_by: "State Health Agency (SHA) Telangana",
  };
}

export async function apiSubmitPmjayClaim(req: PmjayClaimSubmitRequest): Promise<PmjayClaimSubmitResponse> {
  await new Promise((res) => setTimeout(res, 1000));
  const claimId = `CLAIM-TS-2026-${Math.floor(100000 + Math.random() * 900000)}`;
  return {
    claim_id: claimId,
    status: "submitted",
    expected_settlement_days: 7,
    submitted_at: new Date().toISOString(),
  };
}

export async function apiSubmitCmrfClaim(req: CmrfClaimSubmitRequest): Promise<CmrfClaimSubmitResponse> {
  await new Promise((res) => setTimeout(res, 900));
  const cmrfId = `CMRF-TS-2026-${Math.floor(100000 + Math.random() * 900000)}`;
  return {
    cmrf_claim_id: cmrfId,
    status: "submitted",
    submitted_at: new Date().toISOString(),
  };
}
