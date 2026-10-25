import { useState } from "react";
import { MessageSquare, Send, Sparkles, User, Bot, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, sleep, nowTime } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "doctor" | "ai";
  content: string;
  timestamp: string;
}

const aiResponses = [
  "Based on the clinical presentation, I recommend considering atypical pneumonia coverage. The CURB-65 score of 1 suggests low mortality risk, but the CRP of 45 indicates significant inflammation. Would you like me to elaborate on antibiotic options?",
  "Looking at the differentials, the Centor criteria score of 3 gives a 40-60% probability of GAS pharyngitis. A rapid antigen test would help confirm. Remember that in adults > 25, GAS is less common.",
  "The elevated creatinine (2.4 mg/dL from baseline 1.0) meets KDIGO Stage 2 AKI criteria. I'd suggest holding nephrotoxins, IV fluids, and monitoring urine output. Nephrology consult is recommended.",
  "Regarding drug interactions: Amoxicillin-Clavulanate may potentiate warfarin effect. Check INR if patient is on anticoagulation. No significant interaction with Paracetamol or Salbutamol.",
  "For the troponin elevation, consider Type 2 NSTEMI given the infection and tachycardia. The ESC 0/1-hour algorithm could help rule out Type 1 MI. Would you like me to calculate the HEART score?",
  "The HbA1c of 7.2% indicates suboptimal glycemic control. For inpatients, I'd suggest basal-bolus insulin regimen rather than sliding scale. Target glucose 140-180 mg/dL per ADA guidelines.",
];

export default function AICaseDiscussion({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (!patientId) { toast.error("Select a patient first"); return; }

    const userMsg: ChatMessage = { id: uid("chat"), role: "doctor", content: text, timestamp: nowTime() };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setBusy(true);
    logAudit("Case discussion question", `${text.slice(0, 60)}… for ${patientId}`, doctorName);

    await sleep(1200 + Math.random() * 800);

    const aiMsg: ChatMessage = {
      id: uid("chat"), role: "ai",
      content: aiResponses[Math.floor(Math.random() * aiResponses.length)],
      timestamp: nowTime(),
    };
    setMessages((p) => [...p, aiMsg]);
    setBusy(false);
    logAudit("Case discussion response", `AI responded to: ${text.slice(0, 40)}…`, "CDS agent");
  };

  const clearChat = () => {
    setMessages([]);
    logAudit("Case discussion cleared", `Patient ${patientId}`, doctorName);
    toast.success("Chat cleared");
  };

  const copyChat = () => {
    const text = messages.map((m) => `[${m.role.toUpperCase()}] ${m.content}`).join("\n\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard")).catch(() => toast.error("Copy failed"));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="AI Case Discussion" subtitle="Discuss this case with the CDS clinical agent" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={copyChat} disabled={messages.length === 0}><ClipboardCopy size={14} /> Copy</button>
          <button className="btn-ghost" onClick={clearChat} disabled={messages.length === 0}>Clear</button>
        </div>
      </div>

      <GlassCard>
        <div className="h-[400px] overflow-y-auto space-y-3 mb-4 pr-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare size={32} className="text-slate-600 mb-2" />
              <p className="text-sm text-slate-500">Ask clinical questions about this case</p>
              <p className="text-xs text-slate-600 mt-1">e.g. "What antibiotic should I prescribe?", "Any drug interactions?", "Calculate the HEART score"</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex gap-2", m.role === "doctor" ? "justify-end" : "justify-start")}>
              {m.role === "ai" && (
                <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-400/30 flex items-center justify-center shrink-0">
                  <Bot size={14} className="text-violet-300" />
                </div>
              )}
              <div className={cn(
                "max-w-[75%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                m.role === "doctor"
                  ? "bg-cyan-500/15 border border-cyan-400/25 text-cyan-100 rounded-tr-sm"
                  : "bg-white/[0.04] border border-white/10 text-slate-300 rounded-tl-sm"
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge tone={m.role === "doctor" ? "cyan" : "violet"} className="!text-[7px]">{m.role === "doctor" ? "You" : "CDS AI"}</Badge>
                  <span className="text-[9px] text-slate-600">{m.timestamp}</span>
                </div>
                {m.content}
              </div>
              {m.role === "doctor" && (
                <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0">
                  <User size={14} className="text-cyan-300" />
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-400/30 flex items-center justify-center shrink-0">
                <Bot size={14} className="text-violet-300" />
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2">
                <span className="typing-dot" /> <span className="typing-dot" /> <span className="typing-dot" />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            className="input-dark flex-1"
            placeholder="Ask the CDS agent about this case…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void sendMessage()}
          />
          <button className="btn-neon !px-3" onClick={() => void sendMessage()} disabled={busy || !input.trim()}>
            {busy ? <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
