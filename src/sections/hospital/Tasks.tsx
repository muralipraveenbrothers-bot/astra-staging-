import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  Plus,
  Search,
  UserCheck,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import type { HospitalTask, TaskPriority, TaskStatus } from "@/lib/taskEngine";
import { cn } from "@/lib/utils";

const PRIORITY_BADGES: Record<TaskPriority, { tone: "red" | "amber" | "cyan" | "violet"; label: string }> = {
  critical: { tone: "red", label: "STAT / Critical" },
  high: { tone: "amber", label: "High" },
  normal: { tone: "cyan", label: "Normal" },
  low: { tone: "violet", label: "Low" },
};

const STATUS_ORDER: TaskStatus[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "COMPLETED", "VERIFIED", "CLOSED"];

export function Tasks() {
  const { tasks, updateTaskStatus, addTask } = useStore();
  const { account } = useAuth();
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<HospitalTask | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  // New task form state
  const [newTitle, setNewTitle] = useState("");
  const [newDept, setNewDept] = useState("Pharmacy");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [newPatient, setNewPatient] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const userRole = account?.role ?? "ceo";
  const userName = account?.name ?? "Staff";

  const depts = Array.from(new Set(tasks.map((t) => t.department)));

  const filteredTasks = tasks.filter((t) => {
    if (filterDept !== "all" && t.department !== filterDept) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchPatient = t.patientName?.toLowerCase().includes(q);
      const matchUhid = t.uhid?.toLowerCase().includes(q);
      const matchId = t.id.toLowerCase().includes(q);
      if (!matchTitle && !matchPatient && !matchUhid && !matchId) return false;
    }
    return true;
  });

  const handleCreate = () => {
    if (!newTitle.trim()) {
      toast.error("Please enter a task title");
      return;
    }
    const created = addTask({
      title: newTitle.trim(),
      department: newDept,
      priority: newPriority,
      patientName: newPatient.trim() || undefined,
      description: newDesc.trim() || undefined,
      createdBy: userName,
      status: "NEW",
      category: newDept.toLowerCase() as any,
    });
    toast.success("Task Created", { description: `${created.id} assigned to ${newDept}` });
    setShowNewModal(false);
    setNewTitle("");
    setNewDesc("");
    setNewPatient("");
  };

  const handleAdvanceStatus = (t: HospitalTask) => {
    const currentIndex = STATUS_ORDER.indexOf(t.status);
    if (currentIndex < STATUS_ORDER.length - 1) {
      const nextStatus = STATUS_ORDER[currentIndex + 1];
      updateTaskStatus(t.id, nextStatus, userName, `Status advanced to ${nextStatus}`);
      toast.success(`Task ${t.id} updated`, { description: `Status changed to ${nextStatus}` });
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-bold text-gradient">Universal Task Engine</h1>
            <Badge tone="cyan">{filteredTasks.length} Active Tasks</Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Hospital-wide inter-departmental task queue & SLA tracking system
          </p>
        </div>
        <button className="btn-neon flex items-center gap-2" onClick={() => setShowNewModal(true)}>
          <Plus size={16} /> Create Hospital Task
        </button>
      </div>

      {/* Filters bar */}
      <div className="glass p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input-dark !pl-9"
            placeholder="Search by Task ID, Patient, UHID or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <span className="text-xs text-slate-400">Department:</span>
          <select className="input-dark !py-1.5 text-xs" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="all">All Departments</option>
            {depts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Status:</span>
          <select className="input-dark !py-1.5 text-xs" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Task Queue Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task List */}
        <div className="lg:col-span-2 space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="glass p-8 text-center text-slate-400">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400 opacity-60" />
              <p className="text-sm font-semibold">No pending tasks matching filters</p>
            </div>
          ) : (
            filteredTasks.map((t) => {
              const priorityCfg = PRIORITY_BADGES[t.priority];
              const isSelected = selectedTask?.id === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  className={cn(
                    "glass p-4 cursor-pointer transition-all duration-200 border hover:border-violet-400/40",
                    isSelected ? "border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_16px_rgba(6,182,212,0.2)]" : "border-white/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-400">{t.id}</span>
                      <Badge tone={priorityCfg.tone}>{priorityCfg.label}</Badge>
                      <Badge tone="violet">{t.department}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                      <Clock size={13} className="text-amber-400" />
                      <span>SLA {t.slaMinutes ?? 30}m</span>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-white mt-2 leading-snug">{t.title}</h3>

                  {t.patientName && (
                    <p className="text-xs text-cyan-300 mt-1">
                      Patient: <span className="font-medium text-white">{t.patientName}</span> {t.uhid ? `(${t.uhid})` : ""}
                    </p>
                  )}

                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
                    <span>Created by {t.createdBy} · {t.createdAt}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-semibold px-2 py-0.5 rounded text-[10px]",
                        t.status === "COMPLETED" || t.status === "CLOSED" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-white/5 text-amber-300 border border-amber-500/30"
                      )}>
                        {t.status}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAdvanceStatus(t);
                        }}
                        className="btn-ghost !py-1 !px-2 !text-[11px] flex items-center gap-1"
                        title="Advance Task Workflow Status"
                      >
                        Advance <ArrowUpRight size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Task Details & Audit History */}
        <div className="space-y-4">
          <GlassCard>
            <SectionTitle title="Task Audit & Timeline" subtitle="Inter-departmental execution tracking" />

            {selectedTask ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-cyan-300 font-bold">{selectedTask.id}</span>
                    <Badge tone={PRIORITY_BADGES[selectedTask.priority].tone}>{selectedTask.priority.toUpperCase()}</Badge>
                  </div>
                  <h4 className="text-sm font-semibold text-white">{selectedTask.title}</h4>
                  {selectedTask.description && (
                    <p className="text-xs text-slate-300 bg-white/5 p-2 rounded border border-white/5">
                      {selectedTask.description}
                    </p>
                  )}
                  <div className="text-xs text-slate-400 space-y-1">
                    <p>Department: <span className="text-white">{selectedTask.department}</span></p>
                    {selectedTask.patientName && <p>Patient: <span className="text-cyan-200">{selectedTask.patientName}</span></p>}
                    <p>Current Status: <span className="text-amber-300 font-bold">{selectedTask.status}</span></p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Execution History</h5>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {selectedTask.history.map((h) => (
                      <div key={h.id} className="rounded border border-white/5 bg-white/[0.02] p-2 text-xs space-y-0.5">
                        <div className="flex items-center justify-between text-slate-400 font-mono text-[10px]">
                          <span>{h.timestamp}</span>
                          <span className="text-violet-300 font-bold">{h.action}</span>
                        </div>
                        <p className="text-slate-200 font-medium">{h.actor}</p>
                        <p className="text-slate-400 text-[11px]">{h.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Select a task from the queue to inspect history & audit log.
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* New Task Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="glass max-w-lg w-full p-6 space-y-4 border border-violet-400/40 shadow-[0_0_30px_rgba(139,92,246,0.3)]">
            <h2 className="text-lg font-bold text-white font-display">Create Inter-Departmental Task</h2>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Task Title / Action Required *</label>
                <input
                  className="input-dark w-full"
                  placeholder="e.g. Dispense Stat Meds / Send Ultrasound Report"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Target Department</label>
                  <select className="input-dark w-full" value={newDept} onChange={(e) => setNewDept(e.target.value)}>
                    <option value="Pharmacy">Pharmacy</option>
                    <option value="Laboratory">Laboratory</option>
                    <option value="Radiology">Radiology</option>
                    <option value="OT">OT</option>
                    <option value="Nursing">Nursing</option>
                    <option value="Reception">Reception</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Priority Level</label>
                  <select className="input-dark w-full" value={newPriority} onChange={(e) => setNewPriority(e.target.value as TaskPriority)}>
                    <option value="critical">STAT / Critical</option>
                    <option value="high">High Priority</option>
                    <option value="normal">Normal Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Patient Name / UHID (Optional)</label>
                <input
                  className="input-dark w-full"
                  placeholder="e.g. Rajesh Sharma (UHID-2024-001)"
                  value={newPatient}
                  onChange={(e) => setNewPatient(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Instructions / Context</label>
                <textarea
                  className="input-dark w-full resize-none"
                  rows={3}
                  placeholder="Additional clinical or operational details..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setShowNewModal(false)}>Cancel</button>
              <button className="btn-neon" onClick={handleCreate}>Dispatch Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
