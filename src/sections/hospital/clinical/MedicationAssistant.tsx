import { useState } from "react";
import { AlertTriangle, Beaker, CheckCircle, Pill, Plus, RefreshCw, Sparkles, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, sleep, nowTime } from "@/lib/utils";
import type { CDSMedication, MedStatus } from "@/lib/types";

const mockMeds = (): Omit<CDSMedication, "status">[] => [
  { id: uid("med"), drug: "Amoxicillin-Clavulanate 625mg", dose: "1 tablet", route: "PO", frequency: "TDS × 7 days", duration: "7 days", quantity: 21, instructions: "Take after food", reasoning: "First-line for community-acquired pneumonia with adequate oral bioavailability", guidelineRef: "BTS CAP Guidelines 2023" },
  { id: uid("med"), drug: "Paracetamol 650mg", dose: "1 tablet", route: "PO", frequency: "Q6H PRN fever > 38.5°C", duration: "3 days", quantity: 12, instructions: "Max 4g/day", reasoning: "Antipyretic for fever management", guidelineRef: "WHO Essential Medicines" },
  { id: uid("med"), drug: "Salbutamol Nebulization", dose: "2.5mg", route: "Inhalation", frequency: "Q4H PRN wheezing", duration: "5 days", quantity: 20, instructions: "Use with nebulizer mask", reasoning: "Bronchodilator for associated bronchospasm", guidelineRef: "GINA Guidelines 2024" },
];

