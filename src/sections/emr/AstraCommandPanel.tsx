import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOTSPOT_LIST } from "./hotspots";
import { speakHumanVoice } from "@/utils/audioAlerts";
import { askDoctorEngine, speakDoctorLine } from "@/services/doctorEngine";
import { looksLikePhi } from "@/astra/voice/providers/phiGate";

interface Props {
  onCommand: (hotspotId: string) => void;
  activeId: string | null;
  onEngine?: (engine: string) => void;
}

export function AstraCommandPanel({ onCommand, activeId, onEngine }: Props) {
  const [text, setText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const speak = (msg: string) => {
    if (muted) return;
    speakHumanVoice(msg, () => setSpeaking(true), () => setSpeaking(false),
      () => setSpeaking(false), "instructional", "en-IN");
  };

  useEffect(() => {
    if (!activeId) return;
    const h = HOTSPOT_LIST.find((x) => x.id === activeId);
    if (h) speak(`${h.label}. ${h.clinicalSignificance}`);
  }, [activeId]);

  const handleSend = async () => {
    const raw = text.trim();
    if (!raw) return;
    const q = raw.toLowerCase();
    setText("");
    const match = HOTSPOT_LIST.find((h) =>
      q.includes(h.label.toLowerCase()) ||
      h.landmarks?.some((l) => q.includes(l.toLowerCase())) ||
      q.includes(h.system.toLowerCase())
    );
    const ordering = /\border\b|prescrib|\bnote\b|diagnos|\buhid\b/i.test(raw) || looksLikePhi(raw);
    if (match && !ordering) {
      onCommand(match.id);
      speak(`Showing ${match.label}. ${match.clinicalSignificance}`);
      return;
    }
    const answer = await askDoctorEngine({
      text: raw,
      ...(looksLikePhi(raw) ? { note: raw } : {}),
    });
    onEngine?.(answer.ok ? answer.engine : "none");
    if (match) onCommand(match.id);
    const line = answer.ok && answer.text ? answer.text : (answer.error || "No engine answered.");
    if (answer.localOnly || looksLikePhi(line)) {
      setSpeaking(true);
      void speakDoctorLine(line, true).finally(() => setSpeaking(false));
    } else {
      speak(line);
    }
  };

  return (
    <div className="flex items-center gap-2 border-t border-slate-700/50 bg-slate-900/80 px-3 py-2 backdrop-blur-md">
      {/* Astra avatar indicator */}
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all", speaking ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.4)]" : "border-slate-600/40 bg-slate-800 text-slate-400")}>
        <Volume2 size={16} className={speaking ? "animate-pulse" : ""} />
      </div>

      <div className="flex-1 text-[11px] text-slate-400">
        {speaking ? (
          <span className="text-cyan-300">ASTRA is speaking…</span>
        ) : activeId ? (
          <span>Showing <span className="font-semibold text-cyan-300">{HOTSPOT_LIST.find((h) => h.id === activeId)?.label}</span></span>
        ) : (
          <span>ASTRA Clinical Command — type or speak a command</span>
        )}
      </div>

      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        placeholder="e.g. Show pancreas · femur fracture · dengue capillary"
        className="w-[260px] rounded-lg border border-slate-600/50 bg-slate-800/60 px-3 py-1.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-500/50"
      />
      <button onClick={() => setMuted(!muted)} className={cn("flex h-8 w-8 items-center justify-center rounded-lg border transition-colors", muted ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-slate-600/40 text-slate-400 hover:text-slate-200")}>
        {muted ? <MicOff size={14} /> : <Mic size={14} />}
      </button>
      <button onClick={handleSend} className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 transition-colors hover:bg-cyan-500/25">
        <Send size={14} />
      </button>
    </div>
  );
}
