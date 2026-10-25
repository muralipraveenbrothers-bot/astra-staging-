import { useState, useRef, useEffect } from "react";
import { AlertTriangle, FileText, Printer, Save, Shield, Signature, X } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, Badge, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, nowTime, uid } from "@/lib/utils";
import type { MLCWound, MLCRecord, PatientRecord } from "@/lib/types";

const POLICE_STATIONS = [
  "Select Police Station",
  "City Police Station",
  "Town Police Station",
  "Rural Police Station",
  "Traffic Police Station",
  "Women Police Station",
  "Railway Police Station",
  "Highway Patrol Station",
  "Cyber Crime Police Station",
  "Crime Branch Station",
  "Special Branch Station",
  "Kotwali Police Station",
  "Sadar Police Station",
  "Gandhi Nagar Police Station",
  "Gopalapuram Police Station",
  "Thirumangalam Police Station",
  "Anna Nagar Police Station",
  "Thillai Nagar Police Station",
  "KK Nagar Police Station",
  "Ashok Nagar Police Station",
  "Teynampet Police Station",
  "Mylapore Police Station",
  "Triplicane Police Station",
  "Washermenpet Police Station",
  "Thousand Lights Police Station",
  "Other",
];

const WOUND_TYPES = ["Abrasion", "Laceration", "Incised Wound", "Contusion/Bruise", "Burn", "Fracture", "Puncture", "Gunshot", "Stab", "Avulsion", "Crush Injury", "Cut Wound", "Abrasions with Bruising"];

const HOSPITAL_NAME = "PM Brothers Multispeciality Hospital";

function generateMLCNumber(): string {
  return `MLC-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

function generateMRNumber(): string {
  return `MR-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
}

