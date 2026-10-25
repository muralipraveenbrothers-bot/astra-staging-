// Cloud HMS (Sparta) sub-page — the hospital's live SpartaHMS cloud instance,
// a local login vault, and an offline instruction queue that a browser-automation
// bridge (Kimi WebBridge) can execute against the real site in a follow-up step.

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  ListChecks,
  Loader2,
  MessageCircle,
  Mic,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useSpeechRecognition } from "@/lib/speech";
import { useStore } from "@/lib/store";
import { askDoctorEngine } from "@/services/doctorEngine";
import { cn, loadLS, nowTime, saveLS, uid } from "@/lib/utils";

const SPARTA_URL = "https://pmbrothersmultispecialityhospital.spartahealth.cloud/Show/Index/1197";

interface SpartaVault {
  email: string;
  password: string;
  clinic: string;
}

type Intent = "register" | "bill" | "discharge" | "other";

interface QueueItem {
  id: string;
  text: string;
  intent: Intent;
  status: "pending" | "done";
  createdAt: string;
}

const defaultVault: SpartaVault = { email: "", password: "", clinic: "Main Clinic" };

function parseIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/\b(register|registration|admit|new patient|op entry|check[- ]?in)\b/.test(t)) return "register";
  if (/\b(bill|billing|payment|receipt|invoice|collect|charge)\b/.test(t)) return "bill";
  if (/\b(discharge|release|checkout|check[- ]?out)\b/.test(t)) return "discharge";
  return "other";
}

const INTENT_TONE: Record<Intent, "cyan" | "amber" | "green" | "neutral"> = {
  register: "cyan",
  bill: "amber",
  discharge: "green",
  other: "neutral",
};

/** Template step-by-step guides per intent — used when no LLM backend is reachable. */
function templateGuide(item: QueueItem): string {
  const t = item.text;
  switch (item.intent) {
    case "register":
      return [
        `AI Guide — Register patient (${t})`,
        "1. Open Sparta HMS → Front Desk module from the left menu.",
        "2. Click “New Registration” and choose OP (outpatient).",
        "3. Fill name, age, gender and mobile number exactly as the patient states them.",
        "4. Select the department / consultant from the dropdown (match the complaint).",
        "5. Choose the payment mode and collect the consultation fee.",
        "6. Save — note the generated UHID / token number.",
        "7. Print the token slip and hand it to the patient with the receipt.",
      ].join("\n");
    case "bill":
      return [
        `AI Guide — Billing task (${t})`,
        "1. Open Sparta HMS → Billing / Cash Counter.",
        "2. Search the patient by name or UHID.",
        "3. Add the service items / verify the auto-pulled charges.",
        "4. Confirm the total with the patient, then select the payment mode.",
        "5. Collect payment and click “Settle & Print”.",
        "6. Hand over the printed receipt; verify the entry in the day collection report.",
      ].join("\n");
    case "discharge":
      return [
        `AI Guide — Discharge (${t})`,
        "1. Open Sparta HMS → IP / Ward Management.",
        "2. Open the patient's encounter and click “Initiate Discharge”.",
        "3. Verify all bills are settled (no red balance line).",
        "4. Enter the final diagnosis and follow-up date from the doctor's note.",
        "5. Generate the discharge summary and print 2 copies.",
        "6. Get the patient's signature, then click “Confirm Discharge” to free the bed.",
      ].join("\n");
    default:
      return [
        `AI Guide — General task (${t})`,
        "1. Open Sparta HMS and sign in with the vault credentials.",
        "2. Use the module menu to reach the area this instruction concerns.",
        "3. Complete the action exactly as written in the instruction.",
        "4. Cross-check the entry appears in the relevant register/report.",
        "5. Mark the instruction done in Astra AI → Cloud HMS queue.",
      ].join("\n");
  }
}

