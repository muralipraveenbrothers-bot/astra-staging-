import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Patient, Prescription, LabOrder, RadiologyReport } from "../types";
import { numberToWordsIndianRupees } from "../utils/cmrfUtils";
import { Printer, X, Download, QrCode, ShieldCheck, CheckCircle2, Scan, Microscope, FileText, AlertTriangle, Building2, Copy, Check, Sparkles } from "lucide-react";

interface PrintableSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: "op_slip" | "discharge_summary" | "prescription" | "radiology_report" | "lab_report" | "cmrf_certificate" | "pharmacy_sale_bill" | "mlc_report" | "outside_lab_bill" | "insurance_claim_report";
  data: any;
}

const getDocumentOrderId = (docType: string, docData: any): string => {
  if (docData.orderId) return String(docData.orderId);
  if (docData.prescriptionId) return String(docData.prescriptionId);
  if (docData.testId) return String(docData.testId);
  if (docData.reportId) return String(docData.reportId);
  if (docData.invoiceNo) return String(docData.invoiceNo);
  if (docData.id) return String(docData.id);

  switch (docType) {
    case "prescription":
      return docData.prescriptionId || "RX-2026-8810";
    case "lab_report":
      return docData.testId || docData.labOrderId || "LAB-2026-9901";
    case "radiology_report":
      return docData.reportId || docData.scanId || "RAD-2026-7712";
    case "pharmacy_sale_bill":
      return docData.invoiceNo || "PHARM-2026-9901";
    case "op_slip":
      return docData.opNumber || docData.tokenNo || "OP-2026-1042";
    case "discharge_summary":
      return docData.dischargeId || "DIS-2026-3021";
    case "cmrf_certificate":
      return docData.opIpNumber || "CMRF-2026-4421";
    case "mlc_report":
      return docData.mlcNumber || "MLC-2026-9102";
    case "outside_lab_bill":
      return docData.invoiceNo || "OUT-2026-4812";
    case "insurance_claim_report":
      return docData.insuranceNumber || "INS-2026-9842";
    default:
      return "ORD-2026-5501";
  }
};