export function MLCForm({
  patient,
  onClose,
  onSave,
}: {
  patient: PatientRecord;
  onClose: () => void;
  onSave: (record: MLCRecord) => void;
}) {
  const { account } = useAuth();
  const { logAudit } = useStore();
  const [mlcNumber] = useState(generateMLCNumber());
  const [mrNumber] = useState(generateMRNumber());
  const [policeStation, setPoliceStation] = useState("");
  const [broughtBy, setBroughtBy] = useState("Self");
  const [broughtByDetails, setBroughtByDetails] = useState("");
  const [history, setHistory] = useState("");
  const [injuryDescription, setInjuryDescription] = useState("");
  const [clinicalFindings, setClinicalFindings] = useState("");
  const [identificationMark1, setIdentificationMark1] = useState("");
  const [identificationMark2, setIdentificationMark2] = useState("");
  const [investigations, setInvestigations] = useState<string[]>([""]);
  const [wounds, setWounds] = useState<MLCWound[]>([
    { slNo: 1, type: "", dimensions: "", location: "", age: "", weapon: "", remarks: "" },
  ]);
  const [finalOpinion, setFinalOpinion] = useState("");
  const [grievousWoundNos, setGrievousWoundNos] = useState("");
  const [simpleWoundNos, setSimpleWoundNos] = useState("");
  const [injuryNature, setInjuryNature] = useState("");
  const [weaponUsed, setWeaponUsed] = useState("");
  const [showIntimation, setShowIntimation] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [signature, setSignature] = useState("");
  const [signatureModal, setSignatureModal] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const doctorName = account?.name ?? "Dr. Attending";
  const doctorRegNo = "REG-MCI-2024-" + Math.floor(10000 + Math.random() * 90000);

  useEffect(() => {
    if (patient.complaint) {
      setHistory(`Patient stated to have ${patient.complaint.toLowerCase()} at [Location] on [Date] at approximately [Time].`);
    }
  }, [patient]);

  const addWound = () => {
    setWounds((prev) => [...prev, { slNo: prev.length + 1, type: "", dimensions: "", location: "", age: "", weapon: "", remarks: "" }]);
  };

  const updateWound = (index: number, field: keyof MLCWound, value: string) => {
    setWounds((prev) => prev.map((w, i) => (i === index ? { ...w, [field]: value } : w)));
  };

  const removeWound = (index: number) => {
    setWounds((prev) => prev.filter((_, i) => i !== index).map((w, i) => ({ ...w, slNo: i + 1 })));
  };

  const addInvestigation = () => setInvestigations((prev) => [...prev, ""]);
  const updateInvestigation = (index: number, value: string) => {
    setInvestigations((prev) => prev.map((inv, i) => (i === index ? value : inv)));
  };

  const handleSignatureStart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
  };

  const handleSignatureMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#d4af37";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleSignatureEnd = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSignature(canvas.toDataURL());
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature("");
  };

  const handleSaveSignature = () => {
    if (!signature) {
      toast.error("Please draw your signature first");
      return;
    }
    setSignatureModal(false);
    toast.success("Signature captured");
  };

  const generateIntimationLetter = (): string => {
    return [
      `MEDICO-LEGAL INTIMATION`,
      ``,
      `To,`,
      `The Station House Officer (SHO) / Police Sub-Inspector,`,
      `${policeStation}`,
      ``,
      `Subject: Medico-Legal Intimation regarding patient admission.`,
      ``,
      `Sir/Madam,`,
      ``,
      `Please note that an injured person has been admitted to our hospital under a Medico-Legal Case (MLC).`,
      ``,
      `MLC Number: ${mlcNumber}`,
      `Date & Time of Admission: ${new Date().toLocaleDateString("en-IN")} at ${nowTime()}`,
      `Name of Patient: ${patient.name}`,
      `Age / Sex: ${patient.age ?? "N/A"} / ${patient.gender ?? "N/A"}`,
      `Resident of: ${patient.address || "N/A"}`,
      `Brought By: ${broughtBy}${broughtByDetails ? ` - ${broughtByDetails}` : ""}`,
      ``,
      `History given by patient/attendant: ${history}`,
      ``,
      `Preliminary Clinical Findings: ${clinicalFindings || "Under observation"}`,
      ``,
      `Kindly depute an Investigating Officer (IO) to record the statement and proceed further.`,
      ``,
      `Signature of Medical Officer:`,
      `Name: ${doctorName}`,
      `Designation & Reg. No.: ${doctorRegNo}`,
      `Hospital Stamp: ${HOSPITAL_NAME}`,
    ].join("\n");
  };

  const generateWoundCertificate = (): string => {
    return [
      `MEDICO-LEGAL INJURY CERTIFICATE`,
      ``,
      `MLC No: ${mlcNumber}`,
      `Name of the Hospital: ${HOSPITAL_NAME}`,
      `Date of Examination: ${new Date().toLocaleDateString("en-IN")} at ${nowTime()}`,
      ``,
      `1. General Particulars`,
      `Patient Name: ${patient.name}`,
      `Age / Sex: ${patient.age ?? "N/A"} / ${patient.gender ?? "N/A"}`,
      `Address: ${patient.address || "N/A"}`,
      `Brought By: ${broughtBy}${broughtByDetails ? ` - ${broughtByDetails}` : ""}`,
      `Consent: "I give my full and voluntary consent for the medico-legal examination and certification of my injuries."`,
      `Signature/Thumb Impression of Patient: _____________`,
      ``,
      `2. Preliminary Data`,
      `Identification Marks:`,
      `  1. ${identificationMark1 || "N/A"}`,
      `  2. ${identificationMark2 || "N/A"}`,
      `Alleged History: "${history}"`,
      ``,
      `3. Table of Injuries`,
      ...wounds
        .filter((w) => w.type)
        .map(
          (w) =>
            `${w.slNo}. ${w.type} | ${w.dimensions} | ${w.location} | ${w.age} | ${w.weapon} | ${w.remarks}`
        ),
      ``,
      `4. Investigations Done`,
      ...investigations.filter(Boolean).map((inv) => `  - ${inv}`),
      ``,
      `5. Final Medical Opinion`,
      `Taking into consideration the clinical history, physical examination, and diagnostic reports, I am of the opinion that:`,
      `${simpleWoundNos ? `Wound No(s). ${simpleWoundNos} is/are Simple in nature.` : ""}`,
      `${grievousWoundNos ? `Wound No(s). ${grievousWoundNos} is/are Grievous in nature.` : ""}`,
      `The above wounds are ${injuryNature || "fresh"} in nature.`,
      `The nature of the weapon/force used is ${weaponUsed || "not specified"}.`,
      `${finalOpinion ? `Additional opinion: ${finalOpinion}` : ""}`,
      ``,
      `Place & Date: ${HOSPITAL_NAME}, ${new Date().toLocaleDateString("en-IN")}`,
      ``,
      `Signature of Medical Officer: ${signature ? "[✓ Signed]" : "______________"}`,
      `Name & Designation: ${doctorName}, Reg No: ${doctorRegNo}`,
    ].join("\n");
  };

  const handleFinalSave = () => {
    if (!policeStation || policeStation === "Select Police Station") {
      toast.error("Please select a police station");
      return;
    }
    if (!history.trim()) {
      toast.error("Please enter the history of the case");
      return;
    }

    const record: MLCRecord = {
      id: uid("mlc"),
      patientId: patient.id,
      mlcNumber,
      mrNumber,
      dateTime: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}`,
      policeStation,
      patientName: patient.name,
      ageSex: `${patient.age ?? "N/A"} / ${patient.gender ?? "N/A"}`,
      address: patient.address || "N/A",
      broughtBy,
      broughtByDetails,
      identificationMarks: [identificationMark1, identificationMark2].filter(Boolean),
      history,
      injuryDescription,
      clinicalFindings,
      investigations: investigations.filter(Boolean),
      wounds: wounds.filter((w) => w.type),
      finalOpinion,
      grievousWoundNos,
      simpleWoundNos,
      injuryNature,
      weaponUsed,
      doctorName,
      doctorRegNo,
      hospitalName: HOSPITAL_NAME,
      hospitalStamp: "",
      signature,
      signedAt: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}`,
      attachments,
      status: "finalized",
    };

    logAudit("MLC Created", `MLC ${mlcNumber} for ${patient.name} · ${policeStation}`, doctorName);
    onSave(record);
    toast.success(`MLC ${mlcNumber} created successfully`);
    onClose();
  };

  return (
    <div className="space-y-4">
      {/* MLC Header */}
      <GlassCard>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={24} className="text-red-400" />
            <div>
              <h2 className="font-display text-xl font-bold text-gradient">Medico-Legal Case (MLC)</h2>
              <p className="text-xs text-slate-400">Patient: {patient.name} · {patient.id}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge tone="red" className="!text-[10px]">{mlcNumber}</Badge>
            <Badge tone="violet" className="!text-[10px]">{mrNumber}</Badge>
          </div>
        </div>
      </GlassCard>

      {/* Patient & Case Details */}
      <GlassCard>
        <SectionTitle title="Hospital & Case Details" subtitle="Auto-populated from patient record" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-slate-500 uppercase">MLC Number</label>
            <p className="text-sm font-bold text-white font-mono">{mlcNumber}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">MR Number</label>
            <p className="text-sm font-bold text-white font-mono">{mrNumber}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Date & Time of Arrival</label>
            <p className="text-sm text-white">{new Date().toLocaleDateString("en-IN")} {nowTime()}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Patient Name</label>
            <p className="text-sm text-white">{patient.name}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Age / Sex</label>
            <p className="text-sm text-white">{patient.age ?? "N/A"} / {patient.gender ?? "N/A"}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Address</label>
            <p className="text-sm text-white">{patient.address || "N/A"}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Aadhaar</label>
            <p className="text-sm text-white font-mono">{patient.aadhaar || "N/A"}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Occupation</label>
            <p className="text-sm text-white">{patient.occupation || "N/A"}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Phone</label>
            <p className="text-sm text-white">{patient.phone || "N/A"}</p>
          </div>
        </div>
      </GlassCard>

      {/* Police Station & Brought By */}
      <GlassCard>
        <SectionTitle title="Case Information" subtitle="Police station and accompanying details" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Area Police Station *</label>
            <select className="input-dark" value={policeStation} onChange={(e) => setPoliceStation(e.target.value)}>
              {POLICE_STATIONS.map((ps) => (
                <option key={ps} value={ps === "Select Police Station" ? "" : ps}>{ps}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Brought By</label>
            <select className="input-dark" value={broughtBy} onChange={(e) => setBroughtBy(e.target.value)}>
              <option>Self</option>
              <option>Relative</option>
              <option>Police</option>
              <option>Good Samaritan</option>
              <option>Ambulance</option>
              <option>Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase mb-1 block">Brought By Details (Name & Contact)</label>
          <input className="input-dark" placeholder="Name and contact of the person who brought the patient" value={broughtByDetails} onChange={(e) => setBroughtByDetails(e.target.value)} />
        </div>
      </GlassCard>

      {/* Identification Marks */}
      <GlassCard>
        <SectionTitle title="Identification Marks" subtitle="Two identifying features" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="input-dark" placeholder='e.g. A black mole on the right side of the neck' value={identificationMark1} onChange={(e) => setIdentificationMark1(e.target.value)} />
          <input className="input-dark" placeholder='e.g. A linear surgical scar on the left forearm' value={identificationMark2} onChange={(e) => setIdentificationMark2(e.target.value)} />
        </div>
      </GlassCard>

      {/* History & Injury Description */}
      <GlassCard>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Alleged History *</label>
            <textarea className="input-dark resize-none" rows={4} placeholder="Brief statement of how the injury occurred (in the patient's own words, if conscious)" value={history} onChange={(e) => setHistory(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Injury Description</label>
            <textarea className="input-dark resize-none" rows={4} placeholder="Precise location, size, shape, and type of wounds (simple language, no heavy medical abbreviations)" value={injuryDescription} onChange={(e) => setInjuryDescription(e.target.value)} />
          </div>
        </div>
      </GlassCard>

      {/* Clinical Findings */}
      <GlassCard>
        <label className="text-[10px] text-slate-500 uppercase mb-1 block">Preliminary Clinical Findings</label>
        <textarea className="input-dark resize-none" rows={2} placeholder="Summary of visible injuries, unconsciousness, or condition" value={clinicalFindings} onChange={(e) => setClinicalFindings(e.target.value)} />
      </GlassCard>

      {/* Investigations */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle title="Investigations Done" subtitle="X-ray, CT scan, USG, MRI, lab reports" />
          <button className="btn-ghost !text-xs" onClick={addInvestigation}>+ Add</button>
        </div>
        <div className="space-y-2">
          {investigations.map((inv, i) => (
            <div key={i} className="flex gap-2">
              <input className="input-dark flex-1" placeholder={`e.g. X-ray of the right knee — normal`} value={inv} onChange={(e) => updateInvestigation(i, e.target.value)} />
              {investigations.length > 1 && (
                <button className="btn-ghost !px-2" onClick={() => setInvestigations((prev) => prev.filter((_, idx) => idx !== i))}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Wounds Table */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle title="Table of Injuries" subtitle="Detailed wound-by-wound documentation" />
          <button className="btn-neon !text-xs" onClick={addWound}>+ Add Wound</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-2 text-slate-400 font-medium">Sl.No</th>
                <th className="text-left p-2 text-slate-400 font-medium">Type of Wound</th>
                <th className="text-left p-2 text-slate-400 font-medium">Dimensions (L×W×D)</th>
                <th className="text-left p-2 text-slate-400 font-medium">Location on Body</th>
                <th className="text-left p-2 text-slate-400 font-medium">Age of Injury</th>
                <th className="text-left p-2 text-slate-400 font-medium">Weapon/Trauma</th>
                <th className="text-left p-2 text-slate-400 font-medium">Remarks</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {wounds.map((wound, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="p-1">{wound.slNo}</td>
                  <td className="p-1">
                    <select className="input-dark !text-[10px]" value={wound.type} onChange={(e) => updateWound(i, "type", e.target.value)}>
                      <option value="">Select</option>
                      {WOUND_TYPES.map((wt) => <option key={wt}>{wt}</option>)}
                    </select>
                  </td>
                  <td className="p-1"><input className="input-dark !text-[10px]" placeholder="e.g. 3×2×0.5 cm" value={wound.dimensions} onChange={(e) => updateWound(i, "dimensions", e.target.value)} /></td>
                  <td className="p-1"><input className="input-dark !text-[10px]" placeholder="e.g. Right forearm" value={wound.location} onChange={(e) => updateWound(i, "location", e.target.value)} /></td>
                  <td className="p-1"><input className="input-dark !text-[10px]" placeholder="Hours/Days" value={wound.age} onChange={(e) => updateWound(i, "age", e.target.value)} /></td>
                  <td className="p-1"><input className="input-dark !text-[10px]" placeholder="e.g. Blunt object" value={wound.weapon} onChange={(e) => updateWound(i, "weapon", e.target.value)} /></td>
                  <td className="p-1"><input className="input-dark !text-[10px]" placeholder="e.g. Sent for X-ray" value={wound.remarks} onChange={(e) => updateWound(i, "remarks", e.target.value)} /></td>
                  <td className="p-1">
                    {wounds.length > 1 && (
                      <button className="btn-ghost !px-1 !py-1" onClick={() => removeWound(i)}><X size={12} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Final Medical Opinion */}
      <GlassCard>
        <SectionTitle title="Final Medical Opinion" subtitle="Simple vs Grievous classification" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Simple Wound No(s).</label>
            <input className="input-dark" placeholder="e.g. 1, 2" value={simpleWoundNos} onChange={(e) => setSimpleWoundNos(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Grievous Wound No(s).</label>
            <input className="input-dark" placeholder="e.g. 3 (due to bone fracture)" value={grievousWoundNos} onChange={(e) => setGrievousWoundNos(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Injury Nature</label>
            <select className="input-dark" value={injuryNature} onChange={(e) => setInjuryNature(e.target.value)}>
              <option value="">Select</option>
              <option>Fresh</option>
              <option>2-3 days old</option>
              <option>4-7 days old</option>
              <option>1-2 weeks old</option>
              <option>Healed/Healing</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Weapon/Force Used</label>
            <input className="input-dark" placeholder="e.g. Blunt object, Sharp weapon, Fist" value={weaponUsed} onChange={(e) => setWeaponUsed(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase mb-1 block">Additional Opinion / Notes</label>
          <textarea className="input-dark resize-none" rows={2} value={finalOpinion} onChange={(e) => setFinalOpinion(e.target.value)} />
        </div>
      </GlassCard>

      {/* Doctor Details & Signature */}
      <GlassCard>
        <SectionTitle title="Medical Officer Details" subtitle="Signing doctor information" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Doctor Name</label>
            <p className="text-sm font-semibold text-white">{doctorName}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Registration No.</label>
            <p className="text-sm font-mono text-white">{doctorRegNo}</p>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1 block">Hospital</label>
            <p className="text-sm text-white">{HOSPITAL_NAME}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-ghost !text-xs flex items-center gap-2" onClick={() => setSignatureModal(true)}>
            <Signature size={14} /> {signature ? "Update Signature" : "Add Signature"}
          </button>
          {signature && (
            <Badge tone="green" className="!text-[10px]">
              <Shield size={10} /> Signed
            </Badge>
          )}
        </div>
      </GlassCard>

      {/* Preview & Actions */}
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => setShowIntimation(true)}>
          <FileText size={14} /> Preview Police Intimation
        </button>
        <button className="btn-ghost" onClick={() => setShowCertificate(true)}>
          <FileText size={14} /> Preview Wound Certificate
        </button>
        <button className="btn-neon" onClick={handleFinalSave}>
          <Save size={14} /> Save & Finalize MLC
        </button>
        <button className="btn-ghost" onClick={onClose}>
          <X size={14} /> Cancel
        </button>
      </div>

      {/* Police Intimation Modal */}
      <Modal open={showIntimation} onClose={() => setShowIntimation(false)} title="Police Intimation Letter" wide>
        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-ink-900 p-4 rounded-lg max-h-[60vh] overflow-y-auto">
          {generateIntimationLetter()}
        </pre>
        <div className="flex gap-2 mt-3 justify-end">
          <button className="btn-ghost !text-xs" onClick={() => {
            navigator.clipboard.writeText(generateIntimationLetter());
            toast.success("Copied to clipboard");
          }}>Copy</button>
          <button className="btn-neon !text-xs" onClick={() => {
            const w = window.open("", "_blank");
            if (w) {
              w.document.write(`<pre style="font-family: monospace; font-size: 12px; line-height: 1.5; padding: 20px; background: #fff; color: #000;">${generateIntimationLetter()}</pre>`);
              w.print();
            }
          }}>
            <Printer size={12} /> Print
          </button>
        </div>
      </Modal>

      {/* Wound Certificate Modal */}
      <Modal open={showCertificate} onClose={() => setShowCertificate(false)} title="Medico-Legal Wound Certificate" wide>
        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap bg-ink-900 p-4 rounded-lg max-h-[60vh] overflow-y-auto">
          {generateWoundCertificate()}
        </pre>
        <div className="flex gap-2 mt-3 justify-end">
          <button className="btn-ghost !text-xs" onClick={() => {
            navigator.clipboard.writeText(generateWoundCertificate());
            toast.success("Copied to clipboard");
          }}>Copy</button>
          <button className="btn-neon !text-xs" onClick={() => {
            const w = window.open("", "_blank");
            if (w) {
              w.document.write(`<pre style="font-family: monospace; font-size: 12px; line-height: 1.5; padding: 20px; background: #fff; color: #000;">${generateWoundCertificate()}</pre>`);
              w.print();
            }
          }}>
            <Printer size={12} /> Print
          </button>
        </div>
      </Modal>

      {/* Signature Pad Modal */}
      <Modal open={signatureModal} onClose={() => setSignatureModal(false)} title="Digital Signature" wide>
        <div className="space-y-4">
          <p className="text-xs text-slate-400">Draw your signature in the box below using mouse or touch:</p>
          <div className="border border-violet-400/40 rounded-lg overflow-hidden bg-white">
            <canvas
              ref={canvasRef}
              width={500}
              height={150}
              className="w-full h-[150px] cursor-crosshair touch-none"
              onMouseDown={handleSignatureStart}
              onMouseMove={handleSignatureMove}
              onMouseUp={handleSignatureEnd}
              onMouseLeave={handleSignatureEnd}
              onTouchStart={handleSignatureStart}
              onTouchMove={handleSignatureMove}
              onTouchEnd={handleSignatureEnd}
            />
          </div>
          <div className="flex gap-2 justify-between">
            <button className="btn-ghost !text-xs" onClick={clearSignature}>
              Clear
            </button>
            <button className="btn-neon !text-xs" onClick={handleSaveSignature}>
              <Save size={14} /> Save Signature
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
