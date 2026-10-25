import { useState } from "react";
import { GlassCard } from "@/components/ui";
import { Stethoscope, Timer, CheckCircle2, AlertTriangle, Users } from "lucide-react";

export interface StaffPerf {
  staff: Array<{ id: string; name: string; designation: string; department: string; shift: string; status: string; language: string; phone?: string; workAreas: string[]; supervisor?: string; assigned: number; completed: number; active: number; overdue: number; slaHit: number; totalClosed: number }>;
  roster: Record<string, Array<{ id: string; name: string; designation: string; department: string; shift: string; status: string; assigned: number; completed: number; active: number; overdue: number }>>;
  departments: Record<string, { staff: number; active: number; overdue: number }>;
}

export interface WOrder {
  id: string; patientId: string; patientName: string; bed: string; ward: string;
  department: string; serviceCode: string; serviceName: string; priority: string;
  status: string; amount?: number; discount?: number; billId?: string; paidAt?: string;
  assignedTo?: string; acknowledgedAt?: string; startedAt?: string; completedAt?: string;
  resultSummary?: string; reviewedAt?: string; reviewedBy?: string; slaMinutes: number;
  createdAt: string; updatedAt: string; escalated?: boolean;
  events: { at: string; actor: string; role: string; from: string; to: string; note?: string }[];
}
export interface StaffMember {
  id: string; employeeId: string; name: string; designation: string;
  department: string; workAreas: string[]; shift: string; language: string;
  status: string; phone?: string; notifyWhatsApp: boolean; notifyTelegram: boolean;
}

const DEPARTMENTS = ["Pharmacy","Lab","Radiology","X-Ray","USG","CT","MRI","Ward","OT","SPL Room","Dressing Room","OT Clinic","Ward Cleaning","Bed Sheet Changing","Housekeeping","Billing","Reception","Stores","Maintenance","Biomedical","Transport","Security"];
const SHIFTS = ["Morning","Evening","Night","General"];
const LANGS = ["Telugu","Hindi","English"];

export function StaffRegistry({ staff, onChange, act }: { staff: StaffMember[]; onChange: () => void; act: (m: string, p: string, b?: unknown, msg?: string) => Promise<void> }) {
  const [f, setF] = useState({ employeeId: "", name: "", designation: "", department: "Lab", workAreas: ["Lab"], shift: "General", language: "Telugu", status: "AVAILABLE", phone: "", notifyWhatsApp: true, notifyTelegram: false });
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  return (
    <GlassCard>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <input className="input-dark text-xs" placeholder="Employee ID" value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)} />
        <input className="input-dark text-xs" placeholder="Name" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <input className="input-dark text-xs" placeholder="Designation" value={f.designation} onChange={(e) => set("designation", e.target.value)} />
        <select className="input-dark text-xs" value={f.department} onChange={(e) => set("department", e.target.value)} >{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select>
        <select className="input-dark text-xs" value={f.shift} onChange={(e) => set("shift", e.target.value)}>{SHIFTS.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input-dark text-xs" value={f.language} onChange={(e) => set("language", e.target.value)}>{LANGS.map((l) => <option key={l}>{l}</option>)}</select>
        <input className="input-dark text-xs" placeholder="Phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        <label className="flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" checked={f.notifyWhatsApp} onChange={(e) => set("notifyWhatsApp", e.target.checked)} /> WhatsApp</label>
      </div>
      <button onClick={() => act("POST", "/staff", f, "Staff added").then(onChange)} className="btn-xs bg-emerald-600 hover:bg-emerald-500 mb-3">+ Add Staff</button>
      <table className="w-full text-xs"><thead className="text-slate-400"><tr><th>ID</th><th>Name</th><th>Role</th><th>Dept</th><th>Areas</th><th>Shift</th><th>Lang</th><th>Status</th></tr></thead>
      <tbody>{staff.map((s) => (<tr key={s.id} className="border-t border-slate-800"><td className="p-1 font-mono">{s.employeeId}</td><td>{s.name}</td><td>{s.designation}</td><td>{s.department}</td><td>{s.workAreas.join(", ")}</td><td>{s.shift}</td><td>{s.language}</td><td><span className={`px-1 rounded text-[10px] ${s.status === "AVAILABLE" ? "bg-emerald-700" : "bg-amber-600"}`}>{s.status}</span></td></tr>))}</tbody></table>
    </GlassCard>
  );
}

