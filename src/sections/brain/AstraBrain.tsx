import React, { useEffect, useRef, useState } from "react";
import { Bookmark, Mic, Search } from "lucide-react";
import { navHash, useHashRoute } from "@/lib/hashRoute";
import { PluginCenter } from "@/sections/plugins/PluginCenter";
import AstraInternalBrowser from "@/sections/browser/AstraInternalBrowser";
import { AstraBrainInventory } from "@/sections/brain/AstraBrainInventory";
import { AstraBrainAgents } from "@/sections/brain/AstraBrainAgents";
import { askDoctorEngine, speakDoctorLine, type DoctorEngineAnswer, type DoctorEngineDraft, type EngineLabel } from "@/services/doctorEngine";
import { apiFetch } from "@/services/apiFetch";
import { startSaarathiListening } from "@/astra/voice/providers/sttPriority";
import { isHiddenFromDoctor } from "@/services/astraServices";
import { VOICE_STATE_VISUAL } from "@/astra/voice/safety/voiceSafety";
import { voiceSession } from "@/astra/voice/safety/voiceSession";
import { FREELLMAPI_ORIGIN } from "@/config/freeLlmEndpoint";

/** One page for Plugin Center and the Internal Browser. Search stays off patient text. */
/** Last confirmed listeners only. A snapshot, not a live port probe. */
const LIVE_NOW: { name: string; address: string; kind: "pm2" | "app" }[] = [
  { name: "FreeLLM", address: FREELLMAPI_ORIGIN, kind: "app" },
  { name: "Astra API", address: "127.0.0.1:3000", kind: "pm2" },
  { name: "Astra UI", address: "127.0.0.1:5173", kind: "pm2" },
  { name: "Hermes", address: "127.0.0.1:9119", kind: "pm2" },
  { name: "OpenClaw", address: "127.0.0.1:18789", kind: "pm2" },
  { name: "Voicebox", address: "127.0.0.1:17493", kind: "pm2" },
  { name: "Ollama", address: "127.0.0.1:11434", kind: "app" },
  { name: "OmniRoute", address: "127.0.0.1:20128", kind: "app" },
  { name: "Laya", address: "127.0.0.1:8791", kind: "app" },
];


const BRAIN_SURFACE = `
.astra-brain { height: 100%; min-height: 0; background: radial-gradient(circle at 15% 0%, #17365f 0%, #081526 42%, #050c16 100%); color: #e7f1ff; }
.astra-brain .ab-scroll { height: 100%; min-height: 0; overflow: auto; scroll-behavior: smooth; overscroll-behavior: contain; color: #e7f1ff; }
.astra-brain .ab-scroll :is(h1,h2,h3,p,span,li,label,strong) { color: #e7f1ff; font-weight: 600; }
.astra-brain .ab-card {
  background: linear-gradient(180deg, rgba(18, 42, 72, .96) 0%, rgba(8, 22, 39, .96) 100%);
  color: #e7f1ff;
  font-weight: 600;
  border: 1px solid #2a5b88;
  box-shadow: 0 10px 22px rgba(0, 0, 0, .28), inset 0 1px 0 rgba(142, 211, 255, .08);
}
.astra-brain .ab-card :is(h1,h2,h3,p,span,li,a,strong,label,div) {
  color: #e7f1ff;
  font-weight: 600;
}
.astra-brain .ab-btn {
  background: #102b4a;
  color: #e7f1ff;
  font-weight: 700;
  border: 1px solid #3b78a9;
  box-shadow: 0 6px 14px rgba(0, 0, 0, .25), 0 2px 0 #214f78;
  transition: transform 80ms ease, box-shadow 80ms ease;
}
.astra-brain .ab-btn[data-on="1"] {
  box-shadow: 0 6px 14px rgba(20, 50, 90, .1), 0 2px 0 #1a3a66, inset 0 0 0 2px #1a3a66;
}
.astra-brain .ab-btn:active:not(:disabled) { transform: translateY(2px); }
.astra-brain .ab-btn:disabled { opacity: .55; }
.astra-brain .ab-card > button.ab-card-hit,
.astra-brain .ab-card > button.ab-card-hit:active {
  background: transparent;
  border: 0;
  box-shadow: none;
  transform: none;
  color: #e7f1ff;
  font-weight: 700;
}
.astra-brain input::placeholder { color: #9db4cc; opacity: 1; }
.astra-brain section[aria-label="Plugin Center"], .astra-brain section[aria-label="Internal Browser"] { min-height: 0; }
`

