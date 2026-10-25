import { useState } from "react";
import { Camera, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { nowTime, randInt, sleep } from "@/lib/utils";

interface CamFeed {
  id: string;
  name: string;
  gradient: string;
  note: string;
}

const baseFeeds: CamFeed[] = [
  { id: "cam-reception", name: "Reception — Cam 01", gradient: "from-cyan-900/60 via-ink-800 to-black", note: "staff present: yes · queue: 3 · PPE: ok" },
  { id: "cam-ward", name: "Ward A — Cam 04", gradient: "from-violet-900/60 via-ink-800 to-black", note: "staff present: yes · beds occupied: 18/22 · PPE: ok" },
  { id: "cam-pharmacy", name: "Pharmacy — Cam 07", gradient: "from-fuchsia-900/60 via-ink-800 to-black", note: "staff present: yes · queue: 1 · controlled cabinet: locked" },
];

export function Monitoring() {
  const [feeds, setFeeds] = useState(baseFeeds);
  const [stamp, setStamp] = useState(nowTime());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await sleep(900);
    setFeeds(
      baseFeeds.map((f) => ({
        ...f,
        note:
          f.id === "cam-reception"
            ? `staff present: yes · queue: ${randInt(0, 6)} · PPE: ok`
            : f.id === "cam-ward"
              ? `staff present: yes · beds occupied: ${randInt(15, 22)}/22 · PPE: ok`
              : `staff present: yes · queue: ${randInt(0, 3)} · controlled cabinet: locked`,
      }))
    );
    setStamp(nowTime());
    setRefreshing(false);
    toast.success("Stills refreshed", { description: "Vision model re-analysed all 3 frames." });
  };

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SectionTitle title="Camera Stills" subtitle={`Structured AI analysis · captured ${stamp}`} />
          <button className="btn-ghost !text-xs" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh stills
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {feeds.map((f) => (
            <div key={f.id} className="rounded-xl overflow-hidden border border-white/10">
              <div className={`relative h-40 bg-gradient-to-br ${f.gradient} flex items-center justify-center`}>
                {/* simulated silhouettes */}
                <div className="absolute bottom-4 left-6 h-10 w-6 rounded-t-full bg-white/[0.07]" />
                <div className="absolute bottom-4 left-16 h-12 w-7 rounded-t-full bg-white/[0.05]" />
                <div className="absolute bottom-4 right-8 h-9 w-6 rounded-t-full bg-white/[0.06]" />
                <Camera size={22} className="text-white/20" />
                <span className="absolute top-2 left-2 text-[9px] font-mono text-slate-400 bg-black/50 rounded px-1.5 py-0.5">
                  ● {stamp} · STILL
                </span>
                <span className="absolute top-2 right-2 text-[9px] font-mono text-cyan-300 bg-black/50 rounded px-1.5 py-0.5">AI-VISION</span>
              </div>
              <div className="p-3 bg-ink-900/70">
                <div className="text-xs font-semibold text-white">{f.name}</div>
                <p className="text-[11px] font-mono text-emerald-300/80 mt-1">{f.note}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4 text-[11px] text-slate-500">
          <ShieldCheck size={13} className="text-emerald-400" />
          Retention policy: stills kept 30 days, then auto-purged. Analysis metadata kept 1 year. Access is role-gated and audit-logged. No continuous video is stored.
        </div>
      </GlassCard>

      {/* weekly rollup */}
      <GlassCard>
        <SectionTitle title="Weekly Rollup" subtitle="Vision-analytics digest · Mon–Sun" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Avg reception queue", value: "3.2", trend: "▼ from 4.1 last week", color: "#39d5ff" },
            { label: "PPE compliance", value: "98.4%", trend: "▲ 0.6 pts", color: "#34d399" },
            { label: "Staff-presence gaps", value: "7", trend: "▼ 3 vs last week", color: "#fbbf24" },
            { label: "After-hours motion events", value: "2", trend: "both cleared by security", color: "#f5d97e" },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{k.label}</div>
              <div className="text-2xl font-bold font-display mt-1" style={{ color: k.color }}>{k.value}</div>
              <div className="text-[10px] text-slate-500 mt-1">{k.trend}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Badge tone="cyan">AI note</Badge>
          <p className="text-xs text-slate-400 mt-2">
            Queue peaks remain concentrated 11:00–13:00 at Reception. Recommend trialing a pre-visit intake form push via WhatsApp 30 minutes before appointments — projected to cut peak queue depth by ~35%.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
