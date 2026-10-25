import { useCallback, useEffect, useState } from "react";
import {
  Activity, BookOpen, BrainCircuit, CheckCircle2, FlaskConical,
  FileUp, Loader2, Play, RefreshCw, Search, ShieldCheck, Sparkles, WandSparkles,
} from "lucide-react";

type Json = Record<string, any>;

async function requestJson(path: string, init?: RequestInit): Promise<Json> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `${res.status} ${res.statusText}`);
  return body;
}

function StatusPill({ value }: { value: string }) {
  const ready = value === "READY" || value === "HEALTHY" || value === "CONNECTED";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-[0.15em] ${
      ready ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-300" : "border-amber-400/35 bg-amber-400/10 text-amber-300"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-400"}`} />
      {value}
    </span>
  );
}

function Output({ data }: { data: Json | null }) {
  if (!data) return <p className="text-xs text-slate-500">Results will appear here with source and execution details.</p>;
  return (
    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-slate-950/75 p-3 text-[11px] leading-5 text-slate-300">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function IntelligenceLabDashboard() {
  const [status, setStatus] = useState<Json | null>(null);
  const [bookHealth, setBookHealth] = useState<Json | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [microPrompt, setMicroPrompt] = useState("Open the laboratory queue and summarize the pending work.");
  const [microResult, setMicroResult] = useState<Json | null>(null);
  const [microBusy, setMicroBusy] = useState(false);
  const [bookPath, setBookPath] = useState("");
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [skillName, setSkillName] = useState("");
  const [bookResult, setBookResult] = useState<Json | null>(null);
  const [bookBusy, setBookBusy] = useState(false);
  const [bookStage, setBookStage] = useState<"idle" | "uploading" | "extracting" | "generating" | "created" | "failed">("idle");
  const [scienceQuery, setScienceQuery] = useState("Find recent evidence on fluid management in adult dengue.");
  const [scienceResult, setScienceResult] = useState<Json | null>(null);
  const [scienceBusy, setScienceBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingHealth(true);
    const [intelligence, books] = await Promise.allSettled([
      requestJson("/api/intelligence/status"),
      requestJson("/api/book-to-skill/health"),
    ]);
    setStatus(
      intelligence.status === "fulfilled" && intelligence.value?.micro
        ? intelligence.value
        : { enabled: false, error: intelligence.status === "rejected" ? intelligence.reason?.message : "Astra API restart required" },
    );
    setBookHealth(books.status === "fulfilled" ? books.value : { ok: false, error: books.reason?.message });
    setLoadingHealth(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function runMicro() {
    setMicroBusy(true);
    try {
      setMicroResult(await requestJson("/api/intelligence/command", {
        method: "POST", body: JSON.stringify({ command: microPrompt, jsonMode: true }),
      }));
    } catch (e) { setMicroResult({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
    finally { setMicroBusy(false); }
  }

  async function runBook(action: "analyze" | "generate") {
    if (!bookPath.trim()) { setBookResult({ ok: false, error: "Enter the full local path of a PDF, EPUB, DOCX, Markdown, HTML, RTF, or text file." }); return; }
    setBookBusy(true);
    try {
      setBookResult(await requestJson(`/api/book-to-skill/${action}`, {
        method: "POST",
        body: JSON.stringify({ input: bookPath.trim(), skillName: skillName.trim() || undefined, mode: "text", depth: "reference" }),
      }));
    } catch (e) { setBookResult({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
    finally { setBookBusy(false); }
  }

  async function uploadAndCreateSkill() {
    if (!bookFile) return;
    setBookBusy(true);
    setBookStage("uploading");
    setBookResult(null);
    try {
      const bytes = new Uint8Array(await bookFile.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      setBookStage("extracting");
      const stageTimer = window.setTimeout(() => setBookStage("generating"), 1200);
      const result = await requestJson("/api/book-to-skill/upload-generate", {
        method: "POST",
        body: JSON.stringify({ filename: bookFile.name, dataBase64: btoa(binary), skillName: skillName.trim() || undefined, mode: "text", depth: "reference" }),
      });
      window.clearTimeout(stageTimer);
      setBookResult(result);
      setBookStage(result.ok && result.skillDir ? "created" : "failed");
    } catch (e) {
      setBookResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      setBookStage("failed");
    } finally { setBookBusy(false); }
  }

  async function runScientist() {
    setScienceBusy(true);
    try {
      setScienceResult(await requestJson("/api/intelligence/scientific", {
        method: "POST", body: JSON.stringify({ query: scienceQuery, privacyMode: true }),
      }));
    } catch (e) { setScienceResult({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
    finally { setScienceBusy(false); }
  }

  const apiNeedsRestart = Boolean(status?.error);
  const microStatus = apiNeedsRestart ? "RESTART REQUIRED" : status?.micro?.status ?? (loadingHealth ? "CHECKING" : "DEGRADED");
  const scientistStatus = apiNeedsRestart ? "RESTART REQUIRED" : status?.scientist?.status ?? (loadingHealth ? "CHECKING" : "DEGRADED");
  const bookStatus = bookHealth?.ok ? "READY" : loadingHealth ? "CHECKING" : "DEGRADED";

  return (
    <div className="min-h-full bg-[#020817] p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-[#07152a] to-slate-950 p-5 shadow-2xl">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"><BrainCircuit /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-400">Astra intelligence plane</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight">Intelligence Lab</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">Fast local operations, document-to-skill conversion, and provenance-aware scientific research in one controlled workspace.</p>
              </div>
            </div>
            <button onClick={() => void refresh()} disabled={loadingHealth} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-50">
              <RefreshCw size={14} className={loadingHealth ? "animate-spin" : ""} /> Refresh health
            </button>
          </div>
          <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["Astra Micro", microStatus, status?.micro?.model || "local operational model"],
              ["Book-to-Skill", bookStatus, bookHealth?.pythonExists ? "extractor and private Python ready" : "extractor preflight"],
              ["Astra Scientist", scientistStatus, `${status?.scientist?.enabledSkills ?? 0} curated skills · PHI guard ${status?.scientist?.phiGuard ? "on" : "off"}`],
            ].map(([name, health, detail]) => (
              <div key={name} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{name}</span><StatusPill value={String(health)} /></div>
                <p className="mt-2 text-[11px] text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-3">
          <section className="rounded-2xl border border-cyan-400/20 bg-slate-900/75 p-4 shadow-xl">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Sparkles className="text-cyan-300" size={19} /><h2 className="font-black">Micro Astra AI</h2></div><StatusPill value={microStatus} /></div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Low-latency local command understanding, structured extraction, navigation, and department routing.</p>
            <textarea value={microPrompt} onChange={(e) => setMicroPrompt(e.target.value)} rows={5} className="mt-4 w-full resize-none rounded-xl border border-cyan-400/15 bg-slate-950/70 p-3 text-sm outline-none focus:border-cyan-400/50" />
            <button onClick={() => void runMicro()} disabled={microBusy || !microPrompt.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-3 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
              {microBusy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run locally
            </button>
            <div className="mt-4"><Output data={microResult} /></div>
          </section>

          <section className="rounded-2xl border border-amber-400/20 bg-slate-900/75 p-4 shadow-xl">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><BookOpen className="text-amber-300" size={19} /><h2 className="font-black">Book-to-Skill</h2></div><StatusPill value={bookStatus} /></div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Turn an approved local document into a reusable Astra/Hermes skill with extraction, structure analysis, and security scanning.</p>
            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-amber-400/35 bg-amber-400/[0.06] px-3 py-4 text-xs font-bold text-amber-200 hover:bg-amber-400/10">
              <FileUp size={17} /> {bookFile ? bookFile.name : "Upload PDF or document"}
              <input type="file" className="hidden" accept=".pdf,.epub,.docx,.md,.txt,.html,.htm,.rtf" onChange={(e) => { setBookFile(e.target.files?.[0] ?? null); setBookStage("idle"); setBookResult(null); }} />
            </label>
            {bookFile && <p className="mt-2 text-[10px] text-slate-500">{(bookFile.size / 1024 / 1024).toFixed(2)} MB · maximum 30 MB</p>}
            <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-slate-500">Document path</label>
            <input value={bookPath} onChange={(e) => setBookPath(e.target.value)} placeholder="D:\\books\\clinical-guide.pdf" className="mt-1.5 w-full rounded-xl border border-amber-400/15 bg-slate-950/70 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50" />
            <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500">Skill name (optional)</label>
            <input value={skillName} onChange={(e) => setSkillName(e.target.value)} placeholder="dengue-fluid-management" className="mt-1.5 w-full rounded-xl border border-amber-400/15 bg-slate-950/70 px-3 py-2.5 text-sm outline-none focus:border-amber-400/50" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => void runBook("analyze")} disabled={bookBusy} className="flex items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs font-black text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"><Search size={14} /> Analyze</button>
              <button onClick={() => void runBook("generate")} disabled={bookBusy} className="flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-2.5 text-xs font-black text-slate-950 hover:bg-amber-300 disabled:opacity-50">{bookBusy ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />} Generate</button>
            </div>
            <button onClick={() => void uploadAndCreateSkill()} disabled={bookBusy || !bookFile} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-3 py-2.5 text-xs font-black text-slate-950 hover:from-amber-300 hover:to-orange-300 disabled:opacity-40">
              {bookBusy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Upload &amp; create skill
            </button>
            {bookStage !== "idle" && (
              <div className={`mt-3 rounded-xl border p-3 text-xs ${bookStage === "created" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : bookStage === "failed" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>
                <div className="flex items-center gap-2 font-black uppercase tracking-wider">
                  {bookStage === "created" ? <CheckCircle2 size={15} /> : bookStage === "failed" ? <span>!</span> : <Loader2 size={15} className="animate-spin" />}
                  {bookStage === "uploading" ? "Uploading document" : bookStage === "extracting" ? "Extracting text and structure" : bookStage === "generating" ? "Generating and validating skill" : bookStage === "created" ? `Skill created: ${bookResult?.skillName ?? "ready"}` : "Skill creation failed"}
                </div>
                {bookStage === "created" && <p className="mt-1 break-all text-[10px] text-emerald-300/80">Installed at {bookResult?.skillDir}</p>}
              </div>
            )}
            <div className="mt-4"><Output data={bookResult} /></div>
          </section>

          <section className="rounded-2xl border border-violet-400/20 bg-slate-900/75 p-4 shadow-xl">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><FlaskConical className="text-violet-300" size={19} /><h2 className="font-black">Astra Scientist</h2></div><StatusPill value={scientistStatus} /></div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Selects curated research skills, removes direct identifiers, records sources, and always requires clinician review.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-emerald-300"><ShieldCheck size={11} className="mr-1 inline" /> PHI guard</span>
              <span className="rounded-full bg-violet-400/10 px-2 py-1 text-violet-300"><Activity size={11} className="mr-1 inline" /> Provenance ledger</span>
              <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-cyan-300"><CheckCircle2 size={11} className="mr-1 inline" /> Doctor review</span>
            </div>
            <textarea value={scienceQuery} onChange={(e) => setScienceQuery(e.target.value)} rows={5} className="mt-4 w-full resize-none rounded-xl border border-violet-400/15 bg-slate-950/70 p-3 text-sm outline-none focus:border-violet-400/50" />
            <button onClick={() => void runScientist()} disabled={scienceBusy || !scienceQuery.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-3 py-2.5 text-xs font-black text-white hover:bg-violet-400 disabled:opacity-50">
              {scienceBusy ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />} Prepare research plan
            </button>
            <div className="mt-4"><Output data={scienceResult} /></div>
          </section>
        </div>
      </div>
    </div>
  );
}
