import { useState } from "react";
import { ClipboardList, Radio, Microscope, Scan, Monitor, Plus, CheckCircle, XCircle, Clock, Search } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, nowTime, uid } from "@/lib/utils";
import type { HospitalOrder } from "@/lib/types";

const RADIOLOGY_TESTS = [
  { id: "usg-abdomen", name: "USG Abdomen", modality: "USG", prep: "N/A" },
  { id: "usg-pelvis", name: "USG Pelvis", modality: "USG", prep: "N/A" },
  { id: "usg-obg", name: "USG OBG", modality: "USG", prep: "Full bladder" },
  { id: "xray-chest", name: "X-Ray Chest PA", modality: "X-Ray", prep: "N/A" },
  { id: "xray-abdomen", name: "X-Ray Abdomen Erect", modality: "X-Ray", prep: "N/A" },
  { id: "xray-knee", name: "X-Ray Knee AP/Lat", modality: "X-Ray", prep: "N/A" },
  { id: "xray-spine", name: "X-Ray Spine LS", modality: "X-Ray", prep: "N/A" },
  { id: "ct-brain", name: "CT Brain Plain", modality: "CT", prep: "N/A" },
  { id: "ct-chest", name: "CT Chest", modality: "CT", prep: "N/A" },
  { id: "ct-abdomen", name: "CT Abdomen", modality: "CT", prep: "4hr fasting" },
  { id: "mri-brain", name: "MRI Brain", modality: "MRI", prep: "Remove metal objects" },
  { id: "mri-knee", name: "MRI Knee", modality: "MRI", prep: "Remove metal objects" },
  { id: "mri-spine", name: "MRI Spine", modality: "MRI", prep: "Remove metal objects" },
];

type Modality = "all" | "USG" | "X-Ray" | "CT" | "MRI";

export function ReceptionRadiology() {
  const { account } = useAuth();
  const { patients, orders, setOrders, logAudit } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [modalityFilter, setModalityFilter] = useState<Modality>("all");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedTest, setSelectedTest] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [notes, setNotes] = useState("");

  const filteredTests = RADIOLOGY_TESTS.filter((t) => {
    if (modalityFilter !== "all" && t.modality !== modalityFilter) return false;
    if (searchQuery) return t.name.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });

  const radiologyOrders = orders.filter((o) => o.targetDept === "Lab" && o.orderText.toLowerCase().includes("radiology"));

  const placeOrder = () => {
    if (!selectedPatient || !selectedTest || !doctorName) {
      toast.error("Select patient, test, and referring doctor");
      return;
    }
    const test = RADIOLOGY_TESTS.find((t) => t.id === selectedTest);
    const order: HospitalOrder = {
      id: uid("ord"),
      patientId: selectedPatient,
      orderText: `Radiology: ${test?.name} — ${notes || "Routine"}`,
      doctor: doctorName,
      createdAt: nowTime(),
      createdTs: Date.now(),
      dueMin: 120,
      targetDept: "Lab",
    };
    setOrders([...orders, order]);
    logAudit("Radiology order", `${test?.name} for ${selectedPatient}`, account?.name ?? "Reception");
    toast.success(`Radiology order placed: ${test?.name}`);
    setSelectedTest("");
    setNotes("");
  };

  return (
    <div className="space-y-4">
      <GlassCard>
        <SectionTitle title="Radiology Investigations" subtitle="Order USG, X-Ray, CT, MRI for patients" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <select className="input-dark" value={selectedPatient} onChange={(e) => setSelectedPatient(e.target.value)}>
              <option value="">Select patient</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.id} — {p.name} ({p.age}y {p.gender})</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input className="input-dark flex-1" placeholder="Referring doctor name" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
              <input className="input-dark flex-1" placeholder="Clinical notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col justify-end">
            <button className="btn-neon w-full" disabled={!selectedPatient || !selectedTest || !doctorName} onClick={placeOrder}>
              <Plus size={15} /> Place Order
            </button>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center gap-2 mb-4">
          {(["all", "USG", "X-Ray", "CT", "MRI"] as Modality[]).map((m) => (
            <button key={m} onClick={() => setModalityFilter(m)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all",
                modalityFilter === m ? "bg-cyan-500/20 text-white border-cyan-400/50" : "text-slate-400 border-white/10 hover:text-white")}>
              {m === "all" ? "All" : m}
            </button>
          ))}
          <div className="relative flex-1 max-w-xs ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input-dark !pl-9" placeholder="Search tests..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {filteredTests.map((test) => {
            const Icon = test.modality === "USG" ? Radio : test.modality === "X-Ray" ? Scan : test.modality === "CT" ? Monitor : Microscope;
            return (
              <button key={test.id} onClick={() => setSelectedTest(test.id)}
                className={cn("rounded-lg border p-3 text-left transition-all",
                  selectedTest === test.id
                    ? "border-cyan-400/50 bg-cyan-500/10"
                    : "border-white/10 bg-white/[0.03] hover:border-cyan-400/30")}>
                <Icon size={18} className={cn("mb-1", selectedTest === test.id ? "text-cyan-300" : "text-slate-400")} />
                <p className="text-xs font-semibold text-white">{test.name}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{test.modality} · {test.prep}</p>
              </button>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard>
        <SectionTitle title="Recent Radiology Orders" subtitle="Last 10 orders" />
        {radiologyOrders.length === 0 && <p className="text-xs text-slate-500">No radiology orders yet.</p>}
        <div className="space-y-2">
          {radiologyOrders.slice().reverse().slice(0, 10).map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <Badge tone="cyan" className="!text-[9px]">{o.patientId}</Badge>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{o.orderText}</p>
                <p className="text-[10px] text-slate-500">Dr. {o.doctor} · {o.createdAt}</p>
              </div>
              <Badge tone={o.acknowledgedBy ? "green" : "amber"} className="!text-[9px]">
                {o.acknowledgedBy ? "Done" : "Pending"}
              </Badge>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
