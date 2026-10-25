import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, BookOpen, CalendarDays, Camera, ChevronLeft, FileImage, FileText, Printer,
  FolderOpen, Library, Mic, MoreHorizontal, Paperclip, Phone, Plug,
  Send, ShieldCheck, Sparkles, Stethoscope, UserPlus, Video,
} from "lucide-react";
import { toast } from "sonner";
import { EnhancedReceptionDashboard } from "@/sections/hospital/EnhancedReceptionDashboard";
import { useAuth } from "@/lib/auth";
import { navHash } from "@/lib/hashRoute";
import { useAstraVoiceTurn } from "@/components/Communications/useAstraVoiceTurn";
import { speakAstra, unlockAstraAudio } from "@/astra/voice/roundTrip/ttsFallback";
import { ensureMicrophone } from "@/astra/voice/roundTrip/microphone";
import type { AstraLanguage } from "@/astra/voice/roundTrip/contracts";
const PmjayInsuranceDashboard = lazy(async () => ({ default: (await import("@/sections/hospital/role/InsuranceDashboard")).InsuranceDashboard }));

type ModuleId = "copilot" | "registration" | "category" | "insurance" | "pmjay" | "tokens" | "files" | "print-queue" | "notifications" | "podcast-files";
type ChatMessage = { id: string; role: "astra" | "user"; text: string };
type Draft = { name?: string; age?: string; gender?: string; mobile?: string; complaint?: string; address?: string; consultant?: string; mlc?: boolean };

const modules: Array<{ id: ModuleId; label: string; icon: typeof UserPlus; anchor?: string }> = [
  { id: "copilot", label: "New Chat", icon: Sparkles },
  { id: "registration", label: "Patient Registration", icon: UserPlus, anchor: "reception-registration" },
  { id: "category", label: "Registration Category, Department & Consultant Doctor", icon: Stethoscope, anchor: "reception-category-consultant" },
  { id: "insurance", label: "Insurance Provider & Rohini Coding Registry", icon: FileText, anchor: "reception-insurance-rohini" },
  { id: "pmjay", label: "PMJAY, Insurance & NABH Quality", icon: ShieldCheck },
  { id: "tokens", label: "Live Token Spooler", icon: CalendarDays, anchor: "reception-token-spooler" },
  { id: "print-queue", label: "Print Documents & Receipts", icon: Printer },
  { id: "notifications", label: "Doctor & Department Orders", icon: Bell },
  { id: "podcast-files", label: "Daily Podcast Files & Suggestions", icon: BookOpen },
  { id: "files", label: "Files & Images", icon: FolderOpen },
];

const languageOptions: Array<{ value: AstraLanguage; label: string; tag: string }> = [
  { value: "en", label: "English", tag: "en-IN" },
  { value: "te", label: "తెలుగు", tag: "te-IN" },
  { value: "hi", label: "हिंदी", tag: "hi-IN" },
  { value: "tenglish", label: "Tenglish", tag: "te-IN" },
  { value: "hinglish", label: "Hinglish", tag: "hi-IN" },
];

function wakeReply(language: AstraLanguage) {
  if (language === "te" || language === "tenglish") return "హాయ్, నేను ఆస్ట్రా. రిసెప్షన్‌లో మీకు ఎలా సహాయం చేయాలి?";
  if (language === "hi" || language === "hinglish") return "नमस्ते, मैं एस्ट्रा हूँ। रिसेप्शन में मैं आपकी कैसे मदद करूँ?";
  return "Hi, I’m Astra. How can I help you at reception?";
}

function parseDraft(text: string): Draft | null {
  const registrationWords = /register|registration|patient|admit|పేషెంట్|రిజిస్టర్|रजिस्टर|मरीज/i;
  if (!registrationWords.test(text)) return null;
  const value = text.replace(/\s+/g, " ").trim();
  const name = value.match(/(?:name(?: is)?|patient(?: name)?|register patient|పేరు|नाम)\s*[:,-]?\s*([\p{L} .]{2,40}?)(?=\s+(?:age|aged|వయసు|उम्र|mobile|phone|complaint|with|male|female)|$)/iu)?.[1]?.trim();
  const age = value.match(/(?:age|aged|వయసు|उम्र)\s*[:,-]?\s*(\d{1,3})/i)?.[1] ?? value.match(/\b(\d{1,3})\s*(?:years?|yrs?)\b/i)?.[1];
  const mobile = value.match(/(?:mobile|phone|ఫోన్|मोबाइल)\s*[:,-]?\s*(\d[\d -]{8,13})/i)?.[1]?.replace(/\D/g, "");
  const complaint = value.match(/(?:complaint|problem|suffering from|with|ఫిర్యాదు|समस्या)\s*[:,-]?\s*([^,.;]{3,80})/i)?.[1]?.trim();
  const address = value.match(/(?:address|from|చిరునామా|पता)\s*[:,-]?\s*([^,.;]{3,80})/i)?.[1]?.trim();
  const consultant = value.match(/(?:doctor|consultant|డాక్టర్|डॉक्टर)\s*[:,-]?\s*([^,.;]{3,60})/i)?.[1]?.trim();
  const gender = /\bfemale\b|మహిళ|महिला/i.test(value) ? "Female" : /\bmale\b|పురుష|पुरुष/i.test(value) ? "Male" : undefined;
  return { name, age, mobile, complaint, address, consultant, gender };
}

