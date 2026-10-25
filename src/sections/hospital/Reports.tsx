// Analytics & Reporting — financial statements computed from the billing
// ledger + pharmacy purchase register, KPI snapshot, department-wise tables,
// print-ready report (.print-zone) and a CEO WhatsApp daily report.

import { useMemo, useState } from "react";
import { BedDouble, Clock, IndianRupee, MessageCircle, Printer, Stethoscope, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn, fmtINR, nowTime } from "@/lib/utils";
import type { Bill } from "@/lib/types";

type Period = "daily" | "monthly" | "ytd";

function classify(b: Bill): string {
  const s = b.service.toLowerCase();
  if (s.startsWith("pharmacy")) return "Pharmacy";
  if (b.kind === "IP" || s.includes("ward") || s.includes("discharge")) return "Ward / IP";
  if (s.includes("panel") || s.includes("cbc") || s.includes("lab") || s.includes("esr")) return "Lab & Diagnostics";
  if (s.includes("ot") || s.includes("surgery") || s.includes("procedure")) return "OT & Procedures";
  return "OP Consultation";
}

export function Reports() {
  const { bills, purchases, dispenses, discharged, beds, patients, addSendLog, logAudit } = useStore();
  const [period, setPeriod] = useState<Period>("daily");

  // Bills carry time-of-day timestamps in this build (all "today"), so the
  // Daily view = full ledger; Monthly/YTD reuse the same ledger and are
  // labelled as simulated projections.
  const data = useMemo(() => {
    const multiplier = period === "daily" ? 1 : period === "monthly" ? 26 : 365;
    const rawRevenue = bills.reduce((s, b) => s + b.amount, 0);
    const byDept = new Map<string, { count: number; total: number }>();
    bills.forEach((b) => {
      const k = classify(b);
      const cur = byDept.get(k) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += b.amount;
      byDept.set(k, cur);
    });
    const byMode = new Map<string, number>();
    bills.forEach((b) => byMode.set(b.mode, (byMode.get(b.mode) ?? 0) + b.amount));
    const pharmSales = bills.filter((b) => classify(b) === "Pharmacy").reduce((s, b) => s + b.amount, 0);
    const pharmPurchases = purchases.reduce((s, p) => s + p.amount, 0);
    const scale = (n: number) => n * multiplier;
    return {
      revenue: scale(rawRevenue),
      byDept: [...byDept.entries()].map(([k, v]) => [k, { count: v.count * multiplier, total: scale(v.total) }] as [string, { count: number; total: number }]).sort((a, b) => b[1].total - a[1].total),
      byMode: [...byMode.entries()].map(([k, v]) => [k, scale(v)] as [string, number]),
      pharmSales: scale(pharmSales),
      pharmPurchases: scale(pharmPurchases),
      margin: scale(pharmSales) - scale(pharmPurchases),
    };
  }, [bills, purchases, period]);

  const occupiedBeds = beds.filter((b) => b.status === "occupied").length;
  const periodLabel = period === "daily" ? `Today · ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : period === "monthly" ? "This month (projected ×26)" : "Year to date (projected ×365)";
  const dispensedUnits = dispenses.reduce((s, d) => s + d.qty, 0);

  // Pure counts from the billing ledger and the bed list. These tiles used to
  // add fixed offsets ("134 +" OP visits, "38 -" IP census), which reported
  // patients who were never registered (audit 2026-09-26 40).
  const opVisits = bills.filter((b) => classify(b) === "OP Consultation").length;
  const reversals = bills.filter((b) => b.reversalOf).length;

  const sendCeoReport = () => {
    addSendLog({ provider: "WhatsApp", template: "ceo_daily_report", recipient: "Hospital CEO / Admin", status: "sent" });
    logAudit("CEO report sent", `${periodLabel} — revenue ${fmtINR(data.revenue)} · ${bills.length} receipts`, "Reports");
    toast.success("Daily report sent to CEO via WhatsApp", { description: "ceo_daily_report template → send-log (simulated send)." });
  };

  const kpis = [
    { label: "OP Visits", value: opVisits, icon: Stethoscope, color: "#39d5ff", note: `${patients.length} patient records on file` },
    { label: "IP Census", value: occupiedBeds, icon: BedDouble, color: "#d4af37", note: `${occupiedBeds} of ${beds.length} tracked beds occupied` },
    { label: "Discharges", value: discharged.length, icon: Clock, color: "#34d399", note: "Cleared discharge records" },
    { label: "Net Receipts", value: bills.length ? Math.round(((bills.length - reversals) / bills.length) * 100) : 0, suffix: "%", icon: TrendingUp, color: "#f5d97e", note: `${bills.length} receipts, ${reversals} reversals` },
  ];

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SectionTitle title="Analytics & Reporting" subtitle={periodLabel} />
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex gap-1">
              {(["daily", "monthly", "ytd"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-lg px-3.5 py-1.5 text-xs font-semibold border transition-all capitalize",
                    period === p ? "bg-violet-500/20 text-white border-violet-400/50" : "text-slate-400 border-white/10 hover:text-white"
                  )}
                >
                  {p === "ytd" ? "YTD" : p}
                </button>
              ))}
            </div>
            <button className="btn-ghost !text-xs !py-1.5" onClick={() => window.print()}><Printer size={13} /> Print report</button>
            <button className="btn-neon !text-xs !py-1.5" onClick={sendCeoReport}><MessageCircle size={13} /> Send daily report to CEO</button>
          </div>
        </div>

        {/* KPI snapshot */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500">{k.label}</p>
                <k.icon size={14} style={{ color: k.color }} />
              </div>
              <p className="text-2xl font-bold text-white mt-1 tabular-nums">
                {k.value}{k.suffix ?? ""}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">{k.note}</p>
            </div>
          ))}
        </div>

        {/* printable statement */}
        <div className="print-zone rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h3 className="font-display text-lg font-bold text-white">PM Brothers Multispeciality Hospital</h3>
              <p className="text-[11px] text-slate-500">Financial & operations statement — {periodLabel}</p>
            </div>
            <p className="text-[10px] text-slate-600">Generated {new Date().toLocaleDateString("en-IN")} {nowTime()} · Astra AI</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-[11px] text-slate-500">Total revenue</p>
              <p className="text-2xl font-bold text-violet-300 flex items-center gap-1"><IndianRupee size={18} />{data.revenue.toLocaleString("en-IN")}</p>
              <p className="text-[10px] text-slate-500 mt-1">{bills.length} receipts on the ledger</p>
            </div>
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-[11px] text-slate-500 mb-1.5">Payment-mode split</p>
              {data.byMode.map(([m, amt]) => (
                <div key={m} className="flex justify-between text-xs py-0.5">
                  <span className="text-slate-300">{m}</span>
                  <span className="text-slate-200 font-medium">{fmtINR(amt)} <span className="text-slate-500">({Math.round((amt / Math.max(1, data.revenue)) * 100)}%)</span></span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-[11px] text-slate-500 mb-1.5">Pharmacy trading</p>
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-300">Sales (billed)</span><span className="text-cyan-300">{fmtINR(data.pharmSales)}</span></div>
                <div className="flex justify-between"><span className="text-slate-300">Purchases (register)</span><span className="text-amber-300">{fmtINR(data.pharmPurchases)}</span></div>
                <div className="flex justify-between border-t border-white/10 pt-0.5 mt-0.5">
                  <span className="text-slate-300">Est. margin</span>
                  <span className={data.margin >= 0 ? "text-emerald-300 font-semibold" : "text-red-300 font-semibold"}>{fmtINR(data.margin)}</span>
                </div>
                <p className="text-[10px] text-slate-600 pt-1">{dispensedUnits} units dispensed</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Revenue by department</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-white/10">
                  <th className="pb-1.5 font-medium">Department</th>
                  <th className="pb-1.5 font-medium text-right">Receipts</th>
                  <th className="pb-1.5 font-medium text-right">Revenue</th>
                  <th className="pb-1.5 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.byDept.map(([dept, v]) => (
                  <tr key={dept} className="border-b border-white/5">
                    <td className="py-1.5 text-slate-200">{dept}</td>
                    <td className="py-1.5 text-right text-slate-400">{v.count}</td>
                    <td className="py-1.5 text-right text-slate-200 font-medium">{fmtINR(v.total)}</td>
                    <td className="py-1.5 text-right text-slate-400">{Math.round((v.total / Math.max(1, data.revenue)) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-slate-600 border-t border-white/5 pt-2">
            Monthly / YTD figures project the current ledger (×26 / ×365) for trend review. Daily view reflects the live ledger.
            Compiled by Astra AI · Kautilya AI — for internal review only.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
