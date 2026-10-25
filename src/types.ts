export type DepartmentType =
  | "clinical_command"
  | "command_center"
  | "doctor"
  | "ceo" | "reception" | "pharmacy" | "laboratory" | "radiology" | "ward"
  | "billing"
  | "ot"
  | "insurance"
  | "tasks"
  | "nabh"
  | "ortho_planner";

export type AIPluginType = "hermes" | "paperclip" | "ocr" | "decision_engine";

export type RegistrationType = "OP" | "IP" | "Radiology" | "Endoscopy" | "Outside";

export interface ProcedureOption {
  id: string;
  category: "USG" | "X-Ray" | "CT" | "MRI" | "Endoscopy";
  name: string;
  defaultPrice: number;
  description: string;
}

export interface Patient {
  uhid: string;
  mrNumber: string;
  opIpNumber: string;
  opdRegNo?: string;
  ipdRegNo?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  name: string;
  age: number;
  dob?: string;
  gender: "Male" | "Female" | "Other";
  phone: string;
  countryCode?: string;
  altPhone?: string;
  aadhaarNumber?: string;
  email?: string;
  address: string;
  streetAddress?: string;
  visitType?: string;
  guardianRelationship?: string;
  guardianName?: string;
  guardianPhone?: string;
  referralType?: string;
  roomType?: string;
  abhaId?: string;
  admissionType: RegistrationType;
  selectedProcedureId?: string;
  selectedProcedureName?: string;
  department: string;
  attendingDoctor: string;
  queueNumber: number;
  chiefComplaints: string;
  symptoms: string[];
  vitals: {
    bp: string;
    pulse: number;
    temp: number;
    spo2: number;
    respRate: number;
  };
  bedNumber?: string;
  admittedDate?: string;
  registrationDate: string;
  billStatus: "Paid" | "Pending";
  consultationFee: number;
  insuranceProvider?: string;
  insuranceNumber?: string;
  insurancePolicyType?: string;
  insuranceCoverageLimit?: number;
  insuranceValidity?: string;
  rohiniCode?: string;
  icdCodeDisease?: string;
  icdCodeTreatment?: string;
  claimApplicable?: boolean;
  claimStatus?: "Eligible" | "Approved" | "Under Process" | "E-Claim Sent" | "Not Applicable";
  eclaimEmailSent?: boolean;
  // MLC Case Details
  isMLC?: boolean;
  mlcNumber?: string;
  mlcNatureOfInjury?: "Grievous" | "Simple";
  mlcCaseType?: "Road Traffic Accident" | "Assault" | "Fall from Height" | "Burns" | "Poisoning" | "Other";
  mlcPoliceStation?: string;
  mlcPoliceOfficer?: string;
  mlcInjuryDescription?: string;
  mlcReportGenerated?: boolean;
  mlcMailedToPolice?: boolean;
  // Outside Patient Specifics
  isOutsidePatient?: boolean;
  selectedLabTests?: string[];
  labBillAmount?: number;
  emergencyAlarm?: boolean;
  isDispatched?: boolean;
  dispatchedAt?: string;
  dispatchMessage?: string;
  chiefComplaint?: string;
  diagnosis?: string;
  primaryDiagnosis?: string;
  condition?: string;
  doctorName?: string;
  status?: string;
  labStatus?: string;
  dispatchTargetDept?: string;
}

export interface PrintQueueItem {
  id: string;
  patientUhid: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  patientType?: "IP" | "OP" | "Outside";
  documentType: "discharge_summary" | "mlc_report" | "lab_report" | "radiology_report" | "insurance_claim_report" | "outside_lab_bill" | "cmrf_certificate";
  title: string;
  subtitle?: string;
  generatedAt: string;
  generatedBy: string;
  status: "Ready for Print" | "Printed" | "Sent via Email" | "Sent to Police" | "Sent to Insurer";
  data: any;
  recipientInfo?: {
    email?: string;
    policeStation?: string;
    insuranceProvider?: string;
    phone?: string;
  };
}

export interface RadiologyReport {
  id: string;
  patientUhid: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  procedureType: "USG" | "X-Ray" | "CT" | "MRI" | "Endoscopy";
  procedureName: string;
  status: "Scheduled" | "In-Progress" | "Finalized";
  orderedAt: string;
  completedAt?: string;
  radiologistName: string;
  templateUsed: string;
  findings: string;
  impression: string;
  scanImageUrl?: string;
  billingAmount: number;
  voiceTranscript?: string;
  isDispatched?: boolean;
}

