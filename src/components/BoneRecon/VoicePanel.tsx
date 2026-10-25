import { useEffect, useState } from "react";
import { Mic, MicOff, Send, Volume2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { speakHumanVoice } from "@/utils/audioAlerts";
import { routeCommand } from "@/services/astraCommandRouter";

interface Props {
  voiceLog: string[];
  speak: (msg: string) => void;
  onAsk: () => void;
}

export function VoicePanel({ voiceLog, speak, onAsk }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d && d.source === "bonerecon" && typeof d.text === "string" && !muted) {
        speakHumanVoice(d.text, () => setSpeaking(true), () => setSpeaking(false), () => setSpeaking(false), "instructional", "en-IN");
      }
    };
    window.addEventListener("astra:copilot-speak", h);
    return () => window.removeEventListener("astra:copilot-speak", h);
  }, [muted]);

  const localSpeak = (msg: string) => {
    if (muted) return;
    speakHumanVoice(msg, () => setSpeaking(true), () => setSpeaking(false), () => setSpeaking(false), "instructional", "en-IN");
  };

  const handleSend = () => {
    const q = text.trim();
    if (!q) return;
    const result = routeCommand(q);
    if (result.success) {
      localSpeak(result.message || "Command received.");
    } else {
      localSpeak("I did not understand that command. Try 'Astra create 3D models'.");
    }
    setText("");
  };

  return (
    <aside className="col-span-3 min-h-0 overflow-y-auto border-l border-slate-700/40 bg-slate-900/30">
      <div className="p-3 space-y-3">
        <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase text-slate-400">Voice Interaction</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMuted(!muted)} className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", muted ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-slate-600/40 text-slate-400 hover:text-cyan-300")}>
              {muted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <div className="flex-1 text-[10px] text-slate-400">
              {muted ? "Voice output muted" : speaking ? "Astra is speaking…" : "Say 'Astra create 3D models' or type below"}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="e.g. create fibula surgical guide"
              className="flex-1 rounded-lg border border-slate-600/50 bg-slate-800/60 px-2 py-1 text-[10px] text-slate-200 focus:border-cyan-500/50"
            />
            <button onClick={handleSend} className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-300"><Send size={12} /></button>
          </div>
          <div className="mt-2 text-[9px] text-slate-500">Voice commands are routed through Voicebox — same conversation runtime as the rest of ASTRA.</div>
        </div>

        <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase text-slate-400">Ask Astra</div>
          <button onClick={onAsk} className="w-full rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-[10px] text-cyan-200 hover:bg-cyan-500/20">
            <Activity size={10} className="mr-1 inline" /> Ask about current planning context
          </button>
          <div className="mt-1 text-[9px] text-slate-500">Patient + region + laterality + diagnosis + step go to the SAME AstraCopilot.</div>
        </div>

        <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase text-slate-400">Astra Responses</div>
          <div className="space-y-1">
            {voiceLog.length === 0 && <div className="text-[9px] text-slate-500">No responses yet.</div>}
            {voiceLog.map((m, i) => (
              <div key={i} className={cn("rounded-md px-2 py-1 text-[9px]", i === 0 ? "bg-cyan-500/10 text-cyan-200" : "bg-slate-800 text-slate-400")}>
                <Volume2 size={9} className="mr-1 inline" /> {m}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}