export function CloudHMS() {
  const { settings, addSendLog } = useStore();
  const [iframeFailed, setIframeFailed] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // vault
  const [vault, setVault] = useState<SpartaVault>(() => ({ ...defaultVault, ...loadLS<Partial<SpartaVault>>("astra.spartaVault", {}) }));
  const [showPw, setShowPw] = useState(false);

  // instruction queue
  const [queue, setQueue] = useState<QueueItem[]>(() => loadLS<QueueItem[]>("astra.spartaQueue", []));
  const [draft, setDraft] = useState("");
  const speech = useSpeechRecognition();

  useEffect(() => saveLS("astra.spartaVault", vault), [vault]);
  useEffect(() => saveLS("astra.spartaQueue", queue), [queue]);

  // iframe CSP fallback — cross-origin frames that send X-Frame-Options /
  // frame-ancestors fail silently, so assume blocked if it hasn't loaded in time.
  useEffect(() => {
    if (failTimer.current) clearTimeout(failTimer.current);
    setIframeFailed(false);
    failTimer.current = setTimeout(() => setIframeFailed(true), 1200);
    return () => { if (failTimer.current) clearTimeout(failTimer.current); };
  }, [frameKey]);

  // push dictated text into the composer when dictation stops
  useEffect(() => {
    if (!speech.listening && speech.transcript.trim()) {
      setDraft((d) => (d + " " + speech.transcript).trim());
      speech.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening]);

  const enqueue = () => {
    const text = draft.trim();
    if (!text) return;
    const item: QueueItem = { id: uid("sq"), text, intent: parseIntent(text), status: "pending", createdAt: nowTime() };
    setQueue((q) => [item, ...q]);
    setDraft("");
    toast.success("Instruction queued for Sparta HMS", {
      description: `Intent: ${item.intent} · executes via the browser-automation bridge.`,
    });
  };

  const markDone = (id: string) => {
    setQueue((q) => q.map((x) => (x.id === id ? { ...x, status: "done" } : x)));
    toast.success("Marked done");
  };

  // ---------------- AI auto-guide ----------------
  const [guides, setGuides] = useState<Record<string, { text: string; engine: string }>>({});
  const [guideBusy, setGuideBusy] = useState<string | null>(null);

  const generateGuide = async (item: QueueItem) => {
    if (guideBusy) return;
    setGuideBusy(item.id);
    try {
      const result = await askDoctorEngine({ text: item.text });
      if (!result.ok || !result.text.trim()) throw new Error(result.error || "empty response");
      setGuides((g) => ({ ...g, [item.id]: { text: result.text.trim(), engine: "gateway " + result.engine } }));
      toast.success("AI guide generated", { description: "via " + result.engine });
    } catch {
      setGuides((g) => ({ ...g, [item.id]: { text: templateGuide(item), engine: "local template (backend unreachable)" } }));
      toast.info("AI backend unreachable. Template guide used", { description: "Intent-matched steps from the local playbook." });
    }
    setGuideBusy(null);
  };

  const sendGuideWa = (item: QueueItem) => {
    addSendLog({ provider: "WhatsApp", template: "ai_guide", recipient: "Meera Nair (Front Desk Lead)", status: "sent" });
    toast.success("Guide sent to receptionist WhatsApp", { description: "ai_guide template → send-log (simulated send)." });
  };

  const clearDone = () => setQueue((q) => q.filter((x) => x.status === "pending"));
  const pending = queue.filter((x) => x.status === "pending");
  const done = queue.filter((x) => x.status === "done");

  return (
    <div className="space-y-4">
      {/* subscription warning */}
      <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 flex items-start gap-3">
        <AlertTriangle size={17} className="text-amber-300 shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-semibold text-amber-200">Subscription expires in ~2 days</span>
          <span className="text-amber-200/70"> — renew the SpartaHMS plan to avoid a reception lockout. Billing → SaaS subscription has the renewal entry.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* live instance card */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <SectionTitle title="Sparta HMS — Live Instance" subtitle="Cloud HMS for PM Brothers Multispeciality Hospital" />
            <Badge tone="green" className="!text-[9px]">
              <Cloud size={10} className="mr-1" /> linked
            </Badge>
          </div>
          <p className="text-[11px] text-slate-500 break-all mb-3">{SPARTA_URL}</p>
          <div className="flex gap-2 mb-3 flex-wrap">
            <a href={SPARTA_URL} target="_blank" rel="noreferrer" className="btn-neon !text-xs !py-1.5">
              <ExternalLink size={13} /> Open Sparta HMS
            </a>
            <button
              className="btn-ghost !text-xs !py-1.5"
              onClick={() => setFrameKey((k) => k + 1)}
            >
              <RefreshCw size={13} /> Retry embed
            </button>
          </div>

          {!iframeFailed ? (
            <div className="rounded-lg border border-white/10 overflow-hidden relative">
              <iframe
                key={frameKey}
                src={SPARTA_URL}
                title="Sparta HMS"
                className="w-full h-64 bg-black"
                onError={() => setIframeFailed(true)}
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[10px] text-slate-400 px-2 py-1 flex items-center gap-1.5">
                <Loader2 size={11} className="animate-spin" /> Attempting embedded view…
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center space-y-2">
              <Cloud size={26} className="mx-auto text-slate-500" />
              <p className="text-xs text-slate-300 font-medium">Embedded view blocked by the site</p>
              <p className="text-[11px] text-slate-500 leading-snug max-w-md mx-auto">
                The Sparta cloud sends frame-blocking headers (X-Frame-Options / CSP frame-ancestors), so it cannot render inside
                this dashboard. Use <span className="text-slate-300">Open Sparta HMS</span> to work in a full tab — instructions
                queued below will be executed there by the browser-automation bridge.
              </p>
            </div>
          )}
        </GlassCard>

        {/* login vault */}
        <GlassCard>
          <SectionTitle title="Login Vault" subtitle="Local-only credentials for the Sparta portal" />
          <div className="space-y-3 mt-1">
            <div>
              <label className="text-[11px] text-slate-500">Email</label>
              <input
                className="input-dark mt-1"
                type="email"
                value={vault.email}
                onChange={(e) => setVault((v) => ({ ...v, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500">Password</label>
              <div className="relative mt-1">
                <input
                  className="input-dark !pr-10 w-full"
                  type={showPw ? "text" : "password"}
                  value={vault.password}
                  onChange={(e) => setVault((v) => ({ ...v, password: e.target.value }))}
                />
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  onClick={() => setShowPw((s) => !s)}
                  title={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500">Clinic</label>
              <input
                className="input-dark mt-1"
                value={vault.clinic}
                onChange={(e) => setVault((v) => ({ ...v, clinic: e.target.value }))}
              />
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 flex items-start gap-2.5">
              <KeyRound size={14} className="text-violet-300 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-400 leading-snug">
                Stored only in this browser (localStorage) — never sent anywhere except the Sparta login page when you use it.
                The automation bridge fills these fields on the real login form; nothing leaves the machine.
              </p>
            </div>
            <a
              href={SPARTA_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost !text-xs w-full"
              onClick={() => toast.info("Opening Sparta login", { description: "Use the vault credentials to sign in." })}
            >
              <ExternalLink size={13} /> Open login page
            </a>
          </div>
        </GlassCard>
      </div>

      {/* instruction queue */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <SectionTitle title="Instruction Queue" subtitle="Tell Astra what to do inside Sparta HMS — executed by the browser bridge" />
          {done.length > 0 && (
            <button className="btn-ghost !text-[11px] !py-1" onClick={clearDone}>
              <Trash2 size={12} /> Clear {done.length} done
            </button>
          )}
        </div>

        <div className="flex gap-2 items-start">
          <textarea
            className="input-dark resize-none flex-1"
            rows={2}
            placeholder='e.g. "register walk-in patient Suresh Patil, 38, male, fever — General Medicine, cash" or "settle the pending bill for PT-1087"'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enqueue(); } }}
          />
          <div className="flex flex-col gap-2">
            <button
              className={cn("btn-ghost !px-3", speech.listening && "!border-red-400/60 !text-red-300")}
              disabled={!speech.supported}
              title={speech.supported ? (speech.listening ? "Stop dictation" : "Dictate instruction") : "Mic not supported in this browser"}
              onClick={() => { if (speech.listening) speech.stop(); else { speech.reset(); speech.start(); } }}
            >
              <Mic size={15} className={speech.listening ? "animate-pulse" : ""} />
            </button>
            <button className="btn-neon !px-3" disabled={!draft.trim()} onClick={enqueue} title="Queue instruction">
              <Send size={15} />
            </button>
          </div>
        </div>
        {speech.listening && (
          <p className="text-[11px] text-red-300 mt-1.5">
            Listening… {speech.transcript} <span className="text-red-300/60">{speech.interim}</span>
          </p>
        )}

        <div className="mt-4 space-y-2">
          {pending.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ListChecks size={14} /> Queue is empty — pending instructions will appear here with their detected intent.
            </div>
          )}
          {pending.map((item) => (
            <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
              <div className="flex items-start gap-3">
                <Badge tone={INTENT_TONE[item.intent]} className="!text-[9px] shrink-0 mt-0.5">{item.intent}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200">{item.text}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">queued {item.createdAt}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button className="btn-ghost !text-[11px] !py-1" disabled={guideBusy === item.id} onClick={() => void generateGuide(item)}>
                    {guideBusy === item.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} AI Guide
                  </button>
                  <button className="btn-ghost !text-[11px] !py-1" onClick={() => markDone(item.id)}>
                    <CheckCircle2 size={12} /> Mark done
                  </button>
                </div>
              </div>
              {guides[item.id] && (
                <div className="rounded-md border border-violet-400/30 bg-violet-500/[0.07] p-3 ml-7">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-[10px] text-violet-300 font-semibold uppercase tracking-wider">Receptionist guide · {guides[item.id].engine}</p>
                    <button className="btn-ghost !text-[10px] !py-0.5 !px-2" onClick={() => sendGuideWa(item)}>
                      <MessageCircle size={11} /> Send to receptionist WhatsApp
                    </button>
                  </div>
                  <ol className="text-[11px] text-slate-200 space-y-1 list-none">
                    {guides[item.id].text.split("\n").filter((l) => l.trim()).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ))}
          {done.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3 flex items-center gap-3 opacity-70">
              <Badge tone="green" className="!text-[9px] shrink-0">{item.intent}</Badge>
              <p className="text-xs text-slate-400 line-through flex-1 truncate">{item.text}</p>
              <span className="text-[10px] text-emerald-300/70 shrink-0">done ✓</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-3">
          Live execution happens via the Kimi WebBridge browser-automation step (follow-up task): it opens the Sparta site in your
          real browser session, signs in with the vault, and works through this queue top-down.
        </p>
      </GlassCard>
    </div>
  );
}
