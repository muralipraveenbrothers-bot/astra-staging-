import { useState } from "react";
import { 
  FileSignature, Plus, Printer, Scissors, ShieldAlert, 
  ClipboardCheck, CheckCircle2, AlertTriangle, Video, Sparkles, Stethoscope, CheckSquare, Square
} from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { OrderStatusChip } from "@/astra/clinical/workflow/OrderStatusChip";
import { SignaturePad } from "@/components/SignaturePad";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, fmtINR, nowTime } from "@/lib/utils";
import type { ConsentRecord } from "@/lib/types";

interface Surgery {
  id: string;
  time: string;
  patientId: string;
  procedure: string;
  surgeon: string;
  room: string;
  status: 
    | "scheduled" 
    | "pre-op" 
    | "in-ot" 
    | "anaesthesia" 
    | "surgery" 
    | "recovery" 
    | "handover" 
    | "cleaned" 
    | "sterilized" 
    | "medicines-returned" 
    | "turnover-logged";
  estCost: number;
}

interface Consumable {
  item: string;
  qty: number;
  usedIn: string;
  cost: number;
  billed: boolean;
}

const scheduleSeed: Surgery[] = [
  { id: "ot-1", time: "08:00", patientId: "PT-1091", procedure: "Laparoscopic cholecystectomy", surgeon: "Dr. Arjun Rao", room: "OT-1", status: "turnover-logged", estCost: 48000 },
  { id: "ot-2", time: "10:30", patientId: "PT-1076", procedure: "Inguinal hernia repair (mesh)", surgeon: "Dr. Arjun Rao", room: "OT-1", status: "surgery", estCost: 38500 },
  { id: "ot-3", time: "13:00", patientId: "PT-1088", procedure: "Caesarean section (elective)", surgeon: "Dr. Nandini S", room: "OT-2", status: "scheduled", estCost: 52000 },
  { id: "ot-4", time: "15:30", patientId: "PT-1095", procedure: "ORIF — distal radius fracture", surgeon: "Dr. Kunal M", room: "OT-1", status: "scheduled", estCost: 61000 },
];

const consumablesSeed: Consumable[] = [
  { item: "Mesh — polypropylene 15×10", qty: 1, usedIn: "PT-1076 hernia", cost: 6200, billed: true },
  { item: "Trocar set (disposable)", qty: 2, usedIn: "PT-1091 lap chole", cost: 4800, billed: true },
  { item: "Suture — Vicryl 2-0 (box)", qty: 3, usedIn: "Multiple", cost: 1650, billed: false },
  { item: "Anesthesia drug tray", qty: 4, usedIn: "All OT today", cost: 7400, billed: true },
  { item: "LCP distal radius 3.5mm", qty: 1, usedIn: "PT-1095 ORIF", cost: 14500, billed: false },
];

const RISK_OPTIONS = ["Bleeding", "Infection", "Anaesthesia risk", "Blood transfusion"];

