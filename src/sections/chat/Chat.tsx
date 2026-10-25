import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Languages,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { AvatarOrb } from "@/components/AvatarOrb";
import { Badge } from "@/components/ui";
import { CommandTray, useCommandRunner } from "./CommandConsole";
import { SmartContextPanel, detectContextMode, type ContextMode } from "./SmartContextPanel";
import { streamChat, type ChatTurn } from "@/lib/llm";
import { askDoctorEngine } from "@/services/doctorEngine";
import { useStore } from "@/lib/store";
import { useAuth, type Role } from "@/lib/auth";
import { cn, sleep, uid } from "@/lib/utils";
import { detectLang, getLang, t, useLang, type Lang, type StringKey } from "@/lib/i18n";
import { understandCommand, suggestsFor, type CommandOutcome } from "@/lib/commandEngine";
import { knowledgeContextFor } from "@/lib/knowledge/graph";
import { knowledgeSearch, type SearchHit } from "@/lib/knowledge/connectors";
import {
  clearConversation,
  CONFIRM_WORDS,
  contextFromOutcome,
  loadConversation,
  normaliseForEngine,
  resolveFollowUp,
  saveConversation,
  systemContextFor,
  takePrompt,
  type ConversationContext,
} from "@/lib/conversation";
import { openerFor } from "@/lib/voiceSpeech";
import { useLocalVoice } from "@/lib/speech";
import { useVoiceboxStatus } from "@/lib/voicebox";
import type { ChatMessage } from "@/lib/types";
import { Columns } from "lucide-react";

/* ---------------- model selector → real provider mapping ---------------- */
interface ModelOption {
  id: string;
  labelKey: StringKey;
  provider: "freellmapi" | "ollama";
  model: string;
}

const modelOptions: ModelOption[] = [
  { id: "auto", labelKey: "model_auto", provider: "freellmapi", model: "auto" },
  { id: "llama3.2:3b", labelKey: "model_llama", provider: "ollama", model: "llama3.2:3b" },
  { id: "qwen3:14b", labelKey: "model_qwen", provider: "ollama", model: "qwen3:14b" },
  { id: "fusion", labelKey: "model_fusion", provider: "freellmapi", model: "fusion" },
];

const SYSTEM_PROMPT = [
  "You are Astra, the AI operations co-pilot of a mid-size hospital.",
  "Persona: concise, calm, ops-focused. Answer in short paragraphs or tight bullet lists.",
  "You help the duty doctor/CEO with census, billing/collections, staffing & attendance,",
  "patient flow, and alerts. When asked about clinical topics, give decision-support style",
  "answers and always note that physician judgment is required. Never invent patient data;",
  "if you lack live data, say so and suggest which Astra module to check.",
].join(" ");

function cannedReply(q: string, lang: Lang): string {
  const s = q.toLowerCase();
  if (s.includes("wait") || s.includes("queue")) return t(lang, "reply_wait");
  if (s.includes("bill") || s.includes("collection") || s.includes("revenue")) return t(lang, "reply_billing");
  if (s.includes("staff") || s.includes("attendance")) return t(lang, "reply_staff");
  if (s.includes("census") || s.includes("bed") || s.includes("ward")) return t(lang, "reply_census");
  return t(lang, "reply_default");
}

