import { useMemo, useState } from "react";
import { Eye, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, fmtINR, nowTime, todayStr } from "@/lib/utils";
import type { Bill, PaymentMode } from "@/lib/types";

export function Billing() {
  const { bills, addBill, addIssue, ceoView, setCeoView, staff, addSendLog, addApproval } = useStore();
  const { account } = useAuth();
  const [kind, setKind] = useState<"OP" | "IP">("OP");
  const [modal, setModal] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [service, setService] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("UPI");
  const [staffName, setStaffName] = useState(staff[0]?.name ?? "");
  const [mismatch, setMismatch] = useState(false);

  const register = useMemo(() => bills.filter((b) => b.kind === kind).slice().reverse(), [bills, kind]);
  const todayTotal = bills.reduce((s, b) => s + (b.reversalOf ? -Math.abs(b.amount) : Math.abs(b.amount)), 0);

  const createBill = () => {
    const amt = Number(amount);
    if (!patientId.trim() || !service.trim() || !amt || amt <= 0) return;
    const ref = mode === "UPI" ? `upi://txn/${Math.random().toString(36).slice(2, 8).toUpperCase()}` : mode === "Card" ? `POS-${Math.floor(10000 + Math.random() * 89999)}` : "CASH-DRAWER-A";
    const bill = addBill({ patientId: patientId.trim(), kind, service: service.trim(), amount: amt, staffName, timestamp: nowTime(), mode, reference: ref });
    toast.success(`Receipt ${bill.receiptNo} issued`, { description: `${fmtINR(amt)} · ${mode} · appended to ${kind} register.` });
    setModal(false);
    setPatientId(""); setService(""); setAmount("");
  };

  const reverse = (b: Bill) => {
    // refund/reversal entries require Doctor/CEO approval — posted only on approval
    addApproval({
      kind: "refund",
      title: `Reversal of ${b.receiptNo} — ${fmtINR(b.amount)}`,
      detail: `${b.service} · ${b.patientId} · ${b.mode} ${b.reference}. Original entry stays untouched (append-only ledger); the reversal posts as a linked entry on approval.`,
      amount: b.amount,
      requestedBy: account?.name ?? "Billing desk",
      requestedByRole: account?.role ?? "reception",
      payload: JSON.stringify({
        bill: {
          patientId: b.patientId,
          kind: b.kind,
          service: `REVERSAL — ${b.service}`,
          amount: b.amount,
          staffName: b.staffName,
          timestamp: nowTime(),
          mode: b.mode,
          reference: `REV↦${b.receiptNo}`,
          reversalOf: b.receiptNo,
        },
      }),
    });
    toast.info("Reversal sent for approval", { description: `${b.receiptNo} → Doctor/CEO bell · Approvals. Posts as a linked entry only on approval.` });
  };

  const runRecon = () => {
    // simulated recon — deterministic mismatch the first time to demonstrate flow
    setMismatch(true);
    addIssue({
      title: `Recon mismatch ${todayStr()}: register ${fmtINR(todayTotal)} vs gateway ${fmtINR(todayTotal - 420)} (₹420)`,
      status: "todo",
      priority: "high",
      assignee: "Billing Fraud Auditor",
    });
    toast.error("Reconciliation mismatch detected", { description: "₹420 gap — issue auto-created for Billing Fraud Auditor (see Agents tab)." });
  };

  return (
    <div className="space-y-4">
      {/* mismatch banner */}
      {mismatch && (
        <div className="glass border !border-red-400/40 p-4 flex items-center gap-3">
          <ShieldAlert className="text-red-400 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">Daily reconciliation mismatch — ₹420 unaccounted</p>
            <p className="text-xs text-slate-400">Register total exceeds gateway + cash count. Issue filed automatically; ledger locked to review mode until cleared.</p>
          </div>
          <button className="btn-ghost !text-xs" onClick={() => { setMismatch(false); toast.success("Mismatch cleared by reviewer", { description: "Ledger unlocked." }); }}>
            Mark resolved
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* register */}
        <GlassCard className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex gap-1.5">
              {(["OP", "IP"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-xs font-semibold border transition-all",
                    kind === k ? "bg-violet-500/20 text-white border-violet-400/50" : "text-slate-400 border-white/10 hover:text-white"
                  )}
                >
                  {k} Register
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                className={cn("btn-ghost !text-xs", ceoView && "!border-cyan-400/50 !text-cyan-300")}
                onClick={() => { setCeoView(!ceoView); toast(ceoView ? "CEO remote view off" : "CEO remote view on", { description: ceoView ? "Edit controls restored." : "Read-only mode — controls disabled." }); }}
              >
                <Eye size={13} /> CEO view {ceoView ? "ON" : "OFF"}
              </button>
              <button className="btn-neon !text-xs !py-1.5" disabled={ceoView} onClick={() => setModal(true)}>
                <Plus size={13} /> New Bill
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-ink-800/95 backdrop-blur">
                <tr className="text-left text-slate-500 border-b border-white/10">
                  <th className="pb-2 pr-2 font-medium">Receipt #</th>
                  <th className="pb-2 pr-2 font-medium">Patient</th>
                  <th className="pb-2 pr-2 font-medium">Service</th>
                  <th className="pb-2 pr-2 font-medium text-right">Amount</th>
                  <th className="pb-2 pr-2 font-medium">Mode / Ref</th>
                  <th className="pb-2 pr-2 font-medium">Staff</th>
                  <th className="pb-2 pr-2 font-medium">Time</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {register.map((b) => (
                  <tr key={b.id} className={cn("border-b border-white/5 hover:bg-white/[0.03]", b.reversalOf && "bg-red-400/5")}>
                    <td className="py-2.5 pr-2 font-mono text-neon-cyan">{b.receiptNo}</td>
                    <td className="py-2.5 pr-2 text-slate-300">{b.patientId}</td>
                    <td className="py-2.5 pr-2 text-slate-300 max-w-[180px] truncate">{b.service}</td>
                    <td className={cn("py-2.5 pr-2 text-right font-semibold", b.reversalOf ? "text-red-300" : "text-white")}>
                      {b.reversalOf ? "−" : ""}{fmtINR(b.amount)}
                    </td>
                    <td className="py-2.5 pr-2">
                      <Badge tone={b.mode === "UPI" ? "cyan" : b.mode === "Card" ? "violet" : "green"} className="!text-[9px]">{b.mode}</Badge>
                      <span className="block text-[9px] text-slate-500 font-mono mt-0.5">{b.reference}</span>
                    </td>
                    <td className="py-2.5 pr-2 text-slate-400">{b.staffName}</td>
                    <td className="py-2.5 pr-2 text-slate-500">{b.timestamp}</td>
                    <td className="py-2.5">
                      {!b.reversalOf && !ceoView && (
                        <button className="btn-ghost !p-1.5" title="Post linked reversal" onClick={() => reverse(b)}>
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">Append-only ledger — corrections are posted as linked reversal entries; originals are never edited.</p>
        </GlassCard>

        {/* recon card */}
        <GlassCard>
          <SectionTitle title="Daily Reconciliation" subtitle={todayStr()} />
          <div className="space-y-3">
            {[
              { label: "Register total", value: todayTotal, color: "#39d5ff" },
              { label: "Payment gateway", value: todayTotal - 420, color: "#d4af37" },
              { label: "Cash count (drawer A)", value: 18450, color: "#f5d97e" },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <span className="text-xs text-slate-400">{r.label}</span>
                <span className="text-sm font-bold" style={{ color: r.color }}>{fmtINR(r.value)}</span>
              </div>
            ))}
            <div className={cn("rounded-lg border p-3 text-center text-xs font-semibold", mismatch ? "border-red-400/40 bg-red-400/10 text-red-300" : "border-white/10 text-slate-500")}>
              {mismatch ? "⚠ Δ ₹420 mismatch — flagged" : "Δ not computed — run reconciliation"}
            </div>
            <button className="btn-neon w-full" disabled={ceoView} onClick={runRecon}>
              Run reconciliation
            </button>
            <p className="text-[10px] text-slate-600">Compares register vs gateway settlement vs physical cash. Mismatch auto-files a critical issue to the Billing Fraud Auditor.</p>
          </div>
        </GlassCard>
      </div>

      {/* new bill modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={`New ${kind} bill`} wide>
        <div className="grid grid-cols-2 gap-3">
          <input className="input-dark" placeholder="Patient ID (e.g. PT-2215)" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          <select className="input-dark" value={kind} onChange={(e) => setKind(e.target.value as "OP" | "IP")}>
            <option value="OP">OP</option>
            <option value="IP">IP</option>
          </select>
          <input className="input-dark col-span-2" placeholder="Service description" value={service} onChange={(e) => setService(e.target.value)} />
          <input className="input-dark" placeholder="Amount (₹)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className="input-dark" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            <option>UPI</option><option>Card</option><option>Cash</option>
          </select>
          <select className="input-dark col-span-2" value={staffName} onChange={(e) => setStaffName(e.target.value)}>
            {staff.map((s) => <option key={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button className="btn-neon w-full mt-4" disabled={!patientId.trim() || !service.trim() || !amount} onClick={createBill}>
          Append to register & print receipt
        </button>
      </Modal>

      {/* ---------------- daily CEO audit ---------------- */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SectionTitle title="Daily CEO Audit" subtitle={`Auto-compiled · ${todayStr()}`} />
          <div className="flex gap-2 items-center">
            <a href="#/reports" className="btn-ghost !text-xs !py-1.5" title="Open the full analytics & reporting module">
              Full report → Reports
            </a>
            <button
              className="btn-neon !text-xs"
              onClick={() => {
                addSendLog({ provider: "WhatsApp", template: "ceo_daily_audit", recipient: "Dr. Admin (CEO)", status: "sent" });
                toast.success("CEO audit sent via WhatsApp", { description: "P&L summary delivered to CEO number · logged in Notifications → Send Log." });
              }}
            >
              <Eye size={13} className="hidden" /> Send via WhatsApp
            </button>
          </div>
        </div>
        {(() => {
          const sum = (m: string) => bills.filter((b) => b.mode === m).reduce((s, b) => s + (b.reversalOf ? -b.amount : b.amount), 0);
          const upi = sum("UPI"), card = sum("Card"), cash = sum("Cash");
          const revenue = upi + card + cash;
          const directCosts = Math.round(revenue * 0.58);
          const margin = revenue - directCosts;
          const cells = [
            { label: "Bills issued today", value: String(bills.length), color: "#39d5ff" },
            { label: "Revenue (gross)", value: fmtINR(revenue), color: "#d4af37" },
            { label: "UPI / Card / Cash", value: `${fmtINR(upi)} / ${fmtINR(card)} / ${fmtINR(cash)}`, color: "#f5d97e" },
            { label: "Est. direct costs (58%)", value: fmtINR(directCosts), color: "#f87171" },
            { label: "Gross margin (P&L)", value: fmtINR(margin), color: "#34d399" },
            { label: "Recon status", value: mismatch ? "⚠ ₹420 open" : "pending run", color: mismatch ? "#f87171" : "#fbbf24" },
          ];
          return (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {cells.map((c) => (
                <div key={c.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider leading-snug">{c.label}</div>
                  <div className="text-sm font-bold mt-1.5 leading-snug" style={{ color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>
          );
        })()}
        <p className="text-[10px] text-slate-600 mt-3">
          Compiled from the append-only ledger (reversals net against revenue). Direct costs are an estimate until pharmacy/OT actuals post at day-end.
        </p>
      </GlassCard>
    </div>
  );
}
