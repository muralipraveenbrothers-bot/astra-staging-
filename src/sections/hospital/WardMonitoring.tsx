// Ward Management + Monitoring — bed board with IP admission/transfer/discharge,
// live ward instruction feed (doctor orders), medication timing board with
// overdue escalation + Voicebox voice alerts, and vitals quick-entry
// with abnormal auto-flags.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlarmClock,
  BedDouble,
  Brush,
  CheckCircle2,
  HeartPulse,
  MessageCircle,
  ShieldAlert,
  Thermometer,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn, nowTime } from "@/lib/utils";
import { AckModal, ackPatch, fmtLeft, OrderQueueRow, useNow, useOrderEscalation } from "./deptOrders";
import type { Bed, HospitalOrder, MedDose } from "@/lib/types";
import { speakHumanVoice } from "@/utils/audioAlerts";

const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

function speak(text: string) {
  speakHumanVoice(text, undefined, undefined, () => toast.error("Voicebox is offline"), "urgent", "en-IN");
}

export function WardMonitoring() {
  const {
    orders, setOrders, addIssue, staff, beds, setBeds, medDoses, setMedDoses,
    vitals, addVitals, markDischarged, addSendLog, logAudit,
  } = useStore();
  const now = useNow();
  useOrderEscalation(orders, setOrders, addIssue, "Ward");

  /* ---------------- bed board ---------------- */
  const [admitBed, setAdmitBed] = useState<Bed | null>(null);
  const [admName, setAdmName] = useState("");
  const [admId, setAdmId] = useState("");
  const [admDiag, setAdmDiag] = useState("");
  const [transferBed, setTransferBed] = useState<Bed | null>(null);
  const [transferTarget, setTransferTarget] = useState("");

  const occupied = beds.filter((b) => b.status === "occupied");
  const vacant = beds.filter((b) => b.status === "vacant");

  const openAdmit = (b: Bed) => {
    setAdmitBed(b);
    setAdmName("");
    setAdmDiag("");
    setAdmId(`PT-1${String(Date.now()).slice(-3)}`);
  };

  const confirmAdmit = () => {
    if (!admitBed || !admName.trim()) return;
    setBeds(
      beds.map((b) =>
        b.id === admitBed.id
          ? { ...b, status: "occupied" as const, patientId: admId.trim(), patientName: admName.trim(), admittedAt: `Today ${nowTime()}`, diagnosis: admDiag.trim() || "Under evaluation" }
          : b
      )
    );
    logAudit("IP admission", `${admId} ${admName.trim()} → ${admitBed.ward} ${admitBed.label} · ${admDiag.trim() || "under evaluation"}`, "Ward Desk");
    addSendLog({ provider: "Internal", template: "ip_admission", recipient: `Ward channel · ${admName.trim()} → ${admitBed.label}`, status: "sent" });
    toast.success("Patient admitted", { description: `${admitBed.ward} ${admitBed.label} allocated · Dashboard census unaffected (IP base).` });
    setAdmitBed(null);
  };

  const dischargeBed = (b: Bed) => {
    if (!b.patientId) return;
    markDischarged({ patientId: b.patientId, dischargedAt: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}`, diagnosis: b.diagnosis ?? "—", followUpDate: "" });
    setBeds(beds.map((x) => (x.id === b.id ? { ...x, status: "cleaning" as const, patientId: undefined, patientName: undefined, admittedAt: undefined, diagnosis: undefined } : x)));
    logAudit("Bed discharge", `${b.patientId} discharged — ${b.label} to cleaning`, "Ward Desk");
    toast.success("Discharged — bed to cleaning", { description: `${b.patientId} freed · Dashboard census updated.` });
  };

  const confirmTransfer = () => {
    if (!transferBed || !transferTarget) return;
    const target = beds.find((b) => b.id === transferTarget);
    if (!target) return;
    setBeds(
      beds.map((b) => {
        if (b.id === transferBed.id) return { ...b, status: "cleaning" as const, patientId: undefined, patientName: undefined, admittedAt: undefined, diagnosis: undefined };
        if (b.id === target.id)
          return { ...b, status: "occupied" as const, patientId: transferBed.patientId, patientName: transferBed.patientName, admittedAt: transferBed.admittedAt, diagnosis: transferBed.diagnosis };
        return b;
      })
    );
    logAudit("Bed transfer", `${transferBed.patientId} ${transferBed.label} → ${target.label}`, "Ward Desk");
    toast.success("Patient transferred", { description: `${transferBed.patientName} → ${target.ward} ${target.label}` });
    setTransferBed(null);
    setTransferTarget("");
  };

  const markCleaned = (b: Bed) => {
    setBeds(beds.map((x) => (x.id === b.id ? { ...x, status: "vacant" as const } : x)));
    toast.success(`${b.label} cleaned and back in service`);
  };

  /* ---------------- ward instruction feed ---------------- */
  const [ackOrder, setAckOrder] = useState<HospitalOrder | null>(null);
  const [feedStaff, setFeedStaff] = useState(staff.find((s) => s.role.toLowerCase().includes("nurse"))?.name ?? staff[0]?.name ?? "");
  const feed = orders
    .filter((o) => (o.targetDept ?? "Ward") === "Ward")
    .sort((a, b) => Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt) || b.createdTs - a.createdTs);

  const confirmAck = (o: HospitalOrder, proof: { note: string; photo: boolean; voice: boolean }) => {
    const at = nowTime();
    setOrders(orders.map((x) => (x.id === o.id ? ackPatch(x, feedStaff, at, proof) : x)));
    logAudit("Ward order acknowledged", `${o.patientId} — “${o.orderText.slice(0, 40)}…” by ${feedStaff}`, feedStaff);
    toast.success("Instruction executed with proof", { description: `${o.patientId} · ${feedStaff} at ${at}` });
    setAckOrder(null);
  };

  /* ---------------- medication timing board ---------------- */
  const overdueRef = useRef<Set<string>>(new Set(medDoses.filter((d) => d.escalated).map((d) => d.id)));
  useEffect(() => {
    const t = setInterval(() => {
      const fresh = medDoses.filter((d) => !d.givenAt && !overdueRef.current.has(d.id) && Date.now() > d.dueTs);
      if (!fresh.length) return;
      fresh.forEach((d) => {
        overdueRef.current.add(d.id);
        addIssue({
          title: `OVERDUE dose ${d.patientId}: ${d.drug} ${d.dose} — escalated (Staff → Supervisor → Dept Head → CEO)`,
          status: "todo",
          priority: "critical",
          assignee: "Ward Ops Reviewer",
        });
        toast.error(`Dose OVERDUE — ${d.patientId} ${d.drug}`, { description: "Escalation filed · voice/WhatsApp alerts available on the timing board." });
      });
      const ids = new Set(fresh.map((d) => d.id));
      setMedDoses(medDoses.map((d) => (ids.has(d.id) ? { ...d, escalated: true } : d)));
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medDoses]);

  const giveDose = (d: MedDose) => {
    const at = nowTime();
    setMedDoses(medDoses.map((x) => (x.id === d.id ? { ...x, givenAt: at, givenBy: feedStaff } : x)));
    logAudit("Dose given", `${d.patientId} — ${d.drug} ${d.dose} by ${feedStaff} at ${at}`, feedStaff);
    toast.success("Dose recorded", { description: `${d.drug} → ${d.patientId} at ${at} · proof signed by ${feedStaff}.` });
  };

  const voiceAlert = (d: MedDose) => {
    speak(`Attention nursing staff. Medication overdue for patient ${d.patientName}, ${d.patientId}. ${d.drug}, dose ${d.dose}. Please administer immediately and record proof.`);
    toast.info("Voice alert playing", { description: "Voicebox is reading the overdue-dose alert aloud." });
  };

  const waAlert = (d: MedDose) => {
    addSendLog({ provider: "WhatsApp", template: "dose_overdue_alert", recipient: `Ward nurses group · ${d.patientId} ${d.drug}`, status: "sent" });
    toast.success("WhatsApp dose alert logged", { description: "dose_overdue_alert → ward nurses group (in send-log)." });
  };

  const pendingDoses = medDoses.filter((d) => !d.givenAt).sort((a, b) => a.dueTs - b.dueTs);
  const givenDoses = medDoses.filter((d) => d.givenAt).slice(-6).reverse();

  /* ---------------- vitals quick-entry ---------------- */
  const [vPid, setVPid] = useState(occupied[0]?.patientId ?? "");
  const [vTemp, setVTemp] = useState("");
  const [vPulse, setVPulse] = useState("");
  const [vBp, setVBp] = useState("");
  const [vSpo2, setVSpo2] = useState("");

  const saveVitals = () => {
    const temp = Number(vTemp), pulse = Number(vPulse), spo2 = Number(vSpo2);
    if (!vPid || !temp || !pulse || !spo2 || !vBp.trim()) {
      toast.error("Fill temp, pulse, BP and SpO₂");
      return;
    }
    const abnormal: string[] = [];
    if (spo2 < 94) abnormal.push(`SpO₂ ${spo2}% < 94`);
    if (pulse > 120) abnormal.push(`pulse ${pulse} > 120`);
    if (temp > 101) abnormal.push(`temp ${temp}°F > 101`);
    addVitals({ patientId: vPid, tempF: temp, pulse, bp: vBp.trim(), spo2, at: `${fmtDay(new Date())} ${nowTime()}`, abnormal });
    logAudit("Vitals recorded", `${vPid} — T ${temp}°F · P ${pulse} · BP ${vBp} · SpO₂ ${spo2}%${abnormal.length ? " · ABNORMAL: " + abnormal.join(", ") : ""}`, feedStaff);
    if (abnormal.length) {
      addSendLog({ provider: "WhatsApp", template: "abnormal_vitals", recipient: `Duty doctor · ${vPid} (${abnormal.join(", ")})`, status: "sent" });
      toast.error("Abnormal vitals — caution raised", { description: `${abnormal.join(" · ")} → duty-doctor WhatsApp alert in send-log.` });
    } else {
      toast.success("Vitals recorded", { description: `${vPid} · all values in range.` });
    }
    setVTemp(""); setVPulse(""); setVBp(""); setVSpo2("");
  };

  const latestAbnormal = vitals.find((v) => v.abnormal.length > 0);

  /* ---------------- render ---------------- */
  const wards = useMemo(() => [...new Set(beds.map((b) => b.ward))], [beds]);

  return (
    <div className="space-y-4">
      {/* ---------------- bed board ---------------- */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SectionTitle title="Bed Board" subtitle={`${occupied.length} occupied · ${vacant.length} vacant · ${beds.filter((b) => b.status === "cleaning").length} cleaning`} />
          <Badge tone="cyan" className="!text-[9px]"><BedDouble size={10} className="mr-1" /> live census</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {wards.map((w) => (
            <div key={w} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{w}</p>
              <div className="grid grid-cols-2 gap-2">
                {beds.filter((b) => b.ward === w).map((b) => (
                  <div
                    key={b.id}
                    className={cn(
                      "rounded-lg border p-2.5 text-xs",
                      b.status === "occupied"
                        ? "border-violet-400/40 bg-violet-500/10"
                        : b.status === "cleaning"
                          ? "border-amber-400/40 bg-amber-400/[0.07]"
                          : "border-emerald-400/30 bg-emerald-400/[0.05]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-white">{b.label}</span>
                      <Badge tone={b.status === "occupied" ? "violet" : b.status === "cleaning" ? "amber" : "green"} className="!text-[8px]">
                        {b.status}
                      </Badge>
                    </div>
                    {b.status === "occupied" ? (
                      <div className="mt-1.5 space-y-0.5">
                        <p className="text-slate-200 font-medium truncate">{b.patientName}</p>
                        <p className="text-[10px] text-slate-500">{b.patientId} · {b.admittedAt}</p>
                        <p className="text-[10px] text-slate-400 truncate">{b.diagnosis}</p>
                        <div className="flex gap-1 mt-1.5">
                          <button className="btn-ghost !text-[9px] !py-0.5 !px-1.5 flex-1" onClick={() => { setTransferBed(b); setTransferTarget(""); }}>Transfer</button>
                          <button className="btn-ghost !text-[9px] !py-0.5 !px-1.5 flex-1 !border-emerald-400/40 !text-emerald-300" onClick={() => dischargeBed(b)}>Discharge</button>
                        </div>
                      </div>
                    ) : b.status === "cleaning" ? (
                      <button className="btn-ghost !text-[9px] !py-0.5 !px-1.5 mt-2 w-full" onClick={() => markCleaned(b)}>
                        <Brush size={10} /> Mark cleaned
                      </button>
                    ) : (
                      <button className="btn-neon !text-[9px] !py-0.5 !px-1.5 mt-2 w-full" onClick={() => openAdmit(b)}>Admit patient</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-3">
          Discharge frees the bed to cleaning and updates the Dashboard IP census via the discharge registry (ties into Orders → IP Discharge Automation).
        </p>
      </GlassCard>

      {/* ---------------- instruction feed + med board ---------------- */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GlassCard>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <SectionTitle title="Live Instruction Feed" subtitle="Ward-routed doctor orders" />
            <select className="input-dark !w-48 !py-1 !text-[11px]" value={feedStaff} onChange={(e) => setFeedStaff(e.target.value)}>
              {staff.map((s) => <option key={s.id}>{s.name}</option>)}
            </select>
          </div>
          {feed.length === 0 && <p className="text-xs text-slate-500">No ward instructions yet.</p>}
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {feed.map((o) => (
              <OrderQueueRow key={o.id} o={o} now={now} actionLabel="Acknowledge + proof" onAction={setAckOrder} />
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <SectionTitle title="Medication Timing Board" subtitle="Due-in countdown per scheduled dose" />
            <Badge tone="amber" className="!text-[9px]"><AlarmClock size={10} className="mr-1" /> {pendingDoses.length} pending</Badge>
          </div>
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {pendingDoses.map((d) => {
              const msLeft = d.dueTs - now;
              const over = msLeft <= 0;
              return (
                <div key={d.id} className={cn("rounded-lg border p-3 flex items-start gap-3", over ? "border-red-400/40 bg-red-400/[0.05]" : "border-white/10 bg-white/[0.03]")}>
                  <div className="shrink-0 mt-0.5">
                    {over ? <ShieldAlert size={17} className="text-red-400 animate-pulse" /> : <AlarmClock size={17} className="text-cyan-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-neon-cyan text-xs">{d.patientId}</span>
                      <span className="text-[11px] text-slate-300">{d.patientName}</span>
                      {over && <Badge tone="red" className="!text-[9px]">CAUTION — DOSE OVERDUE</Badge>}
                      {over && d.escalated && <Badge tone="amber" className="!text-[9px]">⬆ escalated</Badge>}
                    </div>
                    <p className="text-xs text-slate-200 mt-0.5">💊 {d.drug} · {d.dose}</p>
                    {over && (
                      <div className="flex gap-1.5 mt-2">
                        <button className="btn-ghost !text-[10px] !py-0.5 !px-2" onClick={() => voiceAlert(d)}><Volume2 size={11} /> Voice alert</button>
                        <button className="btn-ghost !text-[10px] !py-0.5 !px-2" onClick={() => waAlert(d)}><MessageCircle size={11} /> WhatsApp alert</button>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right space-y-1.5">
                    <div className={cn("font-mono text-sm font-bold tabular-nums", over ? "text-red-300 animate-pulse" : "text-white")}>
                      {over ? `+${fmtLeft(-msLeft)}` : fmtLeft(msLeft)}
                    </div>
                    <button className="btn-neon !text-[10px] !py-1" onClick={() => giveDose(d)}><CheckCircle2 size={11} /> Given</button>
                  </div>
                </div>
              );
            })}
            {pendingDoses.length === 0 && <p className="text-xs text-slate-500">All scheduled doses administered. ✅</p>}
          </div>
          {givenDoses.length > 0 && (
            <div className="mt-3 border-t border-white/5 pt-2 space-y-1">
              {givenDoses.map((d) => (
                <p key={d.id} className="text-[10px] text-emerald-300/70">✓ {d.patientId} {d.drug} — {d.givenBy} at {d.givenAt}</p>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* ---------------- vitals ---------------- */}
      <GlassCard>
        <SectionTitle title="Vitals Quick-Entry" subtitle="Abnormal values auto-flag → caution banner + duty-doctor alert" />
        {latestAbnormal && (
          <div className="rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-2.5 mb-3 flex items-start gap-3">
            <ShieldAlert size={16} className="text-red-300 shrink-0 mt-0.5" />
            <p className="text-xs text-red-200">
              <span className="font-semibold">CAUTION:</span> {latestAbnormal.patientId} — {latestAbnormal.abnormal.join(" · ")} ({latestAbnormal.at}). Duty doctor alerted via WhatsApp (send-log).
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <select className="input-dark col-span-2" value={vPid} onChange={(e) => setVPid(e.target.value)}>
            {occupied.length === 0 && <option value="">No admitted patients</option>}
            {occupied.map((b) => <option key={b.id} value={b.patientId}>{b.patientId} — {b.patientName} ({b.label})</option>)}
          </select>
          <div>
            <label className="text-[10px] text-slate-500 flex items-center gap-1"><Thermometer size={10} /> Temp °F</label>
            <input className="input-dark mt-0.5" placeholder="98.6" value={vTemp} onChange={(e) => setVTemp(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 flex items-center gap-1"><HeartPulse size={10} /> Pulse</label>
            <input className="input-dark mt-0.5" placeholder="76" value={vPulse} onChange={(e) => setVPulse(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 flex items-center gap-1"><Activity size={10} /> BP</label>
            <input className="input-dark mt-0.5" placeholder="120/80" value={vBp} onChange={(e) => setVBp(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">SpO₂ %</label>
            <input className="input-dark mt-0.5" placeholder="98" value={vSpo2} onChange={(e) => setVSpo2(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <button className="btn-neon !text-xs mt-3" onClick={saveVitals} disabled={occupied.length === 0}>
          <HeartPulse size={13} /> Record vitals ({feedStaff})
        </button>
        <div className="mt-3 flex gap-2 flex-wrap">
          {vitals.slice(0, 6).map((v) => (
            <div key={v.id} className={cn("rounded-md border px-2.5 py-1.5 text-[10px]", v.abnormal.length ? "border-red-400/40 bg-red-400/[0.06] text-red-200" : "border-white/10 bg-white/[0.03] text-slate-300")}>
              <span className="font-mono">{v.patientId}</span> · T {v.tempF}°F · P {v.pulse} · {v.bp} · SpO₂ {v.spo2}%
              {v.abnormal.length > 0 && <span className="block text-red-300">⚠ {v.abnormal.join(" · ")}</span>}
            </div>
          ))}
        </div>
      </GlassCard>

      {/* admit modal */}
      <Modal open={!!admitBed} onClose={() => setAdmitBed(null)} title={`Admit patient — ${admitBed?.ward} ${admitBed?.label ?? ""}`} wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className="input-dark" placeholder="Patient name *" value={admName} onChange={(e) => setAdmName(e.target.value)} />
            <input className="input-dark" placeholder="Patient ID" value={admId} onChange={(e) => setAdmId(e.target.value)} />
          </div>
          <input className="input-dark" placeholder="Provisional diagnosis" value={admDiag} onChange={(e) => setAdmDiag(e.target.value)} />
          <p className="text-[11px] text-slate-500">Admission date: today {nowTime()} · recorded on the bed card.</p>
          <button className="btn-neon w-full" disabled={!admName.trim()} onClick={confirmAdmit}>
            <BedDouble size={14} /> Allocate bed & admit
          </button>
        </div>
      </Modal>

      {/* transfer modal */}
      <Modal open={!!transferBed} onClose={() => setTransferBed(null)} title={`Transfer ${transferBed?.patientName ?? ""}`}>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">From {transferBed?.ward} {transferBed?.label} — select the destination vacant bed:</p>
          <select className="input-dark" value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}>
            <option value="">Select vacant bed…</option>
            {vacant.map((b) => <option key={b.id} value={b.id}>{b.ward} {b.label}</option>)}
          </select>
          <button className="btn-neon w-full" disabled={!transferTarget} onClick={confirmTransfer}>Confirm transfer</button>
        </div>
      </Modal>

      {/* ack proof modal */}
      <AckModal order={ackOrder} staffName={feedStaff} onClose={() => setAckOrder(null)} onConfirm={confirmAck} />
    </div>
  );
}
