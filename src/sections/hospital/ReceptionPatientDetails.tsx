import { useState, useEffect, useMemo } from "react";
import { User, Phone, MapPin, Heart, Shield, FileText, Activity, Printer, Search, CalendarRange, Receipt, ScrollText, Filter } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, nowTime } from "@/lib/utils";
import type { PatientRecord, Bill } from "@/lib/types";

interface CollectionDetails {
  patientId: string;
  demographics: { age: string; gender: string; dob: string; bloodGroup: string; weight: string; height: string; occupation: string; maritalStatus: string; };
  vitals: { temp: string; bp: string; pulse: string; spo2: string; rr: string; };
  insurance: { hasInsurance: boolean; insuranceProvider: string; policyNumber: string; validity: string; };
  emergencyContact: { name: string; relationship: string; phone: string; };
  address: { street: string; city: string; state: string; pincode: string; };
}

type ServiceFilter = "all" | "op" | "ip" | "direct";

export default function ReceptionPatientDetails({ patientId, patientName: _patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { patients, bills, dischargePlans, clinicalNotes, logAudit } = useStore();
  const doctorName = account?.name ?? "Receptionist";
  const [details, setDetails] = useState<CollectionDetails | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [selectedPatientId, setSelectedPatientId] = useState(patientId);

  const patient = patients.find((p) => p.id === selectedPatientId);

  useEffect(() => { setSelectedPatientId(patientId); }, [patientId]);

  useEffect(() => {
    if (patient) {
      setDetails({
        patientId: selectedPatientId,
        demographics: {
          age: patient.age?.toString() || "", gender: patient.gender || "", dob: "",
          bloodGroup: patient.bloodGroup || "", weight: patient.weight?.toString() || "",
          height: patient.height?.toString() || "", occupation: "", maritalStatus: "",
        },
        vitals: { temp: "", bp: "", pulse: "", spo2: "", rr: "" },
        insurance: { hasInsurance: false, insuranceProvider: "", policyNumber: "", validity: "" },
        emergencyContact: { name: patient.emergencyContact || "", relationship: "", phone: "" },
        address: { street: patient.address || "", city: "", state: "", pincode: "" },
      });
    }
  }, [patient, selectedPatientId]);

  const patientBills = useMemo(() => {
    let filtered = bills.filter((b) => b.patientId === selectedPatientId);
    if (dateFrom) filtered = filtered.filter((b) => b.timestamp >= dateFrom);
    if (dateTo) filtered = filtered.filter((b) => b.timestamp <= dateTo);
    if (serviceFilter !== "all") filtered = filtered.filter((b) => b.kind.toLowerCase() === serviceFilter);
    return filtered;
  }, [bills, selectedPatientId, dateFrom, dateTo, serviceFilter]);

  const patientDischarges = useMemo(() => {
    return dischargePlans.filter((d) => d.patientId === selectedPatientId);
  }, [dischargePlans, selectedPatientId]);

  const patientNotes = useMemo(() => {
    return clinicalNotes.filter((n) => n.patientId === selectedPatientId);
  }, [clinicalNotes, selectedPatientId]);

  const handleSave = () => {
    if (!details) return;
    logAudit("Patient details updated", `IP/OP collection details for ${selectedPatientId}`, doctorName);
    toast.success("Patient details saved successfully");
    setEditOpen(false);
  };

  const handlePrint = () => {
    logAudit("Patient details printed", `IP/OP collection details for ${selectedPatientId}`, doctorName);
    window.print();
    toast.success("Printing patient details");
  };

  if (!patient || !details) {
    return (
      <GlassCard>
        <p className="text-sm text-slate-500 text-center py-4">Select a patient to view collection details</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Patient Selector */}
      <GlassCard>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <select className="input-dark" value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.id} — {p.name} ({p.age}y · {p.gender})</option>
              ))}
            </select>
          </div>
          <button className="btn-ghost" onClick={handlePrint}><Printer size={14} /> Print</button>
          <button className="btn-neon" onClick={() => setEditOpen(true)}><FileText size={14} /> Edit Details</button>
        </div>
      </GlassCard>

      {/* Demographics & Vitals Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <GlassCard className="xl:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Demographics</h3>
            <Badge tone={patient.admissionStatus === "inpatient" ? "red" : patient.admissionStatus === "discharged" ? "neutral" : "cyan"} className="!text-[8px] ml-auto">
              {patient.admissionStatus || "outpatient"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Age", value: details.demographics.age || patient.age?.toString() || "—" },
              { label: "Gender", value: details.demographics.gender || patient.gender || "—" },
              { label: "Blood Group", value: details.demographics.bloodGroup || patient.bloodGroup || "—" },
              { label: "Weight", value: details.demographics.weight || patient.weight?.toString() || "—" },
              { label: "Height", value: details.demographics.height || patient.height?.toString() || "—" },
              { label: "Phone", value: patient.phone || "—" },
              { label: "Email", value: patient.email || "—" },
              { label: "Doctor", value: patient.linkedDoctor || "—" },
              { label: "Department", value: patient.department || "—" },
              { label: "Aadhaar", value: patient.aadhaar || "—" },
              { label: "Occupation", value: patient.occupation || "—" },
              { label: "MLC Status", value: patient.mlc ? "✓ MLC Case" : "Non-MLC" },
            ].map(({ label, value }) => (
              <div key={label} className={cn("rounded-lg border p-2", label === "MLC Status" && patient.mlc ? "border-red-400/40 bg-red-500/10" : "border-white/10 bg-white/[0.03]")}>
                <p className="text-[8px] text-slate-500 uppercase mb-0.5">{label}</p>
                <p className={cn("text-xs font-medium truncate", label === "MLC Status" && patient.mlc ? "text-red-300" : "text-white")}>{value}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} className="text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Vitals</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Temp", value: details.vitals.temp || "—", unit: "°F" },
              { label: "BP", value: details.vitals.bp || "—", unit: "mmHg" },
              { label: "Pulse", value: details.vitals.pulse || "—", unit: "/min" },
              { label: "SpO2", value: details.vitals.spo2 || "—", unit: "%" },
              { label: "RR", value: details.vitals.rr || "—", unit: "/min" },
            ].map(({ label, value, unit }) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                <p className="text-[8px] text-slate-500 uppercase">{label}</p>
                <p className="text-xs font-medium text-white">{value} <span className="text-[9px] text-slate-400">{unit}</span></p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Insurance & Emergency Contact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={16} className="text-violet-400" />
            <h3 className="text-sm font-bold text-white">Insurance</h3>
            {details.insurance.hasInsurance && <Badge tone="green" className="!text-[8px]">Insured</Badge>}
          </div>
          {details.insurance.hasInsurance ? (
            <div className="grid grid-cols-2 gap-2">
              {[{ label: "Provider", value: details.insurance.insuranceProvider }, { label: "Policy No", value: details.insurance.policyNumber }, { label: "Validity", value: details.insurance.validity }].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <p className="text-[8px] text-slate-500 uppercase">{label}</p>
                  <p className="text-xs font-medium text-white">{value || "—"}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500">No insurance</p>}
        </GlassCard>

        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Phone size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">Emergency Contact</h3>
          </div>
          {details.emergencyContact.name ? (
            <div className="grid grid-cols-2 gap-2">
              {[{ label: "Name", value: details.emergencyContact.name }, { label: "Relation", value: details.emergencyContact.relationship }, { label: "Phone", value: details.emergencyContact.phone }].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <p className="text-[8px] text-slate-500 uppercase">{label}</p>
                  <p className="text-xs font-medium text-white">{value || "—"}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500">No emergency contact</p>}
          {patient.complaint && (
            <div className="mt-2 rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-2">
              <p className="text-[8px] text-cyan-400 uppercase mb-0.5">Complaint / Symptoms</p>
              <p className="text-xs text-slate-200">{patient.complaint}</p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Service History with Date Range */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle title="Service History" subtitle="OP, IP, and direct services" />
          <div className="flex items-center gap-2">
            <CalendarRange size={14} className="text-slate-500" />
            <input type="date" className="input-dark !py-1 !text-[11px] !w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" />
            <span className="text-slate-500 text-xs">to</span>
            <input type="date" className="input-dark !py-1 !text-[11px] !w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" />
          </div>
        </div>
        <div className="flex gap-1 mb-3">
          {(["all", "op", "ip", "direct"] as ServiceFilter[]).map((f) => (
            <button key={f} onClick={() => setServiceFilter(f)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all",
                serviceFilter === f ? "bg-cyan-500/20 text-white border-cyan-400/50" : "text-slate-400 border-white/10 hover:text-white")}>
              {f === "all" ? "All Services" : f.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {patientBills.length === 0 && <p className="text-xs text-slate-500">No services found for this period.</p>}
          {patientBills.map((b) => (
            <div key={b.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className={cn("rounded-lg p-2 border", b.kind === "IP" ? "border-red-400/30 bg-red-500/10" : "border-cyan-400/30 bg-cyan-500/10")}>
                <Receipt size={14} className={b.kind === "IP" ? "text-red-300" : "text-cyan-300"} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">{b.service}</span>
                  <Badge tone={b.kind === "IP" ? "red" : "cyan"} className="!text-[8px]">{b.kind}</Badge>
                </div>
                <p className="text-[10px] text-slate-500">Receipt: {b.receiptNo} · {b.timestamp} · {b.mode}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white">₹{b.amount.toLocaleString("en-IN")}</p>
                <p className="text-[9px] text-slate-500">{b.reference}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Discharge Summaries */}
      {patientDischarges.length > 0 && (
        <GlassCard>
          <SectionTitle title="Discharge Summaries" subtitle="Past discharge records" />
          <div className="space-y-2">
            {patientDischarges.map((d) => (
              <div key={d.id} className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <ScrollText size={14} className="text-amber-400" />
                  <span className="text-xs font-bold text-white">Discharge — {d.dischargeDate}</span>
                  <Badge tone={d.status === "discharged" ? "green" : "amber"} className="!text-[8px]">{d.status}</Badge>
                </div>
                <p className="text-[11px] text-slate-300">Diagnosis: {d.diagnosis}</p>
                {d.proceduresPerformed?.length > 0 && (
                  <p className="text-[10px] text-slate-400">Procedures: {d.proceduresPerformed.join(", ")}</p>
                )}
                <p className="text-[10px] text-slate-400">Condition: {d.conditionAtDischarge} · Follow-up: {d.followUpDate}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Patient Collection Details" wide>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Demographics</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Age</label><input className="input-dark" value={details.demographics.age} onChange={(e) => setDetails({ ...details, demographics: { ...details.demographics, age: e.target.value } })} /></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Gender</label><select className="input-dark" value={details.demographics.gender} onChange={(e) => setDetails({ ...details, demographics: { ...details.demographics, gender: e.target.value } })}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Blood Group</label><select className="input-dark" value={details.demographics.bloodGroup} onChange={(e) => setDetails({ ...details, demographics: { ...details.demographics, bloodGroup: e.target.value } })}><option value="">Select</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Weight (kg)</label><input className="input-dark" type="number" value={details.demographics.weight} onChange={(e) => setDetails({ ...details, demographics: { ...details.demographics, weight: e.target.value } })} /></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Height (cm)</label><input className="input-dark" type="number" value={details.demographics.height} onChange={(e) => setDetails({ ...details, demographics: { ...details.demographics, height: e.target.value } })} /></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Aadhaar</label><input className="input-dark" value={patient.aadhaar || ""} placeholder="12-digit Aadhaar" onChange={(e) => {}} /></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Email</label><input className="input-dark" value={patient.email || ""} placeholder="Email address" onChange={(e) => {}} /></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Occupation</label><input className="input-dark" value={details.demographics.occupation || patient.occupation || ""} onChange={(e) => setDetails({ ...details, demographics: { ...details.demographics, occupation: e.target.value } })} /></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Marital Status</label><select className="input-dark" value={details.demographics.maritalStatus} onChange={(e) => setDetails({ ...details, demographics: { ...details.demographics, maritalStatus: e.target.value } })}><option value="">Select</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></div>
              </div>
            </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Vitals</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Temp (°F)</label><input className="input-dark" value={details.vitals.temp} onChange={(e) => setDetails({ ...details, vitals: { ...details.vitals, temp: e.target.value } })} /></div>
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">BP (mmHg)</label><input className="input-dark" value={details.vitals.bp} onChange={(e) => setDetails({ ...details, vitals: { ...details.vitals, bp: e.target.value } })} /></div>
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Pulse (/min)</label><input className="input-dark" value={details.vitals.pulse} onChange={(e) => setDetails({ ...details, vitals: { ...details.vitals, pulse: e.target.value } })} /></div>
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">SpO2 (%)</label><input className="input-dark" value={details.vitals.spo2} onChange={(e) => setDetails({ ...details, vitals: { ...details.vitals, spo2: e.target.value } })} /></div>
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">RR (/min)</label><input className="input-dark" value={details.vitals.rr} onChange={(e) => setDetails({ ...details, vitals: { ...details.vitals, rr: e.target.value } })} /></div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Insurance</h4>
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" checked={details.insurance.hasInsurance} onChange={(e) => setDetails({ ...details, insurance: { ...details.insurance, hasInsurance: e.target.checked } })} />
              <label className="text-xs text-slate-300">Has Insurance</label>
            </div>
            {details.insurance.hasInsurance && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Provider</label><input className="input-dark" value={details.insurance.insuranceProvider} onChange={(e) => setDetails({ ...details, insurance: { ...details.insurance, insuranceProvider: e.target.value } })} /></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Policy Number</label><input className="input-dark" value={details.insurance.policyNumber} onChange={(e) => setDetails({ ...details, insurance: { ...details.insurance, policyNumber: e.target.value } })} /></div>
                <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Validity</label><input className="input-dark" type="date" value={details.insurance.validity} onChange={(e) => setDetails({ ...details, insurance: { ...details.insurance, validity: e.target.value } })} /></div>
              </div>
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Emergency Contact</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Name</label><input className="input-dark" value={details.emergencyContact.name} onChange={(e) => setDetails({ ...details, emergencyContact: { ...details.emergencyContact, name: e.target.value } })} /></div>
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Relationship</label><input className="input-dark" value={details.emergencyContact.relationship} onChange={(e) => setDetails({ ...details, emergencyContact: { ...details.emergencyContact, relationship: e.target.value } })} /></div>
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Phone</label><input className="input-dark" value={details.emergencyContact.phone} onChange={(e) => setDetails({ ...details, emergencyContact: { ...details.emergencyContact, phone: e.target.value } })} /></div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Address</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2"><label className="text-xs font-semibold text-slate-400 mb-1 block">Street</label><input className="input-dark" value={details.address.street} onChange={(e) => setDetails({ ...details, address: { ...details.address, street: e.target.value } })} /></div>
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">City</label><input className="input-dark" value={details.address.city} onChange={(e) => setDetails({ ...details, address: { ...details.address, city: e.target.value } })} /></div>
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">State</label><input className="input-dark" value={details.address.state} onChange={(e) => setDetails({ ...details, address: { ...details.address, state: e.target.value } })} /></div>
              <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Pincode</label><input className="input-dark" value={details.address.pincode} onChange={(e) => setDetails({ ...details, address: { ...details.address, pincode: e.target.value } })} /></div>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={handleSave}>Save Details</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
