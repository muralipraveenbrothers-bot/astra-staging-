// P4 — Financial Advisor + Patient Counseling (CEO/doctor only).
// Financial: rule-based insight cards computed from the LIVE store (collections,
// mode split, pharmacy margin, low stock, open issues, bed occupancy), each
// routable to the approvals inbox; optional LLM suggestions with offline
// fallback. Counseling: pick an IP/OT case → plain-language explanation with
// TTS playback and mic Q&A (cost / risk / recovery / food), Telugu-friendly
// short-sentence mode, and an explicit doctor-decides disclaimer.

import { useMemo, useState } from "react";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useSpeechRecognition } from "@/lib/speech";
import { askDoctorEngine } from "@/services/doctorEngine";
import { cn, fmtINR } from "@/lib/utils";
import {
  Banknote, BrainCircuit, HeartHandshake, Landmark, Mic, MicOff, Pill,
  BedDouble, ShieldAlert, Sparkles, Speaker, StopCircle, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { speakHumanVoice, stopActiveSpeech } from "@/utils/audioAlerts";

/* ---------------- TTS ---------------- */
function speak(text: string) {
  speakHumanVoice(text, undefined, undefined, () => toast.error("Voicebox is offline"), "empathetic", "en-IN");
}
function stopSpeak() {
  stopActiveSpeech();
}

/* ---------------- counseling case data ---------------- */
interface CounselCase {
  id: string;
  label: string;
  procedure: string;
  doctor: string;
  estCost: number;
  stay: string;
  risks: string[];
  recovery: string;
  food: string;
}

const OT_CASES: CounselCase[] = [
  { id: "ot-3", label: "PT-1088 · Caesarean section (elective)", procedure: "Caesarean section (elective)", doctor: "Dr. Nandini S", estCost: 52000, stay: "3–4 days", risks: ["bleeding", "infection", "anaesthesia reaction"], recovery: "Most mothers walk with support the next day and go home in 3–4 days. Full recovery takes about 6 weeks.", food: "Liquids first after surgery, then soft home food from day one. High-protein diet helps healing." },
  { id: "ot-4", label: "PT-1095 · ORIF — distal radius fracture", procedure: "ORIF — distal radius fracture fixation", doctor: "Dr. Kunal M", estCost: 61000, stay: "1–2 days", risks: ["infection", "stiffness", "implant irritation"], recovery: "Arm in a splint for 2 weeks, stitches out at 12–14 days, physiotherapy for 6–8 weeks for full grip strength.", food: "Normal diet. Calcium and vitamin D rich food supports bone healing." },
];

function explain(c: CounselCase, simple: boolean): string {
  if (simple) {
    return [
      `Namaste. I will explain in simple words.`,
      `The operation is called ${c.procedure}.`,
      `${c.doctor} will do it.`,
      `It usually costs about ${fmtINR(c.estCost)}.`,
      `Hospital stay is about ${c.stay}.`,
      `Every operation has some risk. Main risks here: ${c.risks.join(", ")}. The team watches for these closely.`,
      `After the operation: ${c.recovery}`,
      `About food: ${c.food}`,
      `Please ask any question. The doctor will make the final decision with you.`,
    ].join(" ");
  }
  return `${c.doctor} has advised ${c.procedure}. The estimated package cost is ${fmtINR(c.estCost)} with an expected stay of ${c.stay}. As with any procedure there are risks — principally ${c.risks.join(", ")} — which the anaesthesia and surgical teams actively monitor and manage. Recovery: ${c.recovery} Diet: ${c.food} This explanation is for understanding only; the treating doctor makes all final clinical decisions with the family.`;
}

interface Insight {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  metric: string;
  advice: string;
  rule: string;
}

export function Advisor() {
  const { bills, dispenses, purchases, medicines, issues, beds, settings, addApproval, logAudit } = useStore();
  const { account } = useAuth();
  const [tab, setTab] = useState<"financial" | "counseling">("financial");
  const actor = account?.name ?? "Advisor";

  /* =============== FINANCIAL =============== */
  const revenue = bills.filter((b) => b.amount > 0).reduce((s, b) => s + b.amount, 0);
  const reversals = bills.filter((b) => b.amount < 0).reduce((s, b) => s + b.amount, 0);
  const byMode = (["UPI", "Card", "Cash"] as const).map((m) => ({ mode: m, total: bills.filter((b) => b.mode === m && b.amount > 0).reduce((s, b) => s + b.amount, 0) }));
  const pharmacySales = dispenses.reduce((s, d) => s + d.amount, 0);
  const pharmacyBuys = purchases.reduce((s, p) => s + p.amount, 0);
  const lowStock = medicines.filter((m) => m.stock <= 20);
  const openIssues = issues.filter((i) => i.status !== "done");
  const occBeds = beds.filter((b) => b.status === "occupied").length;
  const occupancy = beds.length ? Math.round((occBeds / beds.length) * 100) : 0;
  const cashShare = revenue ? Math.round(((byMode.find((m) => m.mode === "Cash")?.total ?? 0) / revenue) * 100) : 0;

  const insights: Insight[] = useMemo(() => [
    {
      icon: Banknote,
      title: "Collections pulse",
      metric: `${fmtINR(revenue)} across ${bills.filter((b) => b.amount > 0).length} receipts`,
      advice: cashShare > 25
        ? `Cash is ${cashShare}% of collections — push UPI at the reception desk to cut drawer-variance risk and day-end reconciliation time.`
        : `Cash share is ${cashShare}% — healthy digital mix. Keep the UPI QR visible at every counter.`,
      rule: cashShare > 25 ? "Cap cash collections at 25% — default receipts to UPI" : "Maintain digital-first collection policy",
    },
    {
      icon: Pill,
      title: "Pharmacy margin",
      metric: `${fmtINR(pharmacySales)} dispensed vs ${fmtINR(pharmacyBuys)} purchased`,
      advice: pharmacyBuys > pharmacySales
        ? "Purchases are outpacing dispensing — hold non-urgent purchase orders above ₹5,000 (they already route to approval) and push near-expiry stock first."
        : "Dispensing outpaces purchasing — margin cycle is healthy. Watch the low-stock list so fast movers don't stock out.",
      rule: "Weekly purchase-vs-dispense review with the pharmacist",
    },
    {
      icon: ShieldAlert,
      title: "Stock & shrinkage watch",
      metric: `${lowStock.length} low-stock item${lowStock.length === 1 ? "" : "s"} in the medicine master`,
      advice: lowStock.length
        ? `Reorder now: ${lowStock.slice(0, 3).map((m) => m.name).join(", ")}${lowStock.length > 3 ? ` +${lowStock.length - 3} more` : ""}. Batch-tracking makes expired-stock write-offs visible at month-end.`
        : "No critical stock-outs in the master list. Keep reorder alerts on.",
      rule: "Auto-reorder any master item below 20 units",
    },
    {
      icon: BedDouble,
      title: "Bed occupancy",
      metric: `${occupancy}% (${occBeds}/${beds.length} beds)`,
      advice: occupancy >= 85
        ? "Occupancy is running hot — expedite the two planned discharges and hold elective admissions that lack a bed plan."
        : occupancy <= 50
          ? "Occupancy is soft — a good week to push camp conversions and post-op review revisits into admissions."
          : "Occupancy is in the healthy band — keep the discharge-before-noon drive going.",
      rule: "Escalate to CEO when occupancy crosses 85%",
    },
    {
      icon: Landmark,
      title: "Open compliance items",
      metric: `${openIssues.length} open issue${openIssues.length === 1 ? "" : "s"}${reversals ? ` · ${fmtINR(Math.abs(reversals))} in reversals` : ""}`,
      advice: openIssues.length
        ? `Top priority: ${openIssues[0].title}. Clearing audit issues before Friday keeps the weekend reconciliation clean.`
        : "No open issues — reconciliation is clean.",
      rule: "All audit issues assigned within 24h of raising",
    },
  ], [revenue, bills.length, cashShare, pharmacySales, pharmacyBuys, lowStock, occupancy, occBeds, beds.length, openIssues, reversals]);

  const routeRule = (i: Insight) => {
    addApproval({
      kind: "rule",
      title: `Policy suggestion — ${i.title}`,
      detail: `${i.rule}. Basis: ${i.metric}. ${i.advice}`,
      requestedBy: actor,
      requestedByRole: account?.role ?? "ceo",
    });
    logAudit("Advisor rule routed", `${i.title} → approvals inbox`, actor);
    toast.success("Routed to approvals", { description: "Doctor/CEO can approve or reject in the bell inbox." });
  };

  /* ask box — keyword answers on live numbers */
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const askFinancial = () => {
    const s = ask.toLowerCase();
    let a: string;
    if (s.includes("cash")) a = `Cash collections are ${fmtINR(byMode.find((m) => m.mode === "Cash")?.total ?? 0)} — ${cashShare}% of today's ${fmtINR(revenue)}. ${cashShare > 25 ? "Above the 25% comfort line — steer receipts to UPI." : "Within the comfort band."}`;
    else if (s.includes("upi") || s.includes("card") || s.includes("mode")) a = byMode.map((m) => `${m.mode}: ${fmtINR(m.total)}`).join(" · ") + `. UPI leads when the reception QR is offered first.`;
    else if (s.includes("pharmacy") || s.includes("margin") || s.includes("medicine")) a = `Pharmacy has dispensed ${fmtINR(pharmacySales)} against ${fmtINR(pharmacyBuys)} of purchases on the register. ${lowStock.length} item(s) are low — ${lowStock.slice(0, 3).map((m) => m.name).join(", ") || "none"}.`;
    else if (s.includes("bed") || s.includes("occupancy") || s.includes("ward")) a = `${occBeds} of ${beds.length} beds are occupied (${occupancy}%). ${occupancy >= 85 ? "Hot — push discharges." : occupancy <= 50 ? "Soft — push camp conversions." : "Healthy band."}`;
    else if (s.includes("revenue") || s.includes("collection") || s.includes("today")) a = `Collections on the ledger: ${fmtINR(revenue)} across ${bills.filter((b) => b.amount > 0).length} receipts (${byMode.map((m) => `${m.mode} ${fmtINR(m.total)}`).join(", ")}).`;
    else a = `Today: ${fmtINR(revenue)} collected, pharmacy margin cycle ${fmtINR(pharmacySales - pharmacyBuys)}, occupancy ${occupancy}%, ${openIssues.length} open issues. Ask about cash, pharmacy, beds or revenue.`;
    setAnswer(a);
    logAudit("Advisor question", `${ask} → answered from live ledger`, actor);
  };

  /* LLM suggestions (optional, falls back gracefully) */
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const getAiSuggestions = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    setAiText(null);
    try {
      const result = await askDoctorEngine({
        text: "Give 4 short numbered financial suggestions. No patient names. Revenue " + fmtINR(revenue) + ", cash share " + cashShare + "%, pharmacy dispensed " + fmtINR(pharmacySales) + " vs purchased " + fmtINR(pharmacyBuys) + ", low-stock items " + lowStock.length + ", bed occupancy " + occupancy + "%, open audit issues " + openIssues.length + ".",
      });
      if (!result.ok || !result.text) throw new Error(result.error || "no-answer");
      setAiText(result.text);
            logAudit("Advisor AI suggestions", "LLM suggestions generated from live snapshot", actor);
    } catch {
      toast.info("AI backend offline", { description: "Rule-based insight cards above remain fully available — they run on live ledger data." });
      setAiText(null);
    }
    setAiBusy(false);
  };

  /* =============== COUNSELING =============== */
  const occupiedCases: CounselCase[] = beds
    .filter((b) => b.status === "occupied" && b.patientId)
    .slice(0, 6)
    .map((b) => ({
      id: b.id,
      label: `${b.patientId} · ${b.patientName ?? "IP patient"} — ${b.diagnosis ?? "under treatment"}`,
      procedure: b.diagnosis ?? "In-patient treatment",
      doctor: "Treating doctor",
      estCost: 25000,
      stay: "2–3 days",
      risks: ["hospital-acquired infection", "medication reaction"],
      recovery: "The team reviews progress every morning and shares a daily update with the family.",
      food: "Hospital diet as advised by the duty doctor; outside food only after checking with the nurse.",
    }));
  const allCases = [...OT_CASES, ...occupiedCases];

  const [caseId, setCaseId] = useState<string>(allCases[0]?.id ?? "");
  const [simple, setSimple] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const active = allCases.find((c) => c.id === caseId) ?? allCases[0];
  const explanation = active ? explain(active, simple) : "";

  const speech = useSpeechRecognition();
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);

  const answerQuestion = (qRaw: string) => {
    if (!active) return;
    const q = qRaw.trim();
    if (!q) return;
    const s = q.toLowerCase();
    let a: string;
    if (s.includes("cost") || s.includes("charge") || s.includes("money") || s.includes("kharcha") || s.includes("bill"))
      a = `The estimated total is about ${fmtINR(active.estCost)}. The billing desk gives a written estimate and daily statement — any package discount needs approval.`;
    else if (s.includes("risk") || s.includes("danger") || s.includes("safe") || s.includes("complication"))
      a = `Every procedure carries some risk. For ${active.procedure}, the main ones are ${active.risks.join(", ")}. The team monitors these specifically, and the consent form lists them in writing.`;
    else if (s.includes("recover") || s.includes("rest") || s.includes("days") || s.includes("home") || s.includes("discharge"))
      a = `Expected stay is ${active.stay}. ${active.recovery}`;
    else if (s.includes("food") || s.includes("diet") || s.includes("eat") || s.includes("tiffin"))
      a = active.food;
    else if (s.includes("doctor") || s.includes("who"))
      a = `${active.doctor} is in charge of this case. The duty doctor visits on morning and evening rounds — the family can meet them then.`;
    else
      a = `Good question for the treating team. On this case: ${active.procedure}, estimated ${fmtINR(active.estCost)}, stay ${active.stay}. Ask me about cost, risk, recovery or food — anything else, the doctor will answer on rounds.`;
    setQa((p) => [...p.slice(-3), { q, a }]);
    speak(a);
  };

  const stopMic = () => {
    speech.stop();
    if (speech.transcript.trim()) {
      answerQuestion(speech.transcript);
      speech.reset();
    }
  };

  const playExplanation = () => {
    if (!explanation) return;
    setSpeaking(true);
    speak(explanation);
    logAudit("Counseling session", `${active?.label} — explanation played (${simple ? "simple" : "standard"} mode)`, actor);
    toast.info("Playing explanation", { description: "Browser text-to-speech, English (India). Use Chrome/Edge for best voices." });
    window.setTimeout(() => setSpeaking(false), 4000);
  };

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex gap-2">
        <button className={cn("btn-ghost !text-xs", tab === "financial" && "!border-amber-400/50 !text-amber-300")} onClick={() => setTab("financial")}>
          <Wallet size={13} /> Financial advisor
        </button>
        <button className={cn("btn-ghost !text-xs", tab === "counseling" && "!border-amber-400/50 !text-amber-300")} onClick={() => setTab("counseling")}>
          <HeartHandshake size={13} /> Patient counseling
        </button>
      </div>

      {tab === "financial" ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {insights.map((i) => (
              <GlassCard key={i.title} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <i.icon size={16} className="text-amber-300" />
                  <p className="text-sm font-semibold text-white">{i.title}</p>
                </div>
                <p className="text-xs text-cyan-300 font-medium">{i.metric}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{i.advice}</p>
                <button className="btn-ghost !text-[10px] !py-1" onClick={() => routeRule(i)}>
                  <Sparkles size={11} /> Route “{i.rule.length > 44 ? `${i.rule.slice(0, 44)}…` : i.rule}” to approvals
                </button>
              </GlassCard>
            ))}
            <GlassCard className="space-y-2.5">
              <div className="flex items-center gap-2">
                <BrainCircuit size={16} className="text-violet-300" />
                <p className="text-sm font-semibold text-white">AI suggestions</p>
              </div>
              <p className="text-[11px] text-slate-500">Sends today's live snapshot to the configured LLM for a second opinion. Rule cards above never depend on a backend.</p>
              <button className="btn-neon !text-xs w-full" disabled={aiBusy} onClick={() => void getAiSuggestions()}>
                <Sparkles size={13} /> {aiBusy ? "Asking the model…" : "Get AI suggestions"}
              </button>
              {aiText && <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed border-t border-white/10 pt-2">{aiText}</p>}
            </GlassCard>
          </div>

          <GlassCard>
            <SectionTitle title="Ask the ledger" subtitle="Keyword answers computed from live data — works offline" />
            <div className="flex gap-2 mt-2">
              <input
                className="input-dark flex-1 text-xs"
                placeholder="e.g. How much cash today? · pharmacy margin? · bed occupancy?"
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && askFinancial()}
              />
              <button className="btn-neon !py-2 !px-4 text-xs" disabled={!ask.trim()} onClick={askFinancial}>Ask</button>
            </div>
            {answer && <p className="text-xs text-slate-300 mt-3 leading-relaxed rounded-lg border border-white/10 bg-white/[0.03] p-3">{answer}</p>}
          </GlassCard>
        </>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <GlassCard className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionTitle title="Counseling session" subtitle="Plain-language explanation for the family" />
              <Badge tone="amber">Final decisions rest with the treating doctor</Badge>
            </div>
            <select className="input-dark w-full text-xs" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              {allCases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={simple} onChange={(e) => setSimple(e.target.checked)} className="accent-yellow-500" />
              Simple phrasing (short sentences — easier to translate into Telugu/Hindi for attenders)
            </label>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-200 leading-relaxed">
              {explanation}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-neon !text-xs" onClick={playExplanation} disabled={speaking}>
                <Speaker size={13} /> {speaking ? "Playing…" : "Play aloud (TTS)"}
              </button>
              <button className="btn-ghost !text-xs" onClick={() => { stopSpeak(); setSpeaking(false); }}>
                <StopCircle size={13} /> Stop
              </button>
            </div>
          </GlassCard>

          <GlassCard className="space-y-3">
            <SectionTitle title="Family Q&A" subtitle="Hold the mic, ask in English/Hindi/Telugu-mix — answers spoken back" />
            <div className="flex gap-2">
              {!speech.listening ? (
                <button className="btn-neon !text-xs flex-1" disabled={!speech.supported} onClick={() => { speech.reset(); speech.start(); }}>
                  <Mic size={13} /> {speech.supported ? "Start mic — ask a question" : "Mic not supported in this browser"}
                </button>
              ) : (
                <button className="btn-neon !text-xs flex-1 !bg-none !bg-red-500/80" onClick={stopMic}>
                  <MicOff size={13} /> Stop &amp; answer
                </button>
              )}
            </div>
            {speech.listening && (
              <p className="text-[11px] text-amber-300 animate-pulse">Listening… {speech.interim || speech.transcript || "speak now"}</p>
            )}
            {speech.error && <p className="text-[11px] text-red-300">{speech.error}</p>}
            <div className="flex gap-1.5 flex-wrap">
              {["What will it cost?", "What are the risks?", "How many days to recover?", "What food is allowed?"].map((q) => (
                <button key={q} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-400 hover:text-white hover:border-amber-400/40" onClick={() => answerQuestion(q)}>
                  {q}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {qa.map((x, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] text-cyan-300">“{x.q}”</p>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{x.a}</p>
                </div>
              ))}
              {qa.length === 0 && <p className="text-[11px] text-slate-500">Answers appear here and are spoken aloud. Typical topics: cost, risk, recovery, food, doctor.</p>}
            </div>
            <p className="text-[10px] text-slate-500 border-t border-white/10 pt-2">
              Disclaimer: this assistant explains — it does not advise. Clinical and financial decisions are taken by the treating doctor and the hospital desk with the family.
            </p>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
