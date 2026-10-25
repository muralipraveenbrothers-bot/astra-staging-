// Telangana Chief Minister's Relief Fund (CMRF) Letter of Credit (LOC) Generator Utility

export interface CMRFEstimationItem {
  category: string;
  description: string;
  amount: number;
}

export interface CMRFData {
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientUhid: string;
  mrNumber?: string;
  opIpNumber?: string;
  phone?: string;
  address?: string;
  rationCardNo?: string;
  aadhaarNo?: string;
  admissionDateTime: string;
  diagnosis: string;
  icdCode?: string;
  proposedSurgeryOrProcedure: string;
  clinicalUrgencyDetails: string;
  estimatedCostItems: CMRFEstimationItem[];
  totalEstimatedCost: number;
  attendingSurgeon: string;
  hospitalName: string;
  dmhoLicenseNo: string;
  fireNocNo: string;
}

// Convert numbers to Indian Rupee Words
export function numberToWordsIndianRupees(num: number): string {
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "
  ];
  const b = ["", "", "Twenty ", "Thirty ", "Forty ", "Fifty ", "Sixty ", "Seventy ", "Eighty ", "Ninety "];

  function inWords(n: number): string {
    if ((n = n.toString().length > 9 ? parseFloat(n.toString().substring(0, 9)) : n) === 0) return "";
    let str = "";
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const hundred = Math.floor(n / 100);
    n %= 100;

    if (crore > 0) str += inWords(crore) + "Crore ";
    if (lakh > 0) str += inWords(lakh) + "Lakh ";
    if (thousand > 0) str += inWords(thousand) + "Thousand ";
    if (hundred > 0) str += inWords(hundred) + "Hundred ";
    if (n > 0) {
      if (str !== "") str += "and ";
      if (n < 20) str += a[n];
      else str += b[Math.floor(n / 10)] + a[n % 10];
    }
    return str;
  }

  const rounded = Math.round(num);
  const words = inWords(rounded).trim();
  return words ? `Rupees ${words} Only` : "Rupees Zero Only";
}

