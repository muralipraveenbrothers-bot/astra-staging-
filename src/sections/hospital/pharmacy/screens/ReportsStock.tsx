// SpartaHMS-style pharmacy — Reports / Item Stock / Expenses (3 screens by prop).
// Dense working tables over the shared PharmState (usePharm). Every report has
// Export CSV (downloadCsv helper) + Print. Item Stock replicates the Sparta
// "Item Opening Stock" grid exactly (HSN | Item | Batch | Composition |
// Drug Combination | Purchase Date | Exp Date | Original/Current StockQty |
// Mrp | Rate | Eff.Rate) with low-stock amber + expired red flags.

import { useMemo, useState } from "react";
import {
  AlertTriangle, CalendarRange, Download, FileSpreadsheet,
  Landmark, Plus, Printer, Search, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { cn, fmtINR } from "@/lib/utils";
import {
  daysToExpiry, downloadCsv, effRate, fmtDate, itemById, taxPct, todayISO, uid,
  usePharm, type PharmExpense,
} from "../pharmData";

/* ============================ shared bits ============================ */

const TH = "pb-2 pr-2 whitespace-nowrap";
const TD = "py-1.5 pr-2 whitespace-nowrap";
const NUM = "text-right";

function TableShell({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500 border-b border-white/10">
            {head.map((h, i) => <th key={i} className={TH}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ActionBar({ onCsv, csvLabel = "Export CSV", extra }: {
  onCsv: () => void; csvLabel?: string; extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {extra}
      <button className="btn-ghost !text-xs !py-1.5" onClick={onCsv}><Download size={13} /> {csvLabel}</button>
      <button className="btn-ghost !text-xs !py-1.5" onClick={() => window.print()}><Printer size={13} /> Print</button>
    </div>
  );
}

/* ============================ 1 · REPORTS ============================ */

type ReportTab = "sales" | "purchase" | "stock" | "expiry" | "dues";

function Reports() {
  const { ph } = usePharm();
  const [tab, setTab] = useState<ReportTab>("sales");
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());

  const inRange = (d: string) => d >= from && d <= to;

  /* ---- sales ---- */
  const sales = useMemo(
    () => ph.invoices.filter((i) => i.status === "submitted" && inRange(i.date)),
    [ph.invoices, from, to] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const salesTot = useMemo(() => ({
    total: sales.reduce((s, i) => s + i.total, 0),
    disc: sales.reduce((s, i) => s + i.discAmt, 0),
    net: sales.reduce((s, i) => s + i.net, 0),
    paid: sales.reduce((s, i) => s + i.paid, 0),
    due: sales.reduce((s, i) => s + i.due, 0),
  }), [sales]);

  /* ---- purchase ---- */
  const purchases = useMemo(() => ph.pos.filter((p) => inRange(p.poDate)), [ph.pos, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const purTot = purchases.reduce((s, p) => s + p.total, 0);

  /* ---- stock (current, as of today) ---- */
  const stockRows = useMemo(() => ph.batches.map((b) => {
    const it = itemById(ph, b.itemId);
    if (!it) return null;
    return { b, it, value: Math.round(b.qty * b.rate * 100) / 100 };
  }).filter((x): x is NonNullable<typeof x> => !!x), [ph.batches, ph.items]);
  const stockTotQty = stockRows.reduce((s, r) => s + r.b.qty, 0);
  const stockTotVal = stockRows.reduce((s, r) => s + r.value, 0);

  /* ---- expiry (batches expiring inside the window) ---- */
  const expiries = useMemo(() => ph.batches
    .filter((b) => inRange(b.expDate))
    .map((b) => ({ b, it: itemById(ph, b.itemId), days: daysToExpiry(b.expDate) }))
    .filter((x) => !!x.it)
    .sort((a, b) => a.b.expDate.localeCompare(b.b.expDate)),
    [ph.batches, ph.items, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- dues ---- */
  const dues = useMemo(
    () => ph.invoices.filter((i) => i.due > 0 && inRange(i.date)),
    [ph.invoices, from, to] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dueTot = dues.reduce((s, i) => s + i.due, 0);

  const exportCurrent = () => {
    if (tab === "sales") {
      downloadCsv(`pharm-sales_${from}_${to}.csv`,
        ["Date", "Inv No", "Kind", "Patient", "Items", "Total", "Discount", "Net", "Mode", "Paid", "Due"],
        sales.map((i) => [fmtDate(i.date), i.invNo, i.kind, i.patientName || "—", i.items.length, i.total, i.discAmt, i.net, i.mode, i.paid, i.due]));
    } else if (tab === "purchase") {
      downloadCsv(`pharm-purchase_${from}_${to}.csv`,
        ["PO No", "PO Date", "Supplier", "Inv Type", "Items", "Total", "Status"],
        purchases.map((p) => [p.poNo, fmtDate(p.poDate), p.supplier, p.invType, p.items.length, p.total, p.status]));
    } else if (tab === "stock") {
      downloadCsv(`pharm-stock-report_${todayISO()}.csv`,
        ["Item", "Batch No", "Current Qty", "Rate", "MRP", "Stock Value"],
        stockRows.map((r) => [r.it.name, r.b.batchNo, r.b.qty, r.b.rate, r.b.mrp, r.value]));
    } else if (tab === "expiry") {
      downloadCsv(`pharm-expiry_${from}_${to}.csv`,
        ["Item", "Batch No", "Exp Date", "Days", "Qty", "MRP"],
        expiries.map((x) => [x.it!.name, x.b.batchNo, fmtDate(x.b.expDate), x.days, x.b.qty, x.b.mrp]));
    } else {
      downloadCsv(`pharm-dues_${from}_${to}.csv`,
        ["Inv No", "Date", "Patient", "Mobile", "Net", "Paid", "Due"],
        dues.map((i) => [i.invNo, fmtDate(i.date), i.patientName || "—", i.mobile || "—", i.net, i.paid, i.due]));
    }
  };

  const TABS: { key: ReportTab; label: string; count: number }[] = [
    { key: "sales", label: "Sales", count: sales.length },
    { key: "purchase", label: "Purchase", count: purchases.length },
    { key: "stock", label: "Stock", count: stockRows.length },
    { key: "expiry", label: "Expiry", count: expiries.length },
    { key: "dues", label: "Dues", count: dues.length },
  ];

  return (
    <GlassCard>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <SectionTitle title="Pharmacy Reports" subtitle="Date-range registers · export / print" />
        <ActionBar onCsv={exportCurrent} />
      </div>

      {/* date range */}
      <div className="flex items-center gap-2 mb-3 flex-wrap text-xs">
        <CalendarRange size={14} className="text-amber-400" />
        <span className="text-slate-500">From</span>
        <input type="date" className="input-dark !w-40 !py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-slate-500">To</span>
        <input type="date" className="input-dark !w-40 !py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
        <span className="text-[10px] text-slate-600">Stock tab shows live position as of today; Expiry lists batches expiring inside the window.</span>
      </div>

      {/* internal tabs */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {TABS.map(({ key, label, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all border",
              tab === key
                ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40"
                : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white hover:bg-white/[0.06]")}>
            {label}
            <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-white/10 text-slate-300">{count}</span>
          </button>
        ))}
      </div>

      {tab === "sales" && (
        <>
          <TableShell head={["Date", "Inv No", "Kind", "Patient", <span className="block text-right">Items</span>, <span className="block text-right">Total</span>, <span className="block text-right">Disc</span>, <span className="block text-right">Net</span>, "Mode", <span className="block text-right">Paid</span>, <span className="block text-right">Due</span>]}>
            {sales.map((i) => (
              <tr key={i.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className={TD}>{fmtDate(i.date)}</td>
                <td className={cn(TD, "font-mono text-[10px] text-slate-300")}>{i.invNo}</td>
                <td className={TD}><Badge tone={i.kind === "OP" ? "cyan" : i.kind === "IP" ? "violet" : "neutral"} className="!text-[9px]">{i.kind}</Badge></td>
                <td className={cn(TD, "text-slate-200")}>{i.patientName || "—"}</td>
                <td className={cn(TD, NUM)}>{i.items.length}</td>
                <td className={cn(TD, NUM)}>{fmtINR(i.total)}</td>
                <td className={cn(TD, NUM, "text-slate-500")}>{fmtINR(i.discAmt)}</td>
                <td className={cn(TD, NUM, "text-violet-300 font-semibold")}>{fmtINR(i.net)}</td>
                <td className={TD}>{i.mode}</td>
                <td className={cn(TD, NUM, "text-emerald-300")}>{fmtINR(i.paid)}</td>
                <td className={cn(TD, NUM, i.due > 0 ? "text-amber-300 font-semibold" : "text-slate-500")}>{fmtINR(i.due)}</td>
              </tr>
            ))}
            {sales.length === 0 && <tr><td colSpan={11} className="py-4 text-center text-slate-500">No submitted invoices in range.</td></tr>}
          </TableShell>
          {sales.length > 0 && (
            <div className="flex justify-end gap-4 pt-2 mt-1 border-t border-white/10 text-xs">
              <span className="text-slate-400">Total <span className="text-white font-semibold">{fmtINR(salesTot.total)}</span></span>
              <span className="text-slate-400">Net <span className="text-violet-300 font-semibold">{fmtINR(salesTot.net)}</span></span>
              <span className="text-slate-400">Paid <span className="text-emerald-300 font-semibold">{fmtINR(salesTot.paid)}</span></span>
              <span className="text-slate-400">Due <span className="text-amber-300 font-semibold">{fmtINR(salesTot.due)}</span></span>
            </div>
          )}
        </>
      )}

      {tab === "purchase" && (
        <>
          <TableShell head={["PO No", "PO Date", "Supplier", "Inv Type", <span className="block text-right">Items</span>, <span className="block text-right">Total</span>, "Status"]}>
            {purchases.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className={cn(TD, "font-mono text-[10px] text-slate-300")}>{p.poNo}</td>
                <td className={TD}>{fmtDate(p.poDate)}</td>
                <td className={cn(TD, "text-slate-200")}>{p.supplier}</td>
                <td className={TD}>{p.invType}</td>
                <td className={cn(TD, NUM)}>{p.items.length}</td>
                <td className={cn(TD, NUM, "text-violet-300 font-semibold")}>{fmtINR(p.total)}</td>
                <td className={TD}>
                  <Badge tone={p.status === "received" ? "green" : p.status === "cancelled" ? "red" : "amber"} className="!text-[9px]">{p.status}</Badge>
                </td>
              </tr>
            ))}
            {purchases.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-slate-500">No purchase orders in range.</td></tr>}
          </TableShell>
          {purchases.length > 0 && (
            <div className="flex justify-end pt-2 mt-1 border-t border-white/10 text-xs">
              <span className="text-slate-400">Purchase total <span className="text-violet-300 font-semibold">{fmtINR(purTot)}</span></span>
            </div>
          )}
        </>
      )}

      {tab === "stock" && (
        <>
          <TableShell head={["Item", "Batch No", <span className="block text-right">Current Qty</span>, <span className="block text-right">Rate</span>, <span className="block text-right">MRP</span>, <span className="block text-right">Stock Value</span>]}>
            {stockRows.map((r) => (
              <tr key={r.b.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className={cn(TD, "text-slate-200")}>{r.it.name}</td>
                <td className={cn(TD, "font-mono text-[10px] text-slate-400")}>{r.b.batchNo}</td>
                <td className={cn(TD, NUM, r.b.qty <= r.it.reorder ? "text-amber-300 font-semibold" : "text-white")}>{r.b.qty}</td>
                <td className={cn(TD, NUM)}>{r.b.rate}</td>
                <td className={cn(TD, NUM)}>{r.b.mrp}</td>
                <td className={cn(TD, NUM, "text-violet-300")}>{fmtINR(r.value)}</td>
              </tr>
            ))}
          </TableShell>
          <div className="flex justify-end gap-4 pt-2 mt-1 border-t border-white/10 text-xs">
            <span className="text-slate-400">Units <span className="text-white font-semibold">{stockTotQty}</span></span>
            <span className="text-slate-400">Value (at rate) <span className="text-violet-300 font-semibold">{fmtINR(Math.round(stockTotVal * 100) / 100)}</span></span>
          </div>
        </>
      )}

      {tab === "expiry" && (
        <TableShell head={["Item", "Batch No", "Exp Date", <span className="block text-right">Days</span>, <span className="block text-right">Qty</span>, <span className="block text-right">MRP</span>, "Status"]}>
          {expiries.map((x) => (
            <tr key={x.b.id} className="border-b border-white/5 hover:bg-white/[0.03]">
              <td className={cn(TD, "text-slate-200")}>{x.it!.name}</td>
              <td className={cn(TD, "font-mono text-[10px] text-slate-400")}>{x.b.batchNo}</td>
              <td className={TD}>{fmtDate(x.b.expDate)}</td>
              <td className={cn(TD, NUM)}>{x.days}</td>
              <td className={cn(TD, NUM)}>{x.b.qty}</td>
              <td className={cn(TD, NUM)}>{x.b.mrp}</td>
              <td className={TD}>
                {x.days < 0
                  ? <Badge tone="red" className="!text-[9px]">EXPIRED</Badge>
                  : x.days <= 30
                    ? <Badge tone="amber" className="!text-[9px]">≤30d</Badge>
                    : <Badge tone="cyan" className="!text-[9px]">Expiring</Badge>}
              </td>
            </tr>
          ))}
          {expiries.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-slate-500">No batches expiring inside this window.</td></tr>}
        </TableShell>
      )}

      {tab === "dues" && (
        <>
          <TableShell head={["Inv No", "Date", "Patient", "Mobile", <span className="block text-right">Net</span>, <span className="block text-right">Paid</span>, <span className="block text-right">Due</span>]}>
            {dues.map((i) => (
              <tr key={i.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className={cn(TD, "font-mono text-[10px] text-slate-300")}>{i.invNo}</td>
                <td className={TD}>{fmtDate(i.date)}</td>
                <td className={cn(TD, "text-slate-200")}>{i.patientName || "—"}</td>
                <td className={cn(TD, "text-slate-400")}>{i.mobile || "—"}</td>
                <td className={cn(TD, NUM)}>{fmtINR(i.net)}</td>
                <td className={cn(TD, NUM, "text-emerald-300")}>{fmtINR(i.paid)}</td>
                <td className={cn(TD, NUM, "text-amber-300 font-semibold")}>{fmtINR(i.due)}</td>
              </tr>
            ))}
            {dues.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-slate-500">No outstanding dues in range.</td></tr>}
          </TableShell>
          {dues.length > 0 && (
            <div className="flex justify-end pt-2 mt-1 border-t border-white/10 text-xs">
              <span className="text-slate-400">Outstanding <span className="text-amber-300 font-semibold">{fmtINR(dueTot)}</span></span>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}

/* ============================ 2 · ITEM STOCK ============================ */

function ItemStock() {
  const { ph } = usePharm();
  const [invType, setInvType] = useState("--All--");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ph.batches
      .map((b) => {
        const it = itemById(ph, b.itemId);
        if (!it) return null;
        if (invType !== "--All--" && it.invType !== invType) return null;
        if (q && ![it.name, b.batchNo, it.hsn, it.composition, it.drugCombo].some((s) => s.toLowerCase().includes(q))) return null;
        const pct = taxPct(ph, it.taxCat);
        return {
          b, it,
          eff: effRate(b.rate, pct),
          low: b.qty <= it.reorder,
          expired: daysToExpiry(b.expDate) < 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.it.name.localeCompare(b.it.name) || a.b.expDate.localeCompare(b.b.expDate));
  }, [ph.batches, ph.items, ph.taxCats, invType, search]);

  const exportRows = () => rows.map((r) => [
    r.it.hsn, r.it.name, r.b.batchNo, r.it.composition, r.it.drugCombo,
    fmtDate(r.b.purchaseDate), fmtDate(r.b.expDate), r.b.origQty, r.b.qty,
    r.b.mrp, r.b.rate, r.eff,
  ]);
  const STOCK_HEAD = ["HSN Code", "Item Name", "Batch No", "Composition", "Drug Combination", "Purchase Date", "Exp Date", "Original StockQty", "Current StockQty", "Mrp", "Rate", "Eff.Rate"];

  const lowCount = rows.filter((r) => r.low && !r.expired).length;
  const expCount = rows.filter((r) => r.expired).length;

  return (
    <GlassCard>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <SectionTitle title="Item Stock" subtitle={`${rows.length} batch row(s) · live FEFO ledger`} />
        <div className="flex items-center gap-2">
          {lowCount > 0 && <Badge tone="amber" className="!text-[9px]"><AlertTriangle size={10} className="mr-1" />{lowCount} low</Badge>}
          {expCount > 0 && <Badge tone="red" className="!text-[9px]">{expCount} expired</Badge>}
        </div>
      </div>

      {/* top bar — filter / exports / print / search */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select className="input-dark !w-48 !py-1.5" value={invType} onChange={(e) => setInvType(e.target.value)}>
          <option>--All--</option>
          {ph.invTypes.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn-ghost !text-xs !py-1.5"
          onClick={() => downloadCsv(`item-stock_${todayISO()}.csv`, STOCK_HEAD, exportRows())}>
          <FileSpreadsheet size={13} /> Export to Excel
        </button>
        <button className="btn-ghost !text-xs !py-1.5"
          onClick={() => downloadCsv(`stock-export_${todayISO()}.csv`,
            ["HSN Code", "Item Name", "Batch No", "Purchase Date", "Exp Date", "Current StockQty", "Mrp", "Rate"],
            rows.map((r) => [r.it.hsn, r.it.name, r.b.batchNo, fmtDate(r.b.purchaseDate), fmtDate(r.b.expDate), r.b.qty, r.b.mrp, r.b.rate]))}>
          <Download size={13} /> Export Stock
        </button>
        <button className="btn-ghost !text-xs !py-1.5" onClick={() => window.print()}><Printer size={13} /> Print</button>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
          <input className="input-dark !w-56 !py-1.5 !pl-8" placeholder="Search item / batch / HSN…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <TableShell head={[
        "", "HSN Code", "Item Name", "Batch No", "Composition", "Drug Combination",
        "Purchase Date", "Exp Date",
        <span className="block text-right">Original StockQty</span>,
        <span className="block text-right">Current StockQty</span>,
        <span className="block text-right">Mrp</span>,
        <span className="block text-right">Rate</span>,
        <span className="block text-right">Eff.Rate</span>,
      ]}>
        {rows.map((r) => (
          <tr key={r.b.id} className={cn("border-b border-white/5 hover:bg-white/[0.03]", r.expired && "bg-red-500/[0.04]")}>
            <td className="py-1.5 pr-1.5 w-4">
              {r.expired
                ? <span className="inline-block h-3 w-3 rounded-[3px] bg-red-500" title="Expired batch" />
                : r.low
                  ? <span className="inline-block h-3 w-3 rounded-[3px] bg-amber-400" title="Low stock (≤ reorder level)" />
                  : null}
            </td>
            <td className={cn(TD, "font-mono text-[10px] text-slate-400")}>{r.it.hsn}</td>
            <td className={cn(TD, "text-slate-200")}>{r.it.name}</td>
            <td className={cn(TD, "font-mono text-[10px] text-slate-300")}>{r.b.batchNo}</td>
            <td className={cn(TD, "text-slate-400 max-w-[220px] truncate")} title={r.it.composition}>{r.it.composition}</td>
            <td className={cn(TD, "text-slate-500")}>{r.it.drugCombo}</td>
            <td className={TD}>{fmtDate(r.b.purchaseDate)}</td>
            <td className={cn(TD, r.expired ? "text-red-300 font-semibold" : "")}>{fmtDate(r.b.expDate)}</td>
            <td className={cn(TD, NUM)}>{r.b.origQty}</td>
            <td className={cn(TD, NUM, "font-semibold", r.expired ? "text-red-300" : r.low ? "text-amber-300" : "text-white")}>{r.b.qty}</td>
            <td className={cn(TD, NUM)}>{r.b.mrp}</td>
            <td className={cn(TD, NUM)}>{r.b.rate}</td>
            <td className={cn(TD, NUM, "text-violet-300")}>{r.eff}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={13} className="py-4 text-center text-slate-500">No stock rows match this filter.</td></tr>}
      </TableShell>

      <p className="text-[10px] text-slate-600 mt-2 flex items-center gap-3">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-amber-400" /> at/below reorder level</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-red-500" /> expired batch</span>
        <span>Eff.Rate = rate × (1 + GST%) per item tax category</span>
      </p>
    </GlassCard>
  );
}

/* ============================ 3 · EXPENSES ============================ */

function Expenses() {
  const { ph, setPh } = usePharm();
  const [head, setHead] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PharmExpense["mode"]>("Cash");
  const [remark, setRemark] = useState("");
  const [date, setDate] = useState(todayISO());

  const today = todayISO();
  const sorted = useMemo(
    () => [...ph.expenses].sort((a, b) => b.date.localeCompare(a.date)),
    [ph.expenses]
  );
  const todayTot = ph.expenses.filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0);
  const monthTot = ph.expenses.filter((e) => e.date.slice(0, 7) === today.slice(0, 7)).reduce((s, e) => s + e.amount, 0);
  const allTot = ph.expenses.reduce((s, e) => s + e.amount, 0);

  const add = () => {
    const amt = Number(amount);
    if (!head.trim()) { toast.error("Expense head is required"); return; }
    if (!(amt > 0)) { toast.error("Enter a valid amount"); return; }
    const exp: PharmExpense = { id: uid("exp"), date: date || today, head: head.trim(), amount: amt, mode, remark: remark.trim() };
    setPh((p) => ({ ...p, expenses: [...p.expenses, exp] }));
    toast.success(`Expense added — ${exp.head} · ${fmtINR(amt)}`);
    setHead(""); setAmount(""); setRemark(""); setMode("Cash"); setDate(today);
  };

  const del = (e: PharmExpense) => {
    if (e.date !== today) { toast.error("Day closed — only today's entries can be deleted"); return; }
    setPh((p) => ({ ...p, expenses: p.expenses.filter((x) => x.id !== e.id) }));
    toast.success(`Deleted — ${e.head}`);
  };

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <SectionTitle title="Pharmacy Expenses" subtitle="Day-book entries · feeds Dashboard expense card" />
          <div className="flex items-center gap-2">
            <Badge tone="cyan" className="!text-[10px]"><Landmark size={11} className="mr-1" /> Today {fmtINR(todayTot)}</Badge>
            <Badge tone="violet" className="!text-[10px]">This month {fmtINR(monthTot)}</Badge>
            <Badge tone="neutral" className="!text-[10px]">All time {fmtINR(allTot)}</Badge>
          </div>
        </div>

        {/* add form */}
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-12 md:col-span-3">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Head *</label>
            <input className="input-dark !py-1.5" placeholder="e.g. Cold-chain electricity" value={head} onChange={(e) => setHead(e.target.value)} />
          </div>
          <div className="col-span-4 md:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Amount ₹ *</label>
            <input className="input-dark !py-1.5" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <div className="col-span-4 md:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Mode</label>
            <select className="input-dark !py-1.5" value={mode} onChange={(e) => setMode(e.target.value as PharmExpense["mode"])}>
              <option>Cash</option><option>Card</option><option>UPI</option>
            </select>
          </div>
          <div className="col-span-4 md:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Date</label>
            <input type="date" className="input-dark !py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="col-span-8 md:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Remark</label>
            <input className="input-dark !py-1.5" placeholder="Optional note" value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
          <div className="col-span-4 md:col-span-1">
            <button className="btn-neon w-full !text-xs !py-1.5" onClick={add}><Plus size={13} /> Add</button>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionTitle title="Expense Register" subtitle={`${sorted.length} entr${sorted.length === 1 ? "y" : "ies"} · delete allowed only until end-of-day`} />
        <TableShell head={["Date", "Head", <span className="block text-right">Amount</span>, "Mode", "Remark", ""]}>
          {sorted.map((e) => {
            const deletable = e.date === today;
            return (
              <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className={TD}>{fmtDate(e.date)}</td>
                <td className={cn(TD, "text-slate-200")}>{e.head}</td>
                <td className={cn(TD, NUM, "text-violet-300 font-semibold")}>{fmtINR(e.amount)}</td>
                <td className={TD}><Badge tone={e.mode === "Cash" ? "amber" : e.mode === "Card" ? "cyan" : "violet"} className="!text-[9px]">{e.mode}</Badge></td>
                <td className={cn(TD, "text-slate-500")}>{e.remark || "—"}</td>
                <td className={cn(TD, "text-right")}>
                  <button
                    className={cn("p-1 rounded", deletable ? "text-slate-500 hover:text-red-300" : "text-slate-700 cursor-not-allowed")}
                    title={deletable ? "Delete entry" : "Day closed — locked"}
                    onClick={() => del(e)}>
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-500">No expenses recorded yet.</td></tr>}
        </TableShell>
      </GlassCard>
    </div>
  );
}

/* ============================ entry ============================ */

export function ReportsStock({ view }: { view: "reports" | "stock" | "expenses" }) {
  if (view === "stock") return <ItemStock />;
  if (view === "expenses") return <Expenses />;
  return <Reports />;
}