const STOP_WORDS = /^(stop|halt|silence|ఆపండి|रुको|बंद करो)\b.*$/i;
const CONTINUE_WORDS = /^(continue|resume|carry on|కంటిన్యూ|అక్కడి నుంచి|जारी रखें)\b.*$/i;
const CANCEL_WORDS = /^(cancel|no|never mind|don'?t|no thanks|వద్దు|नहीं)\b.*$/i;

function langForText(text: string): Lang {
  return detectLang(text) ?? getLang();
}

function spokenCommand(o: CommandOutcome): string {
  if (!o.allowed) return `${openerFor("denied")}${o.deniedReason ?? "This action is not permitted for your role."}`;
  if (o.requiresConfirm && !o.confirmed) return `${openerFor("confirm")}${o.title}. Please confirm, or say cancel.`;
  const kind = o.level === "info" ? "info" : "action";
  const first = o.lines[0] ?? "";
  return `${openerFor(kind)}${o.title}. ${first}`;
}

export function Chat() {
  const { settings, services, setBrainState } = useStore();
  const { account } = useAuth();
  const [lang, setLang] = useLang();
  const runner = useCommandRunner();
  const vb = useVoiceboxStatus();
  const voice = useLocalVoice(vb.status);
  const [showContext, setShowContext] = useState(true);
  const [contextMode, setContextMode] = useState<ContextMode>("default");

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m-0",
      role: "assistant",
      content: t(getLang(), "greeting"),
      servedBy: t(getLang(), "readyServedBy"),
    },
  ]);
  const [input, setInput] = useState("");
  const [modelId, setModelId] = useState("auto");
  const [fusion, setFusion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fusionPhase, setFusionPhase] = useState<string[]>([]);
  const [convMode, setConvMode] = useState(false);
  const [session, setSession] = useState<ConversationContext>(loadConversation);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserRef = useRef("");
  const busyRef = useRef(false);
  const sessionRef = useRef(session);
  const voicePendingRef = useRef(false);

  busyRef.current = busy;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, fusionPhase, voice.speaking]);

  useEffect(() => {
    setMessages((p) =>
      p.map((m) =>
        m.id === "m-0" ? { ...m, content: t(lang, "greeting"), servedBy: t(lang, "readyServedBy") } : m
      )
    );
  }, [lang]);

  const optionFor = (id: string): ModelOption => modelOptions.find((m) => m.id === id) ?? modelOptions[0];

  const patchMessage = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const updateSession = useCallback((patch: Partial<ConversationContext>) => {
    const next = { ...sessionRef.current, ...patch };
    sessionRef.current = next;
    saveConversation(next);
    setSession(next);
  }, []);

  const say = async (text: string, msgLang: Lang, msgId?: string) => {
    if (!voice.canUseTts) return;
    if (msgId) {
      setSpeakingMsgId(msgId);
      patchLit(msgId, true);
    }
    await voice.speak(text, msgLang);
    if (msgId) {
      patchLit(msgId, false);
      setSpeakingMsgId(undefined);
    }
  };

  function patchLit(id: string, speaking: boolean) {
    setMessages((p) => p.map((m) => (m.id === id ? { ...m, speaking } : m)));
  }

  const stopEverything = (reason: "stop" | "mute") => {
    abortRef.current?.abort();
    setBrainState("idle");
    setBusy(false);
    voice.stopSpeaking(false);
    if (reason === "stop") {
      toast("Stopped", { description: "Streaming and speech halted. Say 'continue' to resume where I left off." });
    }
    if (speakingMsgId) patchLit(speakingMsgId, false);
  };

  /** true when this turn came from the microphone: the answer must be SPOKEN
   *  even when conversation mode is off (voice in → voice out contract). */
  const voiceTurnRef = useRef(false);

  /** @returns true when the text hit the offline command engine (bubble added). */
  const handleCommand = (raw: string): boolean => {
    const norm = normaliseForEngine(raw);
    if (!understandCommand(norm)) return false;
    const outcome = runner.run(norm);
    if (!outcome) return false;
    const text = [outcome.title, ...outcome.lines].join("\n");
    const id = uid("m");
    setMessages((p) => [...p, { id, role: "assistant", content: text, cmd: outcome, servedBy: "command engine · executed offline" }]);
    const mem = contextFromOutcome(outcome.title, outcome.lines);
    if (mem.patientUhid || mem.department || mem.lastTopic) updateSession(mem);
    const spoken = spokenCommand(outcome);
    if (!outcome.requiresConfirm || outcome.confirmed) {
      void say(spoken, "en", id);
    } else {
      voice.stopSpeaking(false);
    }
    return true;
  };

  const simulateReply = async (userText: string, replaceId?: string) => {
    setBusy(true);
    setBrainState("thinking");
    const effLang = detectLang(userText) ?? lang;
    const full = cannedReply(userText, effLang);
    const id = replaceId ?? uid("m");
    patchMessage(id, { error: false, simOffer: false, content: "", servedBy: undefined, live: false });
    for (let i = 0; i < full.length; i += 4) {
      await sleep(16);
      patchMessage(id, { content: full.slice(0, i + 4) });
    }
    patchMessage(id, { servedBy: t(effLang, "simServedBy") + (effLang !== lang ? ` · auto-${effLang}` : "") });
    setBrainState("idle");
    setBusy(false);
    if (convMode && voice.canUseTts) void voice.speak(full, effLang);
  };

  const llmSend = async (q: string) => {
    setBusy(true);
    setBrainState("thinking");
    const opt = optionFor(fusion ? "fusion" : modelId);
    const bubbleId = uid("m");
    const effLang = detectLang(q) ?? lang;

    if (opt.provider === "freellmapi") {
      setMessages((p) => [...p, { id: bubbleId, role: "assistant", content: "" }]);
      const result = await askDoctorEngine({ text: q });
      patchMessage(bubbleId, {
        content: result.ok ? result.text : (result.error || "FreeLLM, OmniRoute, and Ollama did not answer"),
        error: !result.ok,
        live: result.ok,
        servedBy: result.ok ? "gateway " + result.engine : "gateway did not answer",
      });
      setBrainState("idle");
      setBusy(false);
      if (result.ok && (convMode || voiceTurnRef.current) && voice.canUseTts && result.text) void say(result.text, effLang, bubbleId);
      return;
    }

    if (opt.model === "fusion") setFusionPhase(["llama3.2:3b", "qwen3:14b", "fusion-synthesizer"]);
    setMessages((p) => [...p, { id: bubbleId, role: "assistant", content: "", fusion: opt.model === "fusion" }]);

    const sysCtx = systemContextFor(sessionRef.current);
    const knowledgeCtx = knowledgeContextFor();
    const hits: SearchHit[] = await knowledgeSearch(q, 8).catch(() => []);
    const citations = hits.map((h) => ({
      subject: h.subject, relation: h.relation, object: h.object, evidence: h.evidence, docRef: h.docRef, tier: h.tier ?? "C", confidence: h.confidence, _score: h._score,
    }));
    const evidenceBlock =
      hits.length > 0
        ? `\n\n[RETRIEVED EVIDENCE — cite these, never invent others]\n${hits
            .map((h, i) => `${i + 1}. ${h.subject} ${h.relation} ${h.object} (tier ${h.tier}, confidence ${h.confidence}, score ${h._score}) — ${h.evidence.slice(0, 200)} — source: ${h.docRef}`)
            .join("\n")}`
        : "\n\n[RETRIEVED EVIDENCE — none found in the knowledge store. If you answer clinically, say: \"Insufficient verified evidence in Astra knowledge fabric.\"]";
    const history: ChatTurn[] = [
      { role: "system", content: `${sysCtx ? `${SYSTEM_PROMPT} ${sysCtx}` : SYSTEM_PROMPT}\n\n[VERIFIED KNOWLEDGE FABRIC]\n${knowledgeCtx}${evidenceBlock}` },
      ...messages
        .filter((m) => !m.error && m.content && !m.cmd)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }) as ChatTurn),
      { role: "user", content: q },
    ];

    abortRef.current = new AbortController();
    let full = "";
    try {
      const result = await streamChat({
        provider: opt.provider,
        baseUrl: settings.ollamaUrl,
        apiKey: settings.freellmApiKey,
        model: opt.model,
        messages: history,
        signal: abortRef.current.signal,
        language: effLang,
        onToken: (tok) => {
          full += tok;
          setMessages((p) => p.map((m) => (m.id === bubbleId ? { ...m, content: full } : m)));
        },
      });
      setFusionPhase([]);
      patchMessage(bubbleId, {
        live: true,
        citations: citations.length ? citations : undefined,
        servedBy: `${opt.provider} · ${opt.model} · ${result.firstTokenMs}ms ttft · ${result.totalMs}ms total · live${effLang !== lang ? ` · auto-${effLang}` : ""}`,
      });
      updateSession({ lastTopic: q.slice(0, 120) });
      if ((convMode || voiceTurnRef.current) && voice.canUseTts && full) void say(full, effLang, bubbleId);
    } catch (e) {
      setFusionPhase([]);
      const errText = e instanceof Error ? e.message : String(e);
      patchMessage(bubbleId, {
        error: true,
        simOffer: true,
        content: `${errText}\n\n${t(effLang, "errorHint")} ${opt.provider === "ollama" ? t(effLang, "errorOllama") : t(effLang, "errorFreellm")
          }`,
      });
    }
    setBrainState("idle");
    setBusy(false);
  };

  const send = async (raw: string, opts?: { fromVoice?: boolean }) => {
    const q = raw.trim();
    if (!q || busyRef.current) return;
    const lower = q.toLowerCase();

    if (STOP_WORDS.test(lower)) {
      stopEverything("stop");
      return;
    }
    if (CONTINUE_WORDS.test(lower)) {
      if (voice.interruptedRemainder) {
        voice.resumeSpeaking();
        return;
      }
      setMessages((p) => [
        ...p,
        { id: uid("m"), role: "user", content: q },
        { id: uid("m"), role: "assistant", content: "Nothing to resume — I wasn't interrupted. What would you like next?" },
      ]);
      return;
    }
    if (runner.pending) {
      if (CONFIRM_WORDS.test(lower)) {
        runner.confirmPending();
        return;
      }
      if (CANCEL_WORDS.test(lower)) {
        runner.cancelPending();
        return;
      }
    }

    lastUserRef.current = q;
    voiceTurnRef.current = opts?.fromVoice === true;
    setMessages((p) => [...p, { id: uid("m"), role: "user", content: q }]);
    setInput("");

    // Update smart context panel based on the query
    setContextMode(detectContextMode(q, sessionRef.current));

    const fup = resolveFollowUp(q, sessionRef.current);
    const effQ = fup.text !== q ? fup.text : q;

    // Track last order/test for contextual follow-ups
    const orderMatch = effQ.match(/\b(cbc|lft|rft|platelet|blood|urine|esr|crp|x-?ray|usg|ultrasound|ct|mri|ecg|echo|troponin|d-dimer|electrolyte|lipid|thyroid|hba1c|sugar|amylase|lipase|bilirubin|sgpt|sgot|creatinine|urea|sodium|potassium|blood culture|dengue|malaria|widal|pt\/inr|aptt|blood group|cross match)\b/i);
    if (orderMatch) {
      updateSession({ lastOrder: orderMatch[1].toUpperCase() });
    }

    if (handleCommand(effQ)) return;
    await llmSend(effQ);
    updateSession({ lastIntent: undefined });
  };

  /* ---------- voice wiring: transcript auto-sends ---------- */
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (!detail || voicePendingRef.current) return;
      if (busyRef.current) {
        setInput(detail);
        return;
      }
      voicePendingRef.current = true;
      void send(detail, { fromVoice: true }).finally(() => {
        voicePendingRef.current = false;
      });
    };
    window.addEventListener("Astra:transcript", h);
    return () => window.removeEventListener("Astra:transcript", h);
  }, [send]);

  /* ---------- unified command bus: all sources (voicebox, department-screen, agent, dashboard) enter the same pipeline ---------- */
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string; source?: string }>).detail;
      if (!detail || typeof detail.text !== "string" || !detail.text.trim()) return;
      if (busyRef.current) {
        setInput(detail.text);
        return;
      }
      void send(detail.text);
    };
    window.addEventListener("Astra:command", h);
    return () => window.removeEventListener("Astra:command", h);
  }, [send]);

  /* ---------- workspace → chatbot prefill ("Ask Astra…") ---------- */
  useEffect(() => {
    const p = takePrompt();
    if (p) void send(p);
  }, [send]);

  /* ---------- conversation mode: auto re-listen after replying ---------- */
  useEffect(() => {
    if (!convMode) return;
    if (voice.speaking || voice.recording || busyRef.current || runner.pending) return;
    const t = setTimeout(() => voice.startListening(), 700);
    return () => clearTimeout(t);
  }, [convMode, voice.speaking, voice.recording, runner.pending, busy, voice.startListening]);

  const regenerate = async () => {
    if (busyRef.current || !lastUserRef.current) return;
    const last = lastUserRef.current;
    const norm = normaliseForEngine(last);
    if (understandCommand(norm)) {
      runner.run(norm);
      return;
    }
    await llmSend(last);
  };

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied", { description: "Response copied to clipboard." });
    } catch {
      toast.error("Copy failed", { description: "Clipboard unavailable in this browser." });
    }
  }, []);

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    setBrainState("idle");
    voice.stopSpeaking(false);
    voice.cancelListening();
    runner.clearAll();
    clearConversation();
    setSession({});
    setMessages([
      {
        id: "m-0",
        role: "assistant",
        content: t(getLang(), "greeting"),
        servedBy: t(getLang(), "readyServedBy"),
      },
    ]);
    toast("Conversation cleared", { description: "Session memory reset. Ask about census, billing, staffing…" });
  }, [runner.clearAll, voice.stopSpeaking, voice.cancelListening, setBrainState]);

  const svc = (id: string) => services.find((s) => s.id === id);
  const statusLabel = (status: string | undefined): string => {
    if (status === "healthy") return t(lang, "statusHealthy");
    if (status === "disabled") return t(lang, "statusDisabled");
    return status ?? "…";
  };

  const role: Role = account?.role ?? "ceo";
  const examples = suggestsFor(role).slice(0, 5);

  const toggleMic = async () => {
    if (voice.recording) {
      await voice.stopListening();
      return;
    }
    if (voice.speaking) voice.stopSpeaking(true);
    voice.startListening();
    toast(t(lang, "listeningToast"), { description: t(lang, "listeningDesc") });
  };

  return (
    <div className="mx-auto h-full flex gap-5 max-w-[1400px]">
      <div className="flex-1 min-w-0 flex flex-col">
        {/* header controls */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h1 className="font-display text-2xl font-bold text-gradient mr-auto">{t(lang, "title")}</h1>

          <button
            className={cn("btn-ghost", showContext && "!border-cyan-400/50 !text-cyan-300")}
            onClick={() => setShowContext((v) => !v)}
            title="Toggle context panel"
          >
            <Columns size={14} /> Context
          </button>

          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px]",
              vb.status === "online"
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : vb.status === "checking"
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-red-400/40 bg-red-400/10 text-red-300"
            )}
            title="Local voice runtime — models run on this machine, never uploaded"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", vb.status === "online" ? "bg-emerald-400 animate-pulse" : vb.status === "checking" ? "bg-amber-400" : "bg-red-400")} />
            {vb.status === "online" ? `Voicebox • Connected ${vb.latencyMs}ms` : vb.status === "checking" ? "Voicebox • Connecting…" : "Voicebox • Offline — fallback"}
          </span>

          <div className="inline-flex items-center rounded-full border border-amber-400/40 bg-white/[0.03] p-0.5 shadow-[0_0_14px_rgba(212,175,55,0.18)]">
            <Languages size={13} className="text-amber-300 mx-1.5" />
            {(["en", "te", "hi"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all",
                  lang === l
                    ? "bg-gradient-to-br from-amber-400/30 to-yellow-500/20 text-amber-200 border border-amber-300/50 shadow-[0_0_10px_rgba(212,175,55,0.4)]"
                    : "text-slate-400 hover:text-amber-200 border border-transparent"
                )}
              >
                {l === "en" ? "EN" : l === "te" ? "తె" : "हिं"}
              </button>
            ))}
          </div>

          <select className="input-dark !w-52" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>{t(lang, m.labelKey)}</option>
            ))}
          </select>

          <button
            className={cn("btn-ghost", fusion && "!border-fuchsia-400/50 !text-fuchsia-300 shadow-[0_0_14px_rgba(232,121,249,0.3)]")}
            onClick={() => {
              setFusion((v) => !v);
              toast(fusion ? t(lang, "fusionOffToast") : t(lang, "fusionOnToast"), {
                description: fusion ? t(lang, "fusionOffDesc") : t(lang, "fusionOnDesc"),
              });
            }}
          >
            <Sparkles size={15} /> {t(lang, "fusion")} {fusion ? "ON" : "OFF"}
          </button>

          <button
            className={cn("btn-ghost", convMode && "!border-cyan-400/50 !text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.35)]")}
            onClick={() => {
              if (convMode) {
                setConvMode(false);
                voice.cancelListening();
                voice.stopSpeaking(false);
              } else {
                setConvMode(true);
                if (voice.speaking) voice.stopSpeaking(false);
                voice.startListening();
              }
            }}
            title="Conversation mode — listen → think → speak → listen"
          >
            <Volume2 size={15} /> Talk {convMode ? "ON" : "OFF"}
          </button>

          <button className="btn-ghost !text-red-300/70" onClick={clearAll} title="Clear conversation">
            <Trash2 size={14} />
          </button>
        </div>

        {/* session context chip */}
        {(session.patientUhid || session.department || session.lastTopic) && (
          <div className="flex items-center gap-1.5 mb-3 text-[10px] flex-wrap">
            <span className="text-slate-500">Context:</span>
            {session.patientUhid && (
              <button
                className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 text-cyan-300"
                onClick={() => {
                  updateSession({ patientUhid: undefined, patientName: undefined });
                  toast.info("Focus cleared", { description: "Astra no longer assumes this patient." });
                }}
              >
                {session.patientName ?? "Patient"} · UHID {session.patientUhid} ✕
              </button>
            )}
            {session.department && <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-slate-300">{session.department}</span>}
            {session.lastTopic && <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-slate-500 truncate max-w-[260px]">“{session.lastTopic}”</span>}
          </div>
        )}

        {/* voice activity bar */}
        {voice.speaking && (
          <div className="glass px-4 py-2.5 mb-3 flex items-center gap-3 border !border-cyan-400/25">
            <AvatarOrb size={22} thinking />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-cyan-300 font-semibold">{speakingMsgId ? "Astra · reading your reply…" : "Astra · speaking…"}</p>
              <p className="text-[10px] text-slate-500 truncate">“{voice.speakingText}”</p>
            </div>
            {voice.interruptedRemainder && (
              <button className="btn-ghost !text-[10px] !py-1 !border-amber-400/50 !text-amber-300" onClick={voice.resumeSpeaking}>
                Continue
              </button>
            )}
            <button className="btn-ghost !text-[10px] !py-1 !border-red-400/40 !text-red-300" onClick={() => voice.stopSpeaking(false)}>
              <Square size={11} /> Stop
            </button>
          </div>
        )}
        {voice.interruptedRemainder && !voice.speaking && (
          <div className="glass px-4 py-2 mb-3 flex items-center gap-3 border !border-amber-400/30">
            <Volume2 size={14} className="text-amber-300" />
            <p className="text-[11px] text-slate-400 flex-1">Interrupted — I stopped speaking. Say <span className="text-white font-semibold">“continue”</span> or tap to resume.</p>
            <button className="btn-ghost !text-[10px] !py-1 !border-amber-400/50 !text-amber-300" onClick={voice.resumeSpeaking}>
              Resume
            </button>
          </div>
        )}

        {/* live backend indicators */}
        <div className="flex gap-2 mb-3 text-[10px]">
          {(["freellmapi", "ollama"] as const).map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-slate-400">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  svc(id)?.status === "healthy" ? "bg-emerald-400" : svc(id)?.status === "disabled" ? "bg-red-400" : "bg-amber-400"
                )}
              />
              {id === "freellmapi" ? "FreeLLMAPI" : "Ollama"} · {svc(id)?.status === "healthy" ? `${svc(id)?.latencyMs}ms` : statusLabel(svc(id)?.status)}
            </span>
          ))}
          <span className="text-slate-600 ml-auto hidden sm:inline-flex items-center gap-1">
            {role.toUpperCase()} session {runner.pending ? "· awaiting confirmation" : ""}
          </span>
        </div>

        {/* fusion panel animation */}
        {fusionPhase.length > 0 && (
          <div className="glass p-4 mb-4 flex items-center gap-4">
            {fusionPhase.map((m, i) => (
              <div key={m} className="flex items-center gap-2">
                <AvatarOrb size={28} thinking />
                <span className="text-xs text-slate-300 font-mono">{m}</span>
                {i < fusionPhase.length - 1 && <span className="text-neon-cyan animate-pulse">→</span>}
              </div>
            ))}
            <span className="text-xs text-slate-500 ml-auto animate-pulse">{t(lang, "fusionPanel")}</span>
          </div>
        )}

        {/* command tray — unified pipeline + confirmations */}
        <CommandTray runner={runner} />

        {/* messages */}
        <div className="glass flex-1 overflow-y-auto p-5 space-y-5 min-h-[300px]">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              {m.role === "assistant" ? (
                <AvatarOrb size={34} thinking={busy && m.content === "" && !m.error} />
              ) : (
                <div className="h-[34px] w-[34px] rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-[0_0_12px_rgba(212,175,55,0.5)]">
                  {account?.name.charAt(0).toUpperCase() ?? "U"}
                </div>
              )}
              <div className={cn("max-w-[78%]", m.role === "user" && "text-right")}>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm leading-relaxed inline-block text-left whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-400/25 text-white"
                      : m.error
                        ? "bg-red-400/[0.07] border border-red-400/40 text-red-200"
                        : m.speaking
                          ? "bg-cyan-400/[0.08] border border-cyan-400/50 text-white"
                          : "bg-white/[0.04] border border-white/10 text-slate-200"
                  )}
                >
                  {m.content === "" && !m.error ? (
                    <span className="inline-flex gap-1 py-1">
                      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    </span>
                  ) : (
                    <>
                      {m.error && <AlertTriangle size={14} className="inline mr-1.5 -mt-0.5 text-red-300" />}
                      {m.content}
                    </>
                  )}
                </div>
                {m.error && m.simOffer && (
                  <button
                    className="btn-ghost !text-[11px] !py-1.5 mt-2 !border-amber-400/40 !text-amber-300"
                    disabled={busy}
                    onClick={() => {
                      const lastUser = [...messages].reverse().find((x) => x.role === "user");
                      void simulateReply(lastUser?.content ?? "", m.id);
                    }}
                  >
                    <Sparkles size={12} /> {t(lang, "simOffer")}
                  </button>
                )}
                {m.servedBy && m.content !== "" && !m.error && (
                  <div className="mt-1.5">
                    <Badge tone={m.live ? "green" : m.fusion ? "violet" : m.cmd ? "amber" : "cyan"} className="font-mono">{m.servedBy}</Badge>
                  </div>
                )}
                {m.citations && m.citations.length > 0 && (
                  <details className="mt-2 rounded-lg border border-violet-400/20 bg-violet-400/[0.04] p-2">
                    <summary className="cursor-pointer text-[10px] font-medium text-violet-300 select-none">
                      Why Astra believes this — {m.citations.length} retrieved evidence points
                    </summary>
                    <div className="mt-1.5 space-y-1.5">
                      {m.citations.map((c, i) => (
                        <div key={i} className="text-[10px] leading-relaxed rounded-md border border-white/5 bg-white/[0.02] p-1.5">
                          <span className="text-cyan-300">{c.subject}</span>{" "}
                          <span className="text-violet-300 font-mono">{c.relation}</span>{" "}
                          <span className="text-fuchsia-300">{c.object}</span>
                          <div className="text-slate-500">tier {c.tier} · confidence {Math.round(c.confidence * 100)}% · score {c._score}</div>
                          <div className="text-slate-400 italic">"{c.evidence}"</div>
                          {c.docRef && (
                            <a className="text-cyan-400 hover:underline break-all" href={c.docRef} target="_blank" rel="noreferrer">{c.docRef}</a>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {m.role === "assistant" && m.content !== "" && !m.error && (
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      className="btn-ghost !text-[9px] !py-0.5 !px-1.5"
                      disabled={busy || !voice.canUseTts}
                      onClick={() => {
                        const ml = langForText(m.content);
                        if (!m.speaking) void say(m.content, ml, m.id);
                      }}
                      title="Read aloud (swap language via EN/తె/हिं)"
                    >
                      <Volume2 size={10} /> {m.speaking ? "Speaking…" : "Speak"}
                    </button>
                    <button className="btn-ghost !text-[9px] !py-0.5 !px-1.5" onClick={() => void copyText(m.content)}>
                      <Copy size={10} /> Copy
                    </button>
                    {m.role === "assistant" && lastUserRef.current && !busy && (
                      <button className="btn-ghost !text-[9px] !py-0.5 !px-1.5" onClick={() => void regenerate()} title="Retry with the same prompt">
                        <RotateCcw size={10} /> Regenerate
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* quick suggestions for this role */}
        {examples.length > 0 && !busy && (
          <div className="flex gap-1.5 mt-3 flex-wrap">
            <span className="text-[9px] text-slate-500 self-center uppercase tracking-wider">Suggestions</span>
            {examples.map((ex) => (
              <button
                key={ex}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] text-slate-400 hover:text-white hover:border-amber-400/40"
                onClick={() => void send(ex)}
              >
                {ex.length > 40 ? `${ex.slice(0, 40)}…` : ex}
              </button>
            ))}
          </div>
        )}
        {voice.recording && (
          <div className="flex items-center gap-2 mt-2 text-[10px] text-red-300">
            <span className="record-ring" />
            {voice.source === "browser" ? (voice.interim || voice.transcript ? `“${voice.interim || voice.transcript}”` : "Listening…") : "Listening… tap mic to finish"}
            <span className="text-slate-500 ml-auto">tap mic again to send</span>
          </div>
        )}
        {voice.listeningError && !voice.recording && <p className="text-[10px] text-red-300 mt-2">{voice.listeningError}</p>}

        {/* composer */}
        <div className="flex items-end gap-2 mt-3">
          <button
            className={cn(
              "btn-ghost !p-3 !rounded-xl transition-all",
              voice.recording && "!border-red-400/60 !text-red-300 shadow-[0_0_18px_rgba(248,113,113,0.5)] scale-110"
            )}
            onClick={() => void toggleMic()}
            title={t(lang, "micTip")}
          >
            {voice.recording ? <MicOff size={18} className="animate-pulse" /> : <Mic size={18} />}
          </button>
          <textarea
            className="input-dark flex-1 resize-none !py-3"
            rows={2}
            placeholder={t(lang, "placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <button className="btn-neon !p-3 !rounded-xl" disabled={busy || !input.trim()} onClick={() => void send(input)}>
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* right context panel */}
      {showContext && (
        <div className="w-80 shrink-0 hidden lg:block">
          <SmartContextPanel mode={contextMode} session={sessionRef.current} onClose={() => setShowContext(false)} />
        </div>
      )}
    </div>
  );
}
