import { useEffect, useState, useRef } from "react";
import { Mic, MicOff, Settings2, Send, Globe, Moon, Sun } from "lucide-react";
import { getVoiceboxEngine, VoicePersona, SupportedLanguage } from "@/voice/VoiceboxEngine";

/**
 * SanjeevaniOverlay – main UI overlay for the voice assistant.
 * Provides:
 *  • Persistent mic button to start/stop voice capture.
 *  • Status indicator (READY, LISTENING, PROCESSING).
 *  • Optional patient context card (basic demographics).
 *  • Transcript view with live updates.
 *  • Simple send button for text fallback.
 */
export function SanjeevaniOverlay({
  onClose,
  initialPatientId,
}: {
  onClose: () => void;
  initialPatientId?: string;
}) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    actions: Array<{ toolId: string }>;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [messages, setMessages] = useState<Array<{from: 'user' | 'assistant'; text: string}>>([]);
  const [patient, setPatient] = useState<any>(null);
  const [language, setLanguage] = useState<SupportedLanguage>(SupportedLanguage.ENGLISH);
  const [persona, setPersona] = useState<VoicePersona>(VoicePersona.DR_ARJUN);
  const micRef = useRef<any>(null);

  // Load patient context if an ID is provided
  useEffect(() => {
    if (initialPatientId) {
      // Use ToolRegistry to fetch patient – placeholder async call
      (async () => {
        try {
          const { ToolRegistry } = await import("@/agents/core/ToolRegistry");
          const p = await ToolRegistry.execute("getPatient", { query: initialPatientId });
          setPatient(p);
        } catch (e) {
          console.error("Failed to load patient", e);
        }
      })();
    }
  }, [initialPatientId]);

  // Start / stop voice session using VoiceboxEngine
  const toggleListening = async () => {
    const engine = getVoiceboxEngine();
    if (!listening) {
      setListening(true);
      try {
        const session = engine.startSession("user1", "doctor", language, persona); // userId & role are placeholders
        micRef.current = session.id;
        // Hook to VoiceboxEngine events for real transcription
        (engine as any).on?.("transcript", (text: string) => {
          setTranscript(text);
        });
      } catch (e) {
        console.error(e);
        setListening(false);
      }
    } else {
      setListening(false);
      setProcessing(true);
      // End session and get final transcript
      const engine = getVoiceboxEngine();
      const finalText = transcript.trim();
      setMessages((msg) => [...msg, { from: "user", text: finalText }]);
      setTranscript("");
      // Send to reasoning tool
      try {
        const { ToolRegistry } = await import("@/agents/core/ToolRegistry");
        const result = await ToolRegistry.execute("runSanjeevaniReasoning", { text: finalText, patientId: patient?.uhid });
        const assistantMsg = `Summary: ${result.summary}\nDifferential: ${result.differential?.join(", ") || "-"}\nRecommendations: ${result.recommendations?.join(", ") || "-"}`;
        setMessages((msg) => [...msg, { from: "assistant", text: assistantMsg }]);
      } catch (e) {
        console.error(e);
        setMessages((msg) => [...msg, { from: "assistant", text: "Error running reasoning" }]);
      } finally {
        setProcessing(false);
      }
    }
  };

  const sendText = async () => {
    if (!transcript) return;
    const text = transcript.trim();
    setMessages((msg) => [...msg, { from: "user", text }]);
    setTranscript("");
    // Invoke Sanjeevani reasoning tool
    setProcessing(true);
    try {
      const { ToolRegistry } = await import("@/agents/core/ToolRegistry");
      const result = await ToolRegistry.execute("runSanjeevaniReasoning", { text, patientId: patient?.uhid });
      const assistantMsg = `Summary: ${result.summary}\nDifferential: ${result.differential?.join(", ") || "-"}\nRecommendations: ${result.recommendations?.join(", ") || "-"}`;
      // Check for write actions in rawResult
      if (result.rawResult?.requiresConfirmation) {
        setConfirmation({
          actions: result.rawResult.actions,
          onConfirm: async () => {
            try {
              await ToolRegistry.execute("confirmSanjeevaniActions", {
                actions: result.rawResult.actions,
                patientId: patient?.uhid,
              });
              setMessages((msg) => [...msg, {
                from: "assistant",
                text: "Actions confirmed and executed.",
              }]);
            } catch (e) {
              console.error(e);
              setMessages((msg) => [...msg, {
                from: "assistant",
                text: "Error confirming actions.",
              }]);
            }
          },
          onCancel: () => {
            setMessages((msg) => [...msg, {
              from: "assistant",
              text: "Actions cancelled.",
            }]);
          },
        });
      } else {
        setMessages((msg) => [...msg, {
          from: "assistant",
          text: assistantMsg,
        }]);
      }
    } catch (e) {
      console.error(e);
      setMessages((msg) => [...msg, {
        from: "assistant",
        text: "Error running reasoning",
      }]);
    } finally {
      setProcessing(false);
    }
  };


  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
      <div className="bg-slate-900 rounded-xl w-full max-w-2xl mx-4 p-4 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">SANJEEVANI AI – Voice Assistant</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span>Status:</span>
          <span className={listening ? "text-emerald-400" : processing ? "text-yellow-400" : "text-gray-500"}>
            {listening ? "LISTENING" : processing ? "PROCESSING" : "READY"}
          </span>
          <span className="mx-2">|</span>
          <span>Lang:</span>
          <select
            value={language}
            onChange={(e) => {
              const lang = e.target.value as SupportedLanguage;
              setLanguage(lang);
            }}
            className="bg-slate-700 text-slate-100 rounded px-1 py-0.5 text-xs"
          >
            {[SupportedLanguage.ENGLISH, SupportedLanguage.TELUGU, SupportedLanguage.HINDI, SupportedLanguage.TAMIL, SupportedLanguage.KANNADA].map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <span className="mx-2">|</span>
          <div className="flex items-center gap-1">
            <span>Persona:</span>
            <div className="flex gap-1">
              {[VoicePersona.DR_ARJUN, VoicePersona.DR_PRIYA, VoicePersona.RECEPTION_GUIDE].map((p) => (
                <button
                  key={p}
                  onClick={() => setPersona(p)}
                  className={`px-2 py-0.5 rounded text-xs ${persona === p ? "bg-emerald-600 text-white" : "bg-slate-600 text-slate-200 hover:bg-slate-500"}`}
                >
                  {p === VoicePersona.DR_ARJUN ? "Dr. Arjun" : p === VoicePersona.DR_PRIYA ? "Dr. Priya" : "Reception"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Patient context card */}
        {patient && (
          <div className="border border-slate-700 rounded p-3 text-xs text-slate-200">
            <div className="font-medium">Patient</div>
            <div>Name: {patient.name}</div>
            <div>UHID: {patient.uhid}</div>
            <div>Age/Gender: {patient.age ?? "-"}/{patient.gender ?? "-"}</div>
          </div>
        )}

        {/* Transcript / conversation view */}
        <div className="flex-1 overflow-y-auto p-2 bg-slate-800 rounded">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`mb-2 max-w-[80%] ${m.from === "user" ? "ml-auto" : "mr-auto"} p-2 rounded ${
                m.from === "user" ? "bg-sky-600 text-white" : "bg-slate-700 text-slate-100"
              }`}
            >
              {m.text}
            </div>
          ))}
          {listening && (
            <div className="italic text-slate-400">{transcript}<span className="animate-pulse">|</span></div>
          )}
        </div>

        {/* Input bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleListening}
            className={`p-2 rounded ${listening ? "bg-red-600" : "bg-emerald-600"}`}
            title={listening ? "Stop listening" : "Start listening"}
          >
            {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <input
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Type or speak…"
            className="flex-1 bg-slate-700 text-slate-100 rounded px-2 py-1 focus:outline-none"
            disabled={processing}
          />
          <button
            onClick={sendText}
            disabled={!transcript || processing}
            className="p-2 bg-slate-600 rounded disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              // Open settings placeholder – could launch a small drawer
            }}
            className="p-2 text-slate-400 hover:text-slate-200"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default SanjeevaniOverlay;
