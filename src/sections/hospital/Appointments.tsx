// Appointments module — doctor-wise book + day list with the full status flow
// (Booked → Checked-in → In-consult → Done / No-show), WhatsApp reminders,
// and check-in hand-off into the Reception/OP (voice) flow.

import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  LogIn,
  MessageCircle,
  Phone,
  Plus,
  Send,
  Stethoscope,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn, nowTime, uid } from "@/lib/utils";
import type { Appointment, AppointmentStatus } from "@/lib/types";

const DEPARTMENTS = ["General Medicine", "Orthopaedics", "Paediatrics", "Cardiology", "Dermatology", "OBG", "Ophthalmology", "ENT", "Dental"];
const DOCTORS = ["Dr. Arjun Rao", "Dr. Nandini S", "Dr. Kunal M", "Dr. Admin"];
const SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "16:00", "16:30", "17:00", "17:30", "18:00"];

const STATUS_META: Record<AppointmentStatus, { label: string; tone: "amber" | "cyan" | "violet" | "green" | "red" }> = {
  booked: { label: "Booked", tone: "amber" },
  "checked-in": { label: "Checked-in", tone: "cyan" },
  "in-consult": { label: "In-consult", tone: "violet" },
  done: { label: "Done", tone: "green" },
  "no-show": { label: "No-show", tone: "red" },
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export function Appointments({ onNavigate }: { onNavigate: (sub: string) => void }) {
  const { appointments, setAppointments, setPrefillReg, addSendLog, logAudit } = useStore();
  const [modal, setModal] = useState(false);
  const [doctorFilter, setDoctorFilter] = useState("all");

  // booking form
  const [bName, setBName] = useState("");
  const [bPhone, setBPhone] = useState("");
  const [bDoctor, setBDoctor] = useState(DOCTORS[0]);
  const [bDept, setBDept] = useState(DEPARTMENTS[0]);
  const [bDate, setBDate] = useState(todayISO());
  const [bSlot, setBSlot] = useState("10:00");
  const [bMode, setBMode] = useState<Appointment["mode"]>("Walk-in");

  const setStatus = (a: Appointment, status: AppointmentStatus, silent?: boolean) => {
    setAppointments(appointments.map((x) => (x.id === a.id ? { ...x, status } : x)));
    if (!silent) toast.success(`${a.patientName} → ${STATUS_META[status].label}`);
  };

  const book = () => {
    if (!bName.trim()) return;
    const a: Appointment = {
      id: uid("ap"),
      patientName: bName.trim(),
      phone: bPhone.trim(),
      doctor: bDoctor,
      department: bDept,
      date: bDate,
      slot: bSlot,
      mode: bMode,
      status: "booked",
      createdAt: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}`,
    };
    setAppointments([...appointments, a]);
    logAudit("Appointment booked", `${a.patientName} · ${a.doctor} · ${a.date} ${a.slot} (${a.mode})`, "Front Desk");
    toast.success("Appointment booked", { description: `${a.date} ${a.slot} · ${a.doctor} · ${a.department}` });
    setModal(false);
    setBName(""); setBPhone("");
  };

  const remind = (a: Appointment) => {
    addSendLog({ provider: "WhatsApp", template: "appointment_reminder", recipient: `${a.patientName} (${a.phone || "no number"})`, status: "sent" });
    toast.success("WhatsApp reminder logged", { description: `appointment_reminder → ${a.phone || "front desk to call"} (in send-log).` });
  };

  const checkIn = (a: Appointment) => {
    setStatus(a, "checked-in", true);
    setPrefillReg({ name: a.patientName, phone: a.phone, department: a.department, doctor: a.doctor });
    logAudit("Appointment check-in", `${a.patientName} checked in — pushed to Reception/OP flow`, "Front Desk");
    toast.success("Checked in — patient pushed to Reception OP flow", {
      description: "Voice Registration form is prefilled; confirm registration & billing there.",
      action: { label: "Open Reception", onClick: () => onNavigate("voice-reg") },
    });
  };

  const filtered = appointments.filter((a) => doctorFilter === "all" || a.doctor === doctorFilter);
  const today = filtered.filter((a) => a.date === todayISO()).sort((x, y) => x.slot.localeCompare(y.slot));
  const upcoming = filtered.filter((a) => a.date > todayISO()).sort((x, y) => (x.date + x.slot).localeCompare(y.date + y.slot));
  const earlier = filtered.filter((a) => a.date < todayISO()).slice(-5);

  const Row = ({ a }: { a: Appointment }) => (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center gap-3 flex-wrap">
      <div className="shrink-0 text-center w-14">
        <p className="font-mono text-sm font-bold text-white">{a.slot}</p>
        <p className="text-[9px] text-slate-500">{a.date === todayISO() ? "today" : a.date}</p>
      </div>
      <div className="flex-1 min-w-[160px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">{a.patientName}</span>
          <Badge tone={STATUS_META[a.status].tone} className="!text-[9px]">{STATUS_META[a.status].label}</Badge>
          <Badge tone="neutral" className="!text-[9px]">{a.mode}</Badge>
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">
          <Stethoscope size={10} className="inline mr-1" />{a.doctor} · {a.department}{a.phone ? ` · ${a.phone}` : ""}
        </p>
      </div>
      <div className="flex gap-1.5 flex-wrap shrink-0">
        {a.status === "booked" && (
          <>
            <button className="btn-neon !text-[10px] !py-1" onClick={() => checkIn(a)}><LogIn size={11} /> Check in</button>
            <button className="btn-ghost !text-[10px] !py-1" onClick={() => setStatus(a, "no-show")}><UserX size={11} /> No-show</button>
          </>
        )}
        {a.status === "checked-in" && (
          <button className="btn-neon !text-[10px] !py-1" onClick={() => setStatus(a, "in-consult")}><Stethoscope size={11} /> Start consult</button>
        )}
        {a.status === "in-consult" && (
          <button className="btn-neon !text-[10px] !py-1" onClick={() => setStatus(a, "done")}><CheckCircle2 size={11} /> Done</button>
        )}
        {(a.status === "booked" || a.status === "checked-in") && (
          <button className="btn-ghost !text-[10px] !py-1" onClick={() => remind(a)} title="Send WhatsApp reminder (send-log)">
            <MessageCircle size={11} /> Remind
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SectionTitle title="Appointments" subtitle={`${today.length} today · ${upcoming.length} upcoming`} />
          <div className="flex gap-2 items-center">
            <select className="input-dark !w-48 !py-1.5 !text-[11px]" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
              <option value="all">All doctors</option>
              {DOCTORS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <button className="btn-neon !text-xs !py-1.5" onClick={() => setModal(true)}><Plus size={13} /> Book appointment</button>
          </div>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <Clock size={11} /> Today — {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
        </p>
        <div className="space-y-2">
          {today.length === 0 && <p className="text-xs text-slate-500">No appointments today for this filter.</p>}
          {today.map((a) => <Row key={a.id} a={a} />)}
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mt-5 mb-2 flex items-center gap-1.5">
          <CalendarDays size={11} /> Upcoming
        </p>
        <div className="space-y-2">
          {upcoming.length === 0 && <p className="text-xs text-slate-500">Nothing scheduled beyond today.</p>}
          {upcoming.map((a) => <Row key={a.id} a={a} />)}
        </div>

        {earlier.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mt-5 mb-2">Recent past</p>
            <div className="space-y-2 opacity-70">{earlier.map((a) => <Row key={a.id} a={a} />)}</div>
          </>
        )}
      </GlassCard>

      {/* booking modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Book appointment" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className="input-dark" placeholder="Patient name *" value={bName} onChange={(e) => setBName(e.target.value)} />
            <input className="input-dark" placeholder="Phone (10-digit)" value={bPhone} onChange={(e) => setBPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} />
            <select className="input-dark" value={bDoctor} onChange={(e) => setBDoctor(e.target.value)}>
              {DOCTORS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input-dark" value={bDept} onChange={(e) => setBDept(e.target.value)}>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <input type="date" className="input-dark" value={bDate} min={todayISO()} onChange={(e) => setBDate(e.target.value)} />
            <select className="input-dark" value={bSlot} onChange={(e) => setBSlot(e.target.value)}>
              {SLOTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-1.5">
            {(["Walk-in", "Phone", "WhatsApp"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setBMode(m)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-xs font-semibold border transition-all flex items-center gap-1.5",
                  bMode === m ? "bg-violet-500/20 text-white border-violet-400/50" : "text-slate-400 border-white/10 hover:text-white"
                )}
              >
                {m === "Phone" ? <Phone size={11} /> : m === "WhatsApp" ? <MessageCircle size={11} /> : <LogIn size={11} />}
                {m}
              </button>
            ))}
          </div>
          <button className="btn-neon w-full" disabled={!bName.trim()} onClick={book}>
            <Send size={14} /> Book — {bDate} {bSlot}
          </button>
        </div>
      </Modal>
    </div>
  );
}