const SKILL_NAMES = ["paper-lookup", "database-lookup", "scientific-writing", "clinical-reports", "treatment-plans", "pydicom", "biopython", "rdkit"];

function SideRail({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="shrink-0 flex flex-col border-black/20">
      <button type="button" className="ab-btn m-1 h-16 w-9 rounded-lg text-[10px]" style={{ writingMode: "vertical-rl" }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {title}
      </button>
      {open ? <div className="ab-card m-1 w-44 rounded-xl p-2 text-[11px] flex flex-col gap-1">{children}</div> : null}
    </aside>
  );
}


type GatewaySide = { listening: boolean; live: boolean; key: "set" | "missing"; detail: string; reason: string };

type RuntimeRow = { id: string; name: string; order: number; detail: string; status: string };

function RuntimePlayground({ onAsk }: { onAsk: (value: string) => void }) {
  const [rows, setRows] = useState<RuntimeRow[]>([]);
  const [probeAt, setProbeAt] = useState<string>("");
  const [running, setRunning] = useState<string>("");
  const [result, setResult] = useState("");

  async function probe(deep = false) {
    setRunning("probe");
    try {
      const [aiRes, layaRes] = await Promise.all([
        apiFetch("/api/health/ai", { headers: { Accept: "application/json" } }),
        apiFetch(deep ? "/api/services/laya/status?deep=1&budgetMs=120000" : "/api/services/laya/status", { headers: { Accept: "application/json" } }),
      ]);
      const ai = await aiRes.json().catch(() => ({})) as { services?: Record<string, { name?: string; reachable?: boolean; error?: string }> };
      const laya = await layaRes.json().catch(() => ({})) as { state?: string; detail?: string; endpoint?: string };
      const service = (id: string, fallback: string): RuntimeRow => {
        const item = ai.services?.[id];
        return { id, name: item?.name ?? fallback, order: 0, status: item?.reachable ? "LIVE" : "UNAVAILABLE", detail: item?.error ?? "real probe completed" };
      };
      const next = [
        service("freellmapi", "FreeLLMAPI"), service("astra", "Astra orchestration"), service("hermes", "Hermes planner"),
        service("langgraph", "LangGraph research"),
        { id: "laya", name: "Laya System-1", order: 0, status: laya.state === "RUNNING" || laya.state === "HEALTHY" ? "LIVE" : String(laya.state ?? "UNAVAILABLE"), detail: laya.detail ?? laya.endpoint ?? "real probe completed" },
        service("ollama", "Ollama local"),
      ].map((row, index) => ({ ...row, order: index + 1 }));
      setRows(next);
      setProbeAt(new Date().toLocaleTimeString());
    } finally { setRunning(""); }
  }

  async function hermesTest() {
    setRunning("hermes");
    try {
      const res = await apiFetch("/api/agents/hermes/test", { method: "POST", headers: { Accept: "application/json" } });
      const body = await res.json().catch(() => ({}));
      setResult(res.ok ? `Hermes test queued: ${body.task?.taskId ?? "accepted"}` : `Hermes test unavailable: HTTP ${res.status}`);
    } finally { setRunning(""); }
  }

  useEffect(() => { void probe(); }, []);
  return <section className="ab-card mx-3 mt-2 rounded-xl px-3 py-3" aria-label="Astra runtime order and playground">
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div><h2 className="text-xs uppercase tracking-wide">Astra runtime order & playground</h2><p className="text-[11px]">Each badge is from a live endpoint or an explicit unavailable result. Last probe: {probeAt || "—"}</p></div>
      <button type="button" className="ab-btn h-8 rounded-lg px-3 text-xs" onClick={() => void probe(true)} disabled={running === "probe"}>{running === "probe" ? "Probing models…" : "Refresh live health & test Laya"}</button>
    </div>
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
      {rows.map((row) => <div key={row.id} className="rounded-lg border border-[#2a5b88] bg-[#081a2d] px-2 py-2"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold">{row.order}. {row.name}</span><span className={`text-[10px] font-bold ${row.status === "LIVE" ? "text-emerald-300" : "text-amber-300"}`}>{row.status}</span></div><p className="text-[10px] mt-1 opacity-80">{row.detail}</p></div>)}
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="ab-btn h-8 rounded-lg px-3 text-xs" onClick={() => onAsk("Give a concise system-safe explanation of the current Astra runtime health.")}>Run Astra playground</button><button type="button" className="ab-btn h-8 rounded-lg px-3 text-xs" onClick={() => void hermesTest()} disabled={running === "hermes"}>{running === "hermes" ? "Testing Hermes…" : "Test Hermes planner"}</button><button type="button" className="ab-btn h-8 rounded-lg px-3 text-xs" onClick={() => onAsk("Run a safe planning-only test through the Astra clinical reasoning flow.")}>Test LangGraph flow</button></div>
    {result && <p className="mt-2 text-[11px] text-cyan-200">{result}</p>}
  </section>;
}

function GatewayLink() {
  const [freellm, setFreellm] = useState<GatewaySide | null>(null);
  const [omni, setOmni] = useState<GatewaySide | null>(null);
  const [platform, setPlatform] = useState("groq");
  const [secret, setSecret] = useState("");
  const [useFree, setUseFree] = useState(true);
  const [useOmni, setUseOmni] = useState(true);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const res = await apiFetch("/api/ai/gateway-link", { headers: { Accept: "application/json" } });
    if (res.status === 401) {
      setNote("Sign in to see whether FreeLLM and OmniRoute accepted their local keys.");
      return;
    }
    const data = await res.json().catch(() => ({})) as { freellm?: GatewaySide; omniroute?: GatewaySide; error?: string };
    setFreellm(data.freellm ?? null);
    setOmni(data.omniroute ?? null);
    if (!data.freellm && data.error) setNote(data.error);
  }

  useEffect(() => { void refresh(); }, []);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNote("");
    try {
      const res = await apiFetch("/api/ai/gateway-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ platform, apiKey: secret, freellm: useFree, omniroute: useOmni }),
      });
      const data = await res.json().catch(() => ({})) as {
        error?: string;
        freellm?: { ok: boolean; reason: string };
        omniroute?: { ok: boolean; reason: string };
      };
      const parts = [
        data.error,
        data.freellm ? `FreeLLM: ${data.freellm.ok ? data.freellm.reason : data.freellm.reason}` : "",
        data.omniroute ? `OmniRoute: ${data.omniroute.reason}` : "",
      ].filter(Boolean);
      setNote(parts.join(" ") || (res.ok ? "Connected." : `HTTP ${res.status}`));
    } finally {
      setSecret("");
      setSaving(false);
      void refresh();
    }
  }

  function line(name: string, side: GatewaySide | null) {
    if (!side) return name + ": not checked";
    const state = side.live ? "Live" : side.listening ? "Not live" : "Down";
    return name + ": " + state + ". Key " + side.key + ". " + (side.reason || side.detail);
  }

  return (
    <form className="ab-card mx-3 mt-2 rounded-xl px-3 py-2 text-xs flex flex-wrap items-end gap-2" onSubmit={(event) => void connect(event)}>
      <div className="min-w-[16rem] flex-1">
        <div>{line("FreeLLM", freellm)}</div>
        <div>{line("OmniRoute", omni)}</div>
        <p>A provider key typed here is stored in the local FreeLLM database and sent to the local OmniRoute API. It is not written into git.</p>
        {note && <p>{note}</p>}
      </div>
      <label className="flex flex-col gap-1">Provider
        <input value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Provider name" className="ab-card h-8 rounded px-2" />
      </label>
      <label className="flex flex-col gap-1">Provider key
        <input value={secret} onChange={(event) => setSecret(event.target.value)} type="password" autoComplete="off" aria-label="Provider API key" className="ab-card h-8 rounded px-2" />
      </label>
      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={useFree} onChange={(event) => setUseFree(event.target.checked)} /> FreeLLM</label>
      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={useOmni} onChange={(event) => setUseOmni(event.target.checked)} /> OmniRoute</label>
      <button type="submit" disabled={saving || !secret.trim()} className="ab-btn h-8 px-3 rounded-lg">Connect key</button>
    </form>
  );
}

