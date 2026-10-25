import { useState } from "react";
import { Pill, Syringe, FlaskRound, ClipboardList, Search, Plus, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, nowTime, uid } from "@/lib/utils";

interface Medication {
  id: string;
  patientId: string;
  patientName: string;
  drug: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  type: "discharge" | "hospital";
  prescribedBy: string;
  prescribedAt: string;
  status: "active" | "completed" | "discontinued";
}

const COMMON_DRUGS = [
  "Amoxicillin 500mg", "Paracetamol 650mg", "Azithromycin 500mg",
  "Ceftriaxone 1g", "Metronidazole 400mg", "Omeprazole 20mg",
  "Amlodipine 5mg", "Metformin 500mg", "Atorvastatin 10mg",
  "Losartan 50mg", "Clopidogrel 75mg", "Diclofenac 50mg",
  "Pantoprazole 40mg", "Ondansetron 4mg", "Salbutamol Inhaler",
];

export function ReceptionMedications() {
  const { account } = useAuth();
  const { patients, logAudit } = useStore();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [medType, setMedType] = useState<"discharge" | "hospital">("hospital");
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [formDrug, setFormDrug] = useState("");
  const [formDose, setFormDose] = useState("");
  const [formRoute, setFormRoute] = useState("Oral");
  const [formFreq, setFormFreq] = useState("OD");
  const [formDuration, setFormDuration] = useState("");

  const addMedication = () => {
    if (!selectedPatient || !formDrug || !formDose) {
      toast.error("Select patient, drug, and dose");
      return;
    }
    const patient = patients.find((p) => p.id === selectedPatient);
    const med: Medication = {
      id: uid("med"),
      patientId: selectedPatient,
      patientName: patient?.name ?? "Unknown",
      drug: formDrug,
      dose: formDose,
      route: formRoute,
      frequency: formFreq,
      duration: formDuration,
      type: medType,
      prescribedBy: account?.name ?? "Reception",
      prescribedAt: nowTime(),
      status: "active",
    };
    setMedications((prev) => [med, ...prev]);
    logAudit("Medication added", `${formDrug} ${formDose} for ${selectedPatient} (${medType})`, account?.name ?? "Reception");
    toast.success(`${medType === "discharge" ? "Discharge" : "Hospital"} medication added`);
    setFormDrug(""); setFormDose(""); setFormDuration("");
    setShowForm(false);
  };

  const completeMed = (id: string) => {
    setMedications((prev) => prev.map((m) => m.id === id ? { ...m, status: "completed" } : m));
    toast.success("Medication marked completed");
  };

  const filteredMeds = medications.filter((m) => {
    if (selectedPatient && m.patientId !== selectedPatient) return false;
    if (medType && m.type !== medType) return false;
    if (searchQuery) return m.drug.toLowerCase().includes(searchQuery.toLowerCase()) || m.patientName.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });

  return (
    <div className="space-y-4">
      <GlassCard>
        <SectionTitle title="Medications" subtitle="Hospital medications & discharge prescriptions" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <select className="input-dark" value={selectedPatient} onChange={(e) => setSelectedPatient(e.target.value)}>
            <option value="">All patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {(["hospital", "discharge"] as const).map((t) => (
              <button key={t} onClick={() => setMedType(t)}
                className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all flex-1",
                  medType === t ? "bg-cyan-500/20 text-white border-cyan-400/50" : "text-slate-400 border-white/10 hover:text-white")}>
                {t === "hospital" ? "Hospital" : "Discharge"}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input-dark !pl-9" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <button className="btn-neon" onClick={() => setShowForm(true)}><Plus size={15} /> Add Medication</button>
        </div>
      </GlassCard>

      {showForm && (
        <GlassCard>
          <SectionTitle title={`Add ${medType === "discharge" ? "Discharge" : "Hospital"} Medication`} subtitle="Select from common drugs or type manually" />
          <div className="flex flex-wrap gap-1.5 mb-3">
            {COMMON_DRUGS.map((d) => (
              <button key={d} onClick={() => { setFormDrug(d); setFormDose(d.includes("mg") ? d.match(/\d+/)?.[0] + " mg" : ""); }}
                className={cn("rounded-lg px-2.5 py-1 text-[10px] font-medium border transition-all",
                  formDrug === d ? "bg-cyan-500/20 text-white border-cyan-400/50" : "text-slate-400 border-white/10 hover:text-white")}>
                {d}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input className="input-dark" placeholder="Drug name *" value={formDrug} onChange={(e) => setFormDrug(e.target.value)} />
            <input className="input-dark" placeholder="Dose * (e.g. 500mg)" value={formDose} onChange={(e) => setFormDose(e.target.value)} />
            <select className="input-dark" value={formRoute} onChange={(e) => setFormRoute(e.target.value)}>
              <option>Oral</option><option>IV</option><option>IM</option><option>Subcutaneous</option><option>Topical</option><option>Inhalation</option>
            </select>
            <select className="input-dark" value={formFreq} onChange={(e) => setFormFreq(e.target.value)}>
              <option>OD</option><option>BD</option><option>TDS</option><option>QID</option><option>HS</option><option>Stat</option>
            </select>
            <input className="input-dark" placeholder="Duration (e.g. 5 days)" value={formDuration} onChange={(e) => setFormDuration(e.target.value)} />
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn-neon" onClick={addMedication}><Plus size={14} /> Add</button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <SectionTitle title={`${medType === "discharge" ? "Discharge" : "Hospital"} Medications`} subtitle={`${filteredMeds.length} medication(s)`} />
        {filteredMeds.length === 0 && <p className="text-xs text-slate-500">No medications yet. Add one above.</p>}
        <div className="space-y-2">
          {filteredMeds.map((med) => (
            <div key={med.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-3">
                {med.type === "discharge" ? <ClipboardList size={16} className="text-amber-400 shrink-0" /> : <Pill size={16} className="text-cyan-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{med.drug}</span>
                    <Badge tone={med.type === "discharge" ? "amber" : "cyan"} className="!text-[9px]">{med.type}</Badge>
                    <Badge tone={med.status === "active" ? "green" : med.status === "completed" ? "neutral" : "red"} className="!text-[9px]">{med.status}</Badge>
                  </div>
                  <p className="text-[10px] text-slate-500">{med.dose} · {med.route} · {med.frequency} · {med.duration} — Dr. {med.prescribedBy}</p>
                  <p className="text-[10px] text-slate-500">{med.patientName} ({med.patientId}) · {med.prescribedAt}</p>
                </div>
                {med.status === "active" && (
                  <button className="btn-ghost !text-[10px] !py-1 text-emerald-400" onClick={() => completeMed(med.id)}>
                    <CheckCircle size={12} /> Complete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