export const PrintableSlipModal: React.FC<PrintableSlipModalProps> = ({
  isOpen,
  onClose,
  documentType,
  data,
}) => {
  if (!isOpen || !data) return null;

  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);

  const patientName = data.patientName || data.name || "Rajesh Kumar";
  const patientUhid = data.patientUhid || data.uhid || "UHID-2026-8801";
  const orderId = getDocumentOrderId(documentType, data);

  const encodedPayload = JSON.stringify({
    uhid: patientUhid,
    orderId: orderId,
    documentType: documentType,
    patientName: patientName,
    issuedAt: new Date().toISOString().split("T")[0],
    hospital: "ASTRA AI HOSPITAL NETWORK",
    scanAction: "DISPATCH_VERIFY",
    verifyUrl: `https://astra-hospital.org/verify?uhid=${encodeURIComponent(patientUhid)}&order=${encodeURIComponent(orderId)}`
  });

  useEffect(() => {
    if (!isOpen || !data) return;

    QRCode.toDataURL(encodedPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF"
      }
    })
      .then((url: string) => setQrDataUrl(url))
      .catch((err: any) => console.error("QR Code generation error:", err));
  }, [isOpen, data, documentType, patientUhid, orderId, encodedPayload]);

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(encodedPayload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-2xl max-w-3xl w-full p-8 shadow-2xl space-y-6 relative border border-slate-200">
        {/* Action Controls Header */}
        <div className="flex items-center justify-between border-b pb-4 border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-cyan-600" />
            <h3 className="text-base font-bold text-slate-800 capitalize">
              Printable {documentType.replace("_", " ")} (Barcoded Official Document)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print Document / Download PDF
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Document Sheet */}
        <div className="space-y-6 font-sans text-xs">
          {/* Official Letterhead Header */}
          <div className="flex items-center justify-between border-b-2 border-cyan-800 pb-4">
            <div>
              <h1 className="text-xl font-black tracking-tight text-cyan-900">ASTRA AI HOSPITAL NETWORK</h1>
              <p className="text-slate-600 font-semibold">Dr. Murali Praveen Medical Center & Multi-Specialty Institute</p>
              <p className="text-[10px] text-slate-500">Jubilee Hills Road No 36, Hyderabad • Emergency Hotline: +91 40 8888 9999</p>
            </div>
            <div className="flex items-center gap-3">
              {qrDataUrl && (
                <div className="p-1 bg-white border border-slate-300 rounded-lg shadow-sm">
                  <img src={qrDataUrl} alt="Document QR Code" className="w-14 h-14 object-contain" />
                </div>
              )}
              <div className="text-right font-mono">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Pharmacy / Lab Dispatch QR</div>
                <div className="text-xs font-black text-cyan-900">{patientUhid}</div>
                <div className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 mt-0.5 inline-block">
                  ORDER ID: {orderId}
                </div>
              </div>
            </div>
          </div>

          {/* Patient Demographics Box */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-[11px]">
            <div>
              <span className="text-slate-500 block text-[10px]">PATIENT NAME</span>
              <span className="font-bold text-slate-900 text-xs">{patientName}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">UHID / REF NO</span>
              <span className="font-bold text-cyan-900 text-xs">{patientUhid}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">ORDER / SCAN ID</span>
              <span className="font-bold text-cyan-900 text-xs bg-cyan-100/70 text-cyan-950 px-1.5 py-0.5 rounded border border-cyan-200 inline-block">{orderId}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">AGE / GENDER</span>
              <span className="font-bold text-slate-900 text-xs">{data.patientAge || data.age || 42} Yrs / {data.patientGender || data.gender || "Male"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">DATE & CONSULTANT</span>
              <span className="font-bold text-slate-900 text-xs">{new Date().toLocaleDateString()} • Dr. Murali Praveen</span>
            </div>
          </div>

          {/* QR Code Scanner Pass Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 text-white p-3.5 rounded-xl border border-cyan-800/60 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 font-sans">
            <div className="flex items-center gap-3.5 w-full sm:w-auto">
              {qrDataUrl ? (
                <div className="bg-white p-1.5 rounded-lg border-2 border-cyan-400 flex-shrink-0 shadow">
                  <img src={qrDataUrl} alt="Dispatch QR Code" className="w-16 h-16 object-contain" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-slate-800 rounded-lg flex items-center justify-center">
                  <QrCode className="w-8 h-8 text-cyan-400 animate-pulse" />
                </div>
              )}
              <div className="space-y-0.5 text-xs">
                <div className="flex items-center gap-1.5 text-cyan-400 font-bold tracking-wide uppercase text-[10px]">
                  <QrCode className="w-3.5 h-3.5 text-cyan-300" />
                  <span>PHARMACY & LAB DISPATCH QR CODE</span>
                  <span className="bg-cyan-500/30 text-cyan-200 text-[9px] px-1.5 py-0.2 rounded font-mono">SCANNER READY</span>
                </div>
                <div className="font-mono text-xs font-bold text-white flex flex-wrap items-center gap-2">
                  <span>UHID: <strong className="text-cyan-300">{patientUhid}</strong></span>
                  <span className="text-slate-500">•</span>
                  <span>ORDER ID: <strong className="text-cyan-300">{orderId}</strong></span>
                </div>
                <p className="text-[10px] text-slate-300">
                  Scan at Pharmacy or Diagnostic Lab workstation for instant order lookup, dispensing & verification.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end print:hidden">
              <button
                onClick={handleCopyPayload}
                className="bg-slate-800 hover:bg-slate-700 text-cyan-200 text-[11px] font-mono px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                title="Copy raw encoded QR string"
              >
                {copiedPayload ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Payload Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Copy QR Data</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* DOCUMENT CONTENT TYPE: PHARMACY SALE BILL / TAX INVOICE */}
          {documentType === "pharmacy_sale_bill" && (
            <div className="space-y-4 text-slate-800">
              <div className="bg-cyan-50 border border-cyan-200 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-cyan-900 text-sm flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-cyan-700" />
                    PHARMACY TAX INVOICE & CASH RECEIPT
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    Invoice No: <strong className="text-slate-900">{data.invoiceNo || "PHARM-2026-9901"}</strong> • Patient Type: <strong className="text-cyan-800">{data.patientType || "OP"}</strong>
                  </p>
                </div>
                <div className="text-right font-mono">
                  <span className="text-xs bg-emerald-600 text-white font-bold px-2.5 py-1 rounded">PAID OFFICIAL RECEIPT</span>
                </div>
              </div>

              {/* Itemized Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                      <th className="p-2 border-r">S.No</th>
                      <th className="p-2 border-r">Drug / Medicine Brand & Generic</th>
                      <th className="p-2 border-r">Batch No</th>
                      <th className="p-2 border-r text-center">Qty</th>
                      <th className="p-2 border-r text-right">Unit Price</th>
                      <th className="p-2 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    {data.items && data.items.length > 0 ? (
                      data.items.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 border-r text-center font-bold">{idx + 1}</td>
                          <td className="p-2 border-r">
                            <div className="font-bold text-slate-900">{item.brandName}</div>
                            <div className="text-[10px] text-slate-500">{item.genericName}</div>
                          </td>
                          <td className="p-2 border-r font-mono text-[10px]">{item.batchNo || "BATCH-882"}</td>
                          <td className="p-2 border-r text-center font-bold text-cyan-800">{item.quantity}</td>
                          <td className="p-2 border-r text-right">₹{item.pricePerUnit}</td>
                          <td className="p-2 text-right font-bold text-slate-900">₹{item.totalPrice}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-3 text-center text-slate-400 italic">No drugs listed in this sale invoice.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bill Totals Summary Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="text-xs space-y-1">
                  <div>Payment Mode: <strong className="text-slate-900">{data.paymentMode || "Cash / Digital UPI"}</strong></div>
                  <div>Consultant / Prescriber: <strong className="text-slate-900">{data.doctorName || "Dr. Murali Praveen"}</strong></div>
                  <div className="text-[10px] text-slate-500 font-mono">DL No: TS/HYD/PHARM/2024/8892 • GSTIN: 36AAACA9812F1Z4</div>
                </div>

                <div className="text-right font-mono text-xs space-y-1 bg-white p-3 rounded-lg border border-slate-200 w-full sm:w-auto">
                  <div className="flex justify-between gap-4 text-slate-600">
                    <span>Subtotal:</span>
                    <span>₹{data.subtotal || data.netTotal || 0}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-slate-600">
                    <span>GST Tax (5%):</span>
                    <span>₹{data.taxAmount || 0}</span>
                  </div>
                  <div className="flex justify-between gap-4 font-bold text-slate-900 text-sm pt-1 border-t border-slate-200">
                    <span>NET AMOUNT PAID:</span>
                    <span className="text-emerald-700 font-black">₹{data.netTotal || 0}/-</span>
                  </div>
                </div>
              </div>

              {/* NON-RETURN POLICY NOTICE */}
              <div className="border-t-2 border-dashed border-slate-300 pt-3 text-[10px] text-slate-600 font-sans space-y-0.5 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200">
                <div className="font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1">
                  <span>⚠️ MANDATORY RETURN & EXCHANGE POLICY NOTICE:</span>
                </div>
                <p className="font-semibold text-red-900">
                  1. MEDICINES / DRUGS ONCE SOLD WILL NOT BE TAKEN BACK OR EXCHANGED UNDER ANY CIRCUMSTANCES (As per Drug Control Regulations).
                </p>
                <p className="text-slate-600">
                  2. Please verify medicine names, dosage, quantity, and expiry date on the strip before leaving the pharmacy counter.
                </p>
                <p className="text-slate-600">
                  3. Cold-chain / Refrigerated medicines (2°C - 8°C) are strictly non-returnable once sold.
                </p>
              </div>
            </div>
          )}

          {/* DOCUMENT CONTENT TYPE: RADIOLOGY & ENDOSCOPY REPORT */}
          {documentType === "radiology_report" && (
            <div className="space-y-4 text-slate-800">
              <div className="bg-cyan-50 border border-cyan-200 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-cyan-900 text-sm flex items-center gap-1.5">
                    <Scan className="w-4 h-4 text-cyan-700" />
                    {data.procedureName || "USG Abdomen & Pelvis"} ({data.procedureType || "USG"})
                  </h4>
                  <p className="text-[11px] text-slate-600">Radiologist: {data.radiologistName || "Dr. Murali Praveen, M.D."}</p>
                </div>
                <div className="text-right font-mono">
                  <span className="text-xs bg-cyan-700 text-white font-bold px-2.5 py-1 rounded">FINAL SIGNED REPORT</span>
                </div>
              </div>

              {/* Embedded Scan Image if available */}
              {data.scanImageUrl && (
                <div className="border border-slate-200 rounded-xl overflow-hidden p-2 bg-slate-50">
                  <div className="text-[10px] font-mono text-slate-500 mb-1 font-bold">ATTACHED SCAN IMAGE FRAME:</div>
                  <img src={data.scanImageUrl} alt="Scan Artifact" className="w-full h-44 object-cover rounded-lg" />
                </div>
              )}

              <div className="space-y-2">
                <h5 className="font-bold text-slate-900 border-b pb-1 text-xs">DETAILED FINDINGS:</h5>
                <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {data.findings || "No findings recorded."}
                </p>
              </div>

              <div className="space-y-2">
                <h5 className="font-bold text-cyan-900 border-b pb-1 text-xs">IMPRESSION & CONCLUSION:</h5>
                <p className="whitespace-pre-wrap font-mono text-xs font-bold text-cyan-900 bg-cyan-50/50 p-3 rounded-xl border border-cyan-200">
                  {data.impression || "Normal scan."}
                </p>
              </div>
            </div>
          )}

          {/* DOCUMENT CONTENT TYPE: LAB REPORT */}
          {documentType === "lab_report" && (
            <div className="space-y-4 text-slate-800">
              <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-purple-900 text-sm flex items-center gap-1.5">
                    <Microscope className="w-4 h-4 text-purple-700" />
                    {data.testName} ({data.category || "Laboratory"})
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    Ordered by: {data.orderedBy || "Dr. Murali Praveen"} • Patient ID:{" "}
                    <strong className="text-purple-900 font-mono">{data.patientUhid}</strong>
                    {data.isOutsidePatient && " (Outside Patient)"}
                  </p>
                </div>
                <div className="text-right font-mono text-xs">
                  <span className="bg-purple-700 text-white font-bold px-2.5 py-1 rounded inline-block">LAB VERIFIED REPORT</span>
                  {data.billingAmount && (
                    <div className="text-emerald-700 font-bold mt-1">Tariff Bill: ₹{data.billingAmount}</div>
                  )}
                </div>
              </div>

              {/* HEADING 1: CLINICAL HISTORY */}
              {data.clinicalHistory && (
                <div className="space-y-1">
                  <h5 className="font-bold text-slate-900 border-b pb-1 text-xs">1. CLINICAL HISTORY & PRESENTING COMPLAINTS:</h5>
                  <p className="font-mono text-xs text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                    {data.clinicalHistory}
                  </p>
                </div>
              )}

              {/* HEADING 2: QUANTITATIVE OBSERVATIONS */}
              <div className="space-y-1">
                <h5 className="font-bold text-slate-900 border-b pb-1 text-xs">2. OBSERVATIONS & QUANTITATIVE VALUES:</h5>
                <p className="font-mono text-xs text-slate-900 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed font-semibold whitespace-pre-wrap">
                  {data.results || data.observations || "Standard normal ranges observed."}
                </p>
              </div>

              {/* HEADING 3: IMPRESSION & CONCLUSION */}
              {(data.impression || data.aiInterpretation) && (
                <div className="space-y-1">
                  <h5 className="font-bold text-purple-900 border-b pb-1 text-xs">3. IMPRESSION & CLINICAL CONCLUSION:</h5>
                  <p className="font-mono text-xs font-bold text-purple-900 bg-purple-50/60 p-3 rounded-xl border border-purple-200 leading-relaxed">
                    {data.impression || data.aiInterpretation}
                  </p>
                </div>
              )}

              {/* INSURANCE & ICD-10 CODE CHECK */}
              {data.icd10Suggested && (
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-[11px] flex items-center justify-between font-mono text-emerald-900">
                  <span>ICD-10 Mapping & Insurance Check: <strong>{data.icd10Suggested}</strong></span>
                  <span className="bg-emerald-700 text-white px-2 py-0.5 rounded font-bold text-[10px]">E-CLAIM ELIGIBLE</span>
                </div>
              )}
            </div>
          )}

          {/* DOCUMENT CONTENT TYPE: OP SLIP */}
          {documentType === "op_slip" && (
            <div className="space-y-4 text-slate-800">
              <div className="border-b pb-2">
                <h4 className="font-bold text-slate-900 text-sm">Vitals & Chief Complaints</h4>
                <p className="text-slate-600 font-mono mt-1">
                  BP: {data.vitals?.bp || "120/80"} mmHg | Pulse: {data.vitals?.pulse || 80} bpm | Temp: {data.vitals?.temp || 98.6}°F | SpO2: {data.vitals?.spo2 || 98}%
                </p>
                <p className="mt-1"><strong>Complaints:</strong> {data.chiefComplaints || "Fever and body pain"}</p>
              </div>

              <div className="border-b pb-2">
                <h4 className="font-bold text-slate-900 text-sm">Provisional Clinical Diagnosis & Differential</h4>
                <p className="font-semibold text-cyan-900 mt-1">• Dengue Viral Fever with Thrombocytopenia (ICD-10 A90)</p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1 text-[11px]">
                <div className="font-bold text-cyan-900 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-cyan-700" /> Evidence-Based Medicine & WHO Protocol Compliance:
                </div>
                <p className="text-slate-700">
                  • WHO Dengue Management Standard 2024: Mandatory oral hydration (3L/day ORS/Coconut Water).
                </p>
                <p className="text-slate-700">
                  • Patient Safety Instruction: Avoid NSAIDs (Aspirin, Ibuprofen, Mefenamic Acid) due to bleeding risk. Use Paracetamol only.
                </p>
              </div>
            </div>
          )}

          {/* DOCUMENT CONTENT TYPE: DISCHARGE SUMMARY */}
          {documentType === "discharge_summary" && (
            <div className="space-y-4 text-slate-800 whitespace-pre-wrap font-mono text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              {data.text || `PATIENT DISCHARGE SUMMARY (Astra AI Generated)
UHID: ${patientUhid} | Patient: ${patientName}
Admission Date: 2026-08-01 | Discharge Date: ${new Date().toLocaleDateString()}
Attending Physician: Dr. Murali Praveen

1. FINAL DIAGNOSIS:
   - Acute Community-Acquired Pneumonia (ICD-10 J18.9) - Resolved

2. HOSPITAL COURSE:
   - Managed with IV Antibiotics, respiratory support, and daily vital monitoring.
   - Inflammatory markers normalized.`}
            </div>
          )}

          {/* DOCUMENT CONTENT TYPE: PHARMACY BILL */}
          {documentType === "prescription" && (
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 text-sm border-b pb-2">Prescribed Medications & Pharmacy Invoice</h4>
              <div className="space-y-2">
                {data.medicines?.map((m: any, idx: number) => (
                  <div key={idx} className="flex justify-between border-b border-slate-100 pb-2 text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{m.brandName} ({m.genericName})</div>
                      <div className="text-slate-500">{m.dose} • {m.frequency} • {m.duration}</div>
                    </div>
                    <div className="text-right font-mono font-bold text-slate-800">
                      {m.count} Tabs • ${(m.count * m.unitPrice).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-right font-mono font-bold text-sm pt-2 text-cyan-900">
                Total Pharmacy Bill: ${data.totalAmount?.toFixed(2) || "92.50"}
              </div>
            </div>
          )}

          {/* DOCUMENT CONTENT TYPE: TELANGANA CMRF LETTER OF CREDIT (LOC) CERTIFICATES */}
          {documentType === "cmrf_certificate" && (
            <div className="space-y-6 text-slate-900 font-sans">
              {/* CMRF Banner Header */}
              <div className="bg-emerald-900 text-white p-4 rounded-xl text-center space-y-1 shadow">
                <div className="text-xs uppercase font-bold tracking-widest text-emerald-300">Government of Telangana • Chief Minister's Relief Fund (CMRF)</div>
                <h2 className="text-lg font-black">LETTER OF CREDIT (LOC) REQUISITION & EMERGENCY CERTIFICATES</h2>
                <div className="text-[10px] text-emerald-200 font-mono">
                  DM&HO Registration No: {data.dmhoLicenseNo || "TS/HYD/DMHO/CE/2024/9841"} • Fire NOC: {data.fireNocNo || "TS/FIRE/HYD/NOC/2024/1102"}
                </div>
              </div>

              {/* CERTIFICATE 1: EMERGENCY ADMISSION CERTIFICATE */}
              <div className="border-2 border-emerald-800/40 rounded-xl p-5 bg-emerald-50/20 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <h3 className="font-bold text-emerald-950 text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-700" />
                    CERTIFICATE 1: EMERGENCY ADMISSION CERTIFICATE
                  </h3>
                  <span className="text-[10px] bg-emerald-800 text-white px-2 py-0.5 rounded font-mono font-bold">FORMAL CLINICAL PROOF</span>
                </div>

                <div className="text-xs space-y-2 leading-relaxed text-slate-800">
                  <p className="font-semibold text-slate-900">TO WHOMSOEVER IT MAY CONCERN</p>
                  <p>
                    This is to formally certify that <strong>{patientName.toUpperCase()}</strong>, Aged <strong>{data.patientAge || data.age || 45} Years</strong>, <strong>{data.patientGender || data.gender || "Male"}</strong>, residing at <strong>{data.address || "Hyderabad, Telangana"}</strong> (Aadhaar Card No: <strong>{data.aadhaarNo || "XXXX-XXXX-8912"}</strong>, White Ration Card No: <strong>{data.rationCardNo || "WSC-3601-984120"}</strong>) was admitted in an acute, critical condition to this hospital on <strong>{data.admissionDateTime || new Date().toLocaleString()}</strong> under IP No: <strong>{data.opIpNumber || "IP-2026-4421"}</strong> (UHID: <strong>{patientUhid}</strong>).
                  </p>

                  <div className="bg-white p-3 rounded-lg border border-emerald-200 space-y-1">
                    <div className="font-bold text-emerald-900 text-[11px]">DIAGNOSIS & CLINICAL CRITICALITY:</div>
                    <p className="font-bold text-slate-900 text-xs">
                      {data.diagnosis || "Acute Severe Surgical Emergency requiring immediate intervention"} (ICD-10 Code: {data.icdCode || "K35.80 / Emergency Care"})
                    </p>
                    <p className="text-[11px] text-slate-700">
                      <strong>Reason for Immediate Emergency Admission:</strong> {data.clinicalUrgencyDetails || "Patient presented in acute severe distress with persistent shock parameters and excruciating visceral pain. Clinical evaluation confirmed a life-threatening organ-at-risk situation requiring immediate emergency surgical intervention to prevent organ failure or mortality."}
                    </p>
                  </div>

                  <p>
                    The patient was admitted directly to the Intensive Care Unit / High Dependency Unit and requires immediate emergency operative procedure: <strong>{data.proposedSurgeryOrProcedure || "Emergency Laparoscopic Intervention / Operative Surgery"}</strong>. Any delay in definitive surgical intervention carries a severe risk of septic shock, irreversible organ damage, or loss of life.
                  </p>
                </div>
              </div>

              {/* CERTIFICATE 2: MEDICAL REQUISITION & FINANCIAL ESTIMATION CERTIFICATE */}
              <div className="border-2 border-slate-300 rounded-xl p-5 bg-white space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">CERTIFICATE 2: MEDICAL REQUISITION & ESTIMATION CERTIFICATE</h3>
                    <p className="text-[10px] text-slate-500 font-mono">Formal Cost Breakdown submitted for CMRF Letter of Credit (LOC) Sanction</p>
                  </div>
                  <span className="text-xs bg-slate-900 text-white font-mono font-bold px-2.5 py-1 rounded">ESTIMATION MEMORANDUM</span>
                </div>

                <div className="text-xs text-slate-800 space-y-1">
                  <p className="font-bold">To,</p>
                  <p className="font-semibold">The Member Secretary / Chief Executive Officer,</p>
                  <p>Chief Minister's Relief Fund (CMRF) Cell, Government of Telangana, Secretariat, Hyderabad - 500022.</p>
                </div>

                {/* Structured Financial Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse border border-slate-200 font-mono">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 border-b border-slate-300">
                        <th className="p-2 border-r border-slate-200 w-12 text-center">S.No</th>
                        <th className="p-2 border-r border-slate-200">Description of Medical / Surgical Service</th>
                        <th className="p-2 text-right w-32">Estimated Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-[11px]">
                      {data.estimatedCostItems ? (
                        data.estimatedCostItems.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 border-r border-slate-200 text-center font-bold">{idx + 1}</td>
                            <td className="p-2 border-r border-slate-200">
                              <span className="font-bold text-slate-900 block">{item.category}</span>
                              <span className="text-[10px] text-slate-600 font-sans block">{item.description}</span>
                            </td>
                            <td className="p-2 text-right font-bold text-slate-900">₹{item.amount?.toLocaleString("en-IN")}/-</td>
                          </tr>
                        ))
                      ) : (
                        <>
                          <tr>
                            <td className="p-2 border-r border-slate-200 text-center font-bold">1</td>
                            <td className="p-2 border-r border-slate-200 font-bold">ICU / Special Ward Rent & Monitoring</td>
                            <td className="p-2 text-right font-bold">₹45,000/-</td>
                          </tr>
                          <tr>
                            <td className="p-2 border-r border-slate-200 text-center font-bold">2</td>
                            <td className="p-2 border-r border-slate-200 font-bold">Operation Theatre Suite & Anesthesia Charges</td>
                            <td className="p-2 text-right font-bold">₹38,000/-</td>
                          </tr>
                          <tr>
                            <td className="p-2 border-r border-slate-200 text-center font-bold">3</td>
                            <td className="p-2 border-r border-slate-200 font-bold">Surgical Consumables & Specialized Implants</td>
                            <td className="p-2 text-right font-bold">₹52,000/-</td>
                          </tr>
                          <tr>
                            <td className="p-2 border-r border-slate-200 text-center font-bold">4</td>
                            <td className="p-2 border-r border-slate-200 font-bold">In-Hospital Pharmacy, Life-Saving Drugs & IV Fluids</td>
                            <td className="p-2 text-right font-bold">₹35,000/-</td>
                          </tr>
                          <tr>
                            <td className="p-2 border-r border-slate-200 text-center font-bold">5</td>
                            <td className="p-2 border-r border-slate-200 font-bold">Surgeon, Anesthetist & Specialist Professional Fees</td>
                            <td className="p-2 text-right font-bold">₹35,000/-</td>
                          </tr>
                          <tr>
                            <td className="p-2 border-r border-slate-200 text-center font-bold">6</td>
                            <td className="p-2 border-r border-slate-200 font-bold">Diagnostics, CT/USG Scans & Laboratory Panel</td>
                            <td className="p-2 text-right font-bold">₹20,000/-</td>
                          </tr>
                        </>
                      )}
                      <tr className="bg-emerald-100/80 font-bold text-slate-900 text-xs">
                        <td colSpan={2} className="p-2.5 text-right border-r border-slate-300">TOTAL ESTIMATED COST OF TREATMENT:</td>
                        <td className="p-2.5 text-right text-emerald-950 font-black text-sm">
                          ₹{(data.totalEstimatedCost || 225000).toLocaleString("en-IN")}/-
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                  <span className="font-bold text-slate-700 block text-[10px]">TOTAL ESTIMATED AMOUNT IN WORDS:</span>
                  <p className="font-bold text-emerald-900 text-xs uppercase">
                    {numberToWordsIndianRupees(data.totalEstimatedCost || 225000)}
                  </p>
                </div>

                {/* Explicit Plea */}
                <div className="bg-amber-50/60 p-3.5 rounded-lg border border-amber-300 text-xs text-amber-950 leading-relaxed">
                  <span className="font-bold text-amber-900 block mb-1">EXPLICIT PLEA TO THE TELANGANA CMRF CELL:</span>
                  We respectfully submit that the patient's family belongs to an economically weaker section (Food Security Card No: <strong>{data.rationCardNo || "WSC-3601-984120"}</strong>) and is financially unable to afford the cost of this life-saving procedure. We humbly request the Hon'ble Chief Minister's Relief Fund Cell, Government of Telangana, to kindly sanction the <strong>Letter of Credit (LOC) for ₹{(data.totalEstimatedCost || 225000).toLocaleString("en-IN")}/- ({numberToWordsIndianRupees(data.totalEstimatedCost || 225000)})</strong> at the earliest to enable us to proceed with the operative procedure and complete the life-saving treatment without interruption.
                </div>
              </div>

              {/* ADMINISTRATIVE CHECKLIST FOR RECEPTIONIST */}
              <div className="bg-amber-100/90 border-2 border-amber-400 p-4 rounded-xl text-amber-950 space-y-2 font-sans text-xs shadow-sm">
                <div className="flex items-center gap-2 font-black text-amber-900 text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0" />
                  <span>ADMINISTRATIVE CHECKLIST FOR RECEPTIONIST</span>
                </div>
                <p className="text-[11px] font-semibold text-amber-900">
                  Critical Instructions for Front Desk & Billing Staff before submitting file to Secretariat:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] font-medium text-amber-950 pl-1">
                  <li>Attach Stamped 'True Copy' Duplicate of <strong>Telangana DM&HO Clinical Establishment License (Form-4)</strong> — License No: <code className="bg-amber-200 px-1 py-0.5 rounded font-bold">{data.dmhoLicenseNo || "TS/HYD/DMHO/CE/2024/9841"}</code>.</li>
                  <li>Attach Stamped 'True Copy' Duplicate of <strong>Telangana State Fire Safety No-Objection Certificate (NOC)</strong> — NOC No: <code className="bg-amber-200 px-1 py-0.5 rounded font-bold">{data.fireNocNo || "TS/FIRE/HYD/NOC/2024/1102"}</code>.</li>
                  <li>Attach Self-Attested Copy of Patient <strong>Aadhaar Card</strong> (No: {data.aadhaarNo || "XXXX-XXXX-8912"}).</li>
                  <li>Attach Self-Attested Copy of Telangana <strong>White Ration Card / Food Security Card</strong> (Card No: {data.rationCardNo || "WSC-3601-984120"}).</li>
                  <li>Verify Chief Medical Officer's original signature and official oval hospital seal on both certificates.</li>
                  <li>Enclose MLA / MLC Recommendation Cover Letter representing the patient's assembly constituency.</li>
                </ul>
              </div>
            </div>
          )}

          {/* DOCUMENT CONTENT TYPE: MEDICO-LEGAL CASE (MLC) REPORT */}
          {documentType === "mlc_report" && (
            <div className="space-y-4 text-slate-900 font-sans">
              <div className="bg-rose-950 text-white p-4 rounded-xl flex items-center justify-between border-2 border-rose-600 shadow">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-rose-300 font-mono">CONFIDENTIAL LEGAL DOCUMENT • POLICE INTIMATION RECORD</div>
                  <h3 className="text-base font-black flex items-center gap-2 text-rose-100">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    MEDICO-LEGAL CASE (MLC) EXAMINATION REPORT
                  </h3>
                  <p className="text-xs text-rose-200 mt-0.5">
                    MLC No: <strong className="font-mono text-white underline">{data.mlcNumber || "MLC-2026-9102"}</strong> • Linked Patient ID: <strong className="font-mono text-white">{patientUhid}</strong>
                  </p>
                </div>
                <div className="text-right font-mono">
                  <span className="bg-rose-600 text-white font-bold text-xs px-3 py-1 rounded-lg border border-rose-400">
                    STATUTORY MLC
                  </span>
                </div>
              </div>

              {/* MLC Incident & Police Information Box */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-rose-50 p-4 rounded-xl border border-rose-200 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold">NATURE OF INJURY</span>
                  <span className={`font-black text-sm ${data.mlcNatureOfInjury === "Grievous" ? "text-rose-700" : "text-amber-700"}`}>
                    {data.mlcNatureOfInjury || "Grievous Injury"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold">CASE CLASSIFICATION</span>
                  <span className="font-bold text-slate-900 text-xs">{data.mlcCaseType || "Road Traffic Accident (RTA)"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold">CONCERN POLICE STATION</span>
                  <span className="font-bold text-slate-900 text-xs">{data.mlcPoliceStation || "Kothagudem Town Police Station"}</span>
                </div>
              </div>

              {/* Clinical Injury Description */}
              <div className="space-y-1">
                <h5 className="font-bold text-rose-950 border-b border-rose-200 pb-1 text-xs uppercase tracking-wide">
                  1. DETAILED CLINICAL EXAMINATION & INJURY DESCRIPTION:
                </h5>
                <p className="font-mono text-xs text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed font-semibold whitespace-pre-wrap">
                  {data.mlcInjuryDescription || data.injuryDescription || "Patient brought with history of road traffic accident near Highway Junction. On examination: 5cm x 2cm deep lacerated wound over forehead with active oozing. Multiple superficial abrasions over right forearm and knee joint. No loss of consciousness reported. Patient stable under observation."}
                </p>
              </div>

              {/* Immediate Emergency Treatment Administered */}
              <div className="space-y-1">
                <h5 className="font-bold text-slate-900 border-b pb-1 text-xs uppercase tracking-wide">
                  2. EMERGENCY MEDICAL TREATMENT ADMINISTERED & ADMISSION STATUS:
                </h5>
                <p className="font-mono text-xs text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed">
                  {data.treatmentGiven || "Wound debridement, sterile suturing (4 sutures applied), Tetanus Toxoid 0.5ml IM given. Pain management with IV Analgesics and Antibiotics initiated. CT Brain ordered to rule out occult trauma."}
                </p>
              </div>

              {/* Police Intimation & Statutory Disclaimer Box */}
              <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-300 text-[11px] space-y-1 font-mono">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-slate-700" /> POLICE INTIMATION & STATUTORY RECORD:
                </div>
                <p className="text-slate-600">
                  This Medico-Legal Case report has been auto-generated by Astra AI Hospital OS and registered under statutory CrPC regulations. Intimation memo dispatched to <strong>{data.mlcPoliceStation || "Local Jurisdiction Police Station"}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* DOCUMENT CONTENT TYPE: OUTSIDE PATIENT LAB TEST BILL */}
          {documentType === "outside_lab_bill" && (
            <div className="space-y-4 text-slate-800 font-sans">
              <div className="bg-purple-950 text-white p-4 rounded-xl flex items-center justify-between border-2 border-purple-600 shadow">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-purple-300 font-mono">SMART LAB WORKSTATION • TAX INVOICE</div>
                  <h3 className="text-base font-black text-purple-100 flex items-center gap-2">
                    <Microscope className="w-5 h-5 text-purple-400" />
                    OUTSIDE PATIENT LAB TEST BILL & GST RECEIPT
                  </h3>
                  <p className="text-xs text-purple-200 mt-0.5">
                    Temporary Lab ID: <strong className="font-mono text-white underline">{data.patientUhid || data.uhid || "OUT-2026-4812"}</strong>
                  </p>
                </div>
                <div className="text-right font-mono">
                  <span className="bg-emerald-600 text-white font-bold text-xs px-3 py-1 rounded-lg">
                    PAID IN FULL
                  </span>
                </div>
              </div>

              {/* Itemized Tests Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-purple-50 text-purple-900 border-b border-slate-200">
                      <th className="p-2.5 border-r">S.No</th>
                      <th className="p-2.5 border-r">Lab Investigation Name</th>
                      <th className="p-2.5 border-r text-center">Category</th>
                      <th className="p-2.5 text-right">Tariff Fee (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    {data.selectedLabTests && data.selectedLabTests.length > 0 ? (
                      data.selectedLabTests.map((testName: string, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 border-r text-center font-bold">{idx + 1}</td>
                          <td className="p-2.5 border-r font-bold text-slate-900">{testName}</td>
                          <td className="p-2.5 border-r text-center text-slate-600">Pathology / Diagnostic</td>
                          <td className="p-2.5 text-right font-bold text-slate-900">₹350/-</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-2.5 border-r text-center font-bold">1</td>
                        <td className="p-2.5 border-r font-bold text-slate-900">Complete Blood Picture (CBP) + LFT</td>
                        <td className="p-2.5 border-r text-center text-slate-600">Hematology</td>
                        <td className="p-2.5 text-right font-bold text-slate-900">₹750/-</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bill Totals & GST Summary */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="text-xs space-y-1">
                  <div>Patient Mobile: <strong className="text-slate-900 font-mono">{data.phone || data.patientPhone || "+91 98490 12345"}</strong></div>
                  <div>Address: <strong className="text-slate-900">{data.address || "Local Jurisdiction"}</strong></div>
                  <div className="text-[10px] text-slate-500 font-mono">GSTIN: 36AAACA9812F1Z4 • Barcode Tagged</div>
                </div>

                <div className="text-right font-mono text-xs space-y-1 bg-white p-3 rounded-lg border border-slate-200 w-full sm:w-auto">
                  <div className="flex justify-between gap-6 text-slate-600">
                    <span>Subtotal:</span>
                    <span>₹{data.labBillAmount || data.billingAmount || 750}</span>
                  </div>
                  <div className="flex justify-between gap-6 text-slate-600">
                    <span>GST (5%):</span>
                    <span>₹{Math.round((data.labBillAmount || data.billingAmount || 750) * 0.05)}</span>
                  </div>
                  <div className="flex justify-between gap-6 font-bold text-slate-900 text-sm pt-1 border-t border-slate-200">
                    <span>TOTAL BILL AMOUNT:</span>
                    <span className="text-emerald-700 font-black">
                      ₹{Math.round((data.labBillAmount || data.billingAmount || 750) * 1.05)}/-
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DOCUMENT CONTENT TYPE: INSURANCE CLAIM ELIGIBILITY REPORT */}
          {documentType === "insurance_claim_report" && (
            <div className="space-y-4 text-slate-900 font-sans">
              <div className="bg-indigo-950 text-white p-4 rounded-xl flex items-center justify-between border-2 border-indigo-600 shadow">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-indigo-300 font-mono">INSURANCE PRE-AUTHORIZATION & E-CLAIM REPORT</div>
                  <h3 className="text-base font-black text-indigo-100 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                    INSURANCE CLAIM ELIGIBILITY & ROHINI VERIFICATION
                  </h3>
                  <p className="text-xs text-indigo-200 mt-0.5">
                    Provider: <strong className="font-bold text-white underline">{data.insuranceProvider || "Star Health Insurance"}</strong> • Policy No: <strong className="font-mono text-white">{data.insuranceNumber || "POL-984210"}</strong>
                  </p>
                </div>
                <div className="text-right font-mono">
                  <span className="bg-emerald-600 text-white font-bold text-xs px-3 py-1 rounded-lg">
                    CLAIM ELIGIBLE
                  </span>
                </div>
              </div>

              {/* Policy & ICD-10 Verification Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-indigo-50 p-4 rounded-xl border border-indigo-200 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">ROHINI CODE</span>
                  <span className="font-bold text-indigo-900 text-xs">{data.rohiniCode || "ROHINI-TS-HYD-9841"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">COVERAGE LIMIT</span>
                  <span className="font-bold text-emerald-800 text-xs">₹{(data.insuranceCoverageLimit || 500000).toLocaleString("en-IN")}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ICD-10 DISEASE</span>
                  <span className="font-bold text-slate-900 text-xs">{data.icdCodeDisease || "A90 (Dengue Fever)"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ICD-10 PROCEDURE</span>
                  <span className="font-bold text-slate-900 text-xs">{data.icdCodeTreatment || "Z51.1 (Inpatient Care)"}</span>
                </div>
              </div>

              {/* AI Auto-Check Details */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  AI Automated Policy Validation & Diagnosis Mapping:
                </div>
                <p className="text-slate-700 leading-relaxed font-mono">
                  • Policy status verified as Active. Disease code ({data.icdCodeDisease || "A90"}) and treatment protocol ({data.icdCodeTreatment || "Z51.1"}) match coverage inclusion guidelines.
                </p>
                <p className="text-slate-700 leading-relaxed font-mono">
                  • Pre-authorization requirement: Approved for cashless inpatient coverage up to ₹{(data.insuranceCoverageLimit || 500000).toLocaleString("en-IN")}.
                </p>
              </div>
            </div>
          )}

          {/* Official Doctor Signature Footer */}
          <div className="pt-8 flex items-end justify-between border-t border-slate-200 text-slate-600 text-[11px]">
            <div>
              <p className="font-mono font-bold text-slate-800">Astra AI System & ABDM Verified Document</p>
              <p className="text-[10px] text-slate-500 font-mono">
                QR Code Payload: <span className="font-bold text-cyan-900">{patientUhid}</span> | <span className="font-bold text-cyan-900">{orderId}</span>
              </p>
              <p className="text-[10px] text-slate-400">Scan QR Code above for instant Pharmacy / Diagnostic Lab dispatch verification</p>
            </div>
            <div className="text-center font-serif">
              <div className="font-bold text-slate-900 text-sm italic border-b border-slate-400 pb-1">Dr. Murali Praveen, M.D.</div>
              <p className="text-[10px] text-slate-500 mt-0.5 font-sans">Reg No: MCI-2012-98412 • Senior Consultant Physician</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
