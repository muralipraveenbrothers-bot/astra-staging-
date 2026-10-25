import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, BellRing, CheckCircle2, Clock3, CreditCard, FileWarning, IndianRupee, Loader2, Printer, Radio, Receipt, RefreshCw, Search, ShieldCheck, Sparkles, WalletCards, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { MedicationDraftPanel } from "@/astra/clinical/medication/MedicationDraftPanel";
import { OrderStatusChip } from "@/astra/clinical/workflow/OrderStatusChip";
import { PENDING_EMERGENCY_BILL_LABEL } from "@/astra/clinical/workflow/orderEvents";
import { toStockItems } from "@/astra/clinical/medication/stockCheck";
import { DEMO_STOCK_LABEL, usePharmacyInventory } from "@/sections/hospital/role/pharmacyInventoryLive";

type Alert = { id:string; severity:"critical"|"warning"|"info"; title:string; detail:string; correction:string };
type Charge = { id:string; category:string; description:string; amount:number; department:string; sourceRef?:string; createdAt:string; createdBy:string };
type Payment = { id:string; amount:number; mode:string; reference?:string; receivedAt:string; receivedBy:string };
type Adjustment = { id:string; amount:number; reason:string; createdAt:string; createdBy:string };
type Reminder = { id:string; channel:"in_app"; message:string; createdAt:string; createdBy:string; status:"delivered" };
type Bill = {
  id:string; billNumber:string; patientId:string; patientName:string; uhid:string; totalAmount:number; paidAmount:number; balance:number;
  status:string; displayStatus?:string; settlementLabel?:string; createdAt:string; updatedAt?:string; pharmacyCleared:boolean; labCleared:boolean; doctorCleared:boolean; isPmjayCashless:boolean;
  charges?:Charge[]; payments?:Payment[]; adjustments?:Adjustment[]; reminders?:Reminder[]; anomalies:Alert[];
  orders:Array<{id:string;category:string;item:string;status:string;createdAt:string}>;
  patient?:{department?:string;admissionStatus?:string;bedNumber?:string;ward?:string;insuranceProvider?:string};
};
type Snapshot = { generatedAt:string; summary:{bills:number;gross:number;collected:number;outstanding:number;cleared:number;pending:number;exceptions:number}; bills:Bill[] };
type LiveEvent = { id:string; type:string; timestamp:string; payload?:{snapshot?:Snapshot;billId?:string;billNumber?:string;patientName?:string;uhid?:string;amount?:number;mode?:string;actor?:string;message?:string;count?:number} };

const serviceCategories = ["registration","consultation","pharmacy","laboratory","radiology","ward","procedure","surgery","dressing"];
const money = (n:number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const when = (v?:string) => v ? new Date(v).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}) : "Not recorded";
const stagingBillingSnapshot = (): Snapshot => {
  const now = new Date().toISOString();
  const bill: Bill = {
    id: "staging-bill-001", billNumber: "ASTRA-DEMO-0001", patientId: "staging-patient-001", patientName: "Demo Patient", uhid: "UHID-STAGING-001",
    totalAmount: 18500, paidAmount: 10000, balance: 8500, status: "pending", createdAt: now, pharmacyCleared: true, labCleared: true, doctorCleared: true, isPmjayCashless: false,
    anomalies: [], orders: [], patient: { department: "General Medicine", admissionStatus: "OPD", insuranceProvider: "Self Pay" },
    charges: [{ id: "staging-charge-001", category: "consultation", description: "Demo consultation", amount: 18500, department: "consultation", createdAt: now, createdBy: "Astra staging" }],
    payments: [{ id: "staging-payment-001", amount: 10000, mode: "upi", reference: "DEMO-UPI-001", receivedAt: now, receivedBy: "Astra staging" }],
    adjustments: [], reminders: [],
  };
  return { generatedAt: now, summary: { bills: 1, gross: 18500, collected: 10000, outstanding: 8500, cleared: 0, pending: 1, exceptions: 0 }, bills: [bill] };
};

export function billingCommandError(status: number, fallback: string): string {
  return status === 403 ? "You don't have access to Billing with your role" : fallback;
}

