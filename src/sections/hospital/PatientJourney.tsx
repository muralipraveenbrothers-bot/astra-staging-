import { useState } from "react";
import {
  Activity,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck,
  FlaskConical,
  Pill,
  Search,
  Stethoscope,
  UserCheck,
} from "lucide-react";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface JourneyStage {
  id: string;
  name: string;
  department: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

const STAGES: JourneyStage[] = [
  { id: "reg", name: "Registration", department: "Reception", icon: UserCheck },
  { id: "opd", name: "OP Consultation", department: "Clinical", icon: Stethoscope },
  { id: "lab", name: "Diagnostics / Lab", department: "Laboratory", icon: FlaskConical },
  { id: "pharmacy", name: "Pharmacy", department: "Pharmacy", icon: Pill },
  { id: "admission", name: "IP Admission", department: "Ward", icon: BedDouble },
  { id: "ot", name: "Surgical Care (OT)", department: "OT", icon: Activity },
  { id: "billing", name: "Billing Clearance", department: "Finance", icon: CreditCard },
  { id: "discharge", name: "Discharge & Followup", department: "Ward", icon: FileCheck },
];

export function PatientJourney() {
  const { patients, bills, orders, tasks } = useStore();
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.id ?? "");
  const [search, setSearch] = useState("");

  const activePatient = patients.find((p) => p.id === selectedPatientId) ?? patients[0];

  const filteredPatients = patients.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.department ?? "").toLowerCase().includes(q);
  });

  const patientBills = bills.filter((b) => b.patientId === activePatient?.id);
  const patientOrders = orders.filter((o) => o.patientId === activePatient?.id);
  const patientTasks = tasks.filter((t) => t.patientId === activePatient?.id || t.patientName?.includes(activePatient?.name ?? ""));

  // Mock stage calculation based on patient data
  const getStageStatus = (stageId: string) => {
    if (!activePatient) return "pending";
    if (stageId === "reg") return "completed";
    if (stageId === "opd") return "completed";
    if (stageId === "lab") return patientOrders.some((o) => o.targetDept === "Lab") ? "completed" : "in_progress";
    if (stageId === "pharmacy") return patientOrders.some((o) => o.targetDept === "Pharmacy") ? "completed" : "pending";
    if (stageId === "billing") return patientBills.length > 0 ? "completed" : "pending";
    return "pending";
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient">Patient Journey Intelligence</h1>
        <p className="text-sm text-slate-400 mt-1">
          Unified HMS / EMS / PMS patient lifecycle tracking & active department handoffs
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Patient Selection Sidebar */}
        <div className="glass p-4 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input-dark w-full !pl-8 text-xs"
              placeholder="Filter patients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
            {filteredPatients.map((p) => {
              const active = p.id === activePatient?.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPatientId(p.id)}
                  className={cn(
                    "p-2.5 rounded-lg border cursor-pointer transition-all text-xs",
                    active
                      ? "border-cyan-400/50 bg-cyan-500/10 text-white font-medium"
                      : "border-white/5 hover:bg-white/5 text-slate-300"
                  )}
                >
                  <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                    <span>{p.id}</span>
                    <Badge tone="violet" className="!text-[9px]">{p.department}</Badge>
                  </div>
                  <div className="font-semibold text-white mt-1">{p.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {p.gender || "—"} · {p.age ? `${p.age}y` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Journey Timeline */}
        <div className="lg:col-span-3 space-y-6">
          {activePatient ? (
            <>
              {/* Patient Banner */}
              <GlassCard className="!border-cyan-500/30">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-white">{activePatient.name}</h2>
                      <span className="font-mono text-xs text-cyan-300 font-semibold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30">
                        {activePatient.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {activePatient.gender} · {activePatient.age} years · Phone: {activePatient.phone || "N/A"} · Department: {activePatient.department}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="green">Active Care Plan</Badge>
                    <Badge tone="cyan">OPD Registered</Badge>
                  </div>
                </div>
              </GlassCard>

              {/* Sequential Journey Pipeline */}
              <GlassCard>
                <SectionTitle title="Unified Journey Pipeline" subtitle="HMS / EMS / PMS state tracking" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {STAGES.map((s, idx) => {
                    const status = getStageStatus(s.id);
                    const Icon = s.icon;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          "rounded-xl border p-3 flex flex-col justify-between relative overflow-hidden transition-all",
                          status === "completed"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                            : status === "in_progress"
                            ? "border-amber-400/50 bg-amber-500/10 text-amber-200"
                            : "border-white/5 bg-white/[0.02] text-slate-400 opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">Step 0{idx + 1}</span>
                          <Icon size={16} />
                        </div>
                        <div className="mt-3">
                          <div className="font-semibold text-xs text-white leading-tight">{s.name}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{s.department}</div>
                        </div>
                        <div className="mt-2 text-[10px] font-bold font-mono uppercase tracking-wider">
                          {status === "completed" && "✓ Done"}
                          {status === "in_progress" && "⏳ In Progress"}
                          {status === "pending" && "Pending"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>

              {/* Department Orders & Associated Tasks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <GlassCard>
                  <SectionTitle title="Clinical Orders" subtitle={`Orders issued for ${activePatient.name}`} />
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {patientOrders.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">No active clinical orders found.</p>
                    ) : (
                      patientOrders.map((o) => (
                        <div key={o.id} className="p-2.5 rounded-lg border border-white/5 bg-white/[0.02] text-xs">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="text-cyan-300">{o.targetDept || "Ward"}</span>
                            <span className="text-slate-400">{o.createdAt}</span>
                          </div>
                          <div className="font-semibold text-white mt-1">{o.orderText}</div>
                          <div className="text-slate-400 text-[11px] mt-0.5">By Dr. {o.doctor}</div>
                        </div>
                      ))
                    )}
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionTitle title="Inter-Departmental Tasks" subtitle="Tasks routed across care team" />
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {patientTasks.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">No pending inter-departmental tasks.</p>
                    ) : (
                      patientTasks.map((t) => (
                        <div key={t.id} className="p-2.5 rounded-lg border border-white/5 bg-white/[0.02] text-xs space-y-1">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="text-amber-300">{t.id}</span>
                            <Badge tone="violet">{t.department}</Badge>
                          </div>
                          <div className="font-semibold text-white">{t.title}</div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>Status: {t.status}</span>
                            <span>{t.createdAt}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </GlassCard>
              </div>
            </>
          ) : (
            <GlassCard className="text-center py-12">
              <p className="text-slate-400 text-sm">Select a patient to inspect live journey state.</p>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
