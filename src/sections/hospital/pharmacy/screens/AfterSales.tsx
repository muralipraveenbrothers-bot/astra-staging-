// AfterSales — three Sparta-style post-billing screens in one module:
//   view="returns"   → Sales Returns (return qty against an invoice, restores batches)
//   view="duplicate" → Duplicate Invoice (search → view → reprint via .print-zone)
//   view="dues"      → Due Collections (collect part/full dues + WhatsApp reminder stub)
// Dense working style, Astra gold-obsidian glass theme. Invoices are never
// edited by returns — a SaleReturn record is appended and batch stock restored.

import { useMemo, useState } from "react";
import {
  Eye, MessageCircle, Printer, RotateCcw, Search, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal } from "@/components/ui";
import { cn, fmtINR } from "@/lib/utils";
import {
  fmtDate, todayISO, uid, usePharm,
  type Invoice, type InvMode, type SaleReturn,
} from "../pharmData";

/* ------------------------------ shared bits ------------------------------ */

const inputCls =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none";

const thCls = "px-2.5 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-amber-500/70 font-semibold whitespace-nowrap";
const tdCls = "px-2.5 py-1.5 text-xs text-slate-300 whitespace-nowrap";

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn(thCls, right && "text-right")}>{children}</th>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative max-w-sm">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input className={cn(inputCls, "pl-8")} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function matches(inv: Invoice, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    inv.invNo.toLowerCase().includes(s) ||
    inv.patientName.toLowerCase().includes(s) ||
    inv.patientRegNo.toLowerCase().includes(s) ||
    inv.date.includes(s)
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ============================== 1 · SALES RETURNS ============================== */

const RETURN_REASONS = ["Wrong item dispensed", "Patient refused", "Expired / damaged", "Doctor changed prescription", "Billing error", "Other"];

