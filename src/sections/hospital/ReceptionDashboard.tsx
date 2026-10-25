// Comprehensive Reception Dashboard — one unified view of all reception tools
// Voice Registration, OP Scan, Appointments, Billing, Sparta Cloud, Reputation, Notifications

import { useState } from "react";
import {
  CalendarDays,
  Cloud,
  CreditCard,
  Hospital,
  Mic,
  ScanLine,
  Search,
  Star,
  BellRing,
  UserPlus,
  Users,
  Clock,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import OPScan from "./OPScan";
import { Appointments } from "./Appointments";
import { Billing } from "./Billing";
import { CloudHMS } from "./CloudHMS";
import { Reputation } from "./Reputation";
import { Notifications } from "./Notifications";
import { useSpeechRecognition } from "@/lib/speech";
import {
  consultFee,
  emptyRegistration,
  parseTranscriptLocal,
  type RegistrationFormData,
} from "@/lib/registration";
import { aiExtractRegistration } from "@/lib/registration";
import { BrainCircuit, RotateCcw, UserPlus as UserPlusIcon, Printer, Star as StarIcon } from "lucide-react";
import { toast } from "sonner";
import { ReceiptView } from "@/components/Receipt";
import type { Bill, PatientRecord } from "@/lib/types";
import { nowTime } from "@/lib/utils";

const DEPARTMENTS = ["General Medicine", "Orthopaedics", "Paediatrics", "Cardiology", "Dermatology", "OBG", "Ophthalmology", "ENT", "Dental"];
const DOCTORS = ["Dr. Arjun Rao", "Dr. Nandini S", "Dr. Kunal M", "Dr. Admin"];

type ReceptionTab = "registration" | "appointments" | "billing" | "sparta" | "reputation" | "notifications";

export function ReceptionDashboard() {
  const { account } = useAuth();
  const { patients, appointments } = useStore();
  const [tab, setTab] = useState<ReceptionTab>("registration");

  const todayISO = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter((a) => a.date === todayISO);
  const checkedIn = todayAppointments.filter((a) => a.status === "checked-in" || a.status === "in-consult");
  const todayPatients = patients.filter((p) => p.registeredAt?.startsWith(new Date().toLocaleDateString("en-IN")));

  const tabs = [
    { key: "registration" as ReceptionTab, label: "Voice Registration", icon: Mic, count: 0 },
    { key: "appointments" as ReceptionTab, label: "Appointments", icon: CalendarDays, count: todayAppointments.length },
    { key: "billing" as ReceptionTab, label: "Billing", icon: CreditCard, count: 0 },
    { key: "sparta" as ReceptionTab, label: "Sparta Cloud", icon: Cloud, count: 0 },
    { key: "reputation" as ReceptionTab, label: "Reputation", icon: Star, count: 0 },
    { key: "notifications" as ReceptionTab, label: "Notifications", icon: BellRing, count: 0 },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      {/* Role header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient">Reception Desk</h1>
          <p className="text-sm text-slate-400 mt-1">
            {account?.name ?? "Receptionist"} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="cyan" className="!text-[10px]">
            <Users size={12} className="mr-1" /> {todayPatients.length} registered today
          </Badge>
          <Badge tone="amber" className="!text-[10px]">
            <Clock size={12} className="mr-1" /> {checkedIn.length} checked in now
          </Badge>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all border",
              tab === key
                ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_14px_rgba(212,175,55,0.25)]"
                : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white hover:bg-white/[0.06]"
            )}
          >
            <Icon size={16} className={tab === key ? "text-neon-cyan" : ""} />
            {label}
            {count > 0 && (
              <span className={cn(
                "text-[10px] rounded-full px-1.5 py-0.5 font-semibold",
                tab === key ? "bg-cyan-500/20 text-cyan-300" : "bg-white/10 text-slate-400"
              )}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "registration" && <VoiceRegistrationFull />}
      {tab === "appointments" && <Appointments onNavigate={() => {}} />}
      {tab === "billing" && <Billing />}
      {tab === "sparta" && <CloudHMS />}
      {tab === "reputation" && <Reputation />}
      {tab === "notifications" && <Notifications />}
    </div>
  );
}

// Full voice registration with all fields
function VoiceRegistrationFull() {
  const { settings, addPatient, addBill, addSendLog, patients, prefillReg, setPrefillReg, logAudit } = useStore();
  const speech = useSpeechRecognition();
  const [form, setForm] = useState<RegistrationFormData>(emptyRegistration);
  const [typed, setTyped] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [sendWa, setSendWa] = useState(true);
  const [receipt, setReceipt] = useState<{ bill: Bill; patient: PatientRecord } | null>(null);
  const [uhid, setUhid] = useState("");
  const [searchResults, setSearchResults] = useState<PatientRecord[]>([]);
  const [referral, setReferral] = useState("");

  // Extra patient fields
  const [extra, setExtra] = useState({
    bloodGroup: "",
    weight: "",
    height: "",
    bp: "",
    allergies: "",
    emergencyContact: "",
    emergencyPhone: "",
    maritalStatus: "",
    occupation: "",
    aadhar: "",
    religion: "",
    nationality: "Indian",
  });

  const set = (k: keyof RegistrationFormData, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setExtraField = (k: keyof typeof extra, v: string) => setExtra((f) => ({ ...f, [k]: v }));

  const merge = (p: Partial<RegistrationFormData>) =>
    setForm((f) => {
      const next = { ...f };
      (Object.keys(p) as (keyof RegistrationFormData)[]).forEach((k) => {
        const v = p[k];
        if (v !== undefined && v !== "") {
          (next as unknown as Record<string, string>)[k] = String(v);
        }
      });
      return next;
    });

  // prefill from OP Scan
  useState(() => {
    if (prefillReg) {
      merge(prefillReg);
      setPrefillReg(null);
    }
  });

  // Search existing patients by UHID or phone
  const searchPatient = () => {
    const q = uhid.trim().toLowerCase();
    if (!q) return;
    const results = patients.filter(
      (p) => p.id.toLowerCase().includes(q) || p.phone?.includes(q) || p.name.toLowerCase().includes(q)
    );
    setSearchResults(results);
    if (results.length === 0) toast.info("No matching patient found — new registration");
  };

  // auto-parse live transcript
  useState(() => {
    const text = speech.transcript;
    if (!text.trim()) return;
    const timer = setTimeout(() => merge(parseTranscriptLocal(text)), 500);
    return () => clearTimeout(timer);
  });

  const runAiExtract = async (source: string) => {
    const text = source.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    toast.info("AI extraction running…");
    try {
      const { data } = await aiExtractRegistration(text, settings);
      merge(data);
      toast.success("Form filled by AI extract — review every field.");
    } catch {
      toast.error("AI extract failed — local parse results remain.");
    }
    setAiBusy(false);
  };

  const confirm = () => {
    if (!form.name.trim()) { toast.error("Patient name is required"); return; }
    const patient = addPatient({
      name: form.name.trim(),
      age: form.age ? Number(form.age) : undefined,
      gender: form.gender || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      department: form.department || "General Medicine",
      linkedDoctor: form.doctor || undefined,
      complaint: form.complaint || undefined,
      source: "voice",
    });
    const dept = form.department || "General Medicine";
    const fee = consultFee(dept);
    const ref = form.mode === "UPI" ? `upi://txn/${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      : form.mode === "Card" ? `POS-${Math.floor(10000 + Math.random() * 89999)}`
      : "CASH-DRAWER-A";
    const bill = addBill({
      patientId: patient.id,
      kind: "OP",
      service: `Consultation — ${dept}`,
      amount: fee,
      staffName: "Reception Desk",
      timestamp: nowTime(),
      mode: form.mode,
      reference: ref,
    });
    if (sendWa && patient.phone) {
      addSendLog({ provider: "WhatsApp", template: "bill_receipt", recipient: `${patient.name} (${patient.phone})`, status: "sent" });
    }
    logAudit("Registration", `${patient.id} ${patient.name} · ${dept} · ${bill.receiptNo} ₹${fee}`, "Reception Desk");
    setReceipt({ bill, patient });
  };

  const resetAll = () => {
    setForm(emptyRegistration);
    setTyped("");
    setExtra({
      bloodGroup: "", weight: "", height: "", bp: "", allergies: "", emergencyContact: "",
      emergencyPhone: "", maritalStatus: "", occupation: "", aadhar: "", religion: "", nationality: "Indian",
    });
    speech.reset();
    setUhid("");
    setSearchResults([]);
  };

  const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  return (
    <div className="space-y-4">
      {/* UHID Search / Duplicate Detection */}
      <GlassCard>
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input-dark !pl-9"
              placeholder="Search by UHID, phone, or name (duplicate check)"
              value={uhid}
              onChange={(e) => setUhid(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchPatient()}
            />
          </div>
          <button className="btn-neon !text-xs !py-2" onClick={searchPatient}>
            <Search size={13} /> Search
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] text-amber-300 font-semibold">Existing patient(s) found — select to prefill or register new:</p>
            {searchResults.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <Badge tone="cyan" className="!text-[9px] font-mono">{p.id}</Badge>
                <span className="text-xs text-slate-200 flex-1">{p.name} · {p.age}y · {p.gender} · {p.phone}</span>
                <button className="btn-ghost !text-[10px] !py-1" onClick={() => {
                  setForm((f) => ({
                    ...f,
                    name: p.name,
                    age: String(p.age ?? ""),
                    gender: p.gender ?? "",
                    phone: p.phone ?? "",
                    address: p.address ?? "",
                    department: p.department ?? "",
                    doctor: p.linkedDoctor ?? "",
                    complaint: p.complaint ?? "",
                  }));
                  setSearchResults([]);
                  toast.info("Prefilled from existing patient");
                }}>
                  Prefill
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-600 mt-2">Check for duplicates before registering — AI will flag likely matches.</p>
      </GlassCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Voice Capture */}
        <GlassCard>
          <SectionTitle title="Voice Capture" subtitle="Hold mic → speak patient details → auto-fill form" />
          <div className="flex flex-col items-center py-4">
            <button
              onMouseDown={() => speech.start()}
              onMouseUp={() => speech.stop()}
              onMouseLeave={() => { if (speech.listening) speech.stop(); }}
              onTouchStart={() => speech.start()}
              onTouchEnd={() => speech.stop()}
              disabled={!speech.supported}
              className={cn(
                "h-28 w-28 rounded-full border-2 flex items-center justify-center transition-all duration-200 select-none",
                speech.listening
                  ? "border-red-400 bg-red-400/15 shadow-[0_0_40px_rgba(248,113,113,0.5)] scale-110"
                  : "border-violet-400/60 bg-violet-500/10 hover:bg-violet-500/20 shadow-[0_0_24px_rgba(212,175,55,0.3)]",
                !speech.supported && "opacity-40 cursor-not-allowed"
              )}
            >
              {speech.listening ? <Mic size={38} className="text-red-300 animate-pulse" /> : <Mic size={38} className="text-violet-300" />}
            </button>
            <p className="text-xs text-slate-400 mt-3">
              {!speech.supported ? "Speech not available — use typed dictation below."
                : speech.listening ? "Listening… release to stop"
                : "Hold mic, speak patient details naturally"}
            </p>
          </div>

          {(speech.transcript || speech.interim) && (
            <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3 text-sm text-slate-200 min-h-[40px]">
              {speech.transcript} <span className="text-cyan-300/70">{speech.interim}</span>
            </div>
          )}

          <div className="mt-4">
            <label className="text-[11px] text-slate-500">Typed dictation</label>
            <textarea className="input-dark resize-none mt-1" rows={2} placeholder='e.g. "name Ramesh, 45, male, fever 3 days, cash"'
              value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>

          <div className="flex gap-2 mt-3">
            <button className="btn-ghost !text-xs flex-1" disabled={!typed.trim()}
              onClick={() => { merge(parseTranscriptLocal(typed)); toast.success("Parsed locally"); }}>
              Parse
            </button>
            <button className="btn-neon !text-xs flex-1" disabled={aiBusy || (!typed.trim() && !speech.transcript.trim())}
              onClick={() => void runAiExtract(typed.trim() || speech.transcript)}>
              {aiBusy ? <span className="h-3 w-3 rounded-full border-2 border-black/40 border-t-transparent animate-spin" /> : <BrainCircuit size={13} />}
              AI Extract
            </button>
            <button className="btn-ghost !text-xs" onClick={resetAll}><RotateCcw size={13} /> Reset</button>
          </div>
        </GlassCard>

        {/* Registration Form */}
        <GlassCard>
          <SectionTitle title="OP Registration" subtitle="All fields — voice or manual entry" />
          <div className="grid grid-cols-3 gap-2.5">
            {/* Row 1: Name + Age + Gender */}
            <input className="input-dark col-span-2" placeholder="Patient name *" value={form.name} onChange={(e) => set("name", e.target.value)} />
            <input className="input-dark" placeholder="Age" value={form.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))} />
            
            {/* Row 2: Gender + Phone + Blood Group */}
            <select className="input-dark" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Gender</option><option>Male</option><option>Female</option><option>Other</option>
            </select>
            <input className="input-dark" placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} />
            <select className="input-dark" value={extra.bloodGroup} onChange={(e) => setExtraField("bloodGroup", e.target.value)}>
              <option value="">Blood Group</option>
              {BLOOD_GROUPS.map((bg) => <option key={bg}>{bg}</option>)}
            </select>

            {/* Row 3: Weight + Height + BP */}
            <input className="input-dark" placeholder="Weight (kg)" value={extra.weight} onChange={(e) => setExtraField("weight", e.target.value.replace(/\D/g, ""))} />
            <input className="input-dark" placeholder="Height (cm)" value={extra.height} onChange={(e) => setExtraField("height", e.target.value.replace(/\D/g, ""))} />
            <input className="input-dark" placeholder="BP (e.g. 120/80)" value={extra.bp} onChange={(e) => setExtraField("bp", e.target.value)} />

            {/* Row 4: Department + Doctor + Marital */}
            <select className="input-dark" value={form.department} onChange={(e) => set("department", e.target.value)}>
              <option value="">Department</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input-dark" value={form.doctor} onChange={(e) => set("doctor", e.target.value)}>
              <option value="">Doctor</option>
              {DOCTORS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input-dark" value={extra.maritalStatus} onChange={(e) => setExtraField("maritalStatus", e.target.value)}>
              <option value="">Marital</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
            </select>

            {/* Row 5: Address + Occupation + Religion */}
            <input className="input-dark" placeholder="Address / Village" value={form.address} onChange={(e) => set("address", e.target.value)} />
            <input className="input-dark" placeholder="Occupation" value={extra.occupation} onChange={(e) => setExtraField("occupation", e.target.value)} />
            <input className="input-dark" placeholder="Religion" value={extra.religion} onChange={(e) => setExtraField("religion", e.target.value)} />

            {/* Row 6: Aadhar + Nationality + Referral */}
            <input className="input-dark" placeholder="Aadhar (XXXX XXXX XXXX)" value={extra.aadhar} onChange={(e) => setExtraField("aadhar", e.target.value.replace(/\D/g, "").slice(0, 12))} />
            <input className="input-dark" placeholder="Nationality" value={extra.nationality} onChange={(e) => setExtraField("nationality", e.target.value)} />
            <input className="input-dark" placeholder="Referred by" value={referral} onChange={(e) => setReferral(e.target.value)} />

            {/* Row 7: Emergency Contact */}
            <input className="input-dark" placeholder="Emergency contact name" value={extra.emergencyContact} onChange={(e) => setExtraField("emergencyContact", e.target.value)} />
            <input className="input-dark" placeholder="Emergency phone" value={extra.emergencyPhone} onChange={(e) => setExtraField("emergencyPhone", e.target.value.replace(/\D/g, "").slice(0, 10))} />
            <input className="input-dark" placeholder="Allergies (comma-separated)" value={extra.allergies} onChange={(e) => setExtraField("allergies", e.target.value)} />

            {/* Row 8: Complaint + Payment */}
            <textarea className="input-dark col-span-2 resize-none" rows={2} placeholder="Presenting complaint / symptoms"
              value={form.complaint} onChange={(e) => set("complaint", e.target.value)} />
            <div className="flex flex-col gap-2">
              <div className="flex gap-1">
                {(["UPI", "Card", "Cash"] as const).map((m) => (
                  <button key={m} onClick={() => set("mode", m)}
                    className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all flex-1",
                      form.mode === m ? "bg-violet-500/20 text-white border-violet-400/50" : "text-slate-400 border-white/10 hover:text-white")}>
                    {m}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500 text-center">
                Fee: <span className="text-violet-300 font-bold">₹{consultFee(form.department || "General Medicine").toLocaleString("en-IN")}</span>
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 mt-3 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={sendWa} onChange={(e) => setSendWa(e.target.checked)} className="accent-yellow-500" />
            Send WhatsApp bill receipt + appointment confirmation
          </label>

          <button className="btn-neon w-full mt-3" disabled={!form.name.trim()} onClick={confirm}>
            <UserPlusIcon size={15} /> Register & Bill — ₹{consultFee(form.department || "General Medicine").toLocaleString("en-IN")}
          </button>
        </GlassCard>
      </div>

      {/* Today's Patients */}
      <GlassCard>
        <SectionTitle title={`Today's Registrations (${patients.length})`} subtitle="Newest first" />
        {patients.length === 0 && <p className="text-xs text-slate-500">No patients registered yet.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {patients.slice().reverse().slice(0, 12).map((p) => (
            <div key={p.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <div className="flex items-center gap-2">
                <Badge tone="cyan" className="!text-[9px] font-mono shrink-0">{p.id}</Badge>
                <span className="text-xs font-semibold text-white truncate">{p.name}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {[p.age && `${p.age}y`, p.gender, p.department, p.linkedDoctor, p.registeredAt].filter(Boolean).join(" · ")}
              </div>
              {p.phone && <div className="text-[10px] text-slate-600 mt-0.5">📞 {p.phone}</div>}
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Receipt Overlay */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="relative z-10 space-y-4 max-h-[90vh] overflow-y-auto">
            <ReceiptView bill={receipt.bill} patient={receipt.patient} />
            <div className="flex gap-2 justify-center flex-wrap">
              <button className="btn-neon" onClick={() => window.print()}>
                <Printer size={15} /> Print Receipt
              </button>
              <button className="btn-ghost" onClick={() => {
                addSendLog({ provider: "WhatsApp", template: "review_request", recipient: receipt.patient.phone || receipt.patient.name, status: "sent" });
                toast.success("Google review request sent via WhatsApp");
              }}>
                <StarIcon size={15} /> Request Review
              </button>
              <button className="btn-ghost" onClick={() => { setReceipt(null); resetAll(); toast.success("Ready for next patient"); }}>
                Next Patient →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
