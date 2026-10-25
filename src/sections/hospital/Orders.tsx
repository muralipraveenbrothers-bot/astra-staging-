import { useEffect, useRef, useState } from "react";
import { AlarmClock, Camera, CheckCircle2, ClipboardCheck, Mic, Plus, Printer, ShieldAlert, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { DischargeSummaryView } from "@/components/Receipt";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, fmtINR, nowTime, sleep, uid } from "@/lib/utils";
import { NEW_WINDOW_MS } from "./deptOrders";
import type { HospitalOrder, OrderDept } from "@/lib/types";

const ESCALATION_PATH = "Staff → Supervisor → Dept Head → CEO";

function fmtCountdown(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

/* ------------------------------------------------------------------ */
/* IP Discharge Automation                                             */
/* ------------------------------------------------------------------ */

interface AdmittedPatient {
  patientId: string;
  name: string;
  admitDaysAgo: number;
  estCharges: number;
  ward: string;
}

const ADMITTED: AdmittedPatient[] = [
  { patientId: "PT-1087", name: "R. Devi", admitDaysAgo: 4, estCharges: 18200, ward: "General Ward · Bed 12" },
  { patientId: "PT-1076", name: "M. Singh", admitDaysAgo: 2, estCharges: 9400, ward: "Semi-private · Bed 4" },
  { patientId: "PT-1102", name: "K. Rajan", admitDaysAgo: 1, estCharges: 12600, ward: "ICU step-down · Bed 2" },
];

interface DischargeChecklist {
  vitals: boolean;
  meds: boolean;
  followUpDate: string;
  diagnosis: string;
  treatment: string;
  procedures: string;
  medications: string;
}

const blankChecklist: DischargeChecklist = {
  vitals: false,
  meds: false,
  followUpDate: "",
  diagnosis: "",
  treatment: "",
  procedures: "",
  medications: "",
};

const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

function IPDischargeAutomation({ staffName }: { staffName: string }) {
  const { bills, addBill, markDischarged, discharged, logAudit, addApproval, addSendLog } = useStore();
  const { account } = useAuth();
  const active = ADMITTED.filter((p) => !discharged.some((d) => d.patientId === p.patientId));
  const [pid, setPid] = useState<string>(active[0]?.patientId ?? "");
  const [checks, setChecks] = useState<Record<string, DischargeChecklist>>({});
  const [settling, setSettling] = useState(false);
  const [summary, setSummary] = useState<{
    patientId: string;
    diagnosis: string;
    treatment: string;
    procedures: string;
    medications: string;
    followUpDate: string;
    admitDate: string;
    dischargeDate: string;
  } | null>(null);

  const patient = active.find((p) => p.patientId === pid) ?? active[0];
  const c = (patient && checks[patient.patientId]) || blankChecklist;
  const upd = (patch: Partial<DischargeChecklist>) => {
    if (!patient) return;
    setChecks((prev) => ({ ...prev, [patient.patientId]: { ...((prev[patient.patientId] as DischargeChecklist | undefined) ?? blankChecklist), ...patch } }));
  };

  if (!patient) {
    return (
      <GlassCard>
        <SectionTitle title="IP Discharge Automation" subtitle="Checklist-gated discharge with summary printout" />
        <p className="text-xs text-emerald-300">All admitted patients have been discharged today. 🎉</p>
      </GlassCard>
    );
  }

  const admitDate = fmtDay(new Date(Date.now() - patient.admitDaysAgo * 86400000));
  // outstanding = seeded estimate + posted IP charges − settlement entries
  const postedIp = bills.filter((b) => b.patientId === patient.patientId && b.kind === "IP" && b.reference !== "DISCHARGE-SETTLE").reduce((s, b) => s + b.amount, 0);
  const settled = bills.filter((b) => b.patientId === patient.patientId && b.reference === "DISCHARGE-SETTLE").reduce((s, b) => s + b.amount, 0);
  const outstanding = Math.max(0, patient.estCharges + postedIp - settled);
  const billsOk = outstanding <= 0;
  const followOk = !!c.followUpDate;
  const summaryOk = !!c.diagnosis.trim() && !!c.treatment.trim();
  const allGreen = c.vitals && billsOk && c.meds && followOk && summaryOk;
  const blockers = [
    !c.vitals && "final vitals",
    !billsOk && "bill settlement",
    !c.meds && "medication reconciliation",
    !followOk && "follow-up date",
    !summaryOk && "diagnosis / treatment summary",
  ].filter(Boolean) as string[];

  const recordVitals = async () => {
    toast.info("Recording final vitals…", { description: "Fetching latest readings from the ward monitor (simulated)." });
    await sleep(900);
    upd({ vitals: true });
    toast.success("Final vitals recorded", { description: "BP 128/82 · HR 78 · SpO₂ 98% · T 98.6°F — signed to chart." });
  };

  const settleNow = async () => {
    if (settling || outstanding <= 0) return;
    setSettling(true);
    await sleep(800);
    const bill = addBill({
      patientId: patient.patientId,
      kind: "IP",
      service: "IP bill settlement — discharge",
      amount: outstanding,
      staffName: staffName || "Billing Desk",
      timestamp: nowTime(),
      mode: "UPI",
      reference: "DISCHARGE-SETTLE",
    });
    logAudit("Discharge settlement", `${patient.patientId} — ${fmtINR(outstanding)} settled via UPI (${bill.receiptNo})`, staffName || "Billing Desk");
    toast.success("Outstanding settled", { description: `${bill.receiptNo} · ${fmtINR(outstanding)} via UPI` });
    setSettling(false);
  };

  const reconcileMeds = async () => {
    toast.info("Reconciling medications…", { description: "Matching MAR against pharmacy issues (simulated)." });
    await sleep(900);
    upd({ meds: true });
    toast.success("Medications reconciled", { description: "All issued doses accounted for — no discrepancies." });
  };

  const generate = () => {
    if (!allGreen) return;
    setSummary({
      patientId: patient.patientId,
      diagnosis: c.diagnosis.trim(),
      treatment: c.treatment.trim(),
      procedures: c.procedures.trim(),
      medications: c.medications.trim(),
      followUpDate: c.followUpDate,
      admitDate,
      dischargeDate: `${fmtDay(new Date())} ${nowTime()}`,
    });
  };

  const confirmDischarge = () => {
    if (!summary) return;
    // long-stay discharges (≥ 4 days) require doctor/CEO approval first
    if (patient && patient.admitDaysAgo >= 4 && account?.role !== "doctor" && account?.role !== "ceo") {
      addApproval({
        kind: "discharge",
        title: `Long-stay discharge — ${summary.patientId} (${patient.admitDaysAgo}d)`,
        detail: `${summary.diagnosis} · follow-up ${summary.followUpDate} · submitted by ${staffName || "Ward Ops"}`,
        requestedBy: staffName || "Ward Ops",
        requestedByRole: account?.role ?? "ward",
        payload: JSON.stringify({ discharge: { patientId: summary.patientId, dischargedAt: summary.dischargeDate, diagnosis: summary.diagnosis, followUpDate: summary.followUpDate } }),
      });
      logAudit("Discharge sent for approval", `${summary.patientId} — long stay ${patient.admitDaysAgo}d`, staffName || "Ward Ops");
      toast.info("Sent for approval", { description: `${summary.patientId} has stayed ${patient.admitDaysAgo} days — discharge will execute once a doctor/CEO approves in the bell inbox.` });
      setChecks((prev) => { const n = { ...prev }; delete n[summary.patientId]; return n; });
      setSummary(null);
      return;
    }
    markDischarged({ patientId: summary.patientId, dischargedAt: summary.dischargeDate, diagnosis: summary.diagnosis, followUpDate: summary.followUpDate });
    logAudit("Patient discharged", `${summary.patientId} — ${summary.diagnosis} · follow-up ${summary.followUpDate}`, staffName || "Ward Ops");
    toast.success("Patient marked discharged", { description: `${summary.patientId} · bed freed — Dashboard census updated · Day-5 outcome check scheduled.` });
    setChecks((prev) => { const n = { ...prev }; delete n[summary.patientId]; return n; });
    setSummary(null);
    const remaining = active.filter((p) => p.patientId !== summary.patientId);
    setPid(remaining[0]?.patientId ?? "");
  };

  const Step = ({ ok, label, action }: { ok: boolean; label: string; action?: React.ReactNode }) => (
    <div className={cn("rounded-lg border p-3 flex items-center gap-3", ok ? "border-emerald-400/30 bg-emerald-400/[0.05]" : "border-red-400/30 bg-red-400/[0.04]")}>
      <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", ok ? "bg-emerald-400" : "bg-red-400 animate-pulse")} />
      <span className="text-xs text-slate-200 flex-1">{label}</span>
      {action}
    </div>
  );

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <SectionTitle title="IP Discharge Automation" subtitle="Every red step blocks the discharge summary" />
        <ClipboardCheck size={16} className="text-cyan-300" />
      </div>

      <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
        <span className="text-slate-500">Admitted patient:</span>
        <select className="input-dark !w-72 !py-1.5" value={patient.patientId} onChange={(e) => setPid(e.target.value)}>
          {active.map((p) => (
            <option key={p.patientId} value={p.patientId}>
              {p.patientId} — {p.name} · {p.ward}
            </option>
          ))}
        </select>
        <Badge tone="cyan" className="!text-[9px]">admitted {admitDate}</Badge>
        <Badge tone="amber" className="!text-[9px]">est. charges {fmtINR(patient.estCharges)}</Badge>
      </div>

      <div className="space-y-2.5">
        <Step
          ok={c.vitals}
          label="a) Final vitals recorded and signed to chart"
          action={!c.vitals ? <button className="btn-ghost !text-[11px] !py-1" onClick={() => void recordVitals()}>Record final vitals</button> : <Badge tone="green" className="!text-[9px]">done</Badge>}
        />
        <Step
          ok={billsOk}
          label={billsOk ? "b) All bills settled — nothing outstanding" : `b) Bills outstanding: ${fmtINR(outstanding)}`}
          action={!billsOk ? <button className="btn-neon !text-[11px] !py-1" disabled={settling} onClick={() => void settleNow()}>{settling ? "Settling…" : "Settle now (UPI)"}</button> : <Badge tone="green" className="!text-[9px]">settled</Badge>}
        />
        <Step
          ok={c.meds}
          label="c) Medications reconciled against pharmacy issues"
          action={!c.meds ? <button className="btn-ghost !text-[11px] !py-1" onClick={() => void reconcileMeds()}>Reconcile meds</button> : <Badge tone="green" className="!text-[9px]">done</Badge>}
        />
        <div className={cn("rounded-lg border p-3 flex items-center gap-3 flex-wrap", followOk ? "border-emerald-400/30 bg-emerald-400/[0.05]" : "border-red-400/30 bg-red-400/[0.04]")}>
          <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", followOk ? "bg-emerald-400" : "bg-red-400 animate-pulse")} />
          <span className="text-xs text-slate-200">d) Follow-up date set</span>
          <input type="date" className="input-dark !w-44 !py-1 ml-auto" value={c.followUpDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => upd({ followUpDate: e.target.value })} />
        </div>
        <div className={cn("rounded-lg border p-3 space-y-2", summaryOk ? "border-emerald-400/30 bg-emerald-400/[0.05]" : "border-red-400/30 bg-red-400/[0.04]")}>
          <div className="flex items-center gap-3">
            <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", summaryOk ? "bg-emerald-400" : "bg-red-400 animate-pulse")} />
            <span className="text-xs text-slate-200">e) Discharge summary — diagnosis & treatment (required)</span>
          </div>
          <input className="input-dark" placeholder="Final diagnosis *" value={c.diagnosis} onChange={(e) => upd({ diagnosis: e.target.value })} />
          <input className="input-dark" placeholder="Treatment given *" value={c.treatment} onChange={(e) => upd({ treatment: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input-dark" placeholder="Procedures (optional)" value={c.procedures} onChange={(e) => upd({ procedures: e.target.value })} />
            <input className="input-dark" placeholder="Meds on discharge (optional)" value={c.medications} onChange={(e) => upd({ medications: e.target.value })} />
          </div>
        </div>
      </div>

      <button className="btn-neon w-full mt-4" disabled={!allGreen} onClick={generate} title={allGreen ? "Compile the discharge summary" : `Blocked by: ${blockers.join(", ")}`}>
        {allGreen ? <><ClipboardCheck size={15} /> Generate Discharge Summary</> : `Blocked — complete: ${blockers.join(", ")}`}
      </button>
      <p className="text-[10px] text-slate-600 mt-2">
        All five checks must be green. Marking discharged frees the bed on the Dashboard census and schedules a Day-5 outcome follow-up note on the summary.
      </p>

      {/* discharge summary overlay */}
      {summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="relative z-10 space-y-4 max-h-[90vh] overflow-y-auto">
            <DischargeSummaryView
              patientId={summary.patientId}
              diagnosis={summary.diagnosis}
              treatment={summary.treatment}
              procedures={summary.procedures}
              medications={summary.medications}
              followUpDate={summary.followUpDate}
              admitDate={summary.admitDate}
              dischargeDate={summary.dischargeDate}
            />
            <div className="flex gap-2 justify-center flex-wrap">
              <button className="btn-neon" onClick={() => window.print()}>
                <Printer size={15} /> Download / Print
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  addSendLog({ provider: "WhatsApp", template: "review_request", recipient: summary.patientId, status: "sent" });
                  toast.success("Review request sent", { description: `Google review link sent to ${summary.patientId} on WhatsApp (simulated).` });
                }}
              >
                <Star size={15} /> Send Google review request
              </button>
              <button className="btn-ghost" onClick={confirmDischarge}>
                <CheckCircle2 size={15} /> Mark discharged — free the bed
              </button>
              <button className="btn-ghost" onClick={() => setSummary(null)}>Back to checklist</button>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

export function Orders() {
  const { orders, setOrders, staff, logAudit, addIssue, addSendLog } = useStore();
  const effective = orders;
  const [now, setNow] = useState(Date.now());
  const [modal, setModal] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [orderText, setOrderText] = useState("");
  const [dueMin, setDueMin] = useState("60");
  const [targetDept, setTargetDept] = useState<OrderDept>("Ward");
  const [drug, setDrug] = useState("");
  const [dose, setDose] = useState("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [staffName, setStaffName] = useState(staff.find((s) => s.role.toLowerCase().includes("nurse"))?.name ?? staff[0]?.name ?? "");

  // proof modal state
  const [proofFor, setProofFor] = useState<HospitalOrder | null>(null);
  const [proofNote, setProofNote] = useState("");
  const [proofPhoto, setProofPhoto] = useState(false);
  const [proofVoice, setProofVoice] = useState(false);
  const [recording, setRecording] = useState(false);

  const escalatedRef = useRef<Set<string>>(new Set(orders.filter((o) => o.escalated).map((o) => o.id)));

  const ensureSeeded = (): HospitalOrder[] => orders;

  // 1s countdown ticker + auto-escalation on expiry
  useEffect(() => {
    const t = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      const current = orders;
      let changed = false;
      const updated = current.map((o) => {
        const expired = ts - o.createdTs > o.dueMin * 60 * 1000;
        if (expired && !o.acknowledgedAt && !escalatedRef.current.has(o.id)) {
          escalatedRef.current.add(o.id);
          changed = true;
          addIssue({
            title: `OVERDUE order ${o.patientId}: “${o.orderText.slice(0, 50)}” — escalated (${ESCALATION_PATH})`,
            status: "todo",
            priority: "critical",
            assignee: "Ward Ops Reviewer",
          });
          toast.error(`Order overdue — escalated`, { description: `${o.patientId} · ${ESCALATION_PATH} · Issue filed on Agents tab.` });
          return { ...o, escalated: true };
        }
        return o;
      });
      if (changed) setOrders(updated);
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const openProof = (o: HospitalOrder) => {
    setProofFor(o);
    setProofNote("");
    setProofPhoto(false);
    setProofVoice(false);
  };

  const snapPhoto = async () => {
    toast.info("Capturing proof photo…", { description: "Kiosk cam 02 (simulated snapshot)." });
    await sleep(900);
    setProofPhoto(true);
    toast.success("Proof photo attached");
  };

  const recordVoice = async () => {
    setRecording(true);
    await sleep(2000);
    setRecording(false);
    setProofVoice(true);
    toast.success("Voice note recorded", { description: "0:02 clip attached (simulated recording)." });
  };

  const confirmAck = () => {
    if (!proofFor || !proofNote.trim()) return;
    const updated = ensureSeeded().map((x) =>
      x.id === proofFor.id
        ? {
            ...x,
            acknowledgedBy: staffName,
            acknowledgedAt: nowTime(),
            proofNote: proofNote.trim(),
            proofPhoto,
            proofVoice,
          }
        : x
    );
    setOrders(updated);
    logAudit("Order acknowledged", `${proofFor.patientId} — “${proofFor.orderText.slice(0, 40)}…” ack by ${staffName} with proof`, staffName);
    toast.success("Execution acknowledged with proof", { description: `${proofFor.patientId} · signed by ${staffName} at ${nowTime()}` });
    setProofFor(null);
  };

  const createOrder = () => {
    if (!patientId.trim() || !orderText.trim()) return;
    const o: HospitalOrder = {
      id: uid("ord"),
      patientId: patientId.trim(),
      orderText: orderText.trim(),
      doctor: "Dr. Admin",
      createdAt: nowTime(),
      createdTs: Date.now(),
      dueMin: Number(dueMin) || 60,
      targetDept,
      ...(targetDept === "Pharmacy" && drug.trim()
        ? { drug: drug.trim(), dose: dose.trim() || undefined, qty: Number(qty) || 1, unitPrice: Number(unitPrice) || undefined }
        : {}),
    };
    setOrders([...ensureSeeded(), o]);
    logAudit("Order created", `${o.patientId} — “${o.orderText.slice(0, 50)}” → ${targetDept} · due in ${o.dueMin}m`, "Dr. Admin");
    addSendLog({ provider: "Internal", template: "order_route", recipient: `${targetDept} queue · ${o.patientId} “${o.orderText.slice(0, 40)}”`, status: "sent" });
    toast.success(`Order routed instantly to ${targetDept} queue`, { description: "NEW badge live in the department queue · countdown started — staff acknowledge with proof-of-execution." });
    setModal(false);
    setPatientId(""); setOrderText(""); setDrug(""); setDose(""); setQty("1"); setUnitPrice("");
  };

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle title="Inpatient Orders" subtitle={`Countdown-tracked · escalation path: ${ESCALATION_PATH}`} />
          <button className="btn-neon !text-xs !py-1.5" onClick={() => setModal(true)}><Plus size={13} /> New order</button>
        </div>

        <div className="flex items-center gap-2 mb-4 text-xs">
          <span className="text-slate-500">Acknowledging as:</span>
          <select className="input-dark !w-56 !py-1.5" value={staffName} onChange={(e) => setStaffName(e.target.value)}>
            {staff.map((s) => <option key={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="space-y-2.5">
          {effective.map((o) => {
            const msLeft = o.createdTs + o.dueMin * 60 * 1000 - now;
            const expired = msLeft <= 0 && !o.acknowledgedAt;
            const urgent = !expired && !o.acknowledgedAt && msLeft < 5 * 60 * 1000;
            return (
              <div
                key={o.id}
                className={cn(
                  "rounded-lg border p-4 flex items-start gap-4",
                  o.acknowledgedAt ? "border-emerald-400/25 bg-emerald-400/[0.04]" : expired ? "border-red-400/40 bg-red-400/[0.05]" : urgent ? "border-amber-400/40 bg-amber-400/[0.05]" : "border-white/10 bg-white/[0.03]"
                )}
              >
                <div className="shrink-0 mt-0.5">
                  {o.acknowledgedAt ? (
                    <CheckCircle2 size={19} className="text-emerald-400" />
                  ) : expired ? (
                    <ShieldAlert size={19} className="text-red-400 animate-pulse" />
                  ) : (
                    <AlarmClock size={19} className={urgent ? "text-amber-400" : "text-cyan-300"} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-neon-cyan text-xs">{o.patientId}</span>
                    <span className="text-[10px] text-slate-500">by {o.doctor} · {o.createdAt}</span>
                    <Badge tone="violet" className="!text-[9px]">→ {o.targetDept ?? "Ward"}</Badge>
                    {!o.acknowledgedAt && now - o.createdTs < NEW_WINDOW_MS && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-yellow-400/60 bg-yellow-400/15 px-2 py-0.5 text-[9px] font-bold text-yellow-300 animate-pulse">
                        ✦ NEW
                      </span>
                    )}
                    {expired && <Badge tone="red" className="!text-[9px]">CAUTION — OVERDUE</Badge>}
                    {expired && o.escalated && <Badge tone="amber" className="!text-[9px]">⬆ {ESCALATION_PATH}</Badge>}
                    {urgent && <Badge tone="amber" className="!text-[9px]">due soon</Badge>}
                    {o.acknowledgedAt && <Badge tone="green" className="!text-[9px]">executed ✓</Badge>}
                  </div>
                  <p className="text-sm text-slate-200 mt-1">{o.orderText}</p>
                  {o.acknowledgedAt && (
                    <p className="text-[11px] text-emerald-300/80 mt-1.5">
                      ✓ {o.acknowledgedBy} at {o.acknowledgedAt} — proof: “{o.proofNote}”{o.proofPhoto ? " 📷" : ""}{o.proofVoice ? " 🎙" : ""}
                    </p>
                  )}
                </div>
                {!o.acknowledgedAt && (
                  <div className="shrink-0 text-right space-y-2">
                    <div className={cn(
                      "font-mono text-lg font-bold tabular-nums",
                      expired ? "text-red-300 animate-pulse" : urgent ? "text-amber-300" : "text-white"
                    )}>
                      {expired ? `+${fmtCountdown(-msLeft)}` : fmtCountdown(msLeft)}
                    </div>
                    <button className="btn-neon !text-[11px] !py-1.5" onClick={() => openProof(o)}>
                      Acknowledge + proof
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-600 mt-3">
          On countdown expiry the order escalates automatically ({ESCALATION_PATH}) and a critical Issue is filed on the Agents tab. Completion requires proof: note + optional photo / voice note.
        </p>
      </GlassCard>

      <IPDischargeAutomation staffName={staffName} />

      {/* new order modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="New inpatient order" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className="input-dark" placeholder="Patient ID (e.g. PT-1102)" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
            <select className="input-dark" value={dueMin} onChange={(e) => setDueMin(e.target.value)}>
              <option value="15">Due in 15 min (stat)</option>
              <option value="30">Due in 30 min</option>
              <option value="60">Due in 1 hour</option>
              <option value="240">Due in 4 hours</option>
              <option value="720">Due in 12 hours</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-slate-500">Route to department queue</label>
            <div className="flex gap-1.5 mt-1">
              {(["Ward", "Pharmacy", "Lab"] as OrderDept[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setTargetDept(d)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-xs font-semibold border transition-all",
                    targetDept === d ? "bg-violet-500/20 text-white border-violet-400/50" : "text-slate-400 border-white/10 hover:text-white"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <textarea className="input-dark resize-none" rows={3} placeholder="Order text — medication / nursing instruction / investigation…" value={orderText} onChange={(e) => setOrderText(e.target.value)} />
          {targetDept === "Pharmacy" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <input className="input-dark" placeholder="Drug / item (e.g. Ceftriaxone 1g Inj)" value={drug} onChange={(e) => setDrug(e.target.value)} />
              <input className="input-dark" placeholder="Dose (e.g. 1 vial IV BD)" value={dose} onChange={(e) => setDose(e.target.value)} />
              <input className="input-dark" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
              <input className="input-dark" placeholder="Unit price ₹ (optional)" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
          )}
          <button className="btn-neon w-full" disabled={!patientId.trim() || !orderText.trim()} onClick={createOrder}>
            Route order to {targetDept} queue
          </button>
        </div>
      </Modal>

      {/* proof-of-execution modal */}
      <Modal open={!!proofFor} onClose={() => setProofFor(null)} title={`Proof of execution — ${proofFor?.patientId ?? ""}`} wide>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Order: <span className="text-slate-200">{proofFor?.orderText}</span></p>
          <textarea
            className="input-dark resize-none"
            rows={3}
            placeholder="Completion note (required) — what was done, observations…"
            value={proofNote}
            onChange={(e) => setProofNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button className={cn("btn-ghost !text-xs flex-1", proofPhoto && "!border-emerald-400/50 !text-emerald-300")} onClick={() => void snapPhoto()}>
              <Camera size={13} /> {proofPhoto ? "✓ Photo attached" : "Attach photo"}
            </button>
            <button
              className={cn("btn-ghost !text-xs flex-1", proofVoice && "!border-emerald-400/50 !text-emerald-300", recording && "!border-red-400/60 !text-red-300")}
              disabled={recording}
              onClick={() => void recordVoice()}
            >
              <Mic size={13} className={recording ? "animate-pulse" : ""} />
              {recording ? "Recording…" : proofVoice ? "✓ Voice note 0:02" : "Record voice note"}
            </button>
          </div>
          <button className="btn-neon w-full" disabled={!proofNote.trim()} onClick={confirmAck}>
            Sign & acknowledge ({staffName})
          </button>
        </div>
      </Modal>
    </div>
  );
}