function ReturnsScreen() {
  const { ph, setPh } = usePharm();
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [retQty, setRetQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [note, setNote] = useState("");

  const hits = useMemo(
    () => ph.invoices.filter((i) => i.status === "submitted" && matches(i, q)).slice().reverse(),
    [ph.invoices, q]
  );
  const inv = ph.invoices.find((i) => i.id === selId) ?? null;

  /** qty already returned for this invoice line (matched by name + batch) */
  const alreadyReturned = (name: string, batchNo: string): number =>
    ph.returns
      .filter((r) => r.invNo === inv?.invNo)
      .flatMap((r) => r.items)
      .filter((it) => it.name === name && it.batchNo === batchNo)
      .reduce((s, it) => s + it.qty, 0);

  const returnableLines = inv
    ? inv.items.map((it, idx) => ({
        it, idx,
        returned: alreadyReturned(it.name, it.batchNo),
        max: it.qty - alreadyReturned(it.name, it.batchNo),
      }))
    : [];

  const grandTotal = returnableLines.reduce((s, { it, idx }) => {
    const rq = Math.min(retQty[idx] ?? 0, it.qty - alreadyReturned(it.name, it.batchNo));
    return s + (it.qty > 0 ? round2((it.amount / it.qty) * rq) : 0);
  }, 0);

  const pick = (id: string) => {
    setSelId(id);
    setRetQty({});
    setReason(RETURN_REASONS[0]);
    setNote("");
  };

  const submit = () => {
    if (!inv) return;
    const lines = returnableLines
      .map(({ it, idx, max }) => ({ it, rq: Math.min(Math.max(retQty[idx] ?? 0, 0), max) }))
      .filter((x) => x.rq > 0);
    if (!lines.length) {
      toast.error("Enter a return quantity for at least one line.");
      return;
    }
    const items = lines.map(({ it, rq }) => ({
      name: it.name, batchNo: it.batchNo, qty: rq,
      amount: round2((it.amount / it.qty) * rq),
    }));
    const ret: SaleReturn = {
      id: uid("ret"),
      retNo: `RET-${ph.retCounter}`,
      date: todayISO(),
      invNo: inv.invNo,
      kind: inv.kind,
      items,
      total: round2(items.reduce((s, x) => s + x.amount, 0)),
    };
    setPh((prev) => ({
      ...prev,
      retCounter: prev.retCounter + 1,
      returns: [...prev.returns, ret],
      // restore batch stock for the returned lines (invoice itself untouched)
      batches: prev.batches.map((b) => {
        const line = lines.find((x) => x.it.itemId === b.itemId && x.it.batchNo === b.batchNo);
        return line ? { ...b, qty: b.qty + line.rq } : b;
      }),
    }));
    toast.success(`${ret.retNo} submitted — ${fmtINR(ret.total)} returned against ${inv.invNo}. Stock restored.`, {
      description: `${reason}${note ? ` · ${note}` : ""}`,
    });
    setSelId(null);
    setRetQty({});
    setNote("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-gradient flex items-center gap-2">
            <RotateCcw size={17} className="text-amber-400" /> Sales Returns
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Return items against a submitted invoice — stock goes back to the batch, the invoice stays intact.</p>
        </div>
        <Badge tone="amber" className="!text-[10px]">{ph.returns.length} returns on record</Badge>
      </div>

      <GlassCard className="!p-4 space-y-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search invoice no / patient name / reg no…" />
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="w-full border-collapse">
            <thead className="bg-white/[0.03] border-b border-white/[0.07]">
              <tr>
                <Th>Invoice</Th><Th>Date</Th><Th>Patient</Th><Th>Type</Th>
                <Th right>Net</Th><Th>Mode</Th><Th>{""}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {hits.map((i) => (
                <tr key={i.id} className={cn("hover:bg-white/[0.03] transition-colors", selId === i.id && "bg-amber-400/[0.06]")}>
                  <td className={cn(tdCls, "font-mono text-amber-300")}>{i.invNo}</td>
                  <td className={tdCls}>{fmtDate(i.date)} {i.time}</td>
                  <td className={tdCls}>{i.patientName || "—"} <span className="text-slate-600">{i.patientRegNo}</span></td>
                  <td className={tdCls}><Badge tone={i.kind === "OP" ? "cyan" : i.kind === "IP" ? "violet" : "neutral"} className="!text-[9px]">{i.kind}</Badge></td>
                  <td className={cn(tdCls, "text-right font-mono")}>{fmtINR(i.net)}</td>
                  <td className={tdCls}>{i.mode}</td>
                  <td className={cn(tdCls, "text-right")}>
                    <button onClick={() => pick(i.id)} className="btn-ghost !px-2 !py-1 !text-[11px]">Select</button>
                  </td>
                </tr>
              ))}
              {!hits.length && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-500">No submitted invoices match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {inv && (
        <GlassCard className="!p-4 space-y-3 border-amber-400/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-slate-300">
              Returning against <span className="font-mono text-amber-300 font-semibold">{inv.invNo}</span>
              {" · "}{inv.patientName || "Walk-in"} · {fmtDate(inv.date)}
            </p>
            <p className="text-xs text-slate-400">Return value: <span className="font-mono text-emerald-300 font-semibold">{fmtINR(round2(grandTotal))}</span></p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
            <table className="w-full border-collapse">
              <thead className="bg-white/[0.03] border-b border-white/[0.07]">
                <tr>
                  <Th>Item</Th><Th>Batch</Th><Th right>MRP</Th><Th right>Sold</Th>
                  <Th right>Returned</Th><Th right>Return Qty</Th><Th right>Value</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {returnableLines.map(({ it, idx, returned, max }) => {
                  const rq = Math.min(retQty[idx] ?? 0, max);
                  const val = it.qty > 0 ? round2((it.amount / it.qty) * rq) : 0;
                  return (
                    <tr key={idx} className="hover:bg-white/[0.03]">
                      <td className={tdCls}>{it.name}</td>
                      <td className={cn(tdCls, "font-mono text-slate-400")}>{it.batchNo}</td>
                      <td className={cn(tdCls, "text-right font-mono")}>{fmtINR(it.mrp)}</td>
                      <td className={cn(tdCls, "text-right")}>{it.qty}</td>
                      <td className={cn(tdCls, "text-right", returned > 0 && "text-red-300")}>{returned || "—"}</td>
                      <td className={cn(tdCls, "text-right")}>
                        {max > 0 ? (
                          <input
                            type="number" min={0} max={max} value={retQty[idx] ?? ""}
                            onChange={(e) => setRetQty((p) => ({ ...p, [idx]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) }))}
                            className={cn(inputCls, "!w-20 !py-1 text-right font-mono inline-block")}
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-600">fully returned</span>
                        )}
                      </td>
                      <td className={cn(tdCls, "text-right font-mono", rq > 0 ? "text-emerald-300" : "text-slate-600")}>{rq > 0 ? fmtINR(val) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-52">
              <label className="block text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1">Reason</label>
              <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
                {RETURN_REASONS.map((r) => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1">Note (optional)</label>
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. strip damaged on opening" />
            </div>
            <button onClick={submit} className="btn-neon !text-xs" disabled={grandTotal <= 0}>
              <RotateCcw size={13} className="mr-1.5" /> Submit Return · {fmtINR(round2(grandTotal))}
            </button>
            <button onClick={() => setSelId(null)} className="btn-ghost !text-xs">Cancel</button>
          </div>
        </GlassCard>
      )}

      <GlassCard className="!p-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-amber-500/70 font-semibold mb-2">Recent returns</p>
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="w-full border-collapse">
            <thead className="bg-white/[0.03] border-b border-white/[0.07]">
              <tr><Th>Return No</Th><Th>Date</Th><Th>Invoice</Th><Th>Type</Th><Th>Items</Th><Th right>Total</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {ph.returns.slice().reverse().slice(0, 12).map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.03]">
                  <td className={cn(tdCls, "font-mono text-amber-300")}>{r.retNo}</td>
                  <td className={tdCls}>{fmtDate(r.date)}</td>
                  <td className={cn(tdCls, "font-mono")}>{r.invNo}</td>
                  <td className={tdCls}>{r.kind}</td>
                  <td className={cn(tdCls, "!whitespace-normal")}>{r.items.map((x) => `${x.name} ×${x.qty}`).join(", ")}</td>
                  <td className={cn(tdCls, "text-right font-mono text-emerald-300")}>{fmtINR(r.total)}</td>
                </tr>
              ))}
              {!ph.returns.length && (
                <tr><td colSpan={6} className="px-3 py-5 text-center text-xs text-slate-500">No returns yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

/* ============================== 2 · DUPLICATE INVOICE ============================== */

function DuplicateScreen() {
  const { ph } = usePharm();
  const [q, setQ] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);

  const hits = useMemo(
    () => ph.invoices.filter((i) => i.status === "submitted" && matches(i, q)).slice().reverse(),
    [ph.invoices, q]
  );
  const inv = ph.invoices.find((i) => i.id === viewId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-gradient flex items-center gap-2">
            <Printer size={17} className="text-amber-400" /> Duplicate Invoice
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Find any submitted invoice and reprint an exact copy — no changes to the original.</p>
        </div>
        <Badge tone="cyan" className="!text-[10px]">{ph.invoices.filter((i) => i.status === "submitted").length} invoices</Badge>
      </div>

      <GlassCard className="!p-4 space-y-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search invoice no / patient / date (yyyy-mm-dd)…" />
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="w-full border-collapse">
            <thead className="bg-white/[0.03] border-b border-white/[0.07]">
              <tr>
                <Th>Invoice</Th><Th>Date</Th><Th>Time</Th><Th>Patient</Th><Th>Doctor</Th>
                <Th>Type</Th><Th>Mode</Th><Th right>Net</Th><Th>{""}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {hits.map((i) => (
                <tr key={i.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className={cn(tdCls, "font-mono text-amber-300")}>{i.invNo}</td>
                  <td className={tdCls}>{fmtDate(i.date)}</td>
                  <td className={tdCls}>{i.time}</td>
                  <td className={tdCls}>{i.patientName || "Walk-in"} <span className="text-slate-600">{i.patientRegNo}</span></td>
                  <td className={tdCls}>{i.doctor || "—"}</td>
                  <td className={tdCls}><Badge tone={i.kind === "OP" ? "cyan" : i.kind === "IP" ? "violet" : "neutral"} className="!text-[9px]">{i.kind}</Badge></td>
                  <td className={tdCls}>{i.mode}</td>
                  <td className={cn(tdCls, "text-right font-mono")}>{fmtINR(i.net)}</td>
                  <td className={cn(tdCls, "text-right")}>
                    <button onClick={() => setViewId(i.id)} className="btn-ghost !px-2 !py-1 !text-[11px]">
                      <Eye size={12} className="mr-1" /> View
                    </button>
                  </td>
                </tr>
              ))}
              {!hits.length && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-xs text-slate-500">No invoices match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <Modal open={!!inv} onClose={() => setViewId(null)} title={`Duplicate · ${inv?.invNo ?? ""}`} wide>
        {inv && (
          <div className="space-y-4">
            {/* printable receipt copy */}
            <div className="print-zone rounded-lg border border-white/10 bg-white/[0.02] p-4 text-xs space-y-3">
              <div className="text-center space-y-0.5">
                <p className="font-display text-base font-bold text-white tracking-wide">Astra AI HOSPITAL</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em]">Pharmacy · Duplicate Invoice</p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-slate-300">
                <p><span className="text-slate-500">Invoice:</span> <span className="font-mono text-amber-300">{inv.invNo}</span></p>
                <p><span className="text-slate-500">Date:</span> {fmtDate(inv.date)} {inv.time}</p>
                <p><span className="text-slate-500">Patient:</span> {inv.patientName || "Walk-in"} {inv.ageGender && `(${inv.ageGender})`}</p>
                <p><span className="text-slate-500">Reg No:</span> {inv.patientRegNo || "—"}</p>
                <p><span className="text-slate-500">Doctor:</span> {inv.doctor || "—"}</p>
                <p><span className="text-slate-500">Type / Store:</span> {inv.kind} · {inv.store}</p>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-y border-white/10 text-[10px] uppercase tracking-[0.12em] text-amber-500/70">
                    <th className="py-1.5 text-left">Item</th>
                    <th className="py-1.5 text-left">Batch</th>
                    <th className="py-1.5 text-right">Qty</th>
                    <th className="py-1.5 text-right">MRP</th>
                    <th className="py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {inv.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-1 text-slate-300">{it.name}</td>
                      <td className="py-1 font-mono text-slate-500">{it.batchNo}</td>
                      <td className="py-1 text-right">{it.qty}</td>
                      <td className="py-1 text-right font-mono">{fmtINR(it.mrp)}</td>
                      <td className="py-1 text-right font-mono">{fmtINR(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-0.5 text-right text-slate-300">
                <p>Total: <span className="font-mono">{fmtINR(inv.total)}</span></p>
                {inv.discAmt > 0 && <p>Discount ({inv.discPct}%): <span className="font-mono text-red-300">− {fmtINR(inv.discAmt)}</span></p>}
                <p className="text-sm font-semibold text-white">Net: <span className="font-mono text-amber-300">{fmtINR(inv.net)}</span></p>
                <p className="text-[11px] text-slate-500">Paid {fmtINR(inv.paid)} via {inv.mode}{inv.due > 0 ? ` · Due ${fmtINR(inv.due)}` : ""}</p>
              </div>
              {inv.remarks && inv.remarks !== "NA" && <p className="text-[11px] text-slate-500">Remarks: {inv.remarks}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setViewId(null)} className="btn-ghost !text-xs">Close</button>
              <button onClick={() => window.print()} className="btn-neon !text-xs">
                <Printer size={13} className="mr-1.5" /> Reprint
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============================== 3 · DUE COLLECTIONS ============================== */

function DuesScreen() {
  const { ph, setPh } = usePharm();
  const [q, setQ] = useState("");
  const [collectId, setCollectId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"Cash" | "Card" | "UPI">("Cash");

  const dues = useMemo(
    () => ph.invoices.filter((i) => i.status === "submitted" && i.due > 0 && matches(i, q)).slice().reverse(),
    [ph.invoices, q]
  );
  const totalOutstanding = dues.reduce((s, i) => s + i.due, 0);
  const target = ph.invoices.find((i) => i.id === collectId) ?? null;

  const openCollect = (inv: Invoice) => {
    setCollectId(inv.id);
    setAmount(String(inv.due));
    setMode("Cash");
  };

  const collect = () => {
    if (!target) return;
    const amt = round2(Number(amount) || 0);
    if (amt <= 0) {
      toast.error("Enter a collection amount greater than zero.");
      return;
    }
    if (amt > target.due) {
      toast.error(`Amount exceeds the due of ${fmtINR(target.due)}.`);
      return;
    }
    setPh((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) =>
        i.id === target.id
          ? { ...i, paid: round2(i.paid + amt), due: round2(Math.max(0, i.due - amt)) }
          : i
      ),
    }));
    toast.success(`${fmtINR(amt)} collected on ${target.invNo} via ${mode}.`, {
      description: round2(target.due - amt) > 0 ? `Remaining due: ${fmtINR(round2(target.due - amt))}` : "Invoice fully settled.",
    });
    setCollectId(null);
  };

  const whatsappReminder = (inv: Invoice) => {
    // stub — real WhatsApp gateway integration hooks in here
    console.log("[pharm-dues] WhatsApp reminder stub:", {
      to: inv.mobile || "(no mobile)", invoice: inv.invNo, due: inv.due,
      message: `Dear ${inv.patientName || "Customer"}, a balance of ${fmtINR(inv.due)} is pending on pharmacy invoice ${inv.invNo}. Kindly settle at your earliest convenience. — Astra AI Hospital`,
    });
    toast.success(`Reminder queued for ${inv.patientName || "patient"} (${inv.mobile || "no mobile on file"}).`, {
      description: `${inv.invNo} · due ${fmtINR(inv.due)}`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-gradient flex items-center gap-2">
            <Wallet size={17} className="text-amber-400" /> Due Collections
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">Outstanding balances on pharmacy invoices — collect in full or part.</p>
        </div>
        <Badge tone={dues.length ? "red" : "green"} className="!text-[10px]">
          {dues.length} pending · {fmtINR(round2(totalOutstanding))} outstanding
        </Badge>
      </div>

      <GlassCard className="!p-4 space-y-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search invoice no / patient…" />
        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
          <table className="w-full border-collapse">
            <thead className="bg-white/[0.03] border-b border-white/[0.07]">
              <tr>
                <Th>Patient</Th><Th>Invoice</Th><Th>Date</Th><Th>Type</Th>
                <Th right>Total</Th><Th right>Paid</Th><Th right>Due</Th><Th>{""}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {dues.map((i) => (
                <tr key={i.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className={tdCls}>
                    {i.patientName || "Walk-in"}
                    <span className="block text-[10px] text-slate-600">{i.patientRegNo || "—"} {i.mobile && `· ${i.mobile}`}</span>
                  </td>
                  <td className={cn(tdCls, "font-mono text-amber-300")}>{i.invNo}</td>
                  <td className={tdCls}>{fmtDate(i.date)}</td>
                  <td className={tdCls}><Badge tone={i.kind === "OP" ? "cyan" : i.kind === "IP" ? "violet" : "neutral"} className="!text-[9px]">{i.kind}</Badge></td>
                  <td className={cn(tdCls, "text-right font-mono")}>{fmtINR(i.net)}</td>
                  <td className={cn(tdCls, "text-right font-mono text-emerald-300")}>{fmtINR(i.paid)}</td>
                  <td className={cn(tdCls, "text-right font-mono text-red-300 font-semibold")}>{fmtINR(i.due)}</td>
                  <td className={cn(tdCls, "text-right")}>
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => openCollect(i)} className="btn-neon !px-2.5 !py-1 !text-[11px]">Collect Due</button>
                      <button
                        onClick={() => whatsappReminder(i)}
                        title="Send WhatsApp reminder"
                        className="btn-ghost !px-2 !py-1 !text-[11px] !text-emerald-300"
                      >
                        <MessageCircle size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!dues.length && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-500">No outstanding dues — all invoices settled.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <Modal open={!!target} onClose={() => setCollectId(null)} title={`Collect Due · ${target?.invNo ?? ""}`}>
        {target && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Net</p>
                <p className="font-mono text-xs text-white mt-0.5">{fmtINR(target.net)}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Paid</p>
                <p className="font-mono text-xs text-emerald-300 mt-0.5">{fmtINR(target.paid)}</p>
              </div>
              <div className="rounded-lg border border-red-400/20 bg-red-400/[0.05] p-2.5">
                <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Due</p>
                <p className="font-mono text-xs text-red-300 mt-0.5">{fmtINR(target.due)}</p>
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1">Amount</label>
              <input
                type="number" min={0} max={target.due} step="0.01"
                className={cn(inputCls, "font-mono")} value={amount} onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1">Payment mode</label>
              <div className="flex gap-1.5">
                {(["Cash", "Card", "UPI"] as const).map((m) => (
                  <button
                    key={m} onClick={() => setMode(m)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                      mode === m
                        ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCollectId(null)} className="btn-ghost !text-xs">Cancel</button>
              <button onClick={collect} className="btn-neon !text-xs">
                <Wallet size={13} className="mr-1.5" /> Collect {amount ? fmtINR(Number(amount) || 0) : ""}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============================== switch ============================== */

export function AfterSales({ view }: { view: "returns" | "duplicate" | "dues" }) {
  if (view === "returns") return <ReturnsScreen />;
  if (view === "duplicate") return <DuplicateScreen />;
  return <DuesScreen />;
}
