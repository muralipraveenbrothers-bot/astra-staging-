import { useState } from "react";
import { AlertOctagon, Check, Pencil, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn, nowTime, sleep, uid } from "@/lib/utils";
import type { DdxItem } from "@/lib/types";

const mockDdx = (): DdxItem[] => [
  { id: uid("dx"), rank: 1, diagnosis: "Viral pharyngitis", probability: "high", citation: "UpToDate · Acute pharyngitis in adults", status: "pending" },
  { id: uid("dx"), rank: 2, diagnosis: "Streptococcal pharyngitis (GAS)", probability: "moderate", citation: "National Formulary · Centor criteria", status: "pending" },
  { id: uid("dx"), rank: 3, diagnosis: "Infectious mononucleosis", probability: "low", citation: "UpToDate · EBV infection", status: "pending" },
  { id: uid("dx"), rank: 4, diagnosis: "Peritonsillar abscess (rule out)", probability: "low — red flag", citation: "ClinicalKey · ENT emergencies", status: "pending" },
];

const management = [
  { kind: "Conservative", text: "Warm saline gargles, hydration, voice rest; review in 48h if fever persists.", cite: "UpToDate · supportive care" },
  { kind: "Drug", text: "Paracetamol 500 mg PO TDS × 3 days (max 3 g/day). If Centor ≥ 3: Amoxicillin 500 mg PO TDS × 5 days.", cite: "National Formulary · §5.1.1" },
  { kind: "Surgical", text: "ENT referral if trismus / uvular deviation — possible peritonsillar drainage.", cite: "ClinicalKey · ENT emergencies" },
];

