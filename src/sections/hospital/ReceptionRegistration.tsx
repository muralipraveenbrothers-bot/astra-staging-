import { useState, useRef, useEffect } from "react";
import { UserPlus, Search, QrCode, Activity, Heart, Thermometer, Wind, Droplets, BadgeCheck, Languages, CheckCircle, ArrowRight, Stethoscope, AlertTriangle, Ambulance, ShieldAlert, Save } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, nowTime, uid } from "@/lib/utils";
import type { PatientRecord, MLCRecord } from "@/lib/types";
import { OrderStatusChip } from "@/astra/clinical/workflow/OrderStatusChip";
import { ORDER_EVENTS } from "@/astra/clinical/workflow/orderEvents";
import { publishWorkflowEvent } from "@/astra/clinical/workflow/workflowClient";
import { MLCForm } from "./MLCForm";
import { speakHumanVoice } from "@/utils/audioAlerts";

const OCCUPATIONS = [
  "", "Daily Worker", "Farmer", "Teacher", "Auto Driver", "Driver",
  "Software Engineer", "Doctor", "Nurse", "Engineer", "Lawyer",
  "Accountant", "Business Owner", "Shop Keeper", "Carpenter",
  "Plumber", "Electrician", "Mechanic", "Housewife", "Student",
  "Government Employee", "Private Employee", "Police", "Army",
  "Retired", "Unemployed", "Self Employed", "Tailor", "Cook",
  "Security Guard", "Sweeper", "Peon", "Manager", "Contractor",
  "Fisherman", "Artist", "Writer", "Journalist", "Social Worker",
  "Priest", "Others",
];

type RegType = "op" | "ip" | "emergency";

interface RegForm {
  name: string; age: string; gender: string; phone: string; email: string; address: string;
  department: string; doctor: string; complaint: string; mode: string;
  bloodGroup: string; weight: string; height: string;
  aadhaar: string; occupation: string;
  // vitals
  temp: string; bp: string; pulse: string; spo2: string; rr: string;
  // emergency
  emergencyContact: string; emergencyPhone: string; allergies: string;
}

const emptyForm: RegForm = {
  name: "", age: "", gender: "", phone: "", email: "", address: "",
  department: "General Medicine", doctor: "", complaint: "", mode: "Cash",
  bloodGroup: "", weight: "", height: "",
  aadhaar: "", occupation: "",
  temp: "", bp: "", pulse: "", spo2: "", rr: "",
  emergencyContact: "", emergencyPhone: "", allergies: "",
};

const DEPARTMENTS = ["General Medicine", "Orthopaedics", "Paediatrics", "Cardiology", "Dermatology", "OBG", "Ophthalmology", "ENT", "Dental"];
const DOCTORS = ["Dr. Arjun Rao", "Dr. Nandini S", "Dr. Kunal M", "Dr. Admin"];

const GREETINGS = {
  en: [
    "Thank you for choosing our hospital. We wish you a speedy recovery!",
    "Welcome to our hospital. Our team is committed to your care and wellbeing.",
    "We appreciate your trust in us. Thank you for choosing our healthcare services.",
  ],
  te: [
    "మా ఆసుపత్రిని ఎంచుకున్నందుకు ధన్యవాదాలు. మీరు త్వరగా కోలుకోవాలని కోరుకుంటున్నాము!",
    "మా ఆసుపత్రికి స్వాగతం. మీ సంరక్షణ మరియు శ్రేయస్సు కోసం మా బృందం కట్టుబడి ఉంది.",
    "మాపై మీరు ఉంచిన నమ్మకానికి ధన్యవాదాలు. మా ఆరోగ్య సంరక్షణ సేవలను ఎంచుకున్నందుకు ధన్యవాదాలు.",
  ],
};

function generateOpNumber(): string { return `OP-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`; }
function generateMrNumber(): string { return `MR-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`; }
function generateBarcodeData(id: string): string { return `HOSP::${id}::${Date.now()}`; }