export function NewOrderForm({ act, onDone }: { act: (m: string, p: string, b?: unknown, msg?: string) => Promise<void>; onDone: () => void }) {
  const [f, setF] = useState({ patientId: "UHID-2026-", patientName: "", bed: "", ward: "", department: "Lab", serviceCode: "", serviceName: "", priority: "ROUTINE" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <GlassCard>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <input className="input-dark text-xs" placeholder="Patient UHID" value={f.patientId} onChange={(e) => set("patientId", e.target.value)} />
        <input className="input-dark text-xs" placeholder="Patient Name" value={f.patientName} onChange={(e) => set("patientName", e.target.value)} />
        <input className="input-dark text-xs" placeholder="Bed (e.g. Bed 4)" value={f.bed} onChange={(e) => set("bed", e.target.value)} />
        <input className="input-dark text-xs" placeholder="Ward" value={f.ward} onChange={(e) => set("ward", e.target.value)} />
        <select className="input-dark text-xs" value={f.department} onChange={(e) => set("department", e.target.value)}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select>
        <input className="input-dark text-xs" placeholder="Service Code (CBP)" value={f.serviceCode} onChange={(e) => set("serviceCode", e.target.value)} />
        <input className="input-dark text-xs" placeholder="Service Name" value={f.serviceName} onChange={(e) => set("serviceName", e.target.value)} />
        <select className="input-dark text-xs" value={f.priority} onChange={(e) => set("priority", e.target.value)}><option>ROUTINE</option><option>URGENT</option><option>STAT</option></select>
      </div>
      <button onClick={() => act("POST", "", f, "Order created").then(onDone)} className="btn-xs bg-emerald-600 hover:bg-emerald-500 mt-3">Create Order → Billing</button>
    </GlassCard>
  );
}

export function RosterPanel({ perf }: { perf: StaffPerf | null }) {
  if (!perf) return <GlassCard><div className="text-xs text-slate-400">Loading roster…</div></GlassCard>;
  const SHIFTS = ["Morning", "General", "Evening", "Night"];
  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Metric label="Total Staff" value={perf.staff.length} icon={Users} tone="text-emerald-400" />
          <Metric label="On Active Tasks" value={perf.staff.filter((s) => s.active > 0).length} icon={Timer} tone="text-cyan-400" />
          <Metric label="Total Tasks Done" value={perf.staff.reduce((a, s) => a + s.completed, 0)} icon={CheckCircle2} tone="text-indigo-400" />
          <Metric label="Overdue" value={perf.staff.reduce((a, s) => a + s.overdue, 0)} icon={AlertTriangle} tone="text-rose-400" />
        </div>
      </GlassCard>

      {SHIFTS.map((shift) => (
        <GlassCard key={shift}>
          <div className="font-bold text-xs uppercase tracking-wider text-violet-300 mb-1">Duty Roster — {shift} Shift ({perf.roster[shift]?.length ?? 0})</div>
          <table className="w-full text-xs">
            <thead className="text-slate-400"><tr><th>Name</th><th>Designation</th><th>Dept</th><th>Status</th><th>Assigned</th><th>Done</th><th>Active</th><th>Overdue</th></tr></thead>
            <tbody>{(perf.roster[shift] ?? []).map((s) => (
              <tr key={s.id} className="border-t border-slate-800">
                <td className="p-1 font-medium text-white">{s.name}</td><td>{s.designation}</td><td>{s.department}</td>
                <td><span className={`px-1.5 rounded text-[10px] ${s.status === "AVAILABLE" ? "bg-emerald-700" : s.status === "ON_TASK" ? "bg-amber-600" : "bg-slate-600"}`}>{s.status}</span></td>
                <td className="text-slate-300">{s.assigned}</td><td className="text-emerald-400">{s.completed}</td><td className="text-cyan-400">{s.active}</td>
                <td className={s.overdue > 0 ? "text-rose-400 font-bold" : "text-slate-500"}>{s.overdue}</td>
              </tr>
            ))}{!(perf.roster[shift] ?? []).length && <tr><td colSpan={8} className="p-2 text-slate-500">No staff on {shift} shift</td></tr>}</tbody>
          </table>
        </GlassCard>
      ))}

      <GlassCard>
        <div className="font-bold text-xs uppercase tracking-wider text-cyan-300 mb-1">Department Workload</div>
        <table className="w-full text-xs">
          <thead className="text-slate-400"><tr><th>Department</th><th>Staff</th><th>On Active Task</th><th>Overdue</th></tr></thead>
          <tbody>{Object.entries(perf.departments).map(([dept, d]) => (
            <tr key={dept} className="border-t border-slate-800"><td className="p-1">{dept}</td><td>{d.staff}</td><td className="text-cyan-400">{d.active}</td><td className={d.overdue > 0 ? "text-rose-400 font-bold" : "text-slate-500"}>{d.overdue}</td></tr>
          ))}</tbody>
        </table>
      </GlassCard>
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  return <div className="p-3 rounded bg-slate-800/70 border border-slate-700"><div className="flex items-center gap-1 text-[10px] text-slate-400"><Icon size={12} />{label}</div><div className={`text-2xl font-bold ${tone}`}>{value}</div></div>;
}
