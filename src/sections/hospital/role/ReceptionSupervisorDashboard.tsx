import { useMemo, useState, useEffect } from "react";
import { ShieldCheck, Activity, Users, Phone, MessageSquare, Printer, AlertTriangle, CheckCircle2, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import type { PatientRecord, Appointment, Bill } from "@/lib/types";

type SupervisorTab = "overview" | "receptionists" | "patients" | "engagement" | "audit";

export function ReceptionSupervisorDashboard() {
  const { account } = useAuth();
  const { patients, appointments, bills, audit, logAudit } = useStore();
  const [tab, setTab] = useState<SupervisorTab>("overview");
  const [selectedReceptionist, setSelectedReceptionist] = useState<string | null>(null);

  const todayISO = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter((a) => a.date === todayISO);
  const todayPatients = patients.filter((p) => p.registeredAt?.startsWith(new Date().toLocaleDateString("en-IN")));
  const todayBills = bills.filter((b) => b.timestamp?.startsWith(todayISO));

  const receptionists = [
    { id: "rec-1", name: "Lakshmi", device: "Desktop-01", status: "online", patientsToday: 12 },
    { id: "rec-2", name: "Priya", device: "Tablet-03", status: "online", patientsToday: 8 },
    { id: "rec-3", name: "Anita", device: "Laptop-02", status: "away", patientsToday: 5 },
  ];

  const tabs = [
    { key: "overview" as SupervisorTab, label: "Overview", icon: Activity, count: 0 },
    { key: "receptionists" as SupervisorTab, label: "Receptionists", icon: Users, count: receptionists.length },
    { key: "patients" as SupervisorTab, label: "Patient Flow", icon: Phone, count: todayPatients.length },
    { key: "engagement" as SupervisorTab, label: "Engagement", icon: MessageSquare, count: 0 },
    { key: "audit" as SupervisorTab, label: "Audit & Alerts", icon: AlertTriangle, count: audit.length },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient">Reception Supervisor</h1>
          <p className="text-sm text-slate-400 mt-1">{account?.name ?? "Supervisor"} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Badge tone="green" className="!text-[10px]"><ShieldCheck size={12} className="mr-1" /> Monitoring Active</Badge>
      </div>

      <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => { setTab(key); logAudit("Supervisor tab", `Opened ${label}`, account?.name ?? "Supervisor"); }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all border",
              tab === key
                ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_14px_rgba(212,175,55,0.25)]"
                : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white hover:bg-white/[0.06]"
            )}
          >
            <Icon size={16} className={tab === key ? "text-neon-cyan" : ""} />
            {label}
            {count > 0 && <span className="text-[10px] rounded-full px-1.5 py-0.5 font-semibold bg-cyan-500/20 text-cyan-300">{count}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && <SupervisorOverview receptionists={receptionists} todayPatients={todayPatients} todayAppointments={todayAppointments} todayBills={todayBills} />}
      {tab === "receptionists" && <ReceptionistList receptionists={receptionists} selected={selectedReceptionist} onSelect={setSelectedReceptionist} />}
      {tab === "patients" && <PatientFlow patients={todayPatients} appointments={todayAppointments} />}
      {tab === "engagement" && <EngagementPanel />}
      {tab === "audit" && <AuditPanel audit={audit} />}
    </div>
  );
}

function SupervisorOverview({ receptionists, todayPatients, todayAppointments, todayBills }: { receptionists: any[]; todayPatients: PatientRecord[]; todayAppointments: Appointment[]; todayBills: Bill[] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <GlassCard>
          <div className="text-xs text-slate-400 mb-1">Active Receptionists</div>
          <div className="text-2xl font-bold text-white">{receptionists.filter(r => r.status === "online").length}/{receptionists.length}</div>
        </GlassCard>
        <GlassCard>
          <div className="text-xs text-slate-400 mb-1">Patients Today</div>
          <div className="text-2xl font-bold text-white">{todayPatients.length}</div>
        </GlassCard>
        <GlassCard>
          <div className="text-xs text-slate-400 mb-1">Appointments</div>
          <div className="text-2xl font-bold text-white">{todayAppointments.length}</div>
        </GlassCard>
        <GlassCard>
          <div className="text-xs text-slate-400 mb-1">Billing Volume</div>
          <div className="text-2xl font-bold text-white">₹{todayBills.reduce((s, b) => s + b.amount, 0).toLocaleString("en-IN")}</div>
        </GlassCard>
      </div>

      <GlassCard>
        <SectionTitle title="Live Activity Feed" subtitle="Real-time reception events" />
        <div className="space-y-2">
          {todayPatients.slice().reverse().slice(0, 10).map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white">{p.name} registered</div>
                <div className="text-[10px] text-slate-500">{p.registeredAt} · {p.department}</div>
              </div>
              <Badge tone="cyan" className="!text-[9px]">{p.id}</Badge>
            </div>
          ))}
          {todayPatients.length === 0 && <p className="text-xs text-slate-500">No activity yet today.</p>}
        </div>
      </GlassCard>
    </div>
  );
}