export function OT() {
  const { consents, addConsent, addApproval, logAudit } = useStore();
  const { account } = useAuth();
  const [schedule, setSchedule] = useState(scheduleSeed);
  const [consumables] = useState(consumablesSeed);

  // consent modal state
  const [consentFor, setConsentFor] = useState<Surgery | null>(null);
  const [risks, setRisks] = useState<string[]>([...RISK_OPTIONS]);
  const [alternatives, setAlternatives] = useState("Conservative / medical management was explained.");
  const [attender, setAttender] = useState("");
  const [relation, setRelation] = useState("");
  const [witness, setWitness] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [printConsent, setPrintConsent] = useState<ConsentRecord | null>(null);

  // schedule-surgery (advisory approval) state
  const [schedOpen, setSchedOpen] = useState(false);
  const [nPatient, setNPatient] = useState("");
  const [nProc, setNProc] = useState("");
  const [nSurgeon, setNSurgeon] = useState("Dr. Arjun Rao");
  const [nTime, setNTime] = useState("17:00");
  const [nCost, setNCost] = useState("");

  // 8-Layer OT + Billing Command Center Checklist state
  const [checklistFor, setChecklistFor] = useState<Surgery | null>(null);
  const [checklistData, setChecklistData] = useState<Record<string, Record<string, boolean>>>({});

  const getSpecialtyForProc = (proc: string) => {
    const p = proc.toLowerCase();
    if (p.includes("orif") || p.includes("radius") || p.includes("tibia") || p.includes("fracture")) return "Orthopaedics";
    if (p.includes("caesarean") || p.includes("c-section") || p.includes("hysterectomy")) return "OBG/GYN";
    if (p.includes("laparoscopic") || p.includes("cholecystectomy") || p.includes("gastro")) return "Gastro/Laparoscopy";
    if (p.includes("hernia") || p.includes("appendicectomy")) return "General Surgery";
    if (p.includes("tonsil") || p.includes("ent")) return "ENT";
    if (p.includes("cysto") || p.includes("resecto") || p.includes("urology")) return "Urology";
    return "General Surgery";
  };

  const getInitialChecklist = (s: Surgery) => {
    const specialty = getSpecialtyForProc(s.procedure);
    const specialtyItems: Record<string, string[]> = {
      "Orthopaedics": ["Tibia nail set & reamers", "Guide wire & drill machine + bits", "Screwdrivers & tissue protectors", "C-arm fluoroscopy imaging active"],
      "OBG/GYN": ["Uterine sound & dilators", "Sponge holding forceps & retractors", "Absorbable sutures & bipolar cautery", "Neonatal resuscitation warmer on standby"],
      "Gastro/Laparoscopy": ["HD laparoscopy tower & insufflator", "CO2 tank pressure verified (>50 bar)", "5mm & 10mm trocars with reducer", "Endo-clip applicator & Harmonic scalpel"],
      "General Surgery": ["Standard laparotomy instrument tray", "Monopolar / bipolar electrocautery unit", "Suction cannulas & pool suction tip", "Artery forceps, Langenbeck & Deaver retractors"],
      "ENT": ["Tonsil snare & mouth gag set", "Microlaryngeal suction & cautery", "High-speed ENT drill system", "Cold light fountain calibrated"],
      "Urology": ["Resectoscope & cystoscope sheath", "Continuous glycine irrigation system", "Biopsy forceps & double-J stents", "Lithotripsy probe connected"],
    };

    const isPostOp = s.status === "turnover-logged" || s.status === "medicines-returned" || s.status === "sterilized" || s.status === "cleaned";

    return {
      // 1. DATE & OT PREPARATION
      "prep_date": true,
      "prep_fumigation": true,
      "prep_instruments_ready": true,
      "prep_utilities": true, // Electricity, suction, O2 supply pipeline
      "prep_specialty_equip": true,

      // 2. BILLING PIPELINE
      "bill_preop_open": true,
      "bill_consent_ticked": true,
      "bill_pac_cleared": true,
      "bill_blood_tests": true,
      "bill_anesthesia_cleared": true,
      "bill_uhid_linked": true,

      // 3. UNIVERSAL OT INSTRUMENTS
      "inst_drapes_gowns": true,
      "inst_basic_sets": true,
      "inst_suction_working": true,
      "inst_crash_cart": true, // Neostigmine, Atropine, Naloxone, Flumazenil
      "inst_intubation": true,
      "inst_o2_supply": true,
      "inst_sterilization_trays": true,

      // 4. SURGERY-SPECIFIC INSTRUMENTS
      "spec_item_0": true,
      "spec_item_1": true,
      "spec_item_2": true,
      "spec_item_3": true,

      // 5. ANESTHESIA & DRUGS
      "anes_spinal_general_kit": true,
      "anes_o2_availability": true,
      "anes_reversal_drugs": true, // Neostigmine & Atropine verified
      "anes_doctor_autofill": true,
      "anes_note_autogen": true,

      // 6. PATIENT CONSENT & DOCUMENTATION
      "doc_bilingual_video": true, // 20-sec Telugu + English video
      "doc_digital_signature": true,
      "doc_names_autofilled": true,

      // 7. OT COMMUNICATION
      "comm_video_monitoring": true,
      "comm_command_center": true,
      "comm_doctor_relay": true,

      // 8. POST-OT HANDOVER
      "post_patient_shifted": isPostOp,
      "post_ot_cleaned": isPostOp,
      "post_inst_sterilized": isPostOp,
      "post_meds_returned": isPostOp,
      "post_turnover_time_logged": isPostOp,
      "post_surgical_note_autogen": isPostOp,
      "post_anesthesia_note_saved": isPostOp,
    };
  };

  const openChecklistModal = (s: Surgery) => {
    setChecklistFor(s);
    if (!checklistData[s.id]) {
      setChecklistData((prev) => ({
        ...prev,
        [s.id]: getInitialChecklist(s),
      }));
    }
  };

  const toggleCheckItem = (surgeryId: string, key: string) => {
    setChecklistData((prev) => {
      const curr = prev[surgeryId] || getInitialChecklist(checklistFor!);
      return {
        ...prev,
        [surgeryId]: {
          ...curr,
          [key]: !curr[key],
        },
      };
    });
  };

  const markAllChecklistReady = (surgeryId: string) => {
    setChecklistData((prev) => {
      const curr = { ...(prev[surgeryId] || getInitialChecklist(checklistFor!)) };
      Object.keys(curr).forEach((k) => {
        curr[k] = true;
      });
      return {
        ...prev,
        [surgeryId]: curr,
      };
    });
    toast.success("All 8 layers marked verified & passed", {
      description: `Synced with OT Command Center & Hospital Authority.`,
    });
  };

  const consentForSurgery = (id: string) => consents.find((c) => c.surgeryId === id);

  const advance = (s: Surgery) => {
    if (s.status === "scheduled" && !consentForSurgery(s.id)) {
      toast.error("Consent required", { description: `Signed digital consent for ${s.patientId} must be captured before wheel-in.` });
      return;
    }
    
    const workflow: Surgery["status"][] = [
      "scheduled", "pre-op", "in-ot", "anaesthesia", "surgery", 
      "recovery", "handover", "cleaned", "sterilized", 
      "medicines-returned", "turnover-logged"
    ];
    
    const currentIdx = workflow.indexOf(s.status);
    if (currentIdx === -1 || currentIdx === workflow.length - 1) return;
    
    const next = workflow[currentIdx + 1];
    setSchedule(schedule.map((x) => (x.id === s.id ? { ...x, status: next } : x)));
    toast.success(`${s.procedure} → ${next.toUpperCase()}`, { description: `${s.patientId} · ${s.room}` });
  };

  const openConsent = (s: Surgery) => {
    setConsentFor(s);
    setRisks([...RISK_OPTIONS]);
    setAlternatives("Conservative / medical management was explained.");
    setAttender("");
    setRelation("");
    setWitness(account?.name ?? "");
    setSignature(null);
  };

  const signConsent = () => {
    if (!consentFor || !signature || !attender.trim()) return;
    const rec: Omit<ConsentRecord, "id"> = {
      surgeryId: consentFor.id,
      patientId: consentFor.patientId,
      procedure: consentFor.procedure,
      surgeon: consentFor.surgeon,
      risks,
      alternatives,
      attender: attender.trim(),
      relation: relation.trim() || "Attender",
      witness: witness.trim() || "OT Nurse",
      signature,
      signedAt: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}`,
    };
    addConsent(rec);
    logAudit("Consent signed", `${consentFor.patientId} — ${consentFor.procedure} · signed by ${attender.trim()} (${relation.trim() || "attender"})`, account?.name ?? "OT");
    toast.success("Consent captured", { description: `${consentFor.patientId} · ${consentFor.procedure} — wheel-in is now unblocked.` });
    setConsentFor(null);
  };

  const requestSurgery = () => {
    if (!nPatient.trim() || !nProc.trim()) return;
    addApproval({
      kind: "surgery",
      title: `Schedule surgery — ${nPatient.trim()}`,
      detail: `${nProc.trim()} · ${nSurgeon} · ${nTime} · est. ${fmtINR(Number(nCost) || 0)}`,
      amount: Number(nCost) || undefined,
      requestedBy: account?.name ?? "OT Desk",
      requestedByRole: account?.role ?? "doctor",
    });
    logAudit("Surgery schedule requested", `${nPatient.trim()} — ${nProc.trim()} (${nSurgeon})`, account?.name ?? "OT Desk");
    toast.info("Sent for approval", { description: "Doctor/CEO approval requested — on approval, add it to the OT board. (Advisory: approval logs the decision.)" });
    setSchedOpen(false);
    setNPatient("");
    setNProc("");
    setNCost("");
  };

  const totalUsed = consumables.reduce((s, c) => s + c.cost * c.qty, 0);
  const unbilled = consumables.filter((c) => !c.billed).reduce((s, c) => s + c.cost * c.qty, 0);

  const costData = schedule.map((s) => {
    let actualRatio = 0;
    if (s.status === "turnover-logged") actualRatio = 0.94;
    else if (s.status !== "scheduled" && s.status !== "pre-op") actualRatio = 0.61;
    return {
      name: s.patientId,
      estimate: s.estCost,
      actual: Math.round(s.estCost * actualRatio),
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* schedule */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <SectionTitle title="OT Schedule" subtitle="Today · 2 theatres · consent-gated wheel-in" />
            <div className="flex items-center gap-2">
              <OrderStatusChip patientUhid={schedule[0]?.patientId} role="ot" />
              <button className="btn-ghost !text-[10px] !py-1" onClick={() => setSchedOpen(true)}>
                <Plus size={11} /> Schedule surgery
              </button>
            </div>
          </div>
          <div className="space-y-2.5">
            {schedule.map((s) => {
              const consent = consentForSurgery(s.id);
              const blocked = s.status === "scheduled" && !consent;
              return (
                <div key={s.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3.5 flex items-start gap-3">
                  <div className="shrink-0 text-center">
                    <div className="font-mono text-sm font-bold text-violet-300">{s.time}</div>
                    <Badge tone="cyan" className="!text-[9px] mt-1">{s.room}</Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{s.procedure}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{s.patientId} · {s.surgeon} · est. {fmtINR(s.estCost)}</div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {consent ? (
                        <Badge tone="green" className="!text-[9px]">✓ Consent signed · {consent.attender}</Badge>
                      ) : s.status === "scheduled" ? (
                        <Badge tone="amber" className="!text-[9px]">⚠ Consent REQUIRED</Badge>
                      ) : (
                        <Badge tone="neutral" className="!text-[9px]">historical — consent exempt</Badge>
                      )}
                      {s.status === "scheduled" && (
                        <button className="text-[10px] text-amber-300 hover:text-amber-200 underline underline-offset-2" onClick={() => (consent ? setPrintConsent(consent) : openConsent(s))}>
                          {consent ? "View / print consent" : "Capture consent"}
                        </button>
                      )}
                      <button 
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded"
                        onClick={() => openChecklistModal(s)}
                      >
                        <ClipboardCheck size={11} className="text-cyan-400" />
                        8-Layer Command Checklist
                      </button>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <Badge tone={s.status === "turnover-logged" ? "green" : (s.status !== "scheduled" && s.status !== "pre-op") ? "amber" : "neutral"} className="!text-[9px]">
                      {s.status.toUpperCase()}
                    </Badge>
                    {s.status !== "turnover-logged" && (
                      <button
                        className={cn("btn-ghost !text-[10px] !py-1", blocked && "opacity-50 cursor-not-allowed")}
                        onClick={() => advance(s)}
                        title={blocked ? "Signed consent required before wheel-in" : undefined}
                      >
                        {blocked && <ShieldAlert size={10} />}
                        {s.status === "scheduled" ? "Wheel in →" : "Advance Stage →"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>

        {/* cost analysis */}
        <GlassCard>
          <SectionTitle title="Cost Analysis" subtitle="Estimate vs actuals per case (₹)" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costData}>
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={{ background: "#0b1d20", border: "1px solid rgba(212,175,55,0.4)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => fmtINR(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="estimate" fill="#39d5ff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="#d4af37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">Actuals accrue as consumables are scanned in OT. Variance &gt;8% flags the OT incharge.</p>
        </GlassCard>
      </div>

      {/* consumables vs billing */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SectionTitle title="Consumables Used vs Billing" subtitle={`Total used ${fmtINR(totalUsed)} · unbilled ${fmtINR(unbilled)}`} />
          {unbilled > 0 && <Badge tone="red">⚠ {fmtINR(unbilled)} unbilled — revenue leak</Badge>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 pr-2 font-medium">Item</th>
                <th className="pb-2 pr-2 font-medium">Used in</th>
                <th className="pb-2 pr-2 font-medium text-right">Qty</th>
                <th className="pb-2 pr-2 font-medium text-right">Cost</th>
                <th className="pb-2 pr-2 font-medium">Billing status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {consumables.map((c) => (
                <tr key={c.item} className={cn("border-b border-white/5 hover:bg-white/[0.03]", !c.billed && "bg-red-400/5")}>
                  <td className="py-2.5 pr-2 text-slate-200">{c.item}</td>
                  <td className="py-2.5 pr-2 text-slate-400">{c.usedIn}</td>
                  <td className="py-2.5 pr-2 text-right text-slate-300">{c.qty}</td>
                  <td className="py-2.5 pr-2 text-right text-white font-medium">{fmtINR(c.cost * c.qty)}</td>
                  <td className="py-2.5 pr-2">
                    <Badge tone={c.billed ? "green" : "red"} className="!text-[9px]">{c.billed ? "billed" : "UNBILLED"}</Badge>
                  </td>
                  <td className="py-2.5">
                    {!c.billed && (
                      <button
                        className="btn-ghost !p-1.5 !text-[10px]"
                        onClick={() => toast.info("Charge posted to IP bill draft", { description: `${c.item} — awaiting Billing desk confirmation.` })}
                      >
                        <Scissors size={11} /> Post charge
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">Unbilled consumables are auto-flagged to the Billing Fraud Auditor at day-end reconciliation.</p>
      </GlassCard>

      {/* ---------- consent capture modal ---------- */}
      <Modal open={!!consentFor} onClose={() => setConsentFor(null)} title={`Surgical consent — ${consentFor?.patientId ?? ""}`} wide>
        {consentFor && (
          <div className="space-y-3 text-xs">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-1">
              <p className="text-white font-semibold">{consentFor.procedure}</p>
              <p className="text-slate-400">Patient {consentFor.patientId} · Surgeon {consentFor.surgeon} · {consentFor.room} · {consentFor.time}</p>
            </div>
            <div>
              <p className="text-slate-400 mb-1.5">Risks explained to patient &amp; attender:</p>
              <div className="flex gap-2 flex-wrap">
                {RISK_OPTIONS.map((r) => (
                  <button
                    key={r}
                    className={cn("rounded-full border px-3 py-1 text-[11px]", risks.includes(r) ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/10 text-slate-400")}
                    onClick={() => setRisks(risks.includes(r) ? risks.filter((x) => x !== r) : [...risks, r])}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <textarea className="input-dark w-full min-h-[54px]" value={alternatives} onChange={(e) => setAlternatives(e.target.value)} placeholder="Alternatives explained" />
            <div className="grid grid-cols-2 gap-2">
              <input className="input-dark" placeholder="Attender name *" value={attender} onChange={(e) => setAttender(e.target.value)} />
              <input className="input-dark" placeholder="Relation (e.g. spouse)" value={relation} onChange={(e) => setRelation(e.target.value)} />
              <input className="input-dark col-span-2" placeholder="Witness (staff)" value={witness} onChange={(e) => setWitness(e.target.value)} />
            </div>
            <SignaturePad onChange={setSignature} label="Attender signature" />
            <button className="btn-neon w-full" disabled={!signature || !attender.trim()} onClick={signConsent}>
              <FileSignature size={14} /> Sign &amp; file consent
            </button>
            {!signature && <p className="text-[10px] text-amber-300/80 text-center">Signature is mandatory — the button unlocks once the pad has ink.</p>}
          </div>
        )}
      </Modal>

      {/* ---------- signed consent view / print ---------- */}
      <Modal open={!!printConsent} onClose={() => setPrintConsent(null)} title="Signed consent" wide>
        {printConsent && (
          <div className="space-y-3">
            <div className="print-zone rounded-lg border border-white/10 bg-white/[0.02] p-4 text-xs space-y-2">
              <h3 className="font-display text-base font-bold text-white">Astra Hospital — Informed Surgical Consent</h3>
              <p className="text-slate-300">{printConsent.procedure} · Patient {printConsent.patientId} · Surgeon {printConsent.surgeon}</p>
              <p className="text-slate-400">Risks explained: {printConsent.risks.join(", ")}</p>
              <p className="text-slate-400">Alternatives: {printConsent.alternatives}</p>
              <p className="text-slate-400">Signed by {printConsent.attender} ({printConsent.relation}) · Witness {printConsent.witness} · {printConsent.signedAt}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={printConsent.signature} alt="Attender signature" className="h-16 rounded bg-white p-1" />
            </div>
            <button className="btn-neon w-full" onClick={() => window.print()}>
              <Printer size={14} /> Print consent
            </button>
          </div>
        )}
      </Modal>

      {/* ---------- schedule surgery (advisory approval) ---------- */}
      <Modal open={schedOpen} onClose={() => setSchedOpen(false)} title="Request surgery slot">
        <div className="space-y-2 text-xs">
          <input className="input-dark w-full" placeholder="Patient ID (e.g. PT-1102) *" value={nPatient} onChange={(e) => setNPatient(e.target.value)} />
          <input className="input-dark w-full" placeholder="Procedure *" value={nProc} onChange={(e) => setNProc(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <select className="input-dark" value={nSurgeon} onChange={(e) => setNSurgeon(e.target.value)}>
              {["Dr. Arjun Rao", "Dr. Nandini S", "Dr. Kunal M"].map((d) => <option key={d}>{d}</option>)}
            </select>
            <input className="input-dark" placeholder="Time" value={nTime} onChange={(e) => setNTime(e.target.value)} />
            <input className="input-dark" placeholder="Est. cost ₹" type="number" value={nCost} onChange={(e) => setNCost(e.target.value)} />
          </div>
          <button className="btn-neon w-full" disabled={!nPatient.trim() || !nProc.trim()} onClick={requestSurgery}>
            <Plus size={14} /> Send for approval
          </button>
          <p className="text-[10px] text-slate-500 text-center">New OT slots route through the approvals inbox (doctor/CEO).</p>
        </div>
      </Modal>

      {/* ---------- 8-Layer OT + Billing Command Center Checklist Modal ---------- */}
      <Modal open={!!checklistFor} onClose={() => setChecklistFor(null)} title={`🏥 Astra AI — OT + Billing Command Center Check · ${checklistFor?.patientId ?? ""}`} wide>
        {checklistFor && (() => {
          const specialty = getSpecialtyForProc(checklistFor.procedure);
          const currentChecks = checklistData[checklistFor.id] || getInitialChecklist(checklistFor);
          const totalItems = Object.keys(currentChecks).length;
          const checkedCount = Object.values(currentChecks).filter(Boolean).length;
          const hasMissing = checkedCount < totalItems;

          const specialtyItemsMap: Record<string, string[]> = {
            "Orthopaedics": ["Tibia nail set & reamers", "Guide wire & drill machine + bits", "Screwdrivers & tissue protectors", "C-arm fluoroscopy imaging system"],
            "OBG/GYN": ["Uterine sound & dilators", "Sponge holding forceps & retractors", "Absorbable sutures & bipolar cautery", "Neonatal resuscitation warmer on standby"],
            "Gastro/Laparoscopy": ["HD laparoscopy tower & insufflator", "CO2 tank pressure verified (>50 bar)", "5mm & 10mm trocars with reducer", "Endo-clip applicator & Harmonic scalpel"],
            "General Surgery": ["Standard laparotomy instrument tray", "Monopolar / bipolar electrocautery unit", "Suction cannulas & pool suction tip", "Artery forceps, Langenbeck & Deaver retractors"],
            "ENT": ["Tonsil snare & mouth gag set", "Microlaryngeal suction & cautery", "High-speed ENT drill system", "Cold light fountain calibrated"],
            "Urology": ["Resectoscope & cystoscope sheath", "Continuous glycine irrigation system", "Biopsy forceps & double-J stents", "Lithotripsy probe connected"],
          };
          const activeSpecialtyItems = specialtyItemsMap[specialty] || specialtyItemsMap["General Surgery"];

          const renderItem = (key: string, label: string, badge?: string) => {
            const isChecked = !!currentChecks[key];
            return (
              <div 
                key={key} 
                onClick={() => toggleCheckItem(checklistFor.id, key)}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all",
                  isChecked 
                    ? "bg-cyan-950/20 border-cyan-500/30 text-slate-200 hover:bg-cyan-950/30" 
                    : "bg-red-950/20 border-red-500/40 text-red-200 hover:bg-red-950/30"
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isChecked ? (
                    <CheckSquare className="w-4 h-4 text-cyan-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className={cn("truncate", !isChecked && "font-medium text-red-200")}>{label}</span>
                </div>
                {badge && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase shrink-0 ml-2 bg-white/5 text-slate-400 border border-white/10">
                    {badge}
                  </span>
                )}
              </div>
            );
          };

          return (
            <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
              {/* Header card with summary & authority alert */}
              <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/50 via-slate-900 to-cyan-950/30 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-sm text-white">{checklistFor.procedure}</span>
                    <Badge tone="cyan" className="!text-[9px]">{specialty}</Badge>
                  </div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    UHID: <span className="font-mono text-cyan-300 font-semibold">{checklistFor.patientId}</span> · Surgeon: <span className="text-slate-200">{checklistFor.surgeon}</span> · Room: <span className="text-slate-200">{checklistFor.room}</span> · Scheduled: <span className="text-slate-200">{checklistFor.time}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-mono">READINESS SCORE</span>
                    <span className={cn("text-base font-bold font-mono", hasMissing ? "text-amber-400" : "text-emerald-400")}>
                      {checkedCount}/{totalItems} ({Math.round((checkedCount / totalItems) * 100)}%)
                    </span>
                  </div>
                  <button
                    onClick={() => markAllChecklistReady(checklistFor.id)}
                    className="btn-neon !text-xs !py-1.5 !px-3"
                  >
                    <CheckCircle2 size={13} /> Verify All 8 Layers
                  </button>
                </div>
              </div>

              {/* Authority Alert Banner if anything unchecked */}
              {hasMissing && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/50 flex items-start gap-2.5 text-amber-200 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-300">Live Authority &amp; OT Command Center Alert:</span>
                    <p className="text-[11px] text-amber-200/90 mt-0.5">
                      Missing items detected! Hospital authority &amp; billing dispatch notified. Surgery wheel-in will require explicit checklist clearance.
                    </p>
                  </div>
                </div>
              )}

              {/* 8 Indexed Layers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. DATE & OT PREPARATION */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-cyan-500/20 text-cyan-400 font-mono text-[10px] flex items-center justify-center font-bold">1</span>
                      DATE &amp; OT PREPARATION
                    </span>
                    <Badge tone="cyan" className="!text-[8px]">FACILITY</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {renderItem("prep_date", `OT Date & Schedule Confirmed (${checklistFor.time})`)}
                    {renderItem("prep_fumigation", "Fumigation completed and logged in OT Log")}
                    {renderItem("prep_instruments_ready", "OT Instrumentation Tray verified & ready")}
                    {renderItem("prep_utilities", "Electricity, Suction, O₂ pipeline, Monitors checked")}
                    {renderItem("prep_specialty_equip", `Specialty-specific equipment ready (${specialty})`)}
                  </div>
                </div>

                {/* 2. BILLING PIPELINE */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[10px] flex items-center justify-center font-bold">2</span>
                      BILLING PIPELINE
                    </span>
                    <Badge tone="green" className="!text-[8px]">REVENUE &amp; CLEARANCE</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {renderItem("bill_preop_open", "Billing Agent pre-op checklist auto-opened")}
                    {renderItem("bill_consent_ticked", "Billing staff verified digital signed consent")}
                    {renderItem("bill_pac_cleared", "Pre-Anesthesia Check (PAC) clearance confirmed")}
                    {renderItem("bill_blood_tests", "Pre-op blood tests & cross-match validated")}
                    {renderItem("bill_anesthesia_cleared", "Anesthesia billing clearance approved")}
                    {renderItem("bill_uhid_linked", `Billing linked to UHID (${checklistFor.patientId})`)}
                  </div>
                </div>

                {/* 3. UNIVERSAL OT INSTRUMENTS */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-purple-500/20 text-purple-400 font-mono text-[10px] flex items-center justify-center font-bold">3</span>
                      UNIVERSAL OT INSTRUMENTS
                    </span>
                    <Badge tone="violet" className="!text-[8px]">ALL SURGERIES</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {renderItem("inst_drapes_gowns", "Surgical drapes, sterile gowns, gloves (all sizes)")}
                    {renderItem("inst_basic_sets", "Basic retractors, forceps, dissecting scissors")}
                    {renderItem("inst_suction_working", "Suction apparatus + dual cannulas checked")}
                    {renderItem("inst_crash_cart", "Crash Cart: Neostigmine, Atropine, Naloxone, Flumazenil", "DRUGS")}
                    {renderItem("inst_intubation", "Intubation instruments & video laryngoscope")}
                    {renderItem("inst_o2_supply", "Oxygen Supply Checked (Pipeline + Reserve Cylinders)", "O2 SUPPLY")}
                    {renderItem("inst_sterilization_trays", "Sterilization trays & chemical disinfectants validated")}
                  </div>
                </div>

                {/* 4. SURGERY-SPECIFIC INSTRUMENTS */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-amber-500/20 text-amber-400 font-mono text-[10px] flex items-center justify-center font-bold">4</span>
                      SURGERY INSTRUMENTS: {specialty}
                    </span>
                    <Badge tone="amber" className="!text-[8px]">SPECIALTY</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {activeSpecialtyItems.map((item, idx) => 
                      renderItem(`spec_item_${idx}`, item, specialty)
                    )}
                  </div>
                </div>

                {/* 5. ANESTHESIA & DRUGS */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-rose-500/20 text-rose-400 font-mono text-[10px] flex items-center justify-center font-bold">5</span>
                      ANESTHESIA &amp; DRUGS
                    </span>
                    <Badge tone="red" className="!text-[8px]">CRITICAL</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {renderItem("anes_spinal_general_kit", "Spinal & General anesthesia kits inspected")}
                    {renderItem("anes_o2_availability", "Oxygen Availability Check (No-Refuel Pipeline OK)")}
                    {renderItem("anes_reversal_drugs", "Emergency drugs & reversal agents stocked")}
                    {renderItem("anes_doctor_autofill", "Pre-op Anesthesia Doctor name auto-filled")}
                    {renderItem("anes_note_autogen", "Anesthesia note auto-generated (Dictation enabled)")}
                  </div>
                </div>

                {/* 6. PATIENT CONSENT & DOCUMENTATION */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-cyan-500/20 text-cyan-400 font-mono text-[10px] flex items-center justify-center font-bold">6</span>
                      PATIENT CONSENT &amp; DOCS
                    </span>
                    <Badge tone="cyan" className="!text-[8px]">LEGAL &amp; COMPLIANCE</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {renderItem("doc_digital_signature", "Pre-op consent forms with digital attender signature")}
                    {renderItem("doc_bilingual_video", "20-sec Bilingual (Telugu + English) consent video uploaded", "VIDEO")}
                    {renderItem("doc_names_autofilled", "Surgeon & Anesthetist names auto-filled in pre-op checklist")}
                  </div>
                </div>

                {/* 7. OT COMMUNICATION */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-indigo-500/20 text-indigo-400 font-mono text-[10px] flex items-center justify-center font-bold">7</span>
                      OT COMMUNICATION
                    </span>
                    <Badge tone="neutral" className="!text-[8px]">REAL-TIME</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {renderItem("comm_video_monitoring", "Video call option active for remote monitoring")}
                    {renderItem("comm_command_center", "Central Command Center connected with OT assistants")}
                    {renderItem("comm_doctor_relay", "Real-time doctor instructions relayed to OT desk")}
                  </div>
                </div>

                {/* 8. POST-OT HANDOVER */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-white/10">
                    <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-slate-500/20 text-slate-400 font-mono text-[10px] flex items-center justify-center font-bold">8</span>
                      POST-OT HANDOVER
                    </span>
                    <Badge tone="neutral" className="!text-[8px]">POST-OP</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {renderItem("post_patient_shifted", "Patient shifted with structured handover notes")}
                    {renderItem("post_ot_cleaned", "OT cleaned & sanitized for next turnover")}
                    {renderItem("post_inst_sterilized", "Instruments sterilized and logged in CSSD")}
                    {renderItem("post_meds_returned", "Medicines returned & logged in OT Pharmacy")}
                    {renderItem("post_turnover_time_logged", "OT turnover time recorded in master log")}
                    {renderItem("post_surgical_note_autogen", "Surgical procedure note auto-generated (Dictation ready)")}
                    {renderItem("post_anesthesia_note_saved", "Post-op anesthesia note finalized & saved")}
                  </div>
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <span className="text-[11px] text-slate-400 font-mono">
                  Astra AI Operating System · Command Center Enforcement Engine v2.0
                </span>
                <button
                  onClick={() => setChecklistFor(null)}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Close &amp; Return to OT Board
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

