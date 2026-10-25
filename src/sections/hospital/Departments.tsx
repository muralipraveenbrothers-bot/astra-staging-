import { useState } from "react";
import { Mic, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { uid } from "@/lib/utils";
import type { Department, StaffMember } from "@/lib/types";

const deptColors = ["#d4af37", "#39d5ff", "#f5d97e", "#34d399", "#fbbf24"];

export function Departments({ onOpenVoiceReg }: { onOpenVoiceReg?: () => void }) {
  const { departments, setDepartments, staff, setStaff } = useStore();

  // dept modal state
  const [deptModal, setDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState("");
  const [deptHead, setDeptHead] = useState("");

  // staff modal state
  const [staffModal, setStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [sName, setSName] = useState("");
  const [sRole, setSRole] = useState("");
  const [sDept, setSDept] = useState("");
  const [sDoctor, setSDoctor] = useState("");
  const [sWa, setSWa] = useState(true);
  const [sTg, setSTg] = useState(false);
  const [sPc, setSPc] = useState(false);

  const openDept = (d?: Department) => {
    setEditingDept(d ?? null);
    setDeptName(d?.name ?? "");
    setDeptHead(d?.head ?? "");
    setDeptModal(true);
  };

  const saveDept = () => {
    if (!deptName.trim()) return;
    if (editingDept) {
      setDepartments(departments.map((d) => (d.id === editingDept.id ? { ...d, name: deptName.trim(), head: deptHead.trim() } : d)));
      toast.success(`Department “${deptName}” updated`);
    } else {
      setDepartments([
        ...departments,
        { id: uid("dept"), name: deptName.trim(), head: deptHead.trim() || "—", staffCount: 0, color: deptColors[departments.length % deptColors.length], custom: true },
      ]);
      toast.success(`Department “${deptName}” created`);
    }
    setDeptModal(false);
  };

  const delDept = (d: Department) => {
    setDepartments(departments.filter((x) => x.id !== d.id));
    setStaff(staff.filter((s) => s.departmentId !== d.id));
    toast.success(`Department “${d.name}” deleted`, { description: "Associated staff records were removed too." });
  };

  const openStaff = (s?: StaffMember) => {
    setEditingStaff(s ?? null);
    setSName(s?.name ?? "");
    setSRole(s?.role ?? "");
    setSDept(s?.departmentId ?? departments[0]?.id ?? "");
    setSDoctor(s?.linkedDoctor ?? "");
    setSWa(s?.notifyWhatsApp ?? true);
    setSTg(s?.notifyTelegram ?? false);
    setSPc(s?.paperclipMapped ?? false);
    setStaffModal(true);
  };

  const saveStaff = () => {
    if (!sName.trim() || !sRole.trim()) return;
    const payload: StaffMember = {
      id: editingStaff?.id ?? uid("st"),
      name: sName.trim(),
      role: sRole.trim(),
      departmentId: sDept,
      linkedDoctor: sDoctor.trim() || undefined,
      notifyWhatsApp: sWa,
      notifyTelegram: sTg,
      paperclipMapped: sPc,
    };
    if (editingStaff) {
      setStaff(staff.map((s) => (s.id === editingStaff.id ? payload : s)));
      toast.success(`${sName} updated`);
    } else {
      setStaff([...staff, payload]);
      setDepartments(departments.map((d) => (d.id === sDept ? { ...d, staffCount: d.staffCount + 1 } : d)));
      toast.success(`${sName} added to roster`);
    }
    setStaffModal(false);
  };

  const deptNameOf = (id: string) => departments.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      {/* departments */}
      <GlassCard className="xl:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle title="Departments" />
          <button className="btn-neon !text-xs !py-1.5" onClick={() => openDept()}><Plus size={13} /> Add</button>
        </div>
        <div className="space-y-2">
          {departments.map((d) => (
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: d.color, boxShadow: `0 0 8px ${d.color}` }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">{d.name}</div>
                <div className="text-[11px] text-slate-500">Head: {d.head} · {staff.filter((s) => s.departmentId === d.id).length || d.staffCount} staff</div>
              </div>
              {d.custom && <Badge tone="violet">custom</Badge>}
              {onOpenVoiceReg && /reception/i.test(d.name) && (
                <button
                  className="btn-ghost !text-[11px] !py-1 !px-2 !border-cyan-400/40 !text-cyan-300"
                  onClick={onOpenVoiceReg}
                  title="Open the Voice Registration desk"
                >
                  <Mic size={12} /> Voice Reg
                </button>
              )}
              <button className="btn-ghost !p-1.5" onClick={() => openDept(d)}><Pencil size={13} /></button>
              <button className="btn-ghost !p-1.5 hover:!text-red-300" onClick={() => delDept(d)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* staff */}
      <GlassCard className="xl:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle title="Staff Roster" />
          <button className="btn-neon !text-xs !py-1.5" onClick={() => openStaff()}><Plus size={13} /> Add staff</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Dept</th>
                <th className="pb-2 font-medium">Linked Dr.</th>
                <th className="pb-2 font-medium">Notify</th>
                <th className="pb-2 font-medium">Paperclip</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-2.5 pr-2 text-white font-medium">{s.name}</td>
                  <td className="py-2.5 pr-2 text-slate-400">{s.role}</td>
                  <td className="py-2.5 pr-2 text-slate-400">{deptNameOf(s.departmentId)}</td>
                  <td className="py-2.5 pr-2 text-slate-400">{s.linkedDoctor ?? "—"}</td>
                  <td className="py-2.5 pr-2">
                    <div className="flex gap-1">
                      {s.notifyWhatsApp && <Badge tone="green" className="!text-[9px]">WA</Badge>}
                      {s.notifyTelegram && <Badge tone="cyan" className="!text-[9px]">TG</Badge>}
                      {!s.notifyWhatsApp && !s.notifyTelegram && <span className="text-slate-600">—</span>}
                    </div>
                  </td>
                  <td className="py-2.5 pr-2">
                    <span className={s.paperclipMapped ? "text-emerald-300" : "text-slate-600"}>{s.paperclipMapped ? "mapped" : "off"}</span>
                  </td>
                  <td className="py-2.5">
                    <div className="flex gap-1">
                      <button className="btn-ghost !p-1.5" onClick={() => openStaff(s)}><Pencil size={12} /></button>
                      <button
                        className="btn-ghost !p-1.5 hover:!text-red-300"
                        onClick={() => {
                          setStaff(staff.filter((x) => x.id !== s.id));
                          toast.success(`${s.name} removed from roster`);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* dept modal */}
      <Modal open={deptModal} onClose={() => setDeptModal(false)} title={editingDept ? "Edit department" : "New department"}>
        <div className="space-y-3">
          <input className="input-dark" placeholder="Department name" value={deptName} onChange={(e) => setDeptName(e.target.value)} />
          <input className="input-dark" placeholder="Department head" value={deptHead} onChange={(e) => setDeptHead(e.target.value)} />
          <button className="btn-neon w-full" disabled={!deptName.trim()} onClick={saveDept}>
            {editingDept ? "Save changes" : "Create department"}
          </button>
        </div>
      </Modal>

      {/* staff modal */}
      <Modal open={staffModal} onClose={() => setStaffModal(false)} title={editingStaff ? "Edit staff member" : "Add staff member"} wide>
        <div className="grid grid-cols-2 gap-3">
          <input className="input-dark" placeholder="Full name" value={sName} onChange={(e) => setSName(e.target.value)} />
          <input className="input-dark" placeholder="Role (e.g. Staff Nurse)" value={sRole} onChange={(e) => setSRole(e.target.value)} />
          <select className="input-dark" value={sDept} onChange={(e) => setSDept(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <input className="input-dark" placeholder="Linked doctor (optional)" value={sDoctor} onChange={(e) => setSDoctor(e.target.value)} />
        </div>
        <div className="flex gap-5 mt-4 text-sm">
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input type="checkbox" checked={sWa} onChange={(e) => setSWa(e.target.checked)} className="accent-emerald-500" /> WhatsApp
          </label>
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input type="checkbox" checked={sTg} onChange={(e) => setSTg(e.target.checked)} className="accent-cyan-500" /> Telegram
          </label>
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input type="checkbox" checked={sPc} onChange={(e) => setSPc(e.target.checked)} className="accent-violet-500" /> Map to Paperclip node
          </label>
        </div>
        <button className="btn-neon w-full mt-5" disabled={!sName.trim() || !sRole.trim()} onClick={saveStaff}>
          {editingStaff ? "Save changes" : "Add to roster"}
        </button>
      </Modal>
    </div>
  );
}
