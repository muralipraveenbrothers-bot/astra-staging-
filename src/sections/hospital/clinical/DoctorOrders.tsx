import { useState } from "react";
import { ClipboardList, Plus, Send, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { HospitalOrder, OrderDept } from "@/lib/types";

export default function DoctorOrders({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { orders, setOrders, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [orderText, setOrderText] = useState("");
  const [targetDept, setTargetDept] = useState<OrderDept>("Ward");
  const [dueMin, setDueMin] = useState(60);
  const [addDrug, setAddDrug] = useState("");
  const [addDose, setAddDose] = useState("");
  const [addQty, setAddQty] = useState(0);
  const [addPrice, setAddPrice] = useState(0);

  const postOrder = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    if (!orderText.trim()) { toast.error("Enter order text"); return; }
    const o: HospitalOrder = {
      id: uid("ord"), patientId, orderText: orderText.trim(), doctor: doctorName,
      createdAt: nowTime(), createdTs: Date.now(), dueMin,
      targetDept, drug: addDrug || undefined, dose: addDose || undefined,
      qty: addQty || undefined, unitPrice: addPrice || undefined,
    };
    setOrders([o, ...orders]);
    logAudit("Doctor order posted", `${o.orderText.slice(0, 60)} → ${o.targetDept} for ${patientId}`, doctorName);
    setOrderText(""); setAddDrug(""); setAddDose(""); setAddQty(0); setAddPrice(0);
    toast.success(`Order sent to ${targetDept}`);
  };

  const acknowledgeOrder = (id: string) => {
    setOrders(orders.map((o) => o.id === id ? { ...o, acknowledgedBy: doctorName, acknowledgedAt: nowTime() } : o));
    logAudit("Order acknowledged", `${orders.find((o) => o.id === id)?.orderText.slice(0, 40)}`, doctorName);
    toast.success("Order acknowledged");
  };

  const cancelOrder = (id: string) => {
    setOrders(orders.filter((o) => o.id !== id));
    logAudit("Order cancelled", `${orders.find((o) => o.id === id)?.orderText.slice(0, 40)}`, doctorName);
    toast.success("Order cancelled");
  };

  const patientOrders = orders.filter((o) => o.patientId === patientId || !patientId).slice(0, 20);

  return (
    <div className="space-y-4">
      <SectionTitle title="Doctor Orders" subtitle="Post and manage orders routed to departments" />

      <GlassCard>
        <div className="space-y-3">
          <textarea
            className="input-dark resize-none"
            rows={2}
            placeholder="e.g. IV Ceftriaxone 1g BD — administer next dose now"
            value={orderText}
            onChange={(e) => setOrderText(e.target.value)}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Target Dept</label>
              <select className="input-dark" value={targetDept} onChange={(e) => setTargetDept(e.target.value as OrderDept)}>
                <option value="Ward">Ward</option>
                <option value="Pharmacy">Pharmacy</option>
                <option value="Lab">Lab</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Due in (min)</label>
              <input className="input-dark" type="number" min={5} step={5} value={dueMin} onChange={(e) => setDueMin(Number(e.target.value))} />
            </div>
            {targetDept === "Pharmacy" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Drug</label>
                  <input className="input-dark" placeholder="e.g. Amoxicillin" value={addDrug} onChange={(e) => setAddDrug(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Dose</label>
                  <input className="input-dark" placeholder="e.g. 500mg" value={addDose} onChange={(e) => setAddDose(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Qty</label>
                  <input className="input-dark" type="number" min={0} value={addQty} onChange={(e) => setAddQty(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 mb-1 block">Unit Price</label>
                  <input className="input-dark" type="number" min={0} value={addPrice} onChange={(e) => setAddPrice(Number(e.target.value))} />
                </div>
              </>
            )}
          </div>
          <button className="btn-neon" onClick={postOrder} disabled={!patientId || !orderText.trim()}>
            <Send size={14} /> Post Order
          </button>
        </div>
      </GlassCard>

      {patientOrders.length > 0 && (
        <div className="space-y-2">
          {patientOrders.map((o) => (
            <GlassCard key={o.id} className={cn("!p-3", o.acknowledgedBy ? "border-emerald-400/20" : "")}>
              <div className="flex items-start gap-3">
                <ClipboardList size={16} className="text-cyan-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{o.orderText}</span>
                    <Badge tone={o.targetDept === "Pharmacy" ? "violet" : o.targetDept === "Lab" ? "cyan" : "neutral"} className="!text-[8px]">{o.targetDept}</Badge>
                    {o.acknowledgedBy ? (
                      <Badge tone="green" className="!text-[8px]">Acknowledged</Badge>
                    ) : (
                      <Badge tone="amber" className="!text-[8px]"><Clock size={10} className="inline mr-0.5" />{o.dueMin}min</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">By {o.doctor} at {o.createdAt}</p>
                  {o.drug && <p className="text-xs text-slate-400">{o.drug} {o.dose} × {o.qty}</p>}
                  {o.acknowledgedBy && (
                    <p className="text-[10px] text-slate-500">Acknowledged by {o.acknowledgedBy} at {o.acknowledgedAt}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!o.acknowledgedBy && (
                    <button className="btn-ghost !text-xs !py-1" onClick={() => acknowledgeOrder(o.id)}>
                      <CheckCircle size={12} /> Acknowledge
                    </button>
                  )}
                  <button className="btn-ghost !text-xs !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => cancelOrder(o.id)}>
                    <XCircle size={12} /> Cancel
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