export function ReceptionRegistration({ onAdmit }: { onAdmit?: () => void }) {
  const { account } = useAuth();
  const { patients, addPatient, bills, addBill, logAudit } = useStore();
  const [regType, setRegType] = useState<RegType>("op");
  const [form, setForm] = useState<RegForm>(emptyForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientRecord[]>([]);
  const [showGreet, setShowGreet] = useState(false);
  const [greetLang, setGreetLang] = useState<"en" | "te">("en");
  const [greetText, setGreetText] = useState("");
  const [generatedOp, setGeneratedOp] = useState("");
  const [generatedMr, setGeneratedMr] = useState("");
  const [showBarcode, setShowBarcode] = useState(false);
  useEffect(() => {
    setGeneratedOp(generateOpNumber());
    setGeneratedMr(generateMrNumber());
  }, [form.name]);

  const set = (k: keyof RegForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const searchPatient = () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const results = patients.filter((p) => p.id.toLowerCase().includes(q) || p.phone?.includes(q) || p.name.toLowerCase().includes(q));
    setSearchResults(results);
    if (results.length === 0) toast.info("New patient — fill registration form");
  };

  const prefillFromExisting = (p: PatientRecord) => {
    setForm((f) => ({
      ...f, name: p.name, age: String(p.age ?? ""), gender: p.gender ?? "",
      phone: p.phone ?? "", address: p.address ?? "", department: p.department ?? "General Medicine",
      doctor: p.linkedDoctor ?? "", complaint: p.complaint ?? "",
      bloodGroup: p.bloodGroup ?? "", weight: String(p.weight ?? ""), height: String(p.height ?? ""),
      allergies: p.allergies ?? "", emergencyContact: p.emergencyContact ?? "",
    }));
    setSearchResults([]);
    toast.success("Prefilled from existing record");
  };

  const speakGreeting = (text: string, lang: "en" | "te") => {
    speakHumanVoice(text, undefined, undefined, () => toast.error("Voicebox is offline"),
      "empathetic", lang === "te" ? "te-IN" : "en-IN");
  };

  const showRandomGreeting = () => {
    const lang: "en" | "te" = Math.random() > 0.6 ? "te" : "en";
    const texts = GREETINGS[lang];
    const text = texts[Math.floor(Math.random() * texts.length)];
    setGreetLang(lang);
    setGreetText(text);
    setShowGreet(true);
    speakGreeting(text, lang);
  };

  const register = () => {
    if (!form.name.trim()) { toast.error("Patient name is required"); return; }

    const patient = addPatient({
      name: form.name.trim(),
      age: form.age ? Number(form.age) : undefined,
      gender: form.gender || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      department: form.department || "General Medicine",
      linkedDoctor: form.doctor || undefined,
      complaint: form.complaint || undefined,
      allergies: form.allergies || undefined,
      weight: form.weight ? Number(form.weight) : undefined,
      height: form.height ? Number(form.height) : undefined,
      bloodGroup: form.bloodGroup || undefined,
      emergencyContact: form.emergencyContact || undefined,
      aadhaar: form.aadhaar || undefined,
      occupation: form.occupation || undefined,
      mlc: isMLC,
      admissionStatus: regType === "ip" ? "inpatient" : regType === "emergency" ? "inpatient" : "outpatient",
      source: "manual",
    });

    setLastRegisteredPatient(patient);
    void publishWorkflowEvent({
      event: ORDER_EVENTS.PATIENT_REGISTERED,
      patientUhid: patient.id,
      orderId: patient.id,
      actorId: account?.id ?? "reception",
      actorRole: account?.role ?? "reception",
      device: "reception-desk",
    });

    const fee = regType === "emergency" ? 1500 : regType === "ip" ? 0 : 800;
    if (fee > 0) {
      addBill({
        patientId: patient.id,
        kind: regType === "ip" ? "IP" : "OP",
        service: `${regType.toUpperCase()} Registration — ${form.department}`,
        amount: fee,
        staffName: account?.name ?? "Reception",
        timestamp: nowTime(),
        mode: form.mode as any,
        reference: form.mode === "UPI" ? `upi://txn/${Math.random().toString(36).slice(2, 8).toUpperCase()}` : `CASH-${Date.now()}`,
      });
    }

    logAudit("Registration", `${patient.id} ${patient.name} · ${regType.toUpperCase()} · ${form.department}${isMLC ? " · MLC" : ""}`, account?.name ?? "Reception");

    if (isMLC) {
      setShowMLCForm(true);
      return;
    }

    toast.success(`${regType.toUpperCase()} registration complete: ${patient.name}`, {
      description: `${generatedOp} | ${generatedMr}`,
    });

    showRandomGreeting();

    if (regType === "ip" || regType === "emergency") {
      setTimeout(() => { onAdmit?.(); }, 3000);
    }

    setForm(emptyForm);
    setIsMLC(false);
    setGeneratedOp(generateOpNumber());
    setGeneratedMr(generateMrNumber());
  };

  const resetAll = () => {
    setForm(emptyForm);
    setSearchQuery("");
    setSearchResults([]);
    setIsMLC(false);
    setShowMLCForm(false);
    setLastRegisteredPatient(null);
    setGeneratedOp(generateOpNumber());
    setGeneratedMr(generateMrNumber());
  };

  const handleMLCSave = (_record: MLCRecord) => {
    toast.success(`MLC created for ${lastRegisteredPatient?.name}`);
    setShowMLCForm(false);
    showRandomGreeting();
    setForm(emptyForm);
    setIsMLC(false);
    setLastRegisteredPatient(null);
    setGeneratedOp(generateOpNumber());
    setGeneratedMr(generateMrNumber());
  };

  const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const [isMLC, setIsMLC] = useState(false);
const [showMLCForm, setShowMLCForm] = useState(false);
const [lastRegisteredPatient, setLastRegisteredPatient] = useState<PatientRecord | null>(null);

  const typeIcons = { op: Stethoscope, ip: Activity, emergency: Ambulance };
  const typeLabels = { op: "OP Registration", ip: "IP Admission", emergency: "Emergency" };

  return (
    <div className="space-y-4">
      {lastRegisteredPatient && (
        <div className="flex items-center gap-2">
          <OrderStatusChip patientUhid={lastRegisteredPatient.id} role="reception" />
        </div>
      )}
      {/* Registration Type Selector */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          {(["op", "ip", "emergency"] as RegType[]).map((t) => {
            const Icon = typeIcons[t];
            return (
              <button key={t} onClick={() => setRegType(t)}
                className={cn("flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold border transition-all flex-1",
                  regType === t
                    ? t === "emergency"
                      ? "bg-red-500/20 text-red-200 border-red-400/50 shadow-[0_0_14px_rgba(239,68,68,0.3)]"
                      : "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_14px_rgba(212,175,55,0.25)]"
                    : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white")}>
                <Icon size={20} className={regType === t ? "text-neon-cyan" : ""} />
                <div className="text-left">
                  <div>{typeLabels[t]}</div>
                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                    {t === "op" ? "Outpatient consultation" : t === "ip" ? "Inpatient admission" : "Urgent care"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* Duplicate Check */}
      <GlassCard>
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input-dark !pl-9" placeholder="Search by UHID, phone, or name (duplicate check)" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchPatient()} />
          </div>
          <button className="btn-neon !text-xs !py-2" onClick={searchPatient}><Search size={13} /> Search</button>
          <button className="btn-ghost !text-xs" onClick={resetAll}>Reset</button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] text-amber-300 font-semibold">Existing patient(s) found — select to prefill:</p>
            {searchResults.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <Badge tone="cyan" className="!text-[9px] font-mono">{p.id}</Badge>
                <span className="text-xs text-slate-200 flex-1">{p.name} · {p.age}y · {p.gender} · {p.phone}</span>
                <button className="btn-ghost !text-[10px] !py-1" onClick={() => prefillFromExisting(p)}>Prefill</button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Auto-generated IDs & Barcode */}
      <GlassCard>
        <div className="flex items-center justify-between">
          <SectionTitle title="Patient Identifiers" subtitle="Auto-generated unique IDs" />
          <button className="btn-ghost !text-xs" onClick={() => setShowBarcode(!showBarcode)}>
            <QrCode size={14} /> {showBarcode ? "Hide" : "Show"} Barcode
          </button>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-4 py-2">
            <p className="text-[10px] text-slate-500 uppercase">OP Number</p>
            <p className="text-sm font-bold text-white font-mono">{generatedOp}</p>
          </div>
          <div className="rounded-lg border border-violet-400/20 bg-violet-500/10 px-4 py-2">
            <p className="text-[10px] text-slate-500 uppercase">MR Number</p>
            <p className="text-sm font-bold text-white font-mono">{generatedMr}</p>
          </div>
          {showBarcode && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 flex items-center gap-3">
              <QrCode size={32} className="text-cyan-400" />
              <div>
                <p className="text-[10px] text-slate-500">Barcode Data</p>
                <p className="text-[11px] font-mono text-slate-300">{generateBarcodeData(generatedOp)}</p>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Registration Form */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GlassCard>
          <SectionTitle title="Patient Details" subtitle="Demographics & symptoms" />
          <div className="grid grid-cols-2 gap-3">
            <input className="input-dark col-span-2" placeholder="Full name *" value={form.name} onChange={(e) => set("name", e.target.value)} />
            <input className="input-dark" placeholder="Age" type="number" value={form.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))} />
            <select className="input-dark" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Gender</option><option>Male</option><option>Female</option><option>Other</option>
            </select>
            <input className="input-dark col-span-2" placeholder="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} />
            <input className="input-dark col-span-2" placeholder="Email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <input className="input-dark col-span-2" placeholder="Address / Village" value={form.address} onChange={(e) => set("address", e.target.value)} />
            <input className="input-dark col-span-2" placeholder="Aadhaar Number (12 digits)" value={form.aadhaar} onChange={(e) => set("aadhaar", e.target.value.replace(/\D/g, "").slice(0, 12))} />
            <select className="input-dark col-span-2" value={form.occupation} onChange={(e) => set("occupation", e.target.value)}>
              {OCCUPATIONS.map((o) => <option key={o} value={o}>{o || "Select Occupation"}</option>)}
            </select>
            <select className="input-dark" value={form.department} onChange={(e) => set("department", e.target.value)}>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input-dark" value={form.doctor} onChange={(e) => set("doctor", e.target.value)}>
              <option value="">Doctor</option>
              {DOCTORS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <textarea className="input-dark col-span-2 resize-none" rows={2} placeholder="Presenting complaint / symptoms *" value={form.complaint} onChange={(e) => set("complaint", e.target.value)} />
            <input className="input-dark col-span-2" placeholder="Allergies (comma-separated)" value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
            {/* MLC Checkbox */}
            <div className="col-span-2 flex items-center gap-3 p-2 rounded-lg border" style={{ borderColor: isMLC ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)", backgroundColor: isMLC ? "rgba(239,68,68,0.08)" : "transparent" }}>
              <input type="checkbox" id="mlc-toggle" checked={isMLC} onChange={(e) => setIsMLC(e.target.checked)} className="h-5 w-5 accent-red-500" />
              <label htmlFor="mlc-toggle" className="flex items-center gap-2 cursor-pointer">
                <ShieldAlert size={18} className={isMLC ? "text-red-400" : "text-slate-500"} />
                <span className={cn("text-sm font-semibold", isMLC ? "text-red-300" : "text-slate-300")}>
                  Medico-Legal Case (MLC)
                </span>
              </label>
              {isMLC && (
                <Badge tone="red" className="!text-[10px] ml-auto">
                  <AlertTriangle size={10} /> MLC will be created after registration
                </Badge>
              )}
            </div>
          </div>
        </GlassCard>

        <div className="space-y-4">
          {/* Vitals */}
          <GlassCard>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} className="text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Vitals</h3>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "Temp (°F)", key: "temp", icon: Thermometer },
                { label: "BP (mmHg)", key: "bp", icon: Heart },
                { label: "Pulse (/min)", key: "pulse", icon: Activity },
                { label: "SpO2 (%)", key: "spo2", icon: Wind },
                { label: "RR (/min)", key: "rr", icon: Droplets },
              ].map(({ label, key, icon: Icon }) => (
                <div key={key}>
                  <label className="text-[9px] text-slate-500 uppercase">{label}</label>
                  <div className="relative mt-1">
                    <Icon size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input className="input-dark !pl-7 text-xs" value={(form as any)[key]} onChange={(e) => set(key as keyof RegForm, e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Additional */}
          <GlassCard>
            <SectionTitle title="Additional Info" subtitle="Blood group, emergency contact" />
            <div className="grid grid-cols-2 gap-3">
              <select className="input-dark" value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>
                <option value="">Blood Group</option>
                {BLOOD_GROUPS.map((bg) => <option key={bg}>{bg}</option>)}
              </select>
              <input className="input-dark" placeholder="Weight (kg)" value={form.weight} onChange={(e) => set("weight", e.target.value.replace(/\D/g, ""))} />
              <input className="input-dark" placeholder="Height (cm)" value={form.height} onChange={(e) => set("height", e.target.value.replace(/\D/g, ""))} />
              <input className="input-dark" placeholder="Emergency contact name" value={form.emergencyContact} onChange={(e) => set("emergencyContact", e.target.value)} />
              <input className="input-dark col-span-2" placeholder="Emergency phone" value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value.replace(/\D/g, "").slice(0, 10))} />
            </div>
          </GlassCard>

          {/* Payment & Register */}
          <GlassCard>
            <div className="flex gap-1 mb-3">
              {(["UPI", "Card", "Cash"] as const).map((m) => (
                <button key={m} onClick={() => set("mode", m)}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all flex-1",
                    form.mode === m ? "bg-violet-500/20 text-white border-violet-400/50" : "text-slate-400 border-white/10 hover:text-white")}>
                  {m}
                </button>
              ))}
            </div>
            <button className="btn-neon w-full" disabled={!form.name.trim() || !form.complaint.trim()} onClick={register}>
              <UserPlus size={15} /> Register — {regType.toUpperCase()} · {form.name || "New Patient"}
            </button>
          </GlassCard>
        </div>
      </div>

      {/* MLC Form Modal */}
      <Modal open={showMLCForm && !!lastRegisteredPatient} onClose={() => { setShowMLCForm(false); setIsMLC(false); }} title="" wide>
        {lastRegisteredPatient && (
          <div className="max-h-[80vh] overflow-y-auto pr-1">
            <MLCForm
              patient={lastRegisteredPatient}
              onClose={() => { setShowMLCForm(false); setIsMLC(false); }}
              onSave={handleMLCSave}
            />
          </div>
        )}
      </Modal>

      {/* AI Greeting Modal */}
      <Modal open={showGreet} onClose={() => setShowGreet(false)} title="" wide>
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 mb-4">
            <BadgeCheck size={32} className="text-white" />
          </div>
          <h3 className="font-display text-xl font-bold text-gradient mb-2">Registration Complete</h3>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Badge tone="cyan" className="!text-[10px]">{generatedOp}</Badge>
            <Badge tone="violet" className="!text-[10px]">{generatedMr}</Badge>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 max-w-lg mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <Languages size={14} className="text-cyan-400" />
              <span className="text-xs text-slate-400">{greetLang === "te" ? "తెలుగు" : "English"}</span>
            </div>
            <p className="text-sm text-white font-medium leading-relaxed">{greetText}</p>
          </div>
          <div className="flex gap-2 justify-center mt-4">
            <button className="btn-neon" onClick={() => { speakGreeting(greetText, greetLang); }}>🔊 Play Again</button>
            <button className="btn-ghost" onClick={() => {
              const newLang: "en" | "te" = greetLang === "en" ? "te" : "en";
              const texts = GREETINGS[newLang];
              const text = texts[Math.floor(Math.random() * texts.length)];
              setGreetLang(newLang);
              setGreetText(text);
              speakGreeting(text, newLang);
            }}>
              <Languages size={14} /> Try {greetLang === "en" ? "Telugu" : "English"}
            </button>
            <button className="btn-ghost" onClick={() => setShowGreet(false)}>
              <CheckCircle size={14} /> Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
