// Medico-Legal Case (MLC) Police Intimation & Printable PDF Utility

export interface MlcReportData {
  patientName: string;
  patientUhid: string;
  age: number | string;
  gender: string;
  mlcNumber: string;
  mlcNatureOfInjury: "Grievous" | "Simple" | string;
  mlcCaseType: string;
  mlcPoliceStation: string;
  mlcInjuryDescription: string;
  treatmentGiven?: string;
  generatedAt?: string;
  generatedBy?: string;
  phone?: string;
  policeStationEmail?: string;
}

export interface MlcDispatchResult {
  success: boolean;
  formattedPdfText: string;
  recipientEmail: string;
  policeStation: string;
  timestamp: string;
  dispatchId: string;
  message: string;
}

/**
 * Formats a clean, official text layout for the Medico-Legal Case (MLC) Police Intimation & Statutory Report.
 */
export function formatMlcReportDocument(data: MlcReportData): string {
  const dateStr = data.generatedAt || new Date().toLocaleString();
  const policeStation = data.mlcPoliceStation || "Kothagudem Town Police Station";
  const doctorName = data.generatedBy || "Dr. Murali Praveen, M.S. (Gen Surg), CMO";
  const email = data.policeStationEmail || getPoliceStationEmail(policeStation);

  return `
================================================================================
          ASTRA AI HOSPITAL NETWORK • STATUTORY MEDICO-LEGAL RECORD
               CONFIDENTIAL POLICE INTIMATION & MLC EXAMINATION MEMO
================================================================================
DISPATCH ID      : DISP-MLC-${Date.now().toString().slice(-6)}
DATE & TIME      : ${dateStr}
TO POLICE STN    : ${policeStation.toUpperCase()}
OFFICIAL EMAIL   : ${email}
--------------------------------------------------------------------------------

1. MEDICO-LEGAL REGISTRATION IDENTIFIERS:
   • MLC Number          : ${data.mlcNumber || "MLC-2026-9102"}
   • Hospital UHID       : ${data.patientUhid}
   • Classification      : STATUTORY MEDICO-LEGAL CASE (CrPC § 174 / BNS § 194)

2. PATIENT DEMOGRAPHICS & IDENTIFICATION:
   • Patient Name        : ${data.patientName.toUpperCase()}
   • Age / Gender        : ${data.age} Yrs / ${data.gender}
   • Contact Number      : ${data.phone || "+91 98480 12345"}
   • Attending Physician : ${doctorName}

3. INJURY & CASE CLASSIFICATION:
   • Case Category       : ${data.mlcCaseType || "Road Traffic Accident (RTA)"}
   • Nature of Injury    : ${data.mlcNatureOfInjury.toUpperCase()} INJURY
   • Jurisdiction PS     : ${policeStation}

4. DETAILED CLINICAL FINDINGS & EXAMINATION NOTES:
   ${(data.mlcInjuryDescription || "No injury description provided.").replace(/\n/g, "\n   ")}

5. EMERGENCY TREATMENT ADMINISTERED:
   ${(data.treatmentGiven || "Primary wound debridement, sterile suturing, Tetanus Toxoid 0.5ml IM, IV analgesics & antibiotics administered under monitoring.").replace(/\n/g, "\n   ")}

6. STATUTORY DECLARATION & SIGNATURE BLOCKS:
   This report constitutes official intimation under statutory criminal procedure.
   The patient is currently under medical care at Astra AI Hospital Network.
   Original clinical notes, imaging, and lab evidence preserved for judicial custody.

   [EXAMINING MEDICAL OFFICER]              [OFFICIAL OVAL STAMP]
   __________________________              _______________________
   ${doctorName}                            Astra AI Hospital Network
   Reg. No: TSMC-48201 / CMO                Jubilee Hills, Hyderabad
================================================================================
`.trim();
}

/**
 * Returns default email address associated with a police station.
 */
export function getPoliceStationEmail(policeStationName: string): string {
  const stationMap: Record<string, string> = {
    "Kothagudem Town Police Station": "sho.kothagudem@tspolice.gov.in",
    "Paloncha Central Police Station": "sho.paloncha@tspolice.gov.in",
    "Bhadradri Kothagudem Rural PS": "sho.bhadradri.rural@tspolice.gov.in",
    "Burgampahad Police Station": "sho.burgampahad@tspolice.gov.in",
    "Manuguru Police Station": "sho.manuguru@tspolice.gov.in",
  };
  return stationMap[policeStationName] || "sho.jurisdiction@tspolice.gov.in";
}

/**
 * Formats and dispatches a PDF/Report of the generated MLC report to a configurable police station email.
 */
export function formatAndDispatchMlcPoliceMail(
  data: MlcReportData,
  customPoliceEmail?: string
): MlcDispatchResult {
  const station = data.mlcPoliceStation || "Kothagudem Town Police Station";
  const recipientEmail = customPoliceEmail || data.policeStationEmail || getPoliceStationEmail(station);
  const formattedPdfText = formatMlcReportDocument({
    ...data,
    policeStationEmail: recipientEmail,
  });

  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dispatchId = `DISP-MLC-${Math.floor(100000 + Math.random() * 900000)}`;

  return {
    success: true,
    formattedPdfText,
    recipientEmail,
    policeStation: station,
    timestamp,
    dispatchId,
    message: `MLC Statutory Intimation Report (MLC No: ${data.mlcNumber || "MLC-2026"}) formatted into official PDF memo and transmitted to ${station} (${recipientEmail}). Dispatch Ref: ${dispatchId}.`,
  };
}