export function Clinical() {
  const { audit, logAudit } = useStore();
  const [symptoms, setSymptoms] = useState("");
  const [patientId, setPatientId] = useState("");
  const [ddx, setDdx] = useState<DdxItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [caseChat, setCaseChat] = useState<{ role: "doctor" | "ai"; text: string }[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [mgmt, setMgmt] = useState(management);
  const [editingMgmt, setEditingMgmt] = useState<number | null>(null);

  const generate = async () => {
    if (!symptoms.trim() || generating) return;
    setGenerating(true);
    setDdx([]);
    logAudit("DDx requested", `Patient ${patientId || "—"} · symptoms: “${symptoms.slice(0, 60)}…”`, "Dr. Admin");
    await sleep(1800);
    setDdx(mockDdx());
    setGenerating(false);
    logAudit("DDx generated", "4 ranked differentials returned (model qwen3:14b · most-reliable routing)", "CDS agent");
  };

  const decide = (item: DdxItem, status: DdxItem["status"]) => {
    setDdx(ddx.map((d) => (d.id === item.id ? { ...d, status } : d)));
    logAudit(`DDx ${status}`, `#${item.rank} ${item.diagnosis} — ${status} by physician`, "Dr. Admin");
    toast(status === "accepted" ? "Diagnosis accepted" : status === "rejected" ? "Diagnosis rejected" : "Marked for edit", {
      description: `${item.diagnosis} — logged to audit trail.`,
    });
  };

  const sendChat = async () => {
    const q = chatInput.trim();
    if (!q || chatBusy) return;
    setCaseChat((p) => [...p, { role: "doctor", text: q }]);
    setChatInput("");
    setChatBusy(true);
    await sleep(1100);
    setCaseChat((p) => [
      ...p,
      { role: "ai", text: "Based on the presentation, DDx #1 and #2 overlap significantly; a rapid antigen test differentiates GAS with ~95% specificity. No drug interactions flagged with the current med list. Remember: final judgment rests with you — this is decision support only." },
    ]);
    setChatBusy(false);
  };

  return (
    <div className="space-y-4">
      {/* disclaimer */}
      <div className="glass border !border-red-400/50 p-4 flex items-center gap-3" style={{ boxShadow: "0 0 24px rgba(248,113,113,0.15)" }}>
        <AlertOctagon className="text-red-400 shrink-0 animate-pulse" size={22} />
        <div>
          <p className="text-sm font-bold text-red-300">AI-generated decision support — physician judgment required</p>
          <p className="text-xs text-slate-400">Nothing on this page is a diagnosis or prescription. No suggestion is saved, ordered or dispensed without explicit doctor confirmation. Every action is audit-logged.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* left: intake + ddx */}
        <div className="space-y-4">
          <GlassCard>
            <SectionTitle title="Symptom Intake" subtitle="Structured presentation → ranked differential" />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input className="input-dark" placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
              <input className="input-dark" placeholder="Age / Sex (e.g. 34 / F)" />
            </div>
            <textarea
              className="input-dark resize-none"
              rows={3}
              placeholder="e.g. sore throat ×3d, fever 38.4°C, odynophagia, no cough, tonsillar exudate bilaterally…"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
            />
            <button className="btn-neon w-full mt-3" disabled={!symptoms.trim() || generating} onClick={() => void generate()}>
              {generating ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Ranking differentials…
                </>
              ) : (
                <>
                  <Sparkles size={15} /> Generate DDx
                </>
              )}
            </button>
          </GlassCard>

          {ddx.length > 0 && (
            <GlassCard>
              <SectionTitle title="Ranked Differentials" subtitle="Each requires an explicit physician decision" />
              <div className="space-y-2.5">
                {ddx.map((d) => (
                  <div key={d.id} className={cn(
                    "rounded-lg border p-3 transition-colors",
                    d.status === "accepted" ? "border-emerald-400/40 bg-emerald-400/5" :
                    d.status === "rejected" ? "border-red-400/30 bg-red-400/5 opacity-60" :
                    d.status === "edited" ? "border-amber-400/40 bg-amber-400/5" :
                    "border-white/10 bg-white/[0.03]"
                  )}>
                    <div className="flex items-center gap-2.5">
                      <span className="h-6 w-6 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-[11px] font-bold text-violet-300 shrink-0">
                        {d.rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{d.diagnosis}</div>
                        <button
                          className="text-[10px] text-neon-cyan hover:underline font-mono"
                          onClick={() => toast.info("Citation", { description: d.citation + " (reference opens in clinician library — mocked)." })}
                        >
                          📚 {d.citation}
                        </button>
                      </div>
                      <Badge tone={d.probability.startsWith("high") ? "green" : d.probability.startsWith("moderate") ? "amber" : "neutral"} className="!text-[9px] shrink-0">
                        {d.probability}
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-2.5 ml-8">
                      <button className="btn-ghost !text-[10px] !py-1 hover:!border-emerald-400/50 hover:!text-emerald-300" onClick={() => decide(d, "accepted")}><Check size={11} /> Accept</button>
                      <button className="btn-ghost !text-[10px] !py-1 hover:!border-amber-400/50 hover:!text-amber-300" onClick={() => decide(d, "edited")}><Pencil size={11} /> Edit</button>
                      <button className="btn-ghost !text-[10px] !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => decide(d, "rejected")}><X size={11} /> Reject</button>
                      {d.status !== "pending" && <Badge tone={d.status === "accepted" ? "green" : d.status === "rejected" ? "red" : "amber"} className="ml-auto !text-[9px]">{d.status}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>

        {/* right: management + chat + outcome */}
        <div className="space-y-4">
          <GlassCard>
            <SectionTitle title="Management Assistant" subtitle="Editable options with dose + frequency citations" />
            <div className="space-y-2.5">
              {mgmt.map((m, i) => (
                <div key={m.kind} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <Badge tone={m.kind === "Drug" ? "violet" : m.kind === "Surgical" ? "red" : "cyan"}>{m.kind}</Badge>
                    <button
                      className="text-[10px] text-neon-cyan hover:underline"
                      onClick={() => { setEditingMgmt(editingMgmt === i ? null : i); logAudit("Management option viewed/edited", `${m.kind} option opened for edit`, "Dr. Admin"); }}
                    >
                      {editingMgmt === i ? "done" : "edit"}
                    </button>
                  </div>
                  {editingMgmt === i ? (
                    <textarea
                      className="input-dark resize-none mt-2 text-xs"
                      rows={3}
                      value={m.text}
                      onChange={(e) => setMgmt(mgmt.map((x, xi) => (xi === i ? { ...x, text: e.target.value } : x)))}
                    />
                  ) : (
                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">{m.text}</p>
                  )}
                  <button className="text-[10px] text-slate-500 hover:text-neon-cyan font-mono mt-1.5" onClick={() => toast.info("Citation", { description: m.cite })}>
                    📚 {m.cite}
                  </button>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTitle title="Case Chat" subtitle="Discuss this case with the CDS agent" />
            <div className="max-h-44 overflow-y-auto space-y-2 mb-3">
              {caseChat.length === 0 && <p className="text-xs text-slate-500">Ask about differentials, interactions, guideline evidence…</p>}
              {caseChat.map((c, i) => (
                <div key={i} className={cn("rounded-lg px-3 py-2 text-xs leading-relaxed", c.role === "doctor" ? "bg-cyan-500/10 border border-cyan-400/20 text-cyan-100 ml-8" : "bg-white/[0.04] border border-white/10 text-slate-300 mr-8")}>
                  {c.text}
                </div>
              ))}
              {chatBusy && (
                <div className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 mr-8">
                  <span className="typing-dot" /> <span className="typing-dot" /> <span className="typing-dot" />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input className="input-dark flex-1" placeholder="Message CDS agent…" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void sendChat()} />
              <button className="btn-neon !px-3" onClick={() => void sendChat()} disabled={chatBusy}><Send size={14} /></button>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTitle title="Outcome Follow-up" subtitle="Day-5 check — feeds CDS quality metrics" />
            <div className="flex gap-2">
              {["improved", "unchanged", "worse"].map((o) => (
                <button
                  key={o}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-all",
                    outcome === o
                      ? o === "improved" ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                        : o === "worse" ? "border-red-400/50 bg-red-400/10 text-red-300"
                        : "border-amber-400/50 bg-amber-400/10 text-amber-300"
                      : "border-white/10 text-slate-400 hover:text-white"
                  )}
                  onClick={() => { setOutcome(o); logAudit("Outcome recorded", `Day-5 follow-up: ${o}`, "Dr. Admin"); toast.success(`Outcome recorded: ${o}`); }}
                >
                  {o}
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* audit trail */}
      <GlassCard>
        <SectionTitle title="Audit Trail" subtitle="Every suggestion and physician decision, timestamped" />
        <div className="max-h-56 overflow-y-auto space-y-1.5">
          {audit.length === 0 && <p className="text-xs text-slate-500">No entries yet — generate a DDx to begin the trail.</p>}
          {audit.map((a) => (
            <div key={a.id} className="flex items-center gap-3 text-xs rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <span className="font-mono text-slate-500 shrink-0">{a.timestamp}</span>
              <Badge tone="violet" className="!text-[9px] shrink-0">{a.actor}</Badge>
              <span className="text-slate-300 font-medium shrink-0">{a.action}</span>
              <span className="text-slate-500 truncate">{a.detail}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