function ReceptionistList({ receptionists, selected, onSelect }: { receptionists: any[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <GlassCard>
      <SectionTitle title="Receptionist Devices" subtitle="Each receptionist has a unique secure URL" />
      <div className="space-y-2">
        {receptionists.map((r) => (
          <div key={r.id} className={cn("flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all", selected === r.id ? "border-cyan-400/40 bg-cyan-400/5" : "border-white/10 bg-white/[0.03]")} onClick={() => onSelect(r.id)}>
            <div className={cn("h-2 w-2 rounded-full", r.status === "online" ? "bg-emerald-400" : "bg-amber-400")} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">{r.name}</div>
              <div className="text-[11px] text-slate-400">{r.device} · {r.patientsToday} patients today</div>
            </div>
            <Badge tone={r.status === "online" ? "green" : "amber"} className="!text-[9px]">{r.status}</Badge>
            <button className="btn-ghost !text-[10px] !py-1" onClick={(e) => { e.stopPropagation(); toast.success(`Device URL copied for ${r.name}`); }}>
              <Printer size={11} /> Copy URL
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-cyan-400/30 bg-cyan-500/5 p-3">
          <div className="text-xs font-semibold text-cyan-200 mb-1">Assigned Secure URL</div>
          <div className="font-mono text-[11px] text-cyan-100 break-all">https://astra-hospital-system/reception/{selected}</div>
          <p className="text-[10px] text-slate-400 mt-1">Share this URL with {receptionists.find(r => r.id === selected)?.name}. Each URL is device-locked.</p>
        </div>
      )}
    </GlassCard>
  );
}

function PatientFlow({ patients, appointments }: { patients: PatientRecord[]; appointments: Appointment[] }) {
  const [calling, setCalling] = useState<string | null>(null);

  const callPatient = (patientId: string, patientName: string) => {
    setCalling(patientId);
    toast.info(`Calling ${patientName}`, { description: "Please proceed to the reception counter." });
    setTimeout(() => setCalling(null), 4000);
  };

  return (
    <GlassCard>
      <SectionTitle title="Patient Flow Management" subtitle="OP number calling and status tracking" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {patients.length === 0 && <p className="text-xs text-slate-500">No patients registered today.</p>}
        {patients.slice().reverse().slice(0, 12).map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <Badge tone="cyan" className="!text-[9px] font-mono">{p.id}</Badge>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{p.name}</div>
              <div className="text-[10px] text-slate-400">{p.department} · {p.linkedDoctor}</div>
            </div>
            <button className={cn("btn-neon !text-[10px] !py-1", calling === p.id && "opacity-50 cursor-wait")} onClick={() => callPatient(p.id, p.name)} disabled={!!calling}>
              <Phone size={11} className="mr-1" /> {calling === p.id ? "Calling..." : "Call"}
            </button>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function EngagementPanel() {
  const [messages, setMessages] = useState([
    { id: 1, channel: "WhatsApp", recipient: "demo recipient", message: "Demo appointment text. Not sent.", status: "not sent", time: "9:15 AM" },
    { id: 2, channel: "Telegram", recipient: "demo group", message: "Demo note. Not sent.", status: "not sent", time: "8:30 AM" },
  ]);
  const [newMsg, setNewMsg] = useState("");
  const [channel, setChannel] = useState<"WhatsApp" | "Telegram">("WhatsApp");

  const sendMessage = () => {
    if (!newMsg.trim()) return;
    setMessages((m) => [...m, { id: Date.now(), channel, recipient: "Broadcast", message: newMsg, status: "not sent", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    setNewMsg("");
    toast.info("Not sent. This screen does not send " + channel + ". The line stays on this page only.");
  };

  return (
    <div className="space-y-4">
      <GlassCard>
        <SectionTitle title="Communication Center" subtitle="Draft only. Nothing is sent to WhatsApp or Telegram." />
        <div className="flex gap-2 mb-3">
          <button className={cn("btn-ghost !text-xs", channel === "WhatsApp" && "border-cyan-400/40 text-cyan-300")} onClick={() => setChannel("WhatsApp")}>WhatsApp</button>
          <button className={cn("btn-ghost !text-xs", channel === "Telegram" && "border-violet-400/40 text-violet-300")} onClick={() => setChannel("Telegram")}>Telegram</button>
        </div>
        <div className="flex gap-2 mb-3">
          <input className="input-dark flex-1" placeholder="Type message to broadcast..." value={newMsg} onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void sendMessage()} />
          <button className="btn-neon !px-3" onClick={() => void sendMessage()} disabled={!newMsg.trim()}><Send size={14} /></button>
        </div>
        <div className="space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <Badge tone={msg.channel === "WhatsApp" ? "green" : "violet"} className="!text-[8px] shrink-0">{msg.channel}</Badge>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white">{msg.message}</div>
                <div className="text-[10px] text-slate-500">{msg.recipient} · {msg.time}</div>
              </div>
              <Badge tone="green" className="!text-[8px] shrink-0">{msg.status}</Badge>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <SectionTitle title="Patient Advisory Display" subtitle="Health tips and waiting room messages" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { title: "Health Tip", msg: "Deep breathing exercises help prevent chest infections. Try 5 slow breaths every hour." },
            { title: "Appointment Reminder", msg: "Please keep your appointment ID ready. Walk-ins may have extended waiting times." },
            { title: "Emergency Protocol", msg: "In case of emergency, inform the reception desk immediately. Do not leave the premises unattended." },
            { title: "Visiting Hours", msg: "Visiting hours are 6 PM to 8 PM. Only 2 visitors per patient for infection control." },
          ].map(({ title, msg }) => (
            <div key={title} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs font-bold text-white mb-1">{title}</div>
              <p className="text-[11px] text-slate-300">{msg}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

function AuditPanel({ audit }: { audit: any[] }) {
  const [filter, setFilter] = useState<string>("all");

  const receptionAudit = audit.filter((a) => a.action.includes("Reception") || a.action.includes("registration") || a.action.includes("tab"));

  const filtered = filter === "all" ? receptionAudit : receptionAudit.filter((a) => a.actor === filter);

  return (
    <GlassCard>
      <SectionTitle title="Audit Trail & Anomaly Detection" subtitle="Astra AI monitoring logs" />
      <div className="flex gap-2 mb-3">
        <button className={cn("btn-ghost !text-xs", filter === "all" && "border-cyan-400/40 text-cyan-300")} onClick={() => setFilter("all")}>All Events</button>
        <button className={cn("btn-ghost !text-xs", filter === "Lakshmi" && "border-cyan-400/40 text-cyan-300")} onClick={() => setFilter("Lakshmi")}>Lakshmi</button>
        <button className={cn("btn-ghost !text-xs", filter === "Priya" && "border-cyan-400/40 text-cyan-300")} onClick={() => setFilter("Priya")}>Priya</button>
        <button className={cn("btn-ghost !text-xs", filter === "Anita" && "border-cyan-400/40 text-cyan-300")} onClick={() => setFilter("Anita")}>Anita</button>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-1.5">
        {filtered.length === 0 && <p className="text-xs text-slate-500">No audit events yet.</p>}
        {filtered.slice(0, 50).map((a) => (
          <div key={a.id} className="flex items-center gap-3 text-xs rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            <Clock size={12} className="text-slate-500 shrink-0" />
            <span className="font-mono text-slate-500 shrink-0">{a.timestamp}</span>
            <Badge tone="violet" className="!text-[9px] shrink-0">{a.actor}</Badge>
            <span className="text-slate-300 font-medium shrink-0">{a.action}</span>
            <span className="text-slate-500 truncate">{a.detail}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
