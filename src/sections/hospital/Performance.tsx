import { useState } from "react";
import { BrainCircuit, Star } from "lucide-react";
import {
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { deptThroughput } from "@/lib/mock";
import { sleep } from "@/lib/utils";

const staffMetrics = [
  { name: "Meera Nair", throughput: 46, respMin: 2.1, completion: 98, wait: 8 },
  { name: "Ravi Kumar", throughput: 52, respMin: 2.8, completion: 95, wait: 11 },
  { name: "Anjali Verma", throughput: 38, respMin: 3.4, completion: 91, wait: 14 },
  { name: "Sana Iqbal", throughput: 41, respMin: 2.4, completion: 97, wait: 6 },
  { name: "Vikram Shah", throughput: 29, respMin: 4.6, completion: 84, wait: 19 },
];

const suggestions: Record<string, string> = {
  Reception:
    "Reception throughput peaks 11:00–13:00 with wait times spiking to 19 min. Recommend a floating triage desk during that window and pre-visit WhatsApp intake forms — modelled impact: −24% average wait. Also consider auto-routing pharmacy-only visitors past the main queue.",
  Ward:
    "Ward task completion dips to 91% on nights, driven by delayed order acknowledgements. Introduce escalation pings at due+5 min and cross-train two reception staff for basic ward runner duties. Expected improvement: +6 pts completion within two weeks.",
  Pharmacy:
    "Pharmacy response time is strong but stock-variance flags correlate with evening shifts. Recommend barcode double-scan on high-velocity SKUs and a 15-minute end-of-shift reconciliation ritual. This should cut variance events by roughly half.",
};

export function Performance() {
  const { departments, reviews } = useStore();
  const [gen, setGen] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState<string | null>(null);
  const repAvg = reviews.length ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length : 0;

  const generate = async (deptName: string) => {
    if (typing) return;
    setTyping(deptName);
    const full = suggestions[deptName] ?? suggestions.Reception;
    for (let i = 0; i <= full.length; i += 3) {
      await sleep(14);
      setGen((p) => ({ ...p, [deptName]: full.slice(0, i) }));
    }
    setTyping(null);
  };

  return (
    <div className="space-y-4">
      {/* reputation pulse — fed by the Reputation module's logged reviews */}
      <GlassCard className="!p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Star size={18} className="fill-amber-400 text-amber-400" />
          <p className="font-display text-2xl font-bold text-white">{reviews.length ? repAvg.toFixed(1) : "—"}</p>
        </div>
        <p className="text-xs text-slate-400">
          Google reputation · <span className="text-white font-semibold">{reviews.length}</span> review{reviews.length === 1 ? "" : "s"} logged — manage requests, QR standee & doctor averages in <span className="text-amber-300">Reputation</span>
        </p>
      </GlassCard>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GlassCard>
          <SectionTitle title="Department Throughput" subtitle="Visits / tasks completed per day" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptThroughput}>
                <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#10142b", border: "1px solid rgba(212,175,55,0.4)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="reception" stackId="a" fill="#39d5ff" radius={[0, 0, 0, 0]} />
                <Bar dataKey="ward" stackId="a" fill="#d4af37" />
                <Bar dataKey="pharmacy" stackId="a" fill="#f5d97e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Patient Wait Trend" subtitle="Average minutes by day" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={deptThroughput.map((d, i) => ({ day: d.day, wait: [19, 17, 18, 15, 14, 13, 10][i] }))}>
                <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#10142b", border: "1px solid rgba(34,211,238,0.4)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="wait" stroke="#39d5ff" strokeWidth={2.5} dot={{ r: 3, fill: "#39d5ff" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* per-dept AI suggestions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {departments.slice(0, 3).map((d, i) => (
          <GlassCard key={d.id} hover>
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color, boxShadow: `0 0 8px ${d.color}` }} />
              <span className="font-semibold text-white text-sm">{d.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/[0.04] p-2.5"><div className="text-slate-500 text-[10px]">Throughput</div><div className="text-white font-bold text-base">{[137, 46, 106][i % 3]}/day</div></div>
              <div className="rounded-lg bg-white/[0.04] p-2.5"><div className="text-slate-500 text-[10px]">Resp. time</div><div className="text-white font-bold text-base">{[2.6, 3.1, 3.5][i % 3]} min</div></div>
              <div className="rounded-lg bg-white/[0.04] p-2.5"><div className="text-slate-500 text-[10px]">Completion</div><div className="text-white font-bold text-base">{[96, 91, 94][i % 3]}%</div></div>
              <div className="rounded-lg bg-white/[0.04] p-2.5"><div className="text-slate-500 text-[10px]">Patient wait</div><div className="text-white font-bold text-base">{[11, 14, 9][i % 3]} min</div></div>
            </div>
            <button
              className="btn-ghost w-full mt-3 !text-xs"
              disabled={typing === d.name}
              onClick={() => void generate(d.name)}
            >
              <BrainCircuit size={13} className={typing === d.name ? "animate-pulse text-neon-cyan" : ""} />
              {typing === d.name ? "FreeLLMAPI thinking…" : "Generate AI improvement suggestion"}
            </button>
            {gen[d.name] && (
              <p className="text-xs text-slate-300 leading-relaxed mt-3 border-t border-white/10 pt-3">
                {gen[d.name]}
                {typing === d.name && <span className="inline-block w-1.5 h-3 bg-neon-cyan ml-0.5 animate-pulse" />}
              </p>
            )}
          </GlassCard>
        ))}
      </div>

      {/* per-staff table */}
      <GlassCard>
        <SectionTitle title="Per-Staff Metrics" subtitle="Trailing 7 days" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 font-medium">Staff</th>
                <th className="pb-2 font-medium">Throughput (tasks/day)</th>
                <th className="pb-2 font-medium">Response time</th>
                <th className="pb-2 font-medium">Task completion</th>
                <th className="pb-2 font-medium">Avg patient wait</th>
              </tr>
            </thead>
            <tbody>
              {staffMetrics.map((s) => (
                <tr key={s.name} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-2.5 text-white font-medium">{s.name}</td>
                  <td className="py-2.5 text-slate-300">{s.throughput}</td>
                  <td className="py-2.5 text-slate-300">{s.respMin} min</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-white/10 overflow-hidden">
                        <div className={`h-full rounded-full ${s.completion >= 95 ? "bg-emerald-400" : s.completion >= 90 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${s.completion}%` }} />
                      </div>
                      <span className="text-slate-300">{s.completion}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-slate-300">{s.wait} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