export function AstraBrain() {
  const hash = useHashRoute();
  const params = new URLSearchParams(hash.split("?")[1] ?? "");
  const service = params.get("service");
  const initialService = service && !isHiddenFromDoctor(service) ? service : null;
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [engine, setEngine] = useState<EngineLabel | "">("");
  const [modelName, setModelName] = useState("");
  const [privacy, setPrivacy] = useState<"" | "local" | "not-local">("");
  const [drafts, setDrafts] = useState<DoctorEngineDraft[]>([]);
  const [speech, setSpeech] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState(VOICE_STATE_VISUAL.IDLE.label);
  const [silent, setSilent] = useState(false);
  const stopEar = useRef<(() => void) | null>(null);

  useEffect(() => voiceSession.subscribe(() => {
    const snap = voiceSession.snapshot();
    setVoiceLabel(VOICE_STATE_VISUAL[snap.state].label);
    setSilent(snap.silent);
  }), []);

  function showResult(result: DoctorEngineAnswer) {
    setEngine(result.engine);
    setModelName(result.model);
    setPrivacy(result.trace?.privacy ?? "");
    setDrafts(result.drafts);
    setAnswer(result.ok ? result.text : result.error || "No answer");
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setSpeech("");
    setDrafts([]);
    try {
      showResult(await askDoctorEngine({ text: trimmed }));
    } finally {
      setBusy(false);
    }
  }

  async function sayAnswer(text: string, patient: boolean) {
    const spokenBy = await speakDoctorLine(text, patient);
    if (spokenBy === "none") {
      setSpeech(patient
        ? "Not spoken. This patient-looking line stayed on Voicebox, and Voicebox did not finish."
        : "Not spoken. SARVAM_API_KEY is missing. GEMINI_API_KEY is missing. OpenAI did not speak. Voicebox did not finish in time.");
      return;
    }
    setSpeech(patient
      ? "Spoken by " + spokenBy + ". Patient-looking line stayed on Voicebox only."
      : "Spoken by " + spokenBy + ". Order: Sarvam, then Gemini, then OpenAI, then Voicebox.");
  }

  async function toggleVoice() {
    if (listening && stopEar.current) {
      stopEar.current();
      return;
    }
    setSpeech("Hearing with Voicebox. SARVAM_API_KEY is missing. GEMINI_API_KEY is missing. This repo has no Sarvam, Gemini, or OpenAI speech-to-text route, so the recording stays on this PC.");
    const ear = startSaarathiListening({
      preferredLanguage: "auto",
      manual: true,
      maxDurationMs: 12000,
      allowBrowserFallback: false,
    });
    stopEar.current = ear.stop;
    setListening(true);
    const heard = await ear.promise;
    stopEar.current = null;
    setListening(false);
    if (!heard.ok || !heard.text) {
      setAnswer(heard.error === "silence" ? "Voicebox heard silence." : (heard.error || "Voicebox heard nothing"));
      setEngine("");
      setModelName("");
      setPrivacy("");
      setDrafts([]);
      return;
    }
    setQuery(heard.text);
    setBusy(true);
    setDrafts([]);
    try {
      const result = await askDoctorEngine({ text: heard.text });
      showResult(result);
      if (result.ok && result.text) await sayAnswer(result.text, result.localOnly);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="astra-brain h-full min-h-0 flex flex-col overflow-hidden">
      <style>{BRAIN_SURFACE}</style>
      <header className="ab-card mx-3 mt-3 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Astra Brain</h1>
          <p className="text-xs">Plugin Center and Internal Browser side by side. Search stays on this PC. Patient text stays on local Ollama.</p>
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void ask(query); }}>
          <div className="ab-card relative rounded-xl">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Astra Brain non-patient search" placeholder="Non-patient question only." className="w-64 pl-9 pr-3 py-2 rounded-xl bg-transparent text-sm font-semibold border-0 outline-none" />
          </div>
          <button type="submit" disabled={busy} className="ab-btn h-10 px-3 rounded-lg text-xs">Search</button>
          <button type="button" onClick={() => void toggleVoice()} disabled={busy && !listening} className="ab-btn h-10 px-3 rounded-lg text-xs inline-flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5" /> {listening ? "Stop" : "Voice"}
          </button>
        </form>
      </header>
      {(engine || answer || speech || privacy || drafts.length > 0) && (
        <div className="ab-card mx-3 mt-2 rounded-xl px-3 py-2 text-xs">
          {privacy && <div>Privacy: {privacy === "local" ? "local. This turn stayed on this PC. Ollama only." : "not local. Non-patient text tries FreeLLM, then OmniRoute, then Ollama."}</div>}
          {engine && <div>Answered by {engine}{modelName ? ` (${modelName})` : ""}</div>}
          {drafts.map((draft, index) => (
            <p key={draft.agentId + ":" + index} className="mt-1 whitespace-pre-wrap">
              {draft.localOnly ? "On this PC." : "Evidence lookup is not only on this PC."} {draft.note}
            </p>
          ))}
          {speech && <div>Speech: {speech.startsWith("Voicebox") ? "Voicebox" : speech}</div>}
          {answer && <p className="mt-1 whitespace-pre-wrap">{answer}</p>}
        </div>
      )}
      <GatewayLink />
      <RuntimePlayground onAsk={(text) => { setQuery(text); void ask(text); }} />
      <div className="flex-1 min-h-0 flex mt-2">
        <SideRail title="Voice">
          <p>State: {voiceLabel}</p>
          <button type="button" className="ab-btn h-8 rounded-lg" onClick={() => voiceSession.requestStart()}>Start</button>
          <button type="button" className="ab-btn h-8 rounded-lg" onClick={() => voiceSession.pause()}>Pause</button>
          <button type="button" className="ab-btn h-8 rounded-lg" onClick={() => voiceSession.resume()}>Resume</button>
          <button type="button" className="ab-btn h-8 rounded-lg" onClick={() => voiceSession.hardStop({ reason: "button-stop", replyOkay: true })}>Stop</button>
          <button type="button" className="ab-btn h-8 rounded-lg" onClick={() => voiceSession.setSilent(!silent)}>{silent ? "Sound" : "Silent"}</button>
        </SideRail>
        <div className="flex-1 min-w-0 flex flex-col min-h-0 px-1">
          <button type="button" className="ab-btn mb-2 h-8 rounded-lg text-xs" onClick={() => setInventoryOpen((v) => !v)} aria-expanded={inventoryOpen}>
            {inventoryOpen ? "Hide inventory A-F and agents" : "Inventory A-F and agents"}
          </button>
          {inventoryOpen ? (
            <div className="max-h-[32vh] overflow-auto mb-2 pr-1">
              <AstraBrainInventory />
              <AstraBrainAgents />
            </div>
          ) : null}
          <div className="flex-1 min-h-0 grid min-w-0" style={{ gridTemplateColumns: "minmax(0,1fr) 1.25rem minmax(0,1fr)" }}>
            <section aria-label="Plugin Center" className="min-h-0 min-w-0 overflow-hidden">
              <PluginCenter />
            </section>
            <div className="flex flex-col items-center" aria-hidden="true">
              <Bookmark className="w-3.5 h-3.5 mt-1" />
              <div className="w-px flex-1 my-1" style={{ background: "#1a3a66" }} />
            </div>
            <section aria-label="Internal Browser" className="min-h-0 min-w-0 overflow-hidden">
              <AstraInternalBrowser initialService={initialService} initialUrl={params.get("url")} initialPath={params.get("path")} />
            </section>
          </div>
        </div>
        <SideRail title="Skills">
          <p>Registered names only. Not a health check.</p>
          {SKILL_NAMES.map((name) => <span key={name} className="ab-card rounded px-1 py-0.5">{name}</span>)}
        </SideRail>
      </div>
    </div>
  );
}
