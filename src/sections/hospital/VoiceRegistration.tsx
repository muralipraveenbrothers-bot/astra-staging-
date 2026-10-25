import { useEffect, useRef, useState } from "react";
import { BrainCircuit, Mic, MicOff, Printer, RotateCcw, Star, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { ReceiptView } from "@/components/Receipt";
import { useStore } from "@/lib/store";
import { useSpeechRecognition } from "@/lib/speech";
import {
  aiExtractRegistration,
  consultFee,
  emptyRegistration,
  parseTranscriptLocal,
  type RegistrationFormData,
} from "@/lib/registration";
import { cn, nowTime } from "@/lib/utils";
import type { Bill, PatientRecord } from "@/lib/types";

const DEPARTMENTS = ["General Medicine", "Orthopaedics", "Paediatrics", "Cardiology", "Dermatology", "OBG", "Ophthalmology", "ENT", "Dental"];
const DOCTORS = ["Dr. Arjun Rao", "Dr. Nandini S", "Dr. Kunal M", "Dr. Admin"];

export function VoiceRegistration() {
  const { settings, addPatient, addBill, addSendLog, patients, prefillReg, setPrefillReg, logAudit } = useStore();
  const speech = useSpeechRecognition();
  const [form, setForm] = useState<RegistrationFormData>(emptyRegistration);
  const [typed, setTyped] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [sendWa, setSendWa] = useState(true);
  const [receipt, setReceipt] = useState<{ bill: Bill; patient: PatientRecord } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (k: keyof RegistrationFormData, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const merge = (p: Partial<RegistrationFormData>) =>
    setForm((f) => {
      const next = { ...f };
      (Object.keys(p) as (keyof RegistrationFormData)[]).forEach((k) => {
        const v = p[k];
        if (v !== undefined && v !== "") {
          (next as unknown as Record<string, string>)[k] = String(v);
        }
      });
      return next;
    });

  // prefill handoff from OP Scan
  useEffect(() => {
    if (prefillReg) {
      merge(prefillReg);
      setPrefillReg(null);
      toast.info("Form pre-filled from OP Scan extraction", { description: "Review every field before confirming." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillReg]);

  // auto-parse live transcript (debounced) through the local parser
  useEffect(() => {
    const text = speech.transcript;
    if (!text.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => merge(parseTranscriptLocal(text)), 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.transcript]);

  const runAiExtract = async (source: string) => {
    const text = source.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    toast.info("AI extraction running…", { description: "Sending transcript to your configured LLM backend." });
    try {
      const { data, engine } = await aiExtractRegistration(text, settings);
      merge(data);
      toast.success("Form filled by AI extract", { description: `via ${engine} — review every field.` });
    } catch (e) {
      toast.error("AI extract failed", {
        description: `${e instanceof Error ? e.message : String(e)} — local parse results remain; edit fields manually.`,
      });
    }
    setAiBusy(false);
  };

  const confirm = () => {
    if (!form.name.trim()) {
      toast.error("Patient name is required");
      return;
    }
    const patient = addPatient({
      name: form.name.trim(),
      age: form.age ? Number(form.age) : undefined,
      gender: form.gender || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      department: form.department || "General Medicine",
      linkedDoctor: form.doctor || undefined,
      complaint: form.complaint || undefined,
      source: "voice",
    });
    const dept = form.department || "General Medicine";
    const fee = consultFee(dept);
    const ref =
      form.mode === "UPI"
        ? `upi://txn/${Math.random().toString(36).slice(2, 8).toUpperCase()}`
        : form.mode === "Card"
          ? `POS-${Math.floor(10000 + Math.random() * 89999)}`
          : "CASH-DRAWER-A";
    const bill = addBill({
      patientId: patient.id,
      kind: "OP",
      service: `Consultation — ${dept}`,
      amount: fee,
      staffName: "Reception Voice Desk",
      timestamp: nowTime(),
      mode: form.mode,
      reference: ref,
    });
    if (sendWa && patient.phone) {
      addSendLog({ provider: "WhatsApp", template: "bill_receipt", recipient: `${patient.name} (${patient.phone})`, status: "sent" });
      toast.success("WhatsApp bill confirmation logged", { description: `bill_receipt → ${patient.phone} (simulated send, in send-log).` });
    }
    logAudit("Voice registration", `${patient.id} ${patient.name} · ${dept} · ${bill.receiptNo} ₹${fee}`, "Reception Voice Desk");
    setReceipt({ bill, patient });
  };

  const resetAll = () => {
    setForm(emptyRegistration);
    setTyped("");
    speech.reset();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ---------------- capture ---------------- */}
        <GlassCard>
          <SectionTitle title="Voice Capture" subtitle="Push-to-talk at the reception desk · Chrome/Edge recommended" />
          <div className="flex flex-col items-center py-4">
            <button
              onMouseDown={() => speech.start()}
              onMouseUp={() => speech.stop()}
              onMouseLeave={() => { if (speech.listening) speech.stop(); }}
              onTouchStart={() => speech.start()}
              onTouchEnd={() => speech.stop()}
              disabled={!speech.supported}
              className={cn(
                "h-28 w-28 rounded-full border-2 flex items-center justify-center transition-all duration-200 select-none",
                speech.listening
                  ? "border-red-400 bg-red-400/15 shadow-[0_0_40px_rgba(248,113,113,0.5)] scale-110"
                  : "border-violet-400/60 bg-violet-500/10 hover:bg-violet-500/20 shadow-[0_0_24px_rgba(212,175,55,0.3)]",
                !speech.supported && "opacity-40 cursor-not-allowed"
              )}
              title={speech.supported ? "Hold to speak" : "SpeechRecognition unavailable in this browser"}
            >
              {speech.listening ? <Mic size={38} className="text-red-300 animate-pulse" /> : <Mic size={38} className="text-violet-300" />}
            </button>
            <p className="text-xs text-slate-400 mt-3">
              {!speech.supported
                ? "SpeechRecognition not available here — use typed dictation below (same parsing)."
                : speech.listening
                  ? "Listening… release to stop"
                  : "Hold the lotus mic and speak the patient's details"}
            </p>
            {speech.error && <p className="text-[11px] text-red-300 mt-2">{speech.error}</p>}
          </div>

          {(speech.transcript || speech.interim) && (
            <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-3 text-sm text-slate-200 min-h-[60px]">
              {speech.transcript} <span className="text-cyan-300/70">{speech.interim}</span>
            </div>
          )}

          {/* typed dictation fallback */}
          <div className="mt-4">
            <label className="text-[11px] text-slate-500">Typed dictation — type what the patient says</label>
            <textarea
              className="input-dark resize-none mt-1"
              rows={3}
              placeholder='e.g. "name is Ramesh Kumar, age 45, male, from Rampur village, phone 9876543210, having fever since 3 days, cash"'
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>

          <div className="flex gap-2 mt-3 flex-wrap">
            <button className="btn-ghost !text-xs flex-1" disabled={!typed.trim()} onClick={() => { merge(parseTranscriptLocal(typed)); toast.success("Parsed locally into the form"); }}>
              Parse (local rules)
            </button>
            <button
              className="btn-neon !text-xs flex-1"
              disabled={aiBusy || (!typed.trim() && !speech.transcript.trim())}
              onClick={() => void runAiExtract(typed.trim() || speech.transcript)}
            >
              {aiBusy ? <span className="h-3 w-3 rounded-full border-2 border-black/40 border-t-transparent animate-spin" /> : <BrainCircuit size={13} />}
              AI extract
            </button>
            <button className="btn-ghost !text-xs" onClick={resetAll}><RotateCcw size={13} /> Reset</button>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            Local parsing is rule-based and instant. AI extract uses your saved FreeLLMAPI key (or local Ollama llama3.2:3b) with a JSON-extraction prompt — every field stays editable afterwards.
          </p>
        </GlassCard>

        {/* ---------------- form ---------------- */}
        <GlassCard>
          <SectionTitle title="OP Registration" subtitle="Review & edit before confirming" />
          <div className="grid grid-cols-2 gap-3">
            <input className="input-dark" placeholder="Patient name *" value={form.name} onChange={(e) => set("name", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input className="input-dark" placeholder="Age" value={form.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))} />
              <select className="input-dark" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">Gender</option><option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
            <input className="input-dark" placeholder="Phone (10-digit)" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))} />
            <input className="input-dark" placeholder="Address / village" value={form.address} onChange={(e) => set("address", e.target.value)} />
            <select className="input-dark" value={form.department} onChange={(e) => set("department", e.target.value)}>
              <option value="">Department</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input-dark" value={form.doctor} onChange={(e) => set("doctor", e.target.value)}>
              <option value="">Linked doctor</option>
              {DOCTORS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <textarea className="input-dark col-span-2 resize-none" rows={2} placeholder="Presenting complaint" value={form.complaint} onChange={(e) => set("complaint", e.target.value)} />
            <div className="col-span-2 flex items-center gap-4">
              <div className="flex gap-1.5">
                {(["UPI", "Card", "Cash"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => set("mode", m)}
                    className={cn(
                      "rounded-lg px-4 py-1.5 text-xs font-semibold border transition-all",
                      form.mode === m ? "bg-violet-500/20 text-white border-violet-400/50" : "text-slate-400 border-white/10 hover:text-white"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500 ml-auto">
                Fee: <span className="text-violet-300 font-bold">₹{consultFee(form.department || "General Medicine").toLocaleString("en-IN")}</span>
              </span>
            </div>
          </div>

          <label className="flex items-center gap-2 mt-4 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={sendWa} onChange={(e) => setSendWa(e.target.checked)} className="accent-yellow-500" />
            Send bill to patient on WhatsApp (bill_receipt template)
          </label>

          <button className="btn-neon w-full mt-4" disabled={!form.name.trim()} onClick={confirm}>
            <UserPlus size={15} /> Confirm — register, bill & print receipt
          </button>
        </GlassCard>
      </div>

      {/* recent registrations */}
      <GlassCard>
        <SectionTitle title="Today's Voice Registrations" subtitle={`${patients.length} in the local registry`} />
        {patients.length === 0 && <p className="text-xs text-slate-500">No patients registered yet — hold the mic and register the first one.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {patients.slice().reverse().slice(0, 9).map((p) => (
            <div key={p.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center gap-3">
              <Badge tone="cyan" className="font-mono !text-[9px] shrink-0">{p.id}</Badge>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{p.name}</div>
                <div className="text-[10px] text-slate-500 truncate">
                  {[p.age && `${p.age}y`, p.gender, p.department, p.registeredAt].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* receipt overlay */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="relative z-10 space-y-4 max-h-[90vh] overflow-y-auto">
            <ReceiptView bill={receipt.bill} patient={receipt.patient} />
            <div className="flex gap-2 justify-center">
              <button className="btn-neon" onClick={() => window.print()}>
                <Printer size={15} /> Print & Hand Over
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  addSendLog({ provider: "WhatsApp", template: "review_request", recipient: receipt.patient.phone || receipt.patient.name, status: "sent" });
                  toast.success("Review request sent", { description: `Google review link sent to ${receipt.patient.name} on WhatsApp (simulated).` });
                }}
              >
                <Star size={15} /> Send Google review request
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setReceipt(null);
                  resetAll();
                  toast.success("Ready for the next patient");
                }}
              >
                Done — next patient
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
