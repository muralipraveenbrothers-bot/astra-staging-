// P2 — Google Reviews / Reputation command centre.
// Real review link + QR standee, manually-synced profile stats, review-request
// funnel (WhatsApp sends logged in the store), and a manual star-entry desk that
// feeds the per-doctor averages.

import { useEffect, useState } from "react";
import { Copy, Printer, QrCode, RefreshCw, Star, TrendingUp } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn, nowTime } from "@/lib/utils";

const REVIEW_URL = "https://g.page/r/CYqtl2U6ObSiEBM/review";

interface RepStats {
  rating: string;
  total: string;
  interactions: string;
  syncedAt: string;
}

const DEFAULT_STATS: RepStats = { rating: "4.6", total: "212", interactions: "534", syncedAt: "" };

function loadStats(): RepStats {
  try {
    const raw = localStorage.getItem("astra.repStats");
    return raw ? { ...DEFAULT_STATS, ...(JSON.parse(raw) as Partial<RepStats>) } : DEFAULT_STATS;
  } catch {
    return DEFAULT_STATS;
  }
}

const DOCTORS = ["Dr. Anitha Rao", "Dr. Karthik Menon", "Dr. Admin"];
const DEPTS = ["General Medicine", "Orthopaedics", "Gynaecology", "Paediatrics", "ENT"];

function Stars({ n, size = 13 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(n) ? "fill-amber-400 text-amber-400" : "text-slate-600"} />
      ))}
    </span>
  );
}

