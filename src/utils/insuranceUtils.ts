// Rohini Insurance Registry & ICD-10 AI Mapping Utilities

export interface InsuranceProviderOption {
  id: string;
  name: string;
  email: string;
  isGovt: boolean;
  rohiniPrefix: string;
  defaultLimit: number;
}

export const INSURANCE_PROVIDERS_LIST: InsuranceProviderOption[] = [
  { id: "self_pay", name: "Self Pay / Cash", email: "", isGovt: false, rohiniPrefix: "NONE", defaultLimit: 0 },
  { id: "star_health", name: "Star Health Insurance", email: "eclaims@starhealth.in", isGovt: false, rohiniPrefix: "ROH-STAR", defaultLimit: 500000 },
  { id: "icici_lombard", name: "ICICI Lombard", email: "cashless@icicilombard.com", isGovt: false, rohiniPrefix: "ROH-ICICI", defaultLimit: 500000 },
  { id: "hdfc_ergo", name: "HDFC Ergo", email: "healthclaims@hdfcergo.com", isGovt: false, rohiniPrefix: "ROH-HDFC", defaultLimit: 400000 },
  { id: "new_india", name: "New India Assurance", email: "claims.health@newindia.co.in", isGovt: false, rohiniPrefix: "ROH-NIA", defaultLimit: 300000 },
  { id: "united_india", name: "United India Insurance", email: "healthclaims@uiic.co.in", isGovt: false, rohiniPrefix: "ROH-UII", defaultLimit: 300000 },
  { id: "national_ins", name: "National Insurance", email: "claims@nic.co.in", isGovt: false, rohiniPrefix: "ROH-NIC", defaultLimit: 300000 },
  { id: "oriental_ins", name: "Oriental Insurance", email: "claims@orientalinsurance.co.in", isGovt: false, rohiniPrefix: "ROH-OIC", defaultLimit: 300000 },
  { id: "pmjay", name: "Ayushman Bharat (PMJAY)", email: "pmjay.claims@nha.gov.in", isGovt: true, rohiniPrefix: "ROH-PMJAY", defaultLimit: 500000 },
  { id: "aarogyasri", name: "Aarogyasri (Govt. Scheme)", email: "claims@aarogyasri.telangana.gov.in", isGovt: true, rohiniPrefix: "ROH-YS", defaultLimit: 500000 },
  { id: "esi", name: "ESI (Employees' State Insurance)", email: "claims@esic.in", isGovt: true, rohiniPrefix: "ROH-ESI", defaultLimit: 200000 },
  { id: "cghs", name: "CGHS (Central Govt. Health Scheme)", email: "cghs.claims@nic.in", isGovt: true, rohiniPrefix: "ROH-CGHS", defaultLimit: 300000 },
  { id: "other", name: "Other Insurance Provider…", email: "claims@tpa.org.in", isGovt: false, rohiniPrefix: "ROH-TPA", defaultLimit: 250000 },
];

/**
 * AI Mapping Engine: Chief Complaints / Symptoms -> ICD-10 Disease & Treatment Code
 */
export function mapDiagnosisToICD10(complaints: string, department: string, procedureName?: string) {
  const text = `${complaints} ${department} ${procedureName || ""}`.toLowerCase();

  if (text.includes("knee") || text.includes("joint") || text.includes("ortho") || text.includes("osteo")) {
    return {
      diseaseCode: "M17.11",
      diseaseName: "Primary Osteoarthritis, Right Knee",
      treatmentCode: "0SRC0JZ",
      treatmentName: "Total Knee Replacement, Right Knee Joint",
      estimatedClaimAmount: 180000,
      claimApplicable: true,
    };
  }

  if (text.includes("fever") || text.includes("cough") || text.includes("chest") || text.includes("pneumonia") || text.includes("lung")) {
    return {
      diseaseCode: "J18.9",
      diseaseName: "Pneumonia, Unspecified Organism",
      treatmentCode: "3E033VJ",
      treatmentName: "Parenteral Antibiotic & Respiratory IV Therapy",
      estimatedClaimAmount: 65000,
      claimApplicable: true,
    };
  }

  if (text.includes("abdomen") || text.includes("stomach") || text.includes("gallbladder") || text.includes("chole") || text.includes("endo")) {
    return {
      diseaseCode: "K80.20",
      diseaseName: "Calculus of Gallbladder without Cholecystitis",
      treatmentCode: "0FT40ZZ",
      treatmentName: "Laparoscopic Cholecystectomy with Abdominal Drainage",
      estimatedClaimAmount: 95000,
      claimApplicable: true,
    };
  }

  if (text.includes("heart") || text.includes("cardiac") || text.includes("angina") || text.includes("bp")) {
    return {
      diseaseCode: "I20.9",
      diseaseName: "Angina Pectoris, Unspecified Ischemic Heart Disease",
      treatmentCode: "02703ZZ",
      treatmentName: "Coronary Angioplasty with Drug-Eluting Stent Placement",
      estimatedClaimAmount: 220000,
      claimApplicable: true,
    };
  }

  if (text.includes("ct") || text.includes("mri") || text.includes("usg") || text.includes("x-ray") || text.includes("scan") || text.includes("radiology")) {
    return {
      diseaseCode: "R51.9",
      diseaseName: "Headache / Diagnostic Imaging Evaluation",
      treatmentCode: "BW28ZZZ",
      treatmentName: "Advanced Diagnostic Cross-Sectional Imaging & Cashless Workup",
      estimatedClaimAmount: 15000,
      claimApplicable: true,
    };
  }

  if (text.includes("fracture") || text.includes("trauma") || text.includes("accident") || text.includes("bone")) {
    return {
      diseaseCode: "S82.201A",
      diseaseName: "Displaced Fracture of Shaft of Right Tibia",
      treatmentCode: "0PSG04Z",
      treatmentName: "Open Reduction and Internal Fixation (ORIF) Tibia",
      estimatedClaimAmount: 140000,
      claimApplicable: true,
    };
  }

  // Default Fallback mapping
  return {
    diseaseCode: "R10.9",
    diseaseName: "Unspecified Abdominal & Systemic Symptoms",
    treatmentCode: "8E093CZ",
    treatmentName: "Comprehensive Inpatient Evaluation & Medical Management",
    estimatedClaimAmount: 45000,
    claimApplicable: true,
  };
}

/**
 * Generate Rohini Code for Patient Insurance Card
 */
export function generateRohiniDetails(providerName: string, insuranceNumber?: string) {
  const provider = INSURANCE_PROVIDERS_LIST.find((p) => p.name === providerName) || INSURANCE_PROVIDERS_LIST[1];
  const rohiniCode = `${provider.rohiniPrefix}-500038-${Math.floor(1000 + Math.random() * 9000)}`;
  const validity = `01-Jan-2025 to 31-Dec-2027`;
  const policyType = provider.isGovt ? "Government Cashless Health Scheme" : "Cashless Super Shield Platinum";

  return {
    rohiniCode,
    validity,
    policyType,
    coverageLimit: provider.defaultLimit,
    claimEmail: provider.email,
  };
}