// Default Generator for CMRF Certificate Data based on Patient & Diagnosis
export function generateCMRFDataForPatient(
  patient: any,
  overrideSurgery?: string,
  overrideCost?: number
): CMRFData {
  const pName = patient.name || "Patient";
  const pAge = patient.age || 45;
  const pGender = patient.gender || "Male";
  const pUhid = patient.uhid || "UHID-2026-8801";
  const pDx = patient.chiefComplaints || patient.department || "Acute Abdominal Emergency / Surgical Disease";
  const admissionDate = patient.registrationDate || new Date().toLocaleString();

  // Smart surgery mapping
  let surgery = overrideSurgery || "Emergency Laparoscopic Appendectomy / Exploratory Laparotomy";
  let baseCost = overrideCost || 225000;

  if (pDx.toLowerCase().includes("heart") || pDx.toLowerCase().includes("cardiac") || pDx.toLowerCase().includes("chest")) {
    surgery = overrideSurgery || "Emergency Coronary Angioplasty (PTCA) with Drug-Eluting Stent Placement";
    baseCost = overrideCost || 285000;
  } else if (pDx.toLowerCase().includes("fracture") || pDx.toLowerCase().includes("bone") || pDx.toLowerCase().includes("ortho")) {
    surgery = overrideSurgery || "Emergency Open Reduction & Internal Fixation (ORIF) with Titanium Implants";
    baseCost = overrideCost || 195000;
  } else if (pDx.toLowerCase().includes("calculus") || pDx.toLowerCase().includes("stone") || pDx.toLowerCase().includes("gallbladder")) {
    surgery = overrideSurgery || "Emergency Laparoscopic Cholecystectomy & Bile Duct Exploration";
    baseCost = overrideCost || 175000;
  }

  const items: CMRFEstimationItem[] = [
    { category: "ICU / Emergency Bed Charges", description: "3 Days High-Dependency Intensive Care Unit @ ₹10,000/day + 4 Days Special Ward", amount: 45000 },
    { category: "Operation Theatre (OT) & Anesthesia", description: "Modular OT Suite, Anesthesia Equipment, C-Arm / Laparoscopy Tower & Gas Charges", amount: 38000 },
    { category: "Surgical Consumables & Implants", description: "Specialized Surgical Disposables, Staplers, Mesh/Stent/Implants & Sterile Kits", amount: 52000 },
    { category: "Pharmacy, Emergency Drugs & IV Fluids", description: "In-hospital Antibiotics, Analgesics, Inotropes, Blood Components & IV Infusions", amount: 35000 },
    { category: "Surgeon & Anesthetist Professional Fees", description: "Chief Operating Surgeon, Assistant Surgeon & Consultant Anesthetist Charges", amount: 35000 },
    { category: "Diagnostics & Laboratory Investigations", description: "Emergency Pre-Op Blood Panel, CT / Ultrasound Scans, ECG, Echo & Post-Op Monitoring", amount: 20000 },
  ];

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return {
    patientName: pName,
    patientAge: pAge,
    patientGender: pGender,
    patientUhid: pUhid,
    mrNumber: patient.mrNumber || "MRN-2026-9041",
    opIpNumber: patient.opIpNumber || "IP-2026-4421",
    phone: patient.phone || "+91 98490 12345",
    address: patient.address || "H.No 4-12, Hyderabad, Telangana",
    rationCardNo: "WSC-3601-984120",
    aadhaarNo: "XXXX-XXXX-8912",
    admissionDateTime: admissionDate,
    diagnosis: pDx,
    icdCode: "ICD-10 K35.80 / Emergency Care",
    proposedSurgeryOrProcedure: surgery,
    clinicalUrgencyDetails: `Patient presented in acute severe distress with persistent shock parameters and excruciating abdominal/visceral pain. Clinical evaluation and emergency diagnostics confirmed a life-threatening organ-at-risk situation requiring immediate emergency surgical intervention. Any delay in definitive operative management carries a severe risk of septic shock, peritonitis, or mortality.`,
    estimatedCostItems: items,
    totalEstimatedCost: total,
    attendingSurgeon: "Dr. Murali Praveen, M.S. (Gen Surg), M.Ch.",
    hospitalName: "ASTRA AI MULTI-SPECIALTY HOSPITAL",
    dmhoLicenseNo: "TS/HYD/DMHO/CE/2024/9841",
    fireNocNo: "TS/FIRE/HYD/NOC/2024/1102",
  };
}