export function Reputation() {
  const { reviews, addReview, sendLog, logAudit } = useStore();
  const [stats, setStats] = useState<RepStats>(loadStats);
  const [editRating, setEditRating] = useState(stats.rating);
  const [editTotal, setEditTotal] = useState(stats.total);
  const [editInteractions, setEditInteractions] = useState(stats.interactions);

  // manual review entry
  const [mPatient, setMPatient] = useState("");
  const [mDoctor, setMDoctor] = useState(DOCTORS[0]);
  const [mDept, setMDept] = useState(DEPTS[0]);
  const [mStars, setMStars] = useState(5);
  const [mNote, setMNote] = useState("");

  useEffect(() => {
    localStorage.setItem("astra.repStats", JSON.stringify(stats));
  }, [stats]);

  const syncStats = () => {
    if (!editRating.trim() || !editTotal.trim()) return;
    setStats({ rating: editRating.trim(), total: editTotal.trim(), interactions: editInteractions.trim() || "0", syncedAt: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}` });
    logAudit("Reputation stats synced", `Google profile — ${editRating}★ · ${editTotal} reviews (manual sync)`);
    toast.success("Profile stats updated", { description: "Manually synced from the Google Business Profile dashboard." });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(REVIEW_URL);
      toast.success("Review link copied", { description: REVIEW_URL });
    } catch {
      toast.info(REVIEW_URL, { description: "Copy the link manually — clipboard blocked by the browser." });
    }
  };

  // funnel: review-request sends are real (sendLog); clicks are simulated
  const sent = sendLog.filter((s) => s.template === "review_request").length;
  const clicked = Math.round(sent * 0.6);
  const received = reviews.length;
  const avg = received ? reviews.reduce((s, r) => s + r.stars, 0) / received : 0;

  const perDoctor = DOCTORS.map((d) => {
    const rows = reviews.filter((r) => r.doctor === d);
    return { doctor: d, count: rows.length, avg: rows.length ? rows.reduce((s, r) => s + r.stars, 0) / rows.length : 0 };
  }).filter((d) => d.count > 0);

  const submitReview = () => {
    if (!mPatient.trim()) return;
    addReview({ patient: mPatient.trim(), doctor: mDoctor, department: mDept, stars: mStars, note: mNote.trim() || undefined });
    logAudit("Review logged", `${mPatient.trim()} — ${mStars}★ for ${mDoctor} (${mDept})`);
    toast.success("Review recorded", { description: `${mStars}★ from ${mPatient.trim()} — feeds doctor averages below.` });
    setMPatient("");
    setMNote("");
    setMStars(5);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ---------------- Google profile + QR standee ---------------- */}
      <GlassCard className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle title="Google Reviews" subtitle="Real review link — point every happy patient here" />
          <Badge tone="amber">Live link</Badge>
        </div>

        {/* profile snapshot (manually synced) */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-center">
              <p className="font-display text-4xl font-bold text-gradient">{stats.rating || "—"}</p>
              <Stars n={Number(stats.rating) || 0} size={14} />
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <p><span className="text-white font-semibold">{stats.total || "—"}</span> Google reviews</p>
              <p><span className="text-white font-semibold">{stats.interactions || "—"}</span> profile interactions (28d)</p>
              <p className="text-slate-500">{stats.syncedAt ? `Synced ${stats.syncedAt} · manual` : "Not synced yet — enter the numbers from your Google Business Profile"}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap items-center">
            <input value={editRating} onChange={(e) => setEditRating(e.target.value)} placeholder="Rating" className="input-dark w-20 text-xs" />
            <input value={editTotal} onChange={(e) => setEditTotal(e.target.value)} placeholder="Reviews" className="input-dark w-24 text-xs" />
            <input value={editInteractions} onChange={(e) => setEditInteractions(e.target.value)} placeholder="Interactions" className="input-dark w-28 text-xs" />
            <button className="btn-ghost text-xs" onClick={syncStats}>
              <RefreshCw size={13} /> Sync manually
            </button>
          </div>
        </div>

        {/* QR standee */}
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-4 flex items-center gap-5 flex-wrap">
          <div className="rounded-xl bg-white p-3 shrink-0">
            <QRCodeSVG value={REVIEW_URL} size={132} level="M" includeMargin={false} />
          </div>
          <div className="flex-1 min-w-[220px] space-y-2.5">
            <p className="text-sm font-semibold text-white flex items-center gap-2"><QrCode size={15} className="text-amber-300" /> Scan → rate us on Google</p>
            <p className="text-[11px] text-slate-400 break-all">{REVIEW_URL}</p>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-neon text-xs" onClick={copyLink}><Copy size={13} /> Copy link</button>
              <button className="btn-ghost text-xs" onClick={() => window.print()}><Printer size={13} /> Print QR standee</button>
            </div>
          </div>
        </div>

        {/* print-only standee */}
        <div className="print-zone hidden print:block text-center">
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#000" }}>Astra Hospital</h2>
          <p style={{ fontSize: 13, color: "#000", margin: "6px 0 14px" }}>Happy with your care? Scan &amp; rate us on Google — it takes 30 seconds.</p>
          <div style={{ display: "inline-block", padding: 12, border: "2px solid #000" }}>
            <QRCodeSVG value={REVIEW_URL} size={220} level="M" />
          </div>
          <p style={{ fontSize: 11, color: "#000", marginTop: 10 }}>{REVIEW_URL}</p>
        </div>
      </GlassCard>

      {/* ---------------- funnel + entry desk ---------------- */}
      <div className="space-y-5">
        <GlassCard>
          <SectionTitle title="Review funnel" subtitle="Requests sent → tapped → reviews received" />
          <div className="grid grid-cols-4 gap-2 mt-3 text-center">
            {[
              { label: "Requests sent", value: sent, hint: "WhatsApp log" },
              { label: "Link tapped", value: clicked, hint: "simulated 60%" },
              { label: "Reviews in", value: received, hint: "manual entry" },
              { label: "Rolling avg", value: received ? avg.toFixed(1) : "—", hint: "manual entries" },
            ].map((f) => (
              <div key={f.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="font-display text-2xl font-bold text-white">{f.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{f.label}</p>
                <p className="text-[9px] text-slate-600">{f.hint}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-3">
            Requests go out from the registration receipt and discharge summary ("Send Google review request"). Tap-through is an estimate — Google's console has the real number.
          </p>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Log a received review" subtitle="Reception enters reviews seen on Google — drives doctor averages" />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <input value={mPatient} onChange={(e) => setMPatient(e.target.value)} placeholder="Patient name / initials" className="input-dark text-xs col-span-2" />
            <select value={mDoctor} onChange={(e) => setMDoctor(e.target.value)} className="input-dark text-xs">
              {DOCTORS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select value={mDept} onChange={(e) => setMDept(e.target.value)} className="input-dark text-xs">
              {DEPTS.map((d) => <option key={d}>{d}</option>)}
            </select>
            <div className="col-span-2 flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Stars:</span>
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} onClick={() => setMStars(i)} className="p-0.5">
                  <Star size={18} className={cn(i <= mStars ? "fill-amber-400 text-amber-400" : "text-slate-600 hover:text-slate-400")} />
                </button>
              ))}
            </div>
            <input value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Review note (optional)" className="input-dark text-xs col-span-2" />
          </div>
          <button className="btn-neon text-xs mt-3 w-full" disabled={!mPatient.trim()} onClick={submitReview}>
            <Star size={13} /> Record review
          </button>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle title="Doctor leaderboard" subtitle="Average stars from logged reviews" />
            <TrendingUp size={15} className="text-emerald-300" />
          </div>
          {perDoctor.length === 0 ? (
            <p className="text-xs text-slate-500">No reviews logged yet — entries above appear here instantly.</p>
          ) : (
            <div className="space-y-2">
              {perDoctor.sort((a, b) => b.avg - a.avg).map((d) => (
                <div key={d.doctor} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-white flex-1">{d.doctor}</span>
                  <Stars n={d.avg} />
                  <span className="text-xs text-slate-400 w-14 text-right">{d.avg.toFixed(1)} · {d.count}</span>
                </div>
              ))}
            </div>
          )}
          {reviews.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 max-h-40 overflow-y-auto">
              {reviews.slice(0, 6).map((r) => (
                <div key={r.id} className="text-[11px] text-slate-400 flex items-center gap-2">
                  <Stars n={r.stars} size={10} />
                  <span className="text-slate-300">{r.patient}</span>
                  <span className="text-slate-600">· {r.department}{r.note ? ` · “${r.note}”` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
