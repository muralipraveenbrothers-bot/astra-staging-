import { useState, useRef, useEffect } from "react";
import { Mic, X, Send, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { navHash } from "@/lib/hashRoute";
import { useAstraVoiceTurn } from "./useAstraVoiceTurn";
import { useLocalDictation } from "@/astra/voice/useLocalDictation";
import { voiceSession } from "@/astra/voice/safety/voiceSession";

export function GlobalVoiceWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("en-IN");
  const { account } = useAuth();
  const token = localStorage.getItem("astra.serverToken");

  // Guarded Astra turn for this mic panel: transcript → AstraVoiceGuardian →
  // existing brain endpoint → mandatory TEXT → speech (Voicebox/browser chain).
  // Previously this panel only posted the transcript to the communications API,
  // which is why no answer text and no speech ever came back.
  const turn = useAstraVoiceTurn({
    userId: account?.id,
    name: account?.name,
    role: account?.role,
    token,
  });
  const dictation = useLocalDictation({
    language: speechLanguage,
    autoSendFinal: true,
    onFinal: (text) => setTranscript((prev) => (prev ? `${prev} ${text}` : text)),
    onError: (message) => {
      if (message !== "silence") toast.error(message);
    },
  });

  const stopDictationRef = useRef(dictation.stop);
  stopDictationRef.current = dictation.stop;

  useEffect(() => {
    setIsRecording(dictation.isRecording);
  }, [dictation.isRecording]);

  useEffect(() => () => stopDictationRef.current(), []);

  // Only render if logged in
  if (!account) return null;

  const toggleVoice = () => {
    if (isOpen) {
      dictation.stop();
      voiceSession.releasePanel();
      setIsOpen(false);
      setIsRecording(false);
      setTranscript("");
    } else {
      setIsOpen(true);
      dictation.start();
    }
  };

  /** PRIMARY: ask Astra. Text answer is rendered here; speech follows. */
  const handleAskAstra = async () => {
    if (!transcript.trim()) return;
    setIsSending(true);
    try {
      await turn.ask(transcript);
    } catch (err) {
      console.error("[ASTRA:voice]", err);
      toast.error("Astra could not answer that — see the panel for details.");
    } finally {
      setIsSending(false);
    }
  };

  /** SECONDARY (preserved): send the transcript as a message to Astra Connect. */
  const handleSendToConnect = async () => {
    if (!transcript.trim()) return;
    setIsSending(true);
    try {
      await fetch("/api/communications/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: "global", text: transcript.trim() })
      });
      toast.success("Voice message sent to Astra Connect!");
      setTranscript("");
      setIsOpen(false);
      navHash("/comm"); // Navigate to chat to see it
    } catch (err) {
      console.error(err);
      toast.error("Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button 
        onClick={toggleVoice}
        className={`fixed bottom-28 right-6 z-40 p-4 rounded-full shadow-xl shadow-cyan-900/50 transition-all ${isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse" : "bg-cyan-600 hover:bg-cyan-500"}`}
        aria-label="Talk to Astra Saarathi"
      >
        <Mic className="text-white" size={24} />
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-72 md:w-80 glass border-cyan-500/30 p-4 shadow-2xl rounded-2xl animate-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm">
              <Mic size={16} className={isRecording ? "text-red-400" : "text-cyan-400"} /> 
              {isRecording ? "Astra Saarathi is listening..." : "Astra Saarathi"}
            </h3>
            <button onClick={toggleVoice} className="text-slate-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
          
          <div className="bg-black/40 rounded-lg p-3 min-h-[80px] max-h-32 overflow-y-auto mb-3 text-sm text-slate-200 break-words">
            {transcript || <span className="text-slate-500 italic">Speak now...</span>}
          </div>

          {(turn.text || turn.error) && (
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3 mb-3 text-xs text-cyan-50 break-words">
              <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wide text-cyan-300">
                <Sparkles size={11} /> Astra · {turn.dashboard}
              </div>
              {turn.text && <p className="whitespace-pre-wrap">{turn.text}</p>}
              {turn.error && <p className="mt-1 text-amber-300">{turn.error}</p>}
              {turn.status !== "idle" && (
                <p className="mt-1 text-[10px] text-slate-400">
                  {turn.status === "thinking"
                    ? "Thinking…"
                    : turn.spoken
                      ? `Spoken via ${turn.provider}`
                      : "Text response delivered"}
                </p>
              )}
            </div>
          )}

          <select aria-label="Voice recognition language" value={speechLanguage} onChange={(e) => setSpeechLanguage(e.target.value)} className="mb-3 w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-xs text-slate-200">
            <option value="en-IN">English (India)</option>
            <option value="te-IN">తెలుగు</option>
            <option value="hi-IN">हिंदी</option>
            <option value="ta-IN">தமிழ்</option>
            <option value="kn-IN">ಕನ್ನಡ</option>
          </select>

          <div className="flex justify-between gap-2">
            {!isRecording ? (
              <button 
                onClick={() => dictation.start()} 
                className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs py-2 rounded-md transition-colors"
              >
                Restart Mic
              </button>
            ) : (
              <button 
                onClick={() => dictation.stop()} 
                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs py-2 rounded-md transition-colors"
              >
                Stop Listening
              </button>
            )}
            <button
              onClick={handleAskAstra}
              disabled={!transcript.trim() || isSending}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs py-2 rounded-md flex items-center justify-center gap-1 transition-colors"
            >
              {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Ask Astra
            </button>
            <button
              onClick={handleSendToConnect}
              disabled={!transcript.trim() || isSending}
              title="Send this transcript as a message to Astra Connect"
              className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-slate-200 text-xs py-2 px-2 rounded-md transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      )}
    </>
  );
}