export interface LabOrder {
  id: string;
  uhid?: string;
  patientUhid: string;
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  testName: string;
  category: "Hematology" | "Biochemistry" | "Microbiology" | "Pathology" | "Radiology" | "Immunology";
  status: "Ordered" | "Sample Collected" | "Processing" | "Completed";
  orderedBy: string;
  orderedAt: string;
  results?: string;
  reportImageUrl?: string;
  aiInterpretation?: string;
  isDispatched?: boolean;
  isOutsidePatient?: boolean;
  outsidePatientPhone?: string;
  outsidePatientAddress?: string;
  billingAmount?: number;
  ocrConfidence?: number;
  ocrPipelineType?: "Vision AI (Handwriting)" | "Tesseract OCR (Typed Fallback)";
  clinicalHistory?: string;
  observations?: string;
  impression?: string;
  isManualEntry?: boolean;
  icd10Suggested?: string;
  criticalFlag?: boolean;
  insuranceClaimEligible?: boolean;
  eclaimSent?: boolean;
}

export interface PrescribedMedicine {
  brandName: string;
  genericName: string;
  dose: string;
  frequency: string;
  duration: string;
  count: number;
  unitPrice: number;
  stockAvailable: number;
}

export interface Prescription {
  id: string;
  uhid?: string;
  patientUhid: string;
  patientName: string;
  doctorName: string;
  medicines: PrescribedMedicine[];
  whoProtocolRef: string;
  evidenceCitation: string;
  status: "Prescribed" | "Dispensed" | "Billed";
  prescribedAt: string;
  totalAmount: number;
  isDispatched?: boolean;
}

export interface PharmacyItem {
  id: string;
  brandName: string;
  genericName: string;
  batchNo: string;
  expiryDate: string;
  distributorName: string;
  stockSheets: number;
  tabletsPerSheet: number;
  totalTablets: number;
  pricePerTablet: number;
  pricePerSheet: number;
  reorderLevel: number;
}

export interface DischargeSummaryData {
  id: string;
  patientUhid: string;
  patientName: string;
  age: number;
  gender: string;
  admissionDate: string;
  dischargeDate: string;
  primaryDiagnosis: string;
  icd10Code: string;
  hospitalCourse: string;
  investigationSummary: string;
  dischargeMedicines: PrescribedMedicine[];
  whoProtocolRef: string;
  evidenceCitation: string;
  followUpDate: string;
  emergencyRedFlags: string[];
}

export interface HealthTip {
  id: string;
  title: string;
  tipText: string;
  category: "Hydration" | "Hygiene" | "Nutrition" | "Preventive" | "Seasonal";
  audioDuration: string;
  language: string;
}

export interface DrugDistributor {
  id: string;
  distributorName: string;
  contactPerson: string;
  phone: string;
  email: string;
  licenseNo: string;
  gstin: string;
  address: string;
  suppliedBrands: string[];
}

export interface PharmacySaleBillItem {
  brandName: string;
  genericName: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  pricePerUnit: number;
  totalPrice: number;
}

export interface PharmacySaleBill {
  invoiceNo: string;
  date: string;
  patientName: string;
  patientUhid: string;
  patientType: "OP" | "IP" | "Over the Counter";
  phone: string;
  doctorName: string;
  items: PharmacySaleBillItem[];
  subtotal: number;
  taxAmount: number;
  netTotal: number;
  paymentMode: "Cash" | "UPI" | "Card" | "Insurance / Hospital Credit";
}

export interface OCRBillResult {
  distributorName: string;
  invoiceNo: string;
  invoiceDate: string;
  items: Array<{
    brandName: string;
    genericName: string;
    batchNo: string;
    expiryDate: string;
    quantitySheets: number;
    tabletsPerSheet: number;
    unitPrice: number;
  }>;
  totalInvoiceAmount: number;
}

export interface PurchaseOrder {
  poNumber: string;
  distributorName: string;
  distributorId?: string;
  date: string;
  doctorNoticeRef?: string;
  items: {
    brandName: string;
    genericName?: string;
    quantitySheets: number;
    estimatedAmount: number;
  }[];
  totalEstimatedAmount: number;
  status: "Draft" | "Sent to Distributor" | "Received / Stocked";
  notes?: string;
}
