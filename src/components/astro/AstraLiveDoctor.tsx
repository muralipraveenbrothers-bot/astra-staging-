/**
 * ASTRA AI — Live Doctor avatar panel (Phase 2 §14 / §15 / §16)
 * ============================================================
 * Native Astra panel (additive — the hospital dashboard is untouched).
 * Connects to Astra's /ws/avatar gateway (browser → Astra → AI gateway →
 * TTS → A2F). States are driven purely by server events. Microphone audio is
 * captured on demand, sent as base64, and never persisted locally. A2F is
 * optional: with it offline the panel degrades to text + speech without it.
 */
import { useCallback, useRef, useState } from "react";
import { Activity, Mic, MicOff, Send, Square, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveDoctor, type WsResponseEvent } from "@/lib/useLiveDoctor";

const LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "kn-IN", label: "ಕನ್ನಡ" },
  { code: "mr-IN", label: "मराठी" },
];

const MODES = [
  { id: "doctor", label: "AI Doctor" },
  { id: "receptionist", label: "Receptionist" },
  { id: "patient_educator", label: "Patient Education" },
  { id: "clinical_copilot", label: "Clinical Assistant" },
  { id: "emergency", label: "Emergency" },
] as const;

const STATE_COLOR: Record<string, string> = {
  READY: "text-emerald-400",
  LISTENING: "text-cyan-400",
  TRANSCRIBING: "text-amber-400",
  THINKING: "text-amber-400",
  SPEAKING: "text-emerald-400",
  INTERRUPTED: "text-amber-400",
  DEGRADED: "text-orange-400",
  ERROR: "text-red-400",
  CONNECTING: "text-cyan-400",
  OFFLINE: "text-slate-400",
};

export interface AstraLiveDoctorProps {
  patientName?: string;
  patientContext?: { uhid?: string; name?: string; summary?: string };
}
export function AstraLiveDoctor({ patientName = "", patientContext }: AstraLiveDoctorProps) {
  const [language, setLanguage] = useState("en-IN");
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("doctor");
  const [input, setInput] = useState("");
  const [lastResponse, setLastResponse] = useState<WsResponseEvent | null>(null);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const onResponse = useCallback((r: WsResponseEvent) => setLastResponse(r), []);
  const ld = useLiveDoctor({ onResponse });

  const toggleMic = useCallback(async () => {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = String(reader.result ?? "").split(",")[1] ?? "";
          if (b64) ld.sendAudioBase64(b64, rec.mimeType || "audio/webm", language);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [recording, language, ld]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    ld.sendText(text, language);
    setInput("");
  }, [input, language, ld]);

  const aiReady = ld.caps?.ai?.some((p) => p.ready) ?? false;
  const voiceReady = ld.caps?.voice?.providers?.some((p) => p.ready) ?? false;
  const avatarReady = ld.caps?.avatar?.providers?.some((p) => p.ready) ?? false;
  void patientContext;
  void mode;
  return (
    <div className="flex h-full w-full flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-slate-100 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-cyan-400" />
          ASTRA LIVE DOCTOR
          {ld.connected ? <span className="ml-1 flex items-center gap-1 text-[10px] text-emerald-400"><Wifi className="h-3 w-3" />LIVE</span> : <span className="ml-1 flex items-center gap-1 text-[10px] text-slate-500"><WifiOff className="h-3 w-3" />OFFLINE</span>}
        </h2>
        <button
          onClick={() => (ld.connected ? ld.disconnect() : ld.connect())}
          className={cn("rounded-lg px-3 py-1 text-xs font-medium transition", ld.connected ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-cyan-600 text-white hover:bg-cyan-500")}
        >
          {ld.connected ? "Disconnect" : "Connect"}
        </button>
      </div>

      {/* Avatar viewport */}
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900">
        <div className="text-center">
          <div className="mx-auto mb-2 h-16 w-16 rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 ring-1 ring-cyan-400/30" />
          <p className="text-xs font-medium text-slate-300">{patientName || "Astra AI Doctor"}</p>
          <p className={cn("mt-1 text-[11px] tracking-wide", STATE_COLOR[ld.state] ?? "text-slate-400")}>
            {ld.state} {ld.provider ? `· ${ld.provider}` : ""}
          </p>
          {ld.avatarStatus === "streaming" && <p className="mt-1 text-[10px] text-emerald-400">● Avatar streaming (A2F blendshapes)</p>}
        </div>
      </div>
      {/* Controls */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex items-center gap-2 rounded-lg bg-slate-900 px-2 py-1.5">
          <span className="text-slate-400">Language</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="flex-1 bg-transparent text-slate-100 outline-none">
            <option value="auto">Auto</option>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-lg bg-slate-900 px-2 py-1.5">
          <span className="text-slate-400">Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="flex-1 bg-transparent text-slate-100 outline-none">
            {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void toggleMic()}
          className={cn("flex h-10 w-10 items-center justify-center rounded-full transition", recording ? "bg-red-600 text-white" : "bg-cyan-600 text-white hover:bg-cyan-500")}
          title={recording ? "Stop mic" : "Start mic"}
        >
          {recording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          onClick={ld.sendInterrupt}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700"
          title="Stop / Barge-in"
        >
          <Square className="h-4 w-4" />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={patientName ? `Ask about ${patientName}…` : "Type your question…"}
          className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm outline-none ring-cyan-500/30 placeholder:text-slate-500 focus:ring-1"
        />
        <button onClick={submit} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700" title="Send">
          <Send className="h-4 w-4" />
        </button>
      </div>
      {/* Transcript + response */}
      {ld.transcript && <p className="text-xs text-slate-400"><span className="text-slate-500">You:</span> {ld.transcript}</p>}
      {lastResponse && (
        <div className={cn("flex-1 overflow-y-auto rounded-lg border p-3 text-xs leading-relaxed", lastResponse.urgency === "emergency" ? "border-red-800/60 bg-red-950/40" : "border-slate-800 bg-slate-900/60")}>
          {lastResponse.urgency === "emergency" && <p className="mb-1 font-semibold text-red-400">⚠ EMERGENCY — seek immediate clinical care / escalation</p>}
          <p className="text-slate-200">{lastResponse.answer}</p>
          {lastResponse.redFlags?.length ? (
            <ul className="mt-2 list-disc pl-4 text-amber-400">
              {lastResponse.redFlags.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          ) : null}
          {lastResponse.uncertainty && <p className="mt-2 text-slate-500">Uncertainty: {lastResponse.uncertainty}</p>}
        </div>
      )}

      {/* Status dots — driven by live capabilities, never hard-coded */}
      <div className="flex items-center gap-4 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
        <StatusDot label="AI" on={aiReady} />
        <StatusDot label="Voice" on={voiceReady} />
        <StatusDot label="Avatar" on={avatarReady} />
        <span className="ml-auto">{ld.avatarStatus === "streaming" ? "Avatar streaming" : ld.connected ? "Avatar idle" : "Offline fallback"}</span>
      </div>
    </div>
  );
}

function StatusDot({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-emerald-400" : "bg-slate-600")} />
      {label} {on ? "· CONNECTED" : "· OFFLINE"}
    </span>
  );
}
