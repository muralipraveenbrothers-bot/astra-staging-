// ======================================================
// Astra Clinical Co-Pilot — in-app streaming chat widget.
// Routing: OmniRoute → FreeLLMAPI (see src/services/aiRouter.ts).
// Renders INSIDE Astra only — no external windows, no iframes.
// ======================================================

import { useEffect, useRef, useState } from "react";
import { Send, Settings2 } from "lucide-react";
import { astraAIChatStream, type AstraChatMessage } from "@/services/aiRouter";
import { AIRouterSettings } from "@/components/AIRouterSettings";

export function AstraClinicalCoPilot({ patientName = "Current Patient" }: { patientName?: string }) {
  const [messages, setMessages] = useState<AstraChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, stream]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: AstraChatMessage = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setStream("");

    try {
      let full = "";
      await astraAIChatStream({
        messages: [...messages, userMsg],
        model: "auto",
        systemPrompt:
          `You are Astra Clinical Co-Pilot at PM Brothers Multispeciality Hospital. ` +
          `Current patient context: ${patientName}. Give concise, evidence-based answers. ` +
          `Final clinical decision stays with the treating doctor.`,
        onChunk: (t) => {
          full += t;
          setStream(full);
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: full }]);
      setStream("");
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Router error: " + (err instanceof Error ? err.message : String(err)) },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-white/10">
        <div>
          <b className="text-sm font-bold text-slate-100">Astra Clinical Co-Pilot</b>
          <div className="text-[11px] text-sky-300/90 mt-0.5">
            {patientName} • FreeLLMAPI first, then OmniRoute if that gateway is down
          </div>
        </div>
        <button onClick={() => setShowKeys(true)} className="btn-ghost !px-3 !py-1.5 rounded-md text-xs flex items-center gap-1.5" aria-label="Router keys">
          <Settings2 className="w-3.5 h-3.5" /> Keys
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {messages.length === 0 && !stream && (
          <p className="text-xs text-slate-500 text-center mt-8">
            Ask diagnosis support, labs interpretation, or guideline lookups.
            Streaming answers require FreeLLMAPI / OmniRoute to be online.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "self-end bg-sky-600 text-white"
                : "self-start bg-slate-800/90 text-slate-100"
            }`}
          >
            {m.content}
          </div>
        ))}
        {stream && (
          <div className="max-w-[85%] self-start px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap bg-slate-800/90 text-slate-100">
            {stream}
          </div>
        )}
        {loading && !stream && <span className="text-xs text-slate-500 animate-pulse">Astra is thinking…</span>}
      </div>

      {/* Input bar */}
      <div className="flex gap-2 p-3 border-t border-white/10 bg-slate-900/60">
        <input
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask diagnosis, labs, guidelines…"
          className="input-dark flex-1 text-sm"
        />
        <button onClick={send} disabled={loading || !input.trim()} className="btn-neon !px-4 rounded-lg text-sm flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5" /> {loading ? "…" : "Send"}
        </button>
      </div>

      {showKeys && <AIRouterSettings onClose={() => setShowKeys(false)} />}
    </div>
  );
}

export default AstraClinicalCoPilot;
