import { useEffect, useState, useCallback } from "react";
import { GlassCard, SectionTitle } from "@/components/ui";
import { StaffRegistry, NewOrderForm, RosterPanel, type WOrder, type StaffPerf, type StaffMember } from "./staffForms";
import { apiFetch, authHeaders } from "@/services/apiFetch";

const api = (m: string, p: string, b?: unknown) => apiFetch(`/api/workorders${p}`, { method: m, headers: authHeaders(Boolean(b)), body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const SC: Record<string, string> = { DRAFT:"bg-slate-700",REQUESTED:"bg-blue-700",VALIDATED:"bg-blue-500",BILL_REQUIRED:"bg-amber-600",BILL_CREATED:"bg-amber-500",PAYMENT_PENDING:"bg-orange-500",PAID:"bg-emerald-600",RELEASED:"bg-emerald-500",ASSIGNED:"bg-cyan-600",ACKNOWLEDGED:"bg-cyan-500",IN_PROGRESS:"bg-indigo-500",COMPLETED:"bg-green-600",RESULT_READY:"bg-green-500",REVIEWED:"bg-teal-500",CLOSED:"bg-emerald-700",CANCELLED:"bg-red-700",ESCALATED:"bg-rose-600",DELAYED:"bg-yellow-600" };

export function StaffCommandCenter() {
  const [tab, setTab] = useState<"board"|"roster"|"staff"|"new">("board");
  const [orders, setOrders] = useState<WOrder[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [perf, setPerf] = useState<StaffPerf|null>(null);
  const [dash, setDash] = useState<{ totalOrders:number; totalStaff:number; activeOrders:number; overdue:number }|null>(null);
  const [sla, setSla] = useState<{ order:WOrder; overdueMinutes:number; action:string }[]>([]);
  const [msg, setMsg] = useState(""); const [detail, setDetail] = useState<WOrder|null>(null);
  const reload = useCallback(() => {
    // The staging API may be unavailable or return an error envelope. Keep the
    // dashboard usable with empty, clearly non-live collections in that case.
    api("GET", "").then((d) => setOrders(Array.isArray(d?.orders) ? d.orders : [])).catch(() => setOrders([]));
    api("GET", "/staff").then((d) => setStaff(Array.isArray(d?.staff) ? d.staff : [])).catch(() => setStaff([]));
    api("GET", "/dashboard").then((d) => setDash(d && typeof d === "object" ? d : null)).catch(() => setDash(null));
    api("GET", "/sla").then((d) => setSla(Array.isArray(d?.overdue) ? d.overdue : [])).catch(() => setSla([]));
    api("GET", "/performance").then((d) => setPerf(d && typeof d === "object" ? d : null)).catch(() => setPerf(null));
  }, []);
  useEffect(() => { reload(); const t=setInterval(reload,8000); return ()=>clearInterval(t); }, [reload]);
  const act = async (m:string,p:string,b?:unknown,ok?:string) => { try { const r=await api(m,p,b); if(r.error) setMsg("Error: "+r.error); else { setMsg(ok??"OK"); reload(); } } catch(e){ setMsg("Failed: "+(e instanceof Error?e.message:e)); } };
  const step = (o:WOrder) => {
    const s=o.status;
    if(["BILL_REQUIRED","BILL_CREATED","PAYMENT_PENDING"].includes(s)) return <button onClick={()=>act("POST",`/${o.id}/bill`,{amount:300,discount:0},"Billed")}>Bill ₹300</button>;
    if(s==="PAYMENT_PENDING") return <button onClick={()=>act("POST",`/${o.id}/pay`,{reference:"CASH"},"Paid")}>Pay</button>;
    if(s==="RELEASED") return <button onClick={()=>act("POST",`/${o.id}/ack`,{},"Ack")}>Ack</button>;
    if(s==="ACKNOWLEDGED") return <button onClick={()=>act("POST",`/${o.id}/start`,{},"Started")}>Start</button>;
    if(["IN_PROGRESS","ACKNOWLEDGED"].includes(s)) return <button onClick={()=>act("POST",`/${o.id}/complete`,{resultSummary:"WNL"},"Done")}>Complete</button>;
    if(s==="RESULT_READY") return <button onClick={()=>act("POST",`/${o.id}/review`,{},"Closed")}>Review</button>;
    return <span className="text-[10px] text-slate-400">{s}</span>;
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <SectionTitle title="🏥 Staff Command + Work Order Center" subtitle={`${dash?.totalStaff??0} staff · ${dash?.activeOrders??0} active`} />
        <div className="ml-auto flex gap-2">
          <button onClick={()=>setTab("board")} className={`btn-xs ${tab==="board"?"bg-indigo-600":"bg-slate-700"}`}>Work Board</button>
          <button onClick={()=>setTab("roster")} className={`btn-xs ${tab==="roster"?"bg-violet-600":"bg-slate-700"}`}>Roster & Perf</button>
          <button onClick={()=>setTab("staff")} className={`btn-xs ${tab==="staff"?"bg-indigo-600":"bg-slate-700"}`}>Staff</button>
          <button onClick={()=>setTab("new")} className={`btn-xs ${tab==="new"?"bg-emerald-600":"bg-slate-700"}`}>+ Order</button>
        </div>
      </div>
      {sla.length>0 && <GlassCard className="border-rose-500/40 bg-rose-900/20"><div className="text-rose-300 text-xs font-bold">⚠ SLA ({sla.length})</div>{sla.map(s=><div key={s.order.id} className="text-[11px] text-rose-200">{s.order.id} · {s.action} · {s.overdueMinutes}m</div>)}</GlassCard>}
      {msg && <div className="text-xs text-amber-300 bg-amber-900/30 px-3 py-1 rounded">{msg}</div>}
      {tab==="board" && <GlassCard>
        <table className="w-full text-xs">
          <thead className="text-slate-400"><tr><th className="text-left p-2">Order</th><th>Patient</th><th>Bed</th><th>Dept</th><th>Service</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{orders.map(o=>(
            <tr key={o.id} className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer" onClick={()=>setDetail(detail?.id===o.id?null:o)}>
              <td className="p-2 font-mono">{o.id}</td><td>{o.patientName}</td><td>{o.bed}</td><td>{o.department}</td><td>{o.serviceName}</td>
              <td><span className={`px-2 py-0.5 rounded text-[10px] text-white ${SC[o.status]??"bg-slate-600"}`}>{o.status}</span></td>
              <td>{step(o)}</td>
            </tr>
          ))}{orders.length===0&&<tr><td colSpan={7} className="p-4 text-center text-slate-500">No orders</td></tr>}</tbody>
        </table>
        {detail && <div className="mt-3 border-t border-slate-800 pt-3"><div className="text-[11px] font-bold text-indigo-300 mb-1">Trail — {detail.id}</div><div className="max-h-40 overflow-y-auto space-y-0.5">{detail.events.map((e,i)=>{const t=e.at.length>19?e.at.substring(11,19):e.at; return <div key={i} className="text-[10px] text-slate-300 flex gap-2"><span className="text-slate-500">{t}</span><span className="w-20">{e.from}</span><span>→</span><span className="w-20 font-semibold">{e.to}</span><span className="text-slate-500">{e.actor}</span></div>;})}</div></div>}
      </GlassCard>}
      {tab==="roster" && <RosterPanel perf={perf} />}
      {tab==="staff" && <StaffRegistry staff={staff} onChange={reload} act={act} />}
      {tab==="new" && <NewOrderForm act={act} onDone={()=>{reload();setTab("board");}} />}
    </div>
  );
}
