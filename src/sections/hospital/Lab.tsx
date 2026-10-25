import { useEffect, useState } from "react";
import { FlaskConical, Plus, Timer } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { cn, nowTime, uid } from "@/lib/utils";

type SampleStatus = "ordered" | "collected" | "processing" | "resulted";
const FLOW: SampleStatus[] = ["ordered", "collected", "processing", "resulted"];

interface LabOrder {
  id: string;
  patientId: string;
  test: string;
  doctor: string;
  priority: "routine" | "urgent" | "stat";
  status: SampleStatus;
  orderedAt: string;
  orderedTs: number;
  tatTargetMin: number;
}

const seed: LabOrder[] = [
  { id: "lab-1", patientId: "PT-2209", test: "CBC + ESR", doctor: "Dr. Arjun Rao", priority: "routine", status: "resulted", orderedAt: "08:20", orderedTs: Date.now() - 1000 * 60 * 150, tatTargetMin: 120 },
  { id: "lab-2", patientId: "PT-2210", test: "HbA1c", doctor: "Dr. Arjun Rao", priority: "routine", status: "processing", orderedAt: "09:02", orderedTs: Date.now() - 1000 * 60 * 95, tatTargetMin: 180 },
  { id: "lab-3", patientId: "PT-1087", test: "CRP + Procalcitonin", doctor: "Dr. Arjun Rao", priority: "urgent", status: "processing", orderedAt: "09:40", orderedTs: Date.now() - 1000 * 60 * 70, tatTargetMin: 60 },
  { id: "lab-4", patientId: "PT-1102", test: "Troponin-I (serial)", doctor: "Dr. Admin", priority: "stat", status: "collected", orderedAt: "10:15", orderedTs: Date.now() - 1000 * 60 * 32, tatTargetMin: 30 },
  { id: "lab-5", patientId: "PT-2214", test: "Lipid profile", doctor: "Dr. Arjun Rao", priority: "routine", status: "ordered", orderedAt: "10:40", orderedTs: Date.now() - 1000 * 60 * 8, tatTargetMin: 240 },
];

export function Lab() {
  const [orders, setOrders] = useState<LabOrder[]>(seed);
  const [now, setNow] = useState(Date.now());
  const [modal, setModal] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [test, setTest] = useState("");
  const [priority, setPriority] = useState<LabOrder["priority"]>("routine");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const advance = (o: LabOrder) => {
    const next = FLOW[Math.min(FLOW.indexOf(o.status) + 1, FLOW.length - 1)];
    setOrders(orders.map((x) => (x.id === o.id ? { ...x, status: next } : x)));
    toast.success(`${o.test} → ${next}`, { description: o.patientId });
    if (next === "resulted") toast.info("WhatsApp 'lab_report_ready' template queued", { description: "Will send on reconciliation with billing." });
  };

  const addOrder = () => {
    if (!patientId.trim() || !test.trim()) return;
    const tat = priority === "stat" ? 30 : priority === "urgent" ? 60 : 180;
    setOrders([
      { id: uid("lab"), patientId: patientId.trim(), test: test.trim(), doctor: "Dr. Admin", priority, status: "ordered", orderedAt: nowTime(), orderedTs: Date.now(), tatTargetMin: tat },
      ...orders,
    ]);
    toast.success("Lab order placed", { description: `TAT target ${tat} min (${priority}).` });
    setModal(false); setPatientId(""); setTest("");
  };

  const delayed = orders.filter((o) => o.status !== "resulted" && now - o.orderedTs > o.tatTargetMin * 60000);
  const avgTat = Math.round(
    orders.filter((o) => o.status === "resulted").reduce((s, o) => s + (now - o.orderedTs) / 60000, 0) /
      Math.max(1, orders.filter((o) => o.status === "resulted").length)
  );

  return (
    <div className="space-y-4">
      {delayed.length > 0 && (
        <div className="glass border !border-red-400/40 p-4 flex items-center gap-3">
          <Timer className="text-red-400 shrink-0 animate-pulse" size={20} />
          <div>
            <p className="text-sm font-semibold text-red-300">{delayed.length} sample{delayed.length > 1 ? "s" : ""} past TAT target</p>
            <p className="text-xs text-slate-400">{delayed.map((d) => `${d.test} (${d.patientId})`).join(" · ")} — lab supervisor notified via Telegram.</p>
          </div>
        </div>
      )}

      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SectionTitle title="Lab Dashboard" subtitle={`${orders.length} orders today · avg TAT (resulted) ${avgTat} min`} />
          <button className="btn-neon !text-xs !py-1.5" onClick={() => setModal(true)}><Plus size={13} /> New lab order</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 pr-2 font-medium">Patient</th>
                <th className="pb-2 pr-2 font-medium">Test</th>
                <th className="pb-2 pr-2 font-medium">Priority</th>
                <th className="pb-2 pr-2 font-medium">Sample status</th>
                <th className="pb-2 pr-2 font-medium">Elapsed / TAT</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const elapsedMin = Math.floor((now - o.orderedTs) / 60000);
                const late = o.status !== "resulted" && elapsedMin > o.tatTargetMin;
                return (
                  <tr key={o.id} className={cn("border-b border-white/5 hover:bg-white/[0.03]", late && "bg-red-400/5")}>
                    <td className="py-2.5 pr-2 font-mono text-neon-cyan">{o.patientId}</td>
                    <td className="py-2.5 pr-2 text-slate-200">{o.test}</td>
                    <td className="py-2.5 pr-2">
                      <Badge tone={o.priority === "stat" ? "red" : o.priority === "urgent" ? "amber" : "neutral"} className="!text-[9px]">{o.priority}</Badge>
                    </td>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-1">
                        {FLOW.map((s, i) => (
                          <span key={s} className="flex items-center gap-1">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                FLOW.indexOf(o.status) >= i ? (o.status === "resulted" ? "bg-emerald-400" : "bg-yellow-400") : "bg-white/15"
                              )}
                              title={s}
                            />
                            {i < FLOW.length - 1 && <span className="w-3 h-px bg-white/15" />}
                          </span>
                        ))}
                        <span className="ml-2 text-slate-400">{o.status}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-2">
                      <span className={late ? "text-red-300 font-semibold" : "text-slate-300"}>
                        {elapsedMin}m / {o.tatTargetMin}m {late && "⚠"}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {o.status !== "resulted" && (
                        <button className="btn-ghost !p-1.5 !text-[10px]" onClick={() => advance(o)}>
                          <FlaskConical size={11} /> Advance
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">TAT = sample-ordered → result verified. Delays auto-notify the lab supervisor and flag the duty doctor.</p>
      </GlassCard>

      <Modal open={modal} onClose={() => setModal(false)} title="New lab order">
        <div className="space-y-3">
          <input className="input-dark" placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          <input className="input-dark" placeholder="Test (e.g. CBC + ESR)" value={test} onChange={(e) => setTest(e.target.value)} />
          <select className="input-dark" value={priority} onChange={(e) => setPriority(e.target.value as LabOrder["priority"])}>
            <option value="routine">Routine (TAT 3h)</option>
            <option value="urgent">Urgent (TAT 1h)</option>
            <option value="stat">STAT (TAT 30m)</option>
          </select>
          <button className="btn-neon w-full" disabled={!patientId.trim() || !test.trim()} onClick={addOrder}>Place order</button>
        </div>
      </Modal>
    </div>
  );
}
