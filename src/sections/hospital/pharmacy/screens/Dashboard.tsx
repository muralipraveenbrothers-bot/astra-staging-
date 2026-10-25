// Sparta pharmacy Dashboard — date-range collection summary (OP / IP / Direct
// sales & returns by Cash/Card/UPI, total collection, expenses, grand total)
// plus a Profit Audit card (sales revenue − purchase cost of sold items, per
// GST tax category) with a "send audit to CEO & Doctor" action wired to the
// app-wide notification send-log. All figures computed live from usePharm().

import { useMemo, useState } from "react";
import { Database, Download, IndianRupee, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn, fmtINR } from "@/lib/utils";
import { downloadCsv, itemById, todayISO, usePharm } from "../pharmData";
import type { InvKind, SaleReturn } from "../pharmData";

type CashMode = "Cash" | "Card" | "UPI";
const MODES: CashMode[] = ["Cash", "Card", "UPI"];
const KINDS: { kind: InvKind; label: string }[] = [
  { kind: "OP", label: "OP SALES" },
  { kind: "IP", label: "IP SALES" },
  { kind: "Direct", label: "DIRECT SALES" },
];

interface ModeSums {
  Cash: number;
  Card: number;
  UPI: number;
  total: number;
  due: number;
}

const zero = (): ModeSums => ({ Cash: 0, Card: 0, UPI: 0, total: 0, due: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Attribute a return to the payment mode of its original invoice. */
function returnMode(r: SaleReturn, modeByInvNo: Map<string, string>): CashMode | null {
  const m = modeByInvNo.get(r.invNo);
  return m === "Cash" || m === "Card" || m === "UPI" ? m : null;
}

function MoneyCard({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: { label: string; value: number; strong?: boolean }[];
  accent: "gold" | "red" | "cyan";
}) {
  const tile =
    accent === "red"
      ? "from-red-500/25 to-red-600/10 text-red-300 border-red-400/30"
      : accent === "cyan"
        ? "from-cyan-500/25 to-violet-500/10 text-neon-cyan border-cyan-400/30"
        : "from-amber-500/30 to-yellow-600/10 text-amber-300 border-amber-400/30";
  return (
    <GlassCard className="!p-4">
      <div className="flex items-stretch gap-4">
        <div className={cn("w-16 shrink-0 rounded-xl border bg-gradient-to-br flex items-center justify-center", tile)}>
          <IndianRupee size={26} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-500/80 mb-1.5">{title}</p>
          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-2 text-xs">
                <span className={cn("uppercase tracking-wide", r.strong ? "text-slate-200 font-semibold" : "text-slate-500")}>
                  {r.label}
                </span>
                <span className="text-slate-600 mx-1 flex-1 border-b border-dotted border-white/10" />
                <span className={cn("font-mono", r.strong ? "text-white font-semibold" : "text-slate-300")}>
                  ₹&nbsp;{fmtINR(r.value).replace(/^₹\s?/, "")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

export function PharmDashboard() {
  const { ph } = usePharm();
  const { addSendLog } = useStore();

  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [applied, setApplied] = useState<{ start: string; end: string }>({ start: todayISO(), end: todayISO() });

  /* ---------------- aggregation over applied range ---------------- */
  const agg = useMemo(() => {
    const inRange = (d: string) => d >= applied.start && d <= applied.end;
    const invs = ph.invoices.filter((i) => i.status === "submitted" && inRange(i.date));
    const rets = ph.returns.filter((r) => inRange(r.date));
    const exps = ph.expenses.filter((e) => inRange(e.date));
    const modeByInvNo = new Map(ph.invoices.map((i) => [i.invNo, i.mode] as const));

    // sales per kind (net billed, by tender mode; due balances tracked apart)
    const sales: Record<InvKind, ModeSums> = { OP: zero(), IP: zero(), Direct: zero() };
    let dueTotal = 0;
    for (const inv of invs) {
      const s = sales[inv.kind];
      if (inv.mode === "Due") {
        s.due = r2(s.due + inv.net);
      } else {
        s[inv.mode] = r2(s[inv.mode] + inv.net);
        s.total = r2(s.total + inv.net);
      }
      dueTotal = r2(dueTotal + inv.due);
    }

    // returns per kind (attributed to original invoice mode where known)
    const returns: Record<InvKind, ModeSums> = { OP: zero(), IP: zero(), Direct: zero() };
    const returnsByMode: Record<CashMode, number> = { Cash: 0, Card: 0, UPI: 0 };
    for (const r of rets) {
      const s = returns[r.kind];
      s.total = r2(s.total + r.total);
      const m = returnMode(r, modeByInvNo);
      if (m) {
        s[m] = r2(s[m] + r.total);
        returnsByMode[m] = r2(returnsByMode[m] + r.total);
      }
    }

    // collections: money actually received (paid) minus returns refunded
    const collection: ModeSums = zero();
    for (const inv of invs) {
      if (inv.mode === "Due") continue; // due balances collect via Due Collections screen
      collection[inv.mode] = r2(collection[inv.mode] + inv.paid);
    }
    for (const m of MODES) collection[m] = r2(collection[m] - returnsByMode[m]);
    collection.total = r2(collection.Cash + collection.Card + collection.UPI);

    // expenses (total + per mode for grand-total netting)
    const expByMode: Record<CashMode, number> = { Cash: 0, Card: 0, UPI: 0 };
    let expTotal = 0;
    for (const e of exps) {
      expByMode[e.mode] = r2(expByMode[e.mode] + e.amount);
      expTotal = r2(expTotal + e.amount);
    }

    // grand total = collections − expenses, per mode
    const grand: ModeSums = zero();
    for (const m of MODES) grand[m] = r2(collection[m] - expByMode[m]);
    grand.total = r2(grand.Cash + grand.Card + grand.UPI);
    grand.due = dueTotal;

    /* -------- profit audit: revenue − purchase cost of sold items -------- */
    const audit = new Map<string, { revenue: number; cost: number }>();
    for (const inv of invs) {
      for (const si of inv.items) {
        const item = itemById(ph, si.itemId);
        const taxCat = item?.taxCat ?? "UNMAPPED";
        const batch = ph.batches.find((b) => b.itemId === si.itemId && b.batchNo === si.batchNo);
        const costRate = batch?.rate ?? item?.rate ?? 0;
        const row = audit.get(taxCat) ?? { revenue: 0, cost: 0 };
        row.revenue = r2(row.revenue + si.amount);
        row.cost = r2(row.cost + si.qty * costRate);
        audit.set(taxCat, row);
      }
    }
    const auditRows = [...audit.entries()]
      .map(([taxCat, v]) => ({ taxCat, revenue: v.revenue, cost: v.cost, margin: r2(v.revenue - v.cost) }))
      .sort((a, b) => a.taxCat.localeCompare(b.taxCat));
    const auditTotal = auditRows.reduce(
      (acc, r) => ({ revenue: r2(acc.revenue + r.revenue), cost: r2(acc.cost + r.cost), margin: r2(acc.margin + r.margin) }),
      { revenue: 0, cost: 0, margin: 0 },
    );

    return { sales, returns, collection, expTotal, grand, auditRows, auditTotal, counts: { invs: invs.length, rets: rets.length, exps: exps.length } };
  }, [ph, applied]);

  /* ---------------- actions ---------------- */
  const getData = () => {
    if (start > end) {
      toast.error("Invalid range", { description: "Start date must be on or before end date." });
      return;
    }
    setApplied({ start, end });
    toast.success("Dashboard refreshed", { description: `${start} → ${end} · recomputed from live pharmacy ledger.` });
  };

  const doExport = () => {
    const rows: (string | number)[][] = [];
    const pushCard = (title: string, s: ModeSums, withDue = false) => {
      rows.push([title, "CASH", s.Cash], [title, "CARD", s.Card], [title, "UPI", s.UPI], [title, "TOTAL", s.total]);
      if (withDue) rows.push([title, "DUE TOTAL", s.due]);
    };
    for (const { kind, label } of KINDS) pushCard(label, agg.sales[kind]);
    pushCard("OP SALE RETURNS", agg.returns.OP);
    pushCard("IP SALE RETURNS", agg.returns.IP);
    pushCard("DIRECT SALE RETURNS", agg.returns.Direct);
    pushCard("TOTAL COLLECTION", agg.collection);
    rows.push(["PHARMACY EXPENSES", "TOTAL", agg.expTotal]);
    pushCard("GRAND TOTAL", agg.grand, true);
    rows.push([]);
    rows.push(["PROFIT AUDIT", "TAX CATEGORY | REVENUE | COST | MARGIN", ""]);
    for (const r of agg.auditRows) rows.push(["PROFIT AUDIT", r.taxCat, `${r.revenue} | ${r.cost} | ${r.margin}`]);
    rows.push(["PROFIT AUDIT", "TOTAL", `${agg.auditTotal.revenue} | ${agg.auditTotal.cost} | ${agg.auditTotal.margin}`]);
    downloadCsv(`pharmacy-dashboard-${applied.start}-to-${applied.end}.csv`, ["Section", "Row", "Amount (INR)"], rows);
    toast.success("Export downloaded", { description: "Dashboard summary + profit audit saved as CSV." });
  };

  const sendAudit = () => {
    // wired to the app-wide notification send-log (Notifications → Send Log)
    const summary = `revenue ${fmtINR(agg.auditTotal.revenue)} · cost ${fmtINR(agg.auditTotal.cost)} · margin ${fmtINR(agg.auditTotal.margin)}`;
    addSendLog({ provider: "WhatsApp", template: "pharm_profit_audit", recipient: "Dr. Admin (CEO)", status: "sent" });
    addSendLog({ provider: "Internal", template: "pharm_profit_audit", recipient: "Consulting Doctor", status: "sent" });
    toast.success("Profit audit dispatched", {
      description: `${applied.start} → ${applied.end} · ${summary} · logged for CEO (WhatsApp) & Doctor (Internal) in the send-log.`,
    });
  };

  /* ---------------- render ---------------- */
  const cardRows = (s: ModeSums): { label: string; value: number; strong?: boolean }[] => [
    { label: "Cash", value: s.Cash },
    { label: "Card", value: s.Card },
    { label: "UPI", value: s.UPI },
    { label: "Total", value: s.total, strong: true },
  ];

  return (
    <div className="space-y-4">
      {/* -------- date range toolbar -------- */}
      <GlassCard className="!p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-1">Start Date</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="input-dark !w-auto !py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-1">End Date</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="input-dark !w-auto !py-1.5 text-xs"
            />
          </div>
          <button className="btn-neon !text-xs !py-2" onClick={getData}>
            <Database size={13} /> Get Data
          </button>
          <button className="btn-ghost !text-xs !py-2" onClick={() => window.print()}>
            <Printer size={13} /> Print
          </button>
          <button className="btn-ghost !text-xs !py-2 !border-red-400/40 !text-red-300 hover:!bg-red-400/10" onClick={doExport}>
            <Download size={13} /> Export
          </button>
          <p className="text-[10px] text-amber-500/70 italic ml-auto">
            Click on Get Data to show amounts · range {applied.start} → {applied.end} ·{" "}
            {agg.counts.invs} invoices / {agg.counts.rets} returns / {agg.counts.exps} expenses
          </p>
        </div>
      </GlassCard>

      {/* -------- summary cards (Sparta layout: 3×3) -------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <MoneyCard title="OP Sales" rows={cardRows(agg.sales.OP)} accent="cyan" />
        <MoneyCard title="IP Sales" rows={cardRows(agg.sales.IP)} accent="cyan" />
        <MoneyCard title="Direct Sales" rows={cardRows(agg.sales.Direct)} accent="cyan" />
        <MoneyCard title="OP Sale Returns" rows={cardRows(agg.returns.OP)} accent="red" />
        <MoneyCard title="IP Sale Returns" rows={cardRows(agg.returns.IP)} accent="red" />
        <MoneyCard title="Direct Sale Returns" rows={cardRows(agg.returns.Direct)} accent="red" />
        <MoneyCard title="Total Collection" rows={cardRows(agg.collection)} accent="gold" />
        <MoneyCard title="Pharmacy Expenses" rows={[{ label: "Total", value: agg.expTotal, strong: true }]} accent="gold" />
        <MoneyCard
          title="Grand Total"
          rows={[...cardRows(agg.grand), { label: "Due Total", value: agg.grand.due, strong: true }]}
          accent="gold"
        />
      </div>

      {/* -------- profit audit -------- */}
      <GlassCard>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-gradient">Profit Audit</h3>
            <p className="text-[11px] text-slate-500">
              Sales revenue − purchase cost of sold items (batch rate, FEFO-traced) · {applied.start} → {applied.end} ·
              returns excluded
            </p>
          </div>
          <button className="btn-neon !text-xs !py-2" onClick={sendAudit}>
            <Send size={13} /> Send audit to CEO &amp; Doctor
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 pr-3 font-medium">Tax Category</th>
                <th className="pb-2 pr-3 font-medium text-right">Sales Revenue</th>
                <th className="pb-2 pr-3 font-medium text-right">Purchase Cost</th>
                <th className="pb-2 pr-3 font-medium text-right">Margin</th>
                <th className="pb-2 font-medium text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {agg.auditRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-600">
                    No submitted sales in the selected range.
                  </td>
                </tr>
              )}
              {agg.auditRows.map((r) => (
                <tr key={r.taxCat} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-2 pr-3 font-mono text-neon-cyan">{r.taxCat}</td>
                  <td className="py-2 pr-3 text-right text-slate-300">{fmtINR(r.revenue)}</td>
                  <td className="py-2 pr-3 text-right text-slate-300">{fmtINR(r.cost)}</td>
                  <td className={cn("py-2 pr-3 text-right font-semibold", r.margin >= 0 ? "text-emerald-300" : "text-red-300")}>
                    {fmtINR(r.margin)}
                  </td>
                  <td className={cn("py-2 text-right font-mono", r.margin >= 0 ? "text-emerald-400/80" : "text-red-400/80")}>
                    {r.revenue > 0 ? `${((r.margin / r.revenue) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
              {agg.auditRows.length > 0 && (
                <tr className="border-t border-amber-400/30">
                  <td className="py-2.5 pr-3 font-semibold text-amber-300 uppercase tracking-wide text-[11px]">Total</td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-white">{fmtINR(agg.auditTotal.revenue)}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-white">{fmtINR(agg.auditTotal.cost)}</td>
                  <td className={cn("py-2.5 pr-3 text-right font-bold", agg.auditTotal.margin >= 0 ? "text-emerald-300" : "text-red-300")}>
                    {fmtINR(agg.auditTotal.margin)}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-400">
                    {agg.auditTotal.revenue > 0 ? `${((agg.auditTotal.margin / agg.auditTotal.revenue) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