export const BillingDashboard:React.FC = () => {
  const [data,setData] = useState<Snapshot|null>(null);
  const stock = usePharmacyInventory();
  const [selectedId,setSelectedId] = useState("");
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState("all");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [saving,setSaving] = useState(false);
  const [liveConnected,setLiveConnected] = useState(false);
  const [liveEvents,setLiveEvents] = useState<LiveEvent[]>([]);
  const [payment,setPayment] = useState({amount:"",mode:"upi",reference:""});
  const [adjustment,setAdjustment] = useState({amount:"",reason:""});
  const [charge,setCharge] = useState({category:"consultation",description:"",amount:"",sourceRef:""});
  const token = localStorage.getItem("astra.serverToken") ?? "";

  async function load(silent=false){
    if(!silent)setLoading(true); setError("");
    try {
      const r=await fetch("/api/billing/command",{headers:{Authorization:`Bearer ${token}`}});
      if(!r.ok) throw new Error(billingCommandError(r.status, `Billing command HTTP ${r.status}`));
      const next=await r.json() as Snapshot; setData(next);
      setSelectedId(current=>current&&next.bills.some(b=>b.id===current)?current:next.bills[0]?.id??"");
    } catch(e){
      if (import.meta.env.VITE_ASTRA_STAGING_DEMO_AUTH === "true") {
        setData(stagingBillingSnapshot());
        setSelectedId("staging-bill-001");
        setError("");
      } else if(!silent) setError(e instanceof Error?e.message:String(e));
    } finally{if(!silent)setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    let stopped=false;
    let controller:AbortController|undefined;
    const billingTypes=new Set(["BILL_CREATED","BILL_CHARGE_POSTED","BILL_PAYMENT_COLLECTED","BILL_ADJUSTMENT_POSTED","BILL_PAYMENT_REMINDER","ORDER_WORKFLOW_EVENT"]);
    const connect=async()=>{
      while(!stopped){
        controller=new AbortController();
        try{
          const response=await fetch("/api/events",{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
          if(!response.ok||!response.body)throw new Error(`Live stream HTTP ${response.status}`);
          setLiveConnected(true);
          const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer="";
          while(!stopped){
            const {done,value}=await reader.read(); if(done)break;
            buffer+=decoder.decode(value,{stream:true});
            const frames=buffer.split("\n\n"); buffer=frames.pop()??"";
            for(const frame of frames){
              const line=frame.split("\n").find(part=>part.startsWith("data: ")); if(!line)continue;
              try{
                const event=JSON.parse(line.slice(6)) as LiveEvent;
                if(!billingTypes.has(event.type))continue;
                setLiveEvents(current=>[event,...current.filter(item=>item.id!==event.id)].slice(0,40));
                if(event.payload?.snapshot){
                  setData(event.payload.snapshot);
                  setSelectedId(current=>current&&event.payload!.snapshot!.bills.some(b=>b.id===current)?current:event.payload!.snapshot!.bills[0]?.id??"");
                }else void load(true);
              }catch{/* Ignore a malformed event and keep the live connection open. */}
            }
          }
        }catch(e){if(!stopped&&!(e instanceof DOMException&&e.name==="AbortError"))setLiveConnected(false);}
        if(!stopped){setLiveConnected(false);await new Promise(resolve=>setTimeout(resolve,1500));}
      }
    };
    void connect();
    return()=>{stopped=true;controller?.abort();};
  },[token]);
  const bills=useMemo(()=>(data?.bills??[]).filter(b=>{
    const text=`${b.patientName} ${b.uhid} ${b.billNumber}`.toLowerCase();
    const state=filter==="all" || (filter==="pending"?b.balance>0:filter==="paid"?b.balance===0&&b.totalAmount>0:filter==="exceptions"?b.anomalies.length>0:b.status===filter);
    return text.includes(query.toLowerCase())&&state;
  }),[data,query,filter]);
  const selected=(data?.bills??[]).find(b=>b.id===selectedId)??bills[0];
  const dueBills=useMemo(()=>(data?.bills??[]).filter(b=>b.balance>0).sort((a,b)=>+new Date(a.createdAt)-+new Date(b.createdAt)),[data]);
  const feed=useMemo(()=>{
    const history:LiveEvent[]=(data?.bills??[]).flatMap(b=>[
      ...(b.charges??[]).map(x=>({id:x.id,type:"BILL_CHARGE_POSTED",timestamp:x.createdAt,payload:{billId:b.id,billNumber:b.billNumber,patientName:b.patientName,uhid:b.uhid,amount:x.amount,message:`${x.category}: ${x.description}`,actor:x.createdBy}})),
      ...(b.payments??[]).map(x=>({id:x.id,type:"BILL_PAYMENT_COLLECTED",timestamp:x.receivedAt,payload:{billId:b.id,billNumber:b.billNumber,patientName:b.patientName,uhid:b.uhid,amount:x.amount,mode:x.mode,message:`${x.mode.toUpperCase()} payment received`,actor:x.receivedBy}})),
      ...(b.adjustments??[]).map(x=>({id:x.id,type:"BILL_ADJUSTMENT_POSTED",timestamp:x.createdAt,payload:{billId:b.id,billNumber:b.billNumber,patientName:b.patientName,uhid:b.uhid,amount:x.amount,message:"Audited correction posted",actor:x.createdBy}})),
      ...(b.reminders??[]).map(x=>({id:x.id,type:"BILL_PAYMENT_REMINDER",timestamp:x.createdAt,payload:{billId:b.id,billNumber:b.billNumber,patientName:b.patientName,uhid:b.uhid,amount:b.balance,message:x.message,actor:x.createdBy}})),
      {id:`${b.id}-created`,type:"BILL_CREATED",timestamp:b.createdAt,payload:{billId:b.id,billNumber:b.billNumber,patientName:b.patientName,uhid:b.uhid,message:"Bill opened at registration"}}
    ] as LiveEvent[]);
    const merged=[...liveEvents,...history].sort((a,b)=>+new Date(b.timestamp)-+new Date(a.timestamp));
    return [...new Map(merged.map(item=>[item.id,item])).values()].slice(0,30);
  },[data,liveEvents]);

  async function mutate(path:string,body:object,message:string){
    setSaving(true);
    try{
      const r=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
      const result=await r.json(); if(!r.ok) throw new Error(result.message||result.error);
      setData(result.snapshot); toast.success(message); return true;
    }catch(e){toast.error("Billing action rejected",{description:e instanceof Error?e.message:String(e)});return false;}
    finally{setSaving(false);}
  }
  async function collect(){
    if(!selected)return;
    if(await mutate(`/api/billing/bills/${encodeURIComponent(selected.id)}/payments`,{amount:Number(payment.amount),mode:payment.mode,reference:payment.reference},"Payment recorded with receipt and audit trail")) setPayment({amount:"",mode:payment.mode,reference:""});
  }
  async function correct(){
    if(!selected)return;
    if(await mutate(`/api/billing/bills/${encodeURIComponent(selected.id)}/adjustments`,{amount:Number(adjustment.amount),reason:adjustment.reason},"Correction posted without overwriting history")) setAdjustment({amount:"",reason:""});
  }
  async function postCharge(){
    if(!selected)return;
    if(await mutate(`/api/billing/bills/${encodeURIComponent(selected.id)}/charges`,{...charge,amount:Number(charge.amount),department:charge.category},"Department charge posted and linked to the patient ledger")) setCharge({category:charge.category,description:"",amount:"",sourceRef:""});
  }
  async function remind(bill:Bill){
    await mutate(`/api/billing/bills/${encodeURIComponent(bill.id)}/reminders`,{},`In-app payment reminder delivered for ${bill.billNumber}`);
  }
  async function remindAll(){
    await mutate("/api/billing/reminders/due",{},"Due reminders processed with 24-hour duplicate protection");
  }

  if(loading)return <div className="flex h-full items-center justify-center text-sm text-cyan-300"><Loader2 className="mr-2 animate-spin"/>Loading live billing ledger…</div>;
  if(error||!data)return <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 text-sm text-rose-200"><FileWarning className="mb-3"/>{error||"Billing unavailable"}<button onClick={()=>void load()} className="mt-4 block rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold">Retry</button></div>;

  return <div data-testid="billing-command-center" className="mx-auto max-w-[1680px] space-y-4 p-3 text-slate-100">
    <header className="rounded-2xl border border-emerald-400/25 bg-gradient-to-r from-slate-950 via-[#0b1820] to-emerald-950/50 p-5 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[.24em] text-emerald-400">FINANCIAL CONTROL · REVENUE INTEGRITY · AUDIT</p><h1 className="mt-1 flex items-center gap-2 text-xl font-black"><ShieldCheck className="text-emerald-400"/>ASTRA Billing Command Center <OrderStatusChip patientUhid={selected?.uhid} role="billing" /></h1><p className="mt-1 max-w-3xl text-xs text-slate-400">Every bill starts at registration and follows department charges, clearances, payments and audited corrections through discharge.</p></div>
        <div className="flex flex-wrap items-center gap-2"><span data-testid="billing-live-status" className={`rounded-xl border px-3 py-2 text-[10px] font-black ${liveConnected?"border-emerald-400/30 bg-emerald-500/10 text-emerald-300":"border-amber-400/30 bg-amber-500/10 text-amber-200"}`}>{liveConnected?<Wifi size={13} className="mr-1 inline"/>:<WifiOff size={13} className="mr-1 inline"/>}{liveConnected?"LIVE · PUSH CONNECTED":"RECONNECTING · AUTO-SYNC"}</span><button onClick={()=>void load()} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold"><RefreshCw size={14} className="mr-1 inline"/>Refresh</button><button onClick={()=>window.print()} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold"><Printer size={14} className="mr-1 inline"/>Print Control Report</button></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Gross billed" value={money(data.summary.gross)} icon={Receipt} tone="cyan"/><Kpi label="Collected" value={money(data.summary.collected)} icon={Banknote} tone="emerald"/>
        <Kpi label="Outstanding" value={money(data.summary.outstanding)} icon={WalletCards} tone="amber"/><Kpi label="Paid bills" value={String(data.summary.cleared)} icon={CheckCircle2} tone="emerald"/>
        <Kpi label="Pending bills" value={String(data.summary.pending)} icon={Clock3} tone="amber"/><Kpi label="Exceptions" value={String(data.summary.exceptions)} icon={AlertTriangle} tone={data.summary.exceptions?"rose":"emerald"}/>
      </div>
    </header>

    <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <div data-testid="billing-live-feed" className="rounded-2xl border border-cyan-500/25 bg-slate-900/80 p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-black"><Radio size={16} className={liveConnected?"animate-pulse text-emerald-400":"text-amber-300"}/>Live Billing Feed</h2><p className="mt-1 text-[10px] text-slate-500">Every new bill, charge, payment, reminder and correction appears here immediately.</p></div><span className="rounded-lg bg-cyan-500/10 px-2 py-1 text-[9px] font-bold text-cyan-300">{feed.length} latest events</span></div>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">{feed.length?feed.map(event=><button key={event.id} onClick={()=>event.payload?.billId&&setSelectedId(event.payload.billId)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/55 p-3 text-left hover:border-cyan-500/30"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[8px] font-black ${event.type==="BILL_PAYMENT_COLLECTED"?"bg-emerald-500/15 text-emerald-300":event.type==="BILL_PAYMENT_REMINDER"?"bg-amber-500/15 text-amber-300":event.type==="BILL_ADJUSTMENT_POSTED"?"bg-violet-500/15 text-violet-300":"bg-cyan-500/15 text-cyan-300"}`}>{event.type.replace(/^BILL_/,"").replace(/_/g," ")}</span><b className="truncate text-[11px] text-white">{event.payload?.patientName??"Billing command"}</b></div><p className="mt-1 truncate text-[10px] text-slate-400">{event.payload?.message} · {event.payload?.billNumber??"All due bills"}</p><p className="text-[9px] text-slate-600">{when(event.timestamp)}{event.payload?.actor?` · ${event.payload.actor}`:""}</p></div>{typeof event.payload?.amount==="number"&&<b className={`shrink-0 text-xs ${event.type==="BILL_PAYMENT_COLLECTED"?"text-emerald-300":"text-amber-300"}`}>{money(event.payload.amount)}</b>}</button>):<div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-500">Waiting for the first billing event…</div>}</div>
      </div>

      <div data-testid="billing-due-queue" className="rounded-2xl border border-amber-500/25 bg-slate-900/80 p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-black"><BellRing size={16} className="text-amber-300"/>Due Payment Reminder Queue</h2><p className="mt-1 text-[10px] text-slate-500">Live outstanding list with recorded in-app notifications.</p></div><button disabled={saving||dueBills.length===0} onClick={()=>void remindAll()} className="rounded-xl bg-amber-500 px-3 py-2 text-[10px] font-black text-slate-950 disabled:opacity-40">Notify all due</button></div>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">{dueBills.map(b=>{const last=b.reminders?.at(-1);const age=Math.max(0,Math.floor((Date.now()-new Date(b.createdAt).getTime())/3_600_000));return <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/55 p-3"><button onClick={()=>setSelectedId(b.id)} className="min-w-0 text-left"><b className="block truncate text-[11px] text-white">{b.patientName} · {b.billNumber}</b><p className="mt-0.5 text-[10px] text-slate-500">Due {money(b.balance)} · {age}h old</p><p className={`mt-1 text-[9px] ${last?"text-emerald-400":"text-amber-300"}`}>{last?`Last reminder ${when(last.createdAt)}`:"Reminder not sent"}</p></button><button disabled={saving} onClick={()=>void remind(b)} className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-2 text-[9px] font-bold text-amber-200 disabled:opacity-40">Send reminder</button></div>})}{!dueBills.length&&<div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-6 text-center text-xs text-emerald-200"><CheckCircle2 size={15} className="mr-1 inline"/>No unpaid bills.</div>}</div>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)_360px]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-xl">
        <div className="flex gap-2"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-2.5 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Patient, UHID or invoice" className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-2 text-xs outline-none focus:border-cyan-500"/></div><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Bill filter" className="rounded-xl border border-slate-700 bg-slate-950 px-2 text-xs"><option value="all">All</option><option value="pending">Due</option><option value="paid">Paid</option><option value="insurance_pending">Insurance</option><option value="exceptions">Alerts</option></select></div>
        <div className="mt-3 max-h-[690px] space-y-2 overflow-y-auto pr-1">{bills.map(b=><button key={b.id} onClick={()=>setSelectedId(b.id)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.id===b.id?"border-cyan-400/50 bg-cyan-500/10":"border-slate-800 bg-slate-950/50 hover:border-slate-700"}`}><div className="flex items-start justify-between"><div><b className="text-xs text-white">{b.patientName}</b><p className="text-[10px] text-slate-500">{b.uhid} · {b.billNumber}</p></div><Status bill={b}/></div><div className="mt-3 flex items-end justify-between"><div><span className="text-[9px] uppercase text-slate-600">Balance</span><p className={`text-sm font-black ${b.balance?"text-amber-300":"text-emerald-300"}`}>{money(b.balance)}</p></div>{b.anomalies.length>0&&<span className="rounded bg-rose-500/15 px-2 py-1 text-[9px] font-bold text-rose-300">{b.anomalies.length} alert{b.anomalies.length>1?"s":""}</span>}</div></button>)}</div>
      </div>

      {selected?<main className="space-y-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold text-cyan-400">LIVE PATIENT BILL</p><h2 className="text-lg font-black">{selected.patientName} <span className="text-sm font-normal text-slate-500">{selected.uhid}</span></h2><p className="text-xs text-slate-400">{selected.patient?.admissionStatus??"patient"} · {selected.patient?.department??"Department pending"} · {selected.patient?.bedNumber??"No bed"}</p></div><div className="text-right"><p className="text-[10px] text-slate-500">Created {when(selected.createdAt)}</p><b className="font-mono text-cyan-300">{selected.billNumber}</b></div></div>
          <div className="mt-4 grid grid-cols-3 gap-3"><Amount label="Total" value={selected.totalAmount}/><Amount label="Paid" value={selected.paidAmount} green/><Amount label="Balance" value={selected.balance} warning={selected.balance>0}/></div>
          <div className="mt-4">{!stock.loading && !stock.live && <p data-testid="demo-stock-label" className="mb-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-2 py-1 text-[10px] font-bold text-amber-200">{DEMO_STOCK_LABEL}</p>}<MedicationDraftPanel audience="billing" patientId={selected.uhid} patientName={selected.patientName} inventory={toStockItems(stock.items)} /></div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold"><Sparkles size={15} className="mr-2 inline text-cyan-400"/>Charge Coverage Across Hospital</h3><span className="text-[10px] text-slate-500">Order-to-charge reconciliation</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">{serviceCategories.map(c=>{const charges=selected.charges?.filter(x=>x.category===c)??[];const orders=selected.orders.filter(o=>o.category===c||(c==="laboratory"&&o.category==="lab"));return <div key={c} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-center justify-between"><b className="text-[10px] uppercase text-slate-300">{c}</b><span className={`h-2 w-2 rounded-full ${charges.length||orders.length===0?"bg-emerald-400":"bg-amber-400"}`}/></div><p className="mt-1 text-sm font-black">{money(charges.reduce((s,x)=>s+x.amount,0))}</p><p className="text-[9px] text-slate-600">{charges.length} charge · {orders.length} order</p></div>})}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-xl">
          <h3 className="text-sm font-bold"><Receipt size={15} className="mr-2 inline text-emerald-400"/>Ledger Timeline</h3>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto"><Ledger bill={selected}/></div>
        </div>
      </main>:<div className="rounded-2xl border border-slate-800 p-8 text-center text-slate-500">No matching bill.</div>}

      <aside className="space-y-4">
        <div className="rounded-2xl border border-rose-500/25 bg-rose-950/10 p-4 shadow-xl"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-rose-200"><AlertTriangle size={15} className="mr-2 inline"/>Integrity Alerts</h3><span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">{selected?.anomalies.length??0}</span></div><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{selected?.anomalies.length?selected.anomalies.map(a=><div key={a.id} className={`rounded-xl border p-3 ${a.severity==="critical"?"border-rose-500/40 bg-rose-500/10":a.severity==="warning"?"border-amber-500/30 bg-amber-500/10":"border-cyan-500/25 bg-cyan-500/10"}`}><b className="text-xs text-white">{a.title}</b><p className="mt-1 text-[10px] leading-4 text-slate-400">{a.detail}</p><p className="mt-2 rounded-lg bg-black/20 p-2 text-[10px] leading-4 text-emerald-200"><b>How to correct:</b> {a.correction}</p></div>):<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200"><CheckCircle2 size={14} className="mr-1 inline"/>No mismatch detected.</div>}</div></div>
        {selected&&<><div className="rounded-2xl border border-cyan-500/25 bg-slate-900/80 p-4 shadow-xl"><h3 className="text-sm font-bold"><Receipt size={15} className="mr-2 inline text-cyan-300"/>Post Department Charge</h3><p className="mt-1 text-[10px] text-slate-500">Link pharmacy, lab, imaging, ward, procedure, surgery or dressing to its source order.</p><select value={charge.category} onChange={e=>setCharge(c=>({...c,category:e.target.value}))} className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs">{serviceCategories.map(c=><option key={c} value={c}>{c[0].toUpperCase()+c.slice(1)}</option>)}</select><input value={charge.description} onChange={e=>setCharge(c=>({...c,description:e.target.value}))} placeholder="Service description" className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"/><div className="mt-2 grid grid-cols-2 gap-2"><input value={charge.amount} onChange={e=>setCharge(c=>({...c,amount:e.target.value}))} type="number" min="0" placeholder="Amount" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"/><input value={charge.sourceRef} onChange={e=>setCharge(c=>({...c,sourceRef:e.target.value}))} placeholder="Order/source ID" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"/></div><button disabled={saving||!charge.amount||!charge.description.trim()} onClick={()=>void postCharge()} className="mt-3 w-full rounded-xl bg-cyan-600 py-2.5 text-xs font-black disabled:opacity-40">Validate & Post Charge</button></div>
        <div className="rounded-2xl border border-emerald-500/25 bg-slate-900/80 p-4 shadow-xl"><h3 className="text-sm font-bold"><IndianRupee size={15} className="mr-2 inline text-emerald-400"/>Collect Payment</h3><p className="mt-1 text-[10px] text-slate-500">Live balance {money(selected.balance)}. Overpayment is blocked.</p><input value={payment.amount} onChange={e=>setPayment(p=>({...p,amount:e.target.value}))} type="number" min="0" max={selected.balance} placeholder="Amount" className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"/><div className="mt-2 grid grid-cols-2 gap-2"><select value={payment.mode} onChange={e=>setPayment(p=>({...p,mode:e.target.value}))} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"><option value="upi">UPI</option><option value="card">Card</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="insurance">Insurance</option></select><input value={payment.reference} onChange={e=>setPayment(p=>({...p,reference:e.target.value}))} placeholder={payment.mode==="cash"?"Cash note":"Transaction ref"} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"/></div><button disabled={saving||!payment.amount||selected.balance<=0} onClick={()=>void collect()} className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-black disabled:opacity-40"><CreditCard size={14} className="mr-1 inline"/>Validate & Collect</button></div>
        <div className="rounded-2xl border border-violet-500/25 bg-slate-900/80 p-4 shadow-xl"><h3 className="text-sm font-bold">Audited Correction</h3><p className="mt-1 text-[10px] text-slate-500">Never overwrite history. Post a signed adjustment.</p><input value={adjustment.amount} onChange={e=>setAdjustment(p=>({...p,amount:e.target.value}))} type="number" placeholder="e.g. -500" className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"/><textarea value={adjustment.reason} onChange={e=>setAdjustment(p=>({...p,reason:e.target.value}))} placeholder="Reason and document reference" rows={3} className="mt-2 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs"/><button disabled={saving||!adjustment.amount||adjustment.reason.trim().length<8} onClick={()=>void correct()} className="mt-2 w-full rounded-xl border border-violet-400/40 bg-violet-500/15 py-2 text-xs font-bold text-violet-200 disabled:opacity-40">Post Correction to Audit Trail</button></div></>}
      </aside>
    </section>
    <p className="text-center text-[9px] text-slate-600">Snapshot {when(data.generatedAt)} · Amount limits, duplicate source references, payment references and immutable corrections are enforced by the server.</p>
  </div>;
};

function Kpi({label,value,icon:Icon,tone}:{label:string;value:string;icon:typeof Receipt;tone:"cyan"|"emerald"|"amber"|"rose"}){const c={cyan:"text-cyan-300 border-cyan-500/20",emerald:"text-emerald-300 border-emerald-500/20",amber:"text-amber-300 border-amber-500/20",rose:"text-rose-300 border-rose-500/20"}[tone];return <div className={`rounded-xl border bg-black/20 p-3 ${c}`}><div className="flex items-center gap-1 text-[9px] uppercase text-slate-500"><Icon size={12}/>{label}</div><p className={`mt-1 text-lg font-black ${c.split(" ")[0]}`}>{value}</p></div>}
function Amount({label,value,green,warning}:{label:string;value:number;green?:boolean;warning?:boolean}){return <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[9px] uppercase text-slate-600">{label}</p><p className={`text-lg font-black ${green?"text-emerald-300":warning?"text-amber-300":"text-white"}`}>{money(value)}</p></div>}
function Status({bill}:{bill:Bill}){const emergency=bill.displayStatus===PENDING_EMERGENCY_BILL_LABEL||bill.settlementLabel===PENDING_EMERGENCY_BILL_LABEL;if(emergency)return <span data-testid="bill-settlement" className="rounded-lg bg-rose-500/15 px-2 py-1 text-[9px] font-bold text-rose-200">{PENDING_EMERGENCY_BILL_LABEL}</span>;const paid=bill.balance===0&&bill.totalAmount>0;return <span className={`rounded-lg px-2 py-1 text-[9px] font-bold uppercase ${paid?"bg-emerald-500/15 text-emerald-300":bill.status==="insurance_pending"?"bg-violet-500/15 text-violet-300":"bg-amber-500/15 text-amber-300"}`}>{paid?"Paid":bill.status==="insurance_pending"?"Insurance":"Payment due"}</span>}
function Ledger({bill}:{bill:Bill}){const events=[...(bill.charges??[]).map(x=>({at:x.createdAt,type:"CHARGE",title:`${x.category}: ${x.description}`,amount:x.amount,meta:`${x.department} · ${x.createdBy}`})),...(bill.payments??[]).map(x=>({at:x.receivedAt,type:"PAYMENT",title:`${x.mode.toUpperCase()} payment`,amount:-x.amount,meta:`${x.id} · ${x.reference||"Cash"} · ${x.receivedBy}`})),...(bill.adjustments??[]).map(x=>({at:x.createdAt,type:"CORRECTION",title:x.reason,amount:x.amount,meta:x.createdBy})),...(bill.reminders??[]).map(x=>({at:x.createdAt,type:"REMINDER",title:x.message,amount:0,meta:`${x.status} · ${x.createdBy}`})),{at:bill.createdAt,type:"CREATED",title:"Bill opened at patient registration",amount:0,meta:bill.billNumber}].sort((a,b)=>+new Date(b.at)-+new Date(a.at));return <>{events.map((e,i)=><div key={`${e.type}-${i}`} className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div><b className="text-[10px] text-cyan-300">{e.type}</b><p className="text-xs text-slate-200">{e.title}</p><p className="text-[9px] text-slate-600">{when(e.at)} · {e.meta}</p></div><b className={`text-xs ${e.amount<0?"text-emerald-300":e.amount>0?"text-amber-300":"text-slate-500"}`}>{e.amount?`${e.amount<0?"−":"+"}${money(Math.abs(e.amount))}`:"—"}</b></div>)}</>}

export default BillingDashboard;