// Generate the Clean Markdown Output for Copying / Printing
export function generateCMRFMarkdownText(data: CMRFData): string {
  const totalWords = numberToWordsIndianRupees(data.totalEstimatedCost);

  return `
# TELANGANA CHIEF MINISTER'S RELIEF FUND (CMRF)
## LETTER OF CREDIT (LOC) APPLICATION & MEDICAL ESTIMATION CERTIFICATE

**HOSPITAL NAME:** ${data.hospitalName}
**TS DM&HO REGISTRATION LICENSE NO:** ${data.dmhoLicenseNo}
**FIRE SAFETY NOC NO:** ${data.fireNocNo}
**ADDRESS:** Jubilee Hills Road No. 36, Hyderabad, Telangana - 500033 | Contact: 040-8888-9999

---

### CERTIFICATE 1: EMERGENCY ADMISSION CERTIFICATE

**TO WHOMSOEVER IT MAY CONCERN**

This is to formally certify that **${data.patientName.toUpperCase()}**, Aged **${data.patientAge} Years**, **${data.patientGender}**, residing at **${data.address}** (Aadhaar No: **${data.aadhaarNo}**, Food Security / White Ration Card No: **${data.rationCardNo}**), was admitted in an emergency acute condition to this hospital on **${data.admissionDateTime}** under IP No: **${data.opIpNumber}** (UHID: **${data.patientUhid}**).

**CLINICAL DIAGNOSIS:**
${data.diagnosis.toUpperCase()} (ICD-10 Code: ${data.icdCode || "Emergency Medical Protocol"})

**REASON FOR IMMEDIATE LIFE-SAVING EMERGENCY ADMISSION:**
${data.clinicalUrgencyDetails}

The patient was admitted directly to the Intensive Care Unit (ICU) / High Dependency Unit (HDU) and requires immediate operative procedure: **${data.proposedSurgeryOrProcedure.toUpperCase()}**. Delay in treatment would result in severe permanent morbidity or loss of life.

**Date & Time of Admission:** ${data.admissionDateTime}
**Attending Consultant:** ${data.attendingSurgeon}

*Signature & Official Seal of Chief Medical Officer / Attending Surgeon*

---

### CERTIFICATE 2: MEDICAL REQUISITION & FINANCIAL ESTIMATION CERTIFICATE

**MEMORANDUM & FINANCIAL REQUISITION FOR SANCTION OF LETTER OF CREDIT (LOC)**

**To,**
The Member Secretary / Chief Executive Officer,
Chief Minister's Relief Fund (CMRF) Cell,
Government of Telangana, Secretariat,
Hyderabad, Telangana - 500022.

**Respected Sir / Madam,**

Sub: Request for Sanction of Letter of Credit (LOC) under Chief Minister's Relief Fund (CMRF) for **${data.patientName.toUpperCase()}** (Age: ${data.patientAge} Yrs, ${data.patientGender}, IP No: ${data.opIpNumber}) - Reg.

The patient **${data.patientName}** is belonging to an economically weaker section (White Ration Card Holder No: **${data.rationCardNo}**) and requires urgent specialized surgical management: **${data.proposedSurgeryOrProcedure}**.

Below is the itemized financial estimate breakdown prepared in accordance with standard Telangana Government CMRF package ceilings:

| S.No | Description of Medical / Surgical Service | Estimated Amount (INR) |
|---|---|---|
${data.estimatedCostItems.map((item, idx) => `| ${idx + 1} | **${item.category}**<br/>_${item.description}_ | **₹${item.amount.toLocaleString("en-IN")}/-** |`).join("\n")}
| | **TOTAL ESTIMATED COST OF TREATMENT** | **₹${data.totalEstimatedCost.toLocaleString("en-IN")}/-** |

**TOTAL ESTIMATED AMOUNT IN WORDS:**
**${totalWords.toUpperCase()}**

**EXPLICIT PLEA TO THE TELANGANA CMRF CELL:**
We respectfully submit that the patient's family is financially unable to bear the expenses of this life-saving procedure. We humbly request the Hon'ble Chief Minister's Relief Fund Cell, Government of Telangana, to kindly sanction the **Letter of Credit (LOC) for ₹${data.totalEstimatedCost.toLocaleString("en-IN")}/- (${totalWords})** at the earliest to enable us to proceed with the operative procedure and complete the life-saving treatment without interruption.

**Place:** Hyderabad, Telangana
**Date:** ${new Date().toLocaleDateString("en-IN")}

__________________________________________
**Dr. Murali Praveen, M.S., M.Ch.**
Chief Medical Superintendent & Senior Surgeon
${data.hospitalName} (Hospital Seal & Registration Stamp)

---

### **ADMINISTRATIVE CHECKLIST FOR RECEPTIONIST / FRONT DESK STAFF**

> ⚠️ **CRITICAL INSTRUCTIONS FOR RECEPTIONIST BEFORE SUBMITTING FILE TO SECRETARIAT:**
> Please verify and attach the following mandatory physical documents to the patient's CMRF application bundle:
>
> 1.  **Stamped 'True Copy' Duplicate of Telangana DM&HO Clinical Establishment License (Form-4)** — License No: \`${data.dmhoLicenseNo}\`.
> 2.  **Stamped 'True Copy' Duplicate of Telangana State Fire Safety No-Objection Certificate (NOC)** — NOC No: \`${data.fireNocNo}\`.
> 3.  **Self-Attested Copy of Patient Aadhaar Card** (Aadhaar: \`${data.aadhaarNo}\`).
> 4.  **Self-Attested Copy of Telangana White Ration Card / Food Security Card** (Card No: \`${data.rationCardNo}\`).
> 5.  **Original Signed Medical Requisition & Estimation Certificate** bearing the Chief Medical Officer's Signature and Official Oval Hospital Seal.
> 6.  **Recommendation Letter from Hon'ble Member of Legislative Assembly (MLA) / Member of Legislative Council (MLC)** representing the patient's constituency.
`;
}