export default function MedicationAssistant({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { cdsMedications, setCdsMedications, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [meds, setMeds] = useState<CDSMedication[]>(cdsMedications);
  const [generating, setGenerating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addDrug, setAddDrug] = useState("");
  const [addDose, setAddDose] = useState("");
  const [addRoute, setAddRoute] = useState("PO");
  const [addFreq, setAddFreq] = useState("");
  const [addDur, setAddDur] = useState("");
  const [addQty, setAddQty] = useState(0);
  const [addInst, setAddInst] = useState("");
  const [doseCheck, setDoseCheck] = useState<{ drug: string; alert: string; severity: "warning" | "critical" } | null>(null);

  const sync = (d: CDSMedication[]) => { setMeds(d); setCdsMedications(d); };

  const generate = async () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    setGenerating(true);
    logAudit("Medication suggestions requested", `Patient ${patientId}`, doctorName);
    await sleep(2000);
    const results: CDSMedication[] = mockMeds().map((m) => ({ ...m, status: "draft" as MedStatus }));
    sync(results);
    setGenerating(false);
    logAudit("Medications suggested", `${results.length} drugs recommended`, "CDS agent");
    toast.success("Medication recommendations ready");
  };

  const changeStatus = (id: string, status: MedStatus) => {
    const updated = meds.map((m) => m.id === id ? { ...m, status, confirmedBy: status === "confirmed" ? doctorName : m.confirmedBy, confirmedAt: status === "confirmed" ? nowTime() : m.confirmedAt } : m);
    sync(updated);
    logAudit(`Medication ${status}`, `${meds.find((m) => m.id === id)?.drug} ${status} by ${doctorName}`, doctorName);
    toast.success(`Medication ${status}`);
  };

  const removeMed = (id: string) => {
    sync(meds.filter((m) => m.id !== id));
    logAudit("Medication removed", `${meds.find((m) => m.id === id)?.drug}`, doctorName);
    toast.success("Medication removed");
  };

  const addCustom = () => {
    if (!addDrug.trim()) return;
    const m: CDSMedication = {
      id: uid("med"), drug: addDrug.trim(), dose: addDose, route: addRoute,
      frequency: addFreq, duration: addDur, quantity: addQty, instructions: addInst,
      reasoning: "Manual prescription by physician", guidelineRef: "Local protocol",
      status: "pending-confirmation",
    };
    sync([...meds, m]);
    logAudit("Medication added manually", `${m.drug} ${m.dose} ${m.route}`, doctorName);
    setAddOpen(false); setAddDrug(""); setAddDose(""); setAddFreq(""); setAddDur(""); setAddQty(0); setAddInst("");
    toast.success("Medication added");
  };

  const checkDose = () => {
    setDoseCheck({ drug: "Amoxicillin-Clavulanate 625mg", alert: "Maximum daily dose 3g. Prescribed: 1.875g/day — within safe range. No interaction with current Paracetamol.", severity: "warning" });
    logAudit("Dose check performed", `Patient ${patientId}`, doctorName);
    toast.info("Dose check complete", { description: "No critical interactions found" });
  };

  const sendToPharmacy = () => {
    const confirmed = meds.filter((m) => m.status === "confirmed" || m.status === "pending-confirmation");
    if (confirmed.length === 0) { toast.error("No confirmed medications to send"); return; }
    sync(meds.map((m) => confirmed.some((c) => c.id === m.id) ? { ...m, status: "sent-to-pharmacy" as MedStatus } : m));
    logAudit("Medications sent to pharmacy", `${confirmed.length} drugs for ${patientId}`, doctorName);
    toast.success(`${confirmed.length} medications sent to pharmacy`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Medication Assistant" subtitle="AI-assisted prescribing with dose checking" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={checkDose}><Beaker size={14} /> Check Doses</button>
          <button className="btn-ghost" onClick={() => setAddOpen(true)}><Plus size={14} /> Custom</button>
          <button className="btn-neon" onClick={() => void generate()} disabled={!patientId || generating}>
            {generating ? <><RefreshCw size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> AI Suggest</>}
          </button>
        </div>
      </div>

      {/* Dose check alert */}
      {doseCheck && (
        <div className={cn("rounded-lg border p-3 flex items-start gap-3", doseCheck.severity === "critical" ? "border-red-400/40 bg-red-400/10" : "border-amber-400/40 bg-amber-400/10")}>
          <AlertTriangle size={18} className={doseCheck.severity === "critical" ? "text-red-400" : "text-amber-400"} />
          <div className="flex-1">
            <p className="text-xs font-semibold text-white">{doseCheck.drug}</p>
            <p className="text-xs text-slate-300">{doseCheck.alert}</p>
          </div>
          <button className="btn-ghost !text-xs !py-1" onClick={() => setDoseCheck(null)}>Dismiss</button>
        </div>
      )}

      <div className="space-y-2">
        {meds.length === 0 && (
          <GlassCard>
            <p className="text-sm text-slate-500 text-center py-4">No medications yet. Use AI Suggest or add manually.</p>
          </GlassCard>
        )}
        {meds.map((m) => (
          <GlassCard key={m.id} className={cn("!p-3", m.status === "discontinued" ? "opacity-50" : "")}>
            <div className="flex items-start gap-3">
              <Pill size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-sm font-semibold", m.status === "discontinued" ? "text-slate-500 line-through" : "text-white")}>{m.drug}</span>
                  <Badge tone="neutral" className="!text-[8px]">{m.dose}</Badge>
                  <Badge tone="cyan" className="!text-[8px]">{m.route}</Badge>
                  <Badge tone="violet" className="!text-[8px]">{m.frequency}</Badge>
                  <Badge tone={m.status === "confirmed" ? "green" : m.status === "sent-to-pharmacy" ? "cyan" : m.status === "discontinued" ? "red" : m.status === "draft" ? "neutral" : "amber"} className="!text-[8px]">{m.status}</Badge>
                </div>
                {m.duration && <p className="text-xs text-slate-400 mt-0.5">Duration: {m.duration} · Qty: {m.quantity}</p>}
                <p className="text-xs text-slate-400">{m.instructions}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{m.reasoning} · Guideline: {m.guidelineRef}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {(m.status === "draft" || m.status === "pending-confirmation") && (
                  <button className="btn-neon !text-xs !py-1" onClick={() => changeStatus(m.id, "confirmed")}><CheckCircle size={12} /> Confirm</button>
                )}
                {m.status === "confirmed" && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => changeStatus(m.id, "sent-to-pharmacy")}><Beaker size={12} /> Send</button>
                )}
                {m.status !== "discontinued" && m.status !== "administered" && (
                  <button className="btn-ghost !text-xs !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => changeStatus(m.id, "discontinued")}><XCircle size={12} /> Stop</button>
                )}
                <button className="btn-ghost !text-xs !py-1" onClick={() => removeMed(m.id)}><Trash2 size={12} /> Remove</button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {meds.length > 0 && (
        <div className="flex justify-end">
          <button className="btn-neon" onClick={sendToPharmacy}>
            <Beaker size={14} /> Send to Pharmacy
          </button>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Medication">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Drug</label>
              <input className="input-dark" placeholder="Drug name" value={addDrug} onChange={(e) => setAddDrug(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Dose</label>
              <input className="input-dark" placeholder="e.g. 500mg" value={addDose} onChange={(e) => setAddDose(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Route</label>
              <select className="input-dark" value={addRoute} onChange={(e) => setAddRoute(e.target.value)}>
                <option value="PO">PO</option>
                <option value="IV">IV</option>
                <option value="IM">IM</option>
                <option value="SC">SC</option>
                <option value="TOP">Topical</option>
                <option value="PR">PR</option>
                <option value="SL">SL</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Frequency</label>
              <input className="input-dark" placeholder="e.g. TDS × 7 days" value={addFreq} onChange={(e) => setAddFreq(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Duration</label>
              <input className="input-dark" placeholder="e.g. 7 days" value={addDur} onChange={(e) => setAddDur(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Quantity</label>
              <input className="input-dark" type="number" min={0} value={addQty} onChange={(e) => setAddQty(Number(e.target.value))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Instructions</label>
              <textarea className="input-dark resize-none" rows={2} placeholder="Special instructions" value={addInst} onChange={(e) => setAddInst(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addCustom}><Plus size={14} /> Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