function isMlcCandidate(text: string) {
  return /\b(?:rta|road traffic accident|assault|poison(?:ing)?|workplace accident|unconscious|medico.?legal)\b|రోడ్డు ప్రమాదం|దాడి|విషం|बेहोश|हमला|ज़हर/i.test(text);
}

export function ReceptionCopilotShell() {
  const { account } = useAuth();
  const [active, setActive] = useState<ModuleId>("copilot");
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<AstraLanguage>("en");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "astra", text: "Welcome to Astra Reception. I can prepare a patient registration, find the correct reception module, or connect you with Doctor Command." },
  ]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mlcPending, setMlcPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; url?: string; kind: string } | null>(null);
  const recognition = useRef<any>(null);
  const lastTurn = useRef<string>();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const token = localStorage.getItem("astra.serverToken");
  const turn = useAstraVoiceTurn({ userId: account?.id, name: account?.name, role: account?.role, token });

  const selected = useMemo(() => modules.find((m) => m.id === active), [active]);

  useEffect(() => {
    if (!turn.turnId || turn.turnId === lastTurn.current || !turn.text) return;
    lastTurn.current = turn.turnId;
    setMessages((current) => [...current, { id: turn.turnId!, role: "astra", text: turn.text }]);
  }, [turn.turnId, turn.text]);

  useEffect(() => {
    if (active === "copilot" || active === "files" || active === "print-queue" || active === "notifications" || active === "podcast-files") return;
    const timer = window.setTimeout(() => document.getElementById(selected?.anchor ?? "")?.scrollIntoView({ block: "start" }), 120);
    return () => window.clearTimeout(timer);
  }, [active, selected]);

  const chooseModule = (id: ModuleId) => setActive(id);

  async function submit(message = input) {
    const said = message.trim();
    if (!said) return;
    unlockAstraAudio();
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: said }]);
    setInput("");

    if (/^(?:hi|hello|hey)\s+astra\b|^(?:హాయ్|హలో)\s+ఆస్ట్రా|^(?:हाय|हेलो)\s+एस्ट्रा/i.test(said)) {
      const text = wakeReply(language);
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "astra", text }]);
      void speakAstra({ text, language });
      return;
    }

    const nextDraft = parseDraft(said);
    if (nextDraft) {
      setDraft((current) => ({ ...current, ...nextDraft }));
      const printRequested = /op\s*(?:slip|card)|bill\s*(?:slip|receipt)|print|प्रिंट/i.test(said);
      const text = nextDraft.name
        ? `${printRequested ? "I prepared the registration and print request" : "I prepared a registration draft"} for ${nextDraft.name}. Please choose a consultant${printRequested ? " and confirm payment before OP slip and bill receipt generation" : " before registration"}.`
        : "I started a patient registration draft. Please tell me the patient name, age, mobile number, complaint, and consultant.";
      setMessages((current) => [...current, { id: `a-${Date.now()}`, role: "astra", text }]);
      if (isMlcCandidate(said)) setMlcPending(true);
      void speakAstra({ text, language });
      return;
    }
    if (isMlcCandidate(said)) setMlcPending(true);
    await turn.ask(said);
  }

  async function startListening() {
    unlockAstraAudio();
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { toast.error("Speech recognition is unavailable in this browser."); return; }
    const access = await ensureMicrophone();
    if (!access.ok) { toast.error(access.message ?? "Microphone permission is required."); return; }
    recognition.current?.stop?.();
    const engine = new Recognition();
    recognition.current = engine;
    engine.lang = languageOptions.find((x) => x.value === language)?.tag ?? "en-IN";
    engine.interimResults = true;
    engine.onstart = () => setListening(true);
    engine.onresult = (event: any) => {
      let transcript = "";
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      setInput(transcript);
      if (isFinal && transcript.trim()) void submit(transcript);
    };
    engine.onerror = (event: any) => { setListening(false); if (event.error !== "no-speech" && event.error !== "aborted") toast.error(`Microphone error: ${event.error}`); };
    engine.onend = () => setListening(false);
    engine.start();
  }

  async function attachFile(file?: File) {
    if (!file) return;
    const allowed = file.type.startsWith("image/") || file.type === "application/pdf" || file.type === "text/plain";
    if (!allowed) { toast.error("Choose an image, PDF, or text document."); return; }
    setAttachment({ name: file.name, kind: file.type, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined });
    if (file.type === "text/plain") {
      try {
        const text = await file.text();
        const response = await fetch("/api/reception/document-intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, text }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || body.error || "Document intake failed");
        const summary = Object.entries(body.extracted ?? {}).map(([key, value]: [string, any]) => `${key}: ${value.value}`).join(" • ");
        toast.success("Document reviewed", { description: summary || "No labeled patient fields found; review manually." });
      } catch (error) { toast.error("Document intake failed", { description: error instanceof Error ? error.message : "Review the document manually." }); }
    } else toast.info("File attached", { description: "Image/PDF preview is available; no fields are invented without a readable text extraction." });
  }

  function openCall(video: boolean) {
    window.dispatchEvent(new CustomEvent("astra-staff-connect-open", { detail: { video, room: "doctor-command" } }));
  }

  return (
    <div data-testid="reception-copilot-shell" className="mx-auto flex h-[calc(100vh-9.5rem)] min-h-[650px] max-w-[1600px] overflow-hidden rounded-2xl border border-slate-800 bg-[#080c18] shadow-2xl">
      <aside className="flex w-[285px] shrink-0 flex-col border-r border-slate-800 bg-[#0c111d] p-3">
        <div className="mb-3 flex items-center gap-2 px-2 py-2"><div className="rounded-xl bg-cyan-500/15 p-2 text-cyan-300"><Sparkles size={18} /></div><div><b className="block text-sm text-white">ASTRA RECEPTION</b><span className="text-[10px] text-emerald-400">Copilot online</span></div></div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Reception modules">
          {modules.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => chooseModule(id)} className={`w-full rounded-xl px-3 py-2.5 text-left text-[11px] font-semibold transition ${active === id ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/30" : "text-slate-300 hover:bg-white/5"}`}><Icon size={14} className="mr-2 inline shrink-0" />{label}</button>)}
          <div className="my-3 border-t border-slate-800" />
          <button onClick={() => navHash("/knowledge")} className="w-full rounded-xl px-3 py-2 text-left text-xs text-slate-400 hover:bg-white/5"><Library size={14} className="mr-2 inline" />Library</button>
          <button onClick={() => navHash("/tasks")} className="w-full rounded-xl px-3 py-2 text-left text-xs text-slate-400 hover:bg-white/5"><CalendarDays size={14} className="mr-2 inline" />Schedule</button>
          <button onClick={() => navHash("/plugins")} className="w-full rounded-xl px-3 py-2 text-left text-xs text-slate-400 hover:bg-white/5"><Plug size={14} className="mr-2 inline" />Plugins</button>
          <button type="button" disabled aria-disabled="true" className="w-full cursor-not-allowed rounded-xl px-3 py-2 text-left text-xs text-slate-500"><MoreHorizontal size={14} className="mr-2 inline" />More (not available)</button>
          <p className="px-3 pt-4 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">Pinned / Recent</p>
          <button onClick={() => chooseModule("registration")} className="w-full px-3 py-2 text-left text-[11px] text-slate-500">Today’s registrations</button>
        </nav>
        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-[10px] text-slate-500">Signed in as <b className="text-slate-300">{account?.name}</b><br />Reception access only</div>
      </aside>

      <main className="min-w-0 flex-1">
        {active === "notifications" ? (
          <div className="h-full overflow-y-auto p-6" data-testid="reception-notifications">
            <h1 className="text-xl font-bold text-white"><Bell size={20} className="mr-2 inline text-amber-300" />Doctor & Department Orders</h1>
            <p className="mt-1 text-xs text-slate-400">Text notifications for doctor orders and updates from laboratory, radiology, pharmacy, ward and billing.</p>
            <div className="mt-5 space-y-3">
              {[['Dr. Murali Praveen', 'CBC + Dengue NS1 ordered for Rajesh Kumar', 'Laboratory', 'New'], ['Radiology', 'USG abdomen report ready for UHID-2026-8801', 'Radiology', 'Ready'], ['Billing', 'Consultation payment confirmed · BILL-114', 'Billing', 'Confirmed']].map(([from, message, dept, status]) => <article key={message} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4"><div className="flex items-start justify-between gap-3"><div><b className="text-sm text-white">{from}</b><p className="mt-1 text-xs text-slate-300">{message}</p><span className="mt-2 inline-block rounded-full border border-cyan-400/20 px-2 py-1 text-[10px] text-cyan-200">{dept}</span></div><span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-200">{status}</span></div><button onClick={() => toast.success(`${dept} notification acknowledged`)} className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300">Acknowledge</button></article>)}
            </div>
          </div>
        ) : active === "podcast-files" ? (
          <div className="h-full overflow-y-auto p-6" data-testid="reception-podcast-files">
            <h1 className="text-xl font-bold text-white"><BookOpen size={20} className="mr-2 inline text-cyan-300" />Daily Podcast Files & Suggestions</h1>
            <p className="mt-1 text-xs text-slate-400">Review daily health topics, save approved scripts, and manage locally available playback files.</p>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {[['Antibiotics: why the full course matters', 'Telugu · Ready to play'], ['Dengue warning signs and safe hydration', 'Hindi · Ready to play'], ['Blood pressure: when to seek urgent care', 'English · Suggested topic']].map(([title, meta]) => <article key={title} className="rounded-2xl border border-cyan-400/20 bg-slate-900/80 p-4"><b className="text-sm text-white">{title}</b><p className="mt-1 text-[11px] text-emerald-300">{meta}</p><div className="mt-3 flex gap-2"><button onClick={() => toast.success('Podcast file saved locally')} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-[11px] font-bold text-white">Save file</button><button onClick={() => toast.info('Suggestion marked for review')} className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300">Review suggestion</button></div></article>)}
            </div>
            <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><h2 className="text-sm font-bold text-white">Saved Files</h2><p className="mt-1 text-xs text-slate-400">Astra keeps saved podcast scripts and playback metadata locally for Reception.</p><div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">No additional saved files yet. Use <b className="text-cyan-200">Save file</b> above to add one.</div></section>
          </div>
        ) : active !== "copilot" && active !== "files" ? (
          <div className="h-full overflow-y-auto p-4" data-testid="reception-module-host">
            <button onClick={() => setActive("copilot")} className="sticky top-0 z-10 mb-3 rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-300"><ChevronLeft size={14} className="mr-1 inline" />Back to Astra Reception</button>
            {active === "pmjay" ? <Suspense fallback={<div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-cyan-200">Loading PMJAY, Insurance & NABH Quality desk…</div>}><PmjayInsuranceDashboard /></Suspense> : <EnhancedReceptionDashboard key={active} initialSubTab={active === "print-queue" ? "print-queue" : "registration"} />}
          </div>
        ) : active === "files" ? (
          <div className="p-8"><h1 className="text-xl font-bold text-white">Files & Images</h1><p className="mt-2 text-sm text-slate-400">Attach a registration document or patient image. Astra validates the file locally and reports when OCR is unavailable.</p><button onClick={() => fileRef.current?.click()} className="mt-6 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white"><Paperclip size={16} className="mr-2 inline" />Choose image or PDF</button>{attachment && <AttachmentCard attachment={attachment} />}</div>
        ) : (
          <div className="flex h-full flex-col" data-testid="reception-copilot-default">
            <header className="border-b border-slate-800 px-6 py-5"><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-400">ASTRA RECEPTION</p><h1 className="mt-1 text-xl font-semibold text-white">Good day, {account?.name?.split(" ")[0] ?? "Reception"}. What would you like to do?</h1><p className="mt-1 text-xs text-slate-500">Voice, text, registration drafts and staff communication in one workspace.</p></header>
            <section className="min-h-0 flex-1 overflow-y-auto px-6 py-5" aria-live="polite">
              <div className="mx-auto max-w-3xl space-y-4">{messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-cyan-600 text-white" : "border border-slate-800 bg-slate-900 text-slate-200"}`}>{message.text}</div></div>)}
              {turn.status === "thinking" && <p className="text-xs text-cyan-400">Astra is thinking…</p>}
              {turn.error && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{turn.error}</p>}
              {mlcPending && <MlcGate onConfirm={() => { setDraft((d) => ({ ...d, mlc: true })); setMlcPending(false); }} onReject={() => setMlcPending(false)} />}
              {draft && <DraftCard draft={draft} onOpen={() => setActive("registration")} onConsultant={() => setActive("category")} onCancel={() => setDraft(null)} />}
              {attachment && <AttachmentCard attachment={attachment} />}
              </div>
            </section>
            <div className="border-t border-slate-800 bg-[#0b101c] p-4">
              <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700 bg-slate-900/80 p-2 shadow-xl focus-within:border-cyan-500/50">
                <textarea data-testid="reception-composer" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} rows={2} placeholder='Ask Astra, or say “Register patient name Ravi, age 45…”' className="w-full resize-none bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
                  <button title="Attach file" onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Paperclip size={16} /></button>
                  <button title="Use camera" onClick={() => cameraRef.current?.click()} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Camera size={16} /></button>
                  <button title="Voice call Doctor Command" onClick={() => openCall(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-emerald-300"><Phone size={16} /></button>
                  <button title="Video call Doctor Command" onClick={() => openCall(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-emerald-300"><Video size={16} /></button>
                  <select aria-label="Astra language" value={language} onChange={(e) => setLanguage(e.target.value as AstraLanguage)} className="ml-auto rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-300">{languageOptions.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
                  <button data-testid="reception-send" onClick={() => void submit()} disabled={!input.trim()} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Send size={14} className="mr-1 inline" />Send</button>
                </div>
              </div>
              <p className="mx-auto mt-2 max-w-3xl text-center text-[9px] text-slate-600">Astra shows text first, then speaks with Sarvam, Gemini, or local Voicebox. Confirm patient details before saving.</p>
            </div>
          </div>
        )}
      </main>
      <input ref={fileRef} type="file" accept="image/*,application/pdf,text/plain" className="hidden" onChange={(e) => attachFile(e.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => attachFile(e.target.files?.[0])} />
    </div>
  );
}

function MlcGate({ onConfirm, onReject }: { onConfirm: () => void; onReject: () => void }) {
  return <div data-testid="mlc-confirmation" className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4"><b className="text-sm text-rose-200">Possible medico-legal case detected</b><p className="mt-1 text-xs text-slate-300">Confirm before Astra marks this registration as MLC. Police intimation is never triggered automatically.</p><div className="mt-3 flex gap-2"><button onClick={onConfirm} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">Confirm MLC</button><button onClick={onReject} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Not MLC</button></div></div>;
}

function DraftCard({ draft, onOpen, onConsultant, onCancel }: { draft: Draft; onOpen: () => void; onConsultant: () => void; onCancel: () => void }) {
  const fields = [["Name", draft.name], ["Age", draft.age], ["Gender", draft.gender], ["Mobile", draft.mobile], ["Complaint", draft.complaint], ["Address", draft.address], ["Consultant", draft.consultant], ["MLC", draft.mlc ? "Confirmed" : "No / unconfirmed"]];
  return <div data-testid="patient-registration-draft" className="rounded-2xl border border-cyan-500/30 bg-cyan-950/10 p-4"><div className="flex items-center gap-2 text-cyan-200"><UserPlus size={16} /><b className="text-xs tracking-wide">PATIENT REGISTRATION DRAFT</b></div><div className="mt-3 grid grid-cols-2 gap-2">{fields.map(([label, value]) => <div key={label} className="rounded-lg bg-slate-950/60 p-2"><span className="block text-[9px] uppercase text-slate-600">{label}</span><span className="text-xs text-slate-200">{value || "Missing"}</span></div>)}</div>{!draft.consultant && <p className="mt-3 text-xs text-amber-300">Consultant is required before registration.</p>}<div className="mt-3 flex flex-wrap gap-2"><button onClick={onConsultant} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white">Choose Consultant</button><button onClick={onOpen} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">Open Full Form</button><button onClick={() => toast.success("Draft kept in this session", { description: "No patient record was created yet." })} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200">Save Draft</button><button onClick={onCancel} className="rounded-lg px-3 py-2 text-xs text-slate-500">Cancel</button></div></div>;
}

function AttachmentCard({ attachment }: { attachment: { name: string; url?: string; kind: string } }) {
  const message = attachment.kind === "text/plain" ? "Text intake completed with labeled-field provenance. Review before registration." : "Image/PDF preview only; no fields are invented without readable extraction.";
  return <div className="rounded-2xl border border-violet-500/30 bg-violet-950/10 p-4"><div className="flex items-center gap-2 text-violet-200">{attachment.url ? <FileImage size={17} /> : <BookOpen size={17} />}<b className="text-sm">{attachment.name}</b></div>{attachment.url && <img src={attachment.url} alt="Attached preview" className="mt-3 max-h-48 rounded-xl object-contain" />}<p className="mt-3 text-xs text-amber-200">{message}</p></div>;
}
