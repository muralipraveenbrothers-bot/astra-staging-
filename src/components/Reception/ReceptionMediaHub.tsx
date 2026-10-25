import { useMemo, useRef, useState } from "react";
import { BookOpen, CheckCircle2, ExternalLink, Loader2, Pause, Play, Printer, Volume2 } from "lucide-react";
import { toast } from "sonner";

const PRINT_JOBS = [
  { id: "OP-09", title: "OP registration card · B. Balamani", type: "Registration" },
  { id: "BILL-114", title: "Consultation bill · Token 09", type: "Billing" },
  { id: "LAB-221", title: "Lab labels · UHID-2026-8801", type: "Laboratory" },
  { id: "RX-078", title: "Prescription summary · Rajesh Kumar", type: "Pharmacy" },
];

const DAILY_TOPICS = [
  ["Dengue warning signs and safe hydration", "డెంగ్యూ హెచ్చరిక లక్షణాలు మరియు సురక్షిత హైడ్రేషన్"],
  ["Diabetes medicines and meal timing", "మధుమేహ మందులు మరియు భోజన సమయం"],
  ["Blood pressure: when to seek urgent care", "రక్తపోటు: అత్యవసర వైద్యం ఎప్పుడు అవసరం"],
  ["Preventing falls in older adults", "వృద్ధుల్లో పడిపోవడాన్ని నివారించడం"],
  ["Antibiotics: why the full course matters", "యాంటీబయాటిక్స్ పూర్తి కోర్స్ ఎందుకు ముఖ్యం"],
  ["Pregnancy danger signs and timely referral", "గర్భధారణ ప్రమాద సంకేతాలు మరియు సకాలంలో రిఫరల్"],
  ["Child fever: home care and red flags", "పిల్లల జ్వరం: ఇంటి సంరక్షణ మరియు ప్రమాద సంకేతాలు"],
] as const;

function topicsForToday() {
  const today = new Date();
  const day = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
  return [DAILY_TOPICS[day % DAILY_TOPICS.length], DAILY_TOPICS[(day + 3) % DAILY_TOPICS.length]];
}

export function ReceptionMediaHub({ view = "all" }: { view?: "all" | "print" | "broadcast" }) {
  const topics = useMemo(topicsForToday, []);
  const [language, setLanguage] = useState<"en-IN" | "te-IN" | "hi-IN">("te-IN");
  const [playing, setPlaying] = useState<number | null>(null);
  const [printed, setPrinted] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = (index: number) => {
    audioRef.current?.pause();
    if (playing === index) { setPlaying(null); return; }
    const [english, telugu] = topics[index];
    const title = language === "te-IN" ? telugu : english;
    const script = language === "te-IN"
      ? `${title}. ఇది పి ఎం బ్రదర్స్ హాస్పిటల్ ఆస్త్రా ఆరోగ్య పాడ్‌కాస్ట్. లక్షణాలు తీవ్రమైతే లేదా సందేహం ఉంటే వైద్యుడిని సంప్రదించండి. స్వయంగా మందులు మార్చవద్దు.`
      : language === "hi-IN"
        ? `${english}. यह पीएम ब्रदर्स अस्पताल का आज का एस्ट्रा स्वास्थ्य पॉडकास्ट है। गंभीर लक्षण या चिंता होने पर डॉक्टर से संपर्क करें। अपनी दवा स्वयं न बदलें।`
        : `${english}. This is today's Astra health podcast from PM Brothers Hospital. Contact a doctor for severe symptoms or concerns, and do not change prescribed medicines without clinical advice.`;
    const audio = new Audio(`/api/voicebox/audio-proxy?text=${encodeURIComponent(script)}&lang=${encodeURIComponent(language)}&profile=astra_ai`);
    audioRef.current = audio;
    setPlaying(index);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => { setPlaying(null); toast.error("Voicebox could not generate this podcast", { description: "Check the local Voicebox service, then try again." }); };
    void audio.play();
  };

  return (
    <div className="space-y-4">
      {(view === "all" || view === "print") && <section id="unified-print-queue" className="rounded-2xl border border-amber-400/20 bg-slate-900/90 p-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white"><Printer className="h-4 w-4 text-amber-300" /> Unified Print Queue</h3>
          <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-200">{PRINT_JOBS.length - printed.length} pending</span>
        </div>
        <div className="mt-3 space-y-2">
          {PRINT_JOBS.map((job) => {
            const done = printed.includes(job.id);
            return <div key={job.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
              <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-200">{job.title}</p><p className="text-[9px] text-slate-500">{job.id} · {job.type}</p></div>
              <button disabled={done} onClick={() => { window.print(); setPrinted((p) => [...p, job.id]); }} className="rounded-lg border border-amber-400/25 px-2 py-1 text-[10px] font-bold text-amber-200 disabled:border-emerald-400/20 disabled:text-emerald-300">{done ? <><CheckCircle2 className="mr-1 inline h-3 w-3" />Sent</> : "Print"}</button>
            </div>;
          })}
        </div>
      </section>}

      {(view === "all" || view === "broadcast") && <section id="daily-podcast-studio" className="rounded-2xl border border-cyan-400/20 bg-slate-900/90 p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white"><Volume2 className="h-4 w-4 text-cyan-300" /> Daily Health Podcast Studio</h3><p className="mt-1 text-[9px] text-slate-500">Two new topics each day · generated locally with Astra Voicebox</p></div>
          <select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-200"><option value="te-IN">తెలుగు</option><option value="hi-IN">हिंदी</option><option value="en-IN">English</option></select>
        </div>
        <div className="mt-3 space-y-2">
          {topics.map(([en, te], index) => <div key={en} className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3">
            <div className="flex items-center gap-3"><button onClick={() => play(index)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-slate-950">{playing === index ? <Pause size={15} /> : <Play size={15} />}</button><div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-slate-100">{language === "te-IN" ? te : en}</p><p className="mt-1 text-[9px] text-emerald-300">READY TO PLAY · Episode {index + 1}</p></div></div>
          </div>)}
        </div>
        <button onClick={() => window.open("https://notebooklm.google.com/", "_blank", "noopener,noreferrer")} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold text-slate-300 hover:bg-white/10"><BookOpen size={13} /> Open Google NotebookLM source studio <ExternalLink size={11} /></button>
        <p className="mt-2 text-[9px] leading-4 text-slate-500">NotebookLM opens in its official account workspace. Astra keeps daily playback local so hospital audio does not depend on a cloud session.</p>
      </section>}
    </div>
  );
}
