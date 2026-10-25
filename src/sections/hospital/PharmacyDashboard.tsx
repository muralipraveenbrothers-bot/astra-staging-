// Comprehensive Pharmacy Dashboard — all pharmacy tools in one multi-tab view
// Counter Sales, Dispensing Queue, Stock Ledger, Purchase Register, Medicine Master,
// Expiry Tracking, Supplier Management, AI Rack Suggestion, Daily Reports

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Box,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  FlaskConical,
  Loader2,
  MessageCircle,
  Package,
  Pill,
  Plus,
  RotateCcw,
  ScanLine,
  Search,
  ShoppingCart,
  Snowflake,
  Sparkles,
  Syringe,
  Tablet,
  Thermometer,
  Trash2,
  Truck,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { initialPharmacyStock } from "@/lib/mock";
import { cn, fmtINR, nowTime, sleep, uid } from "@/lib/utils";
import { OrderQueueRow, useNow, useOrderEscalation } from "./deptOrders";
import type { HospitalOrder, Medicine, PharmacyDispense, PharmacyPurchase } from "@/lib/types";

const SCAN_MS = 2200;
const APPROVAL_THRESHOLD = 5000;

interface PurchaseDraft {
  supplier: string;
  invoiceNo: string;
  item: string;
  qty: string;
  amount: string;
}

interface CartLine {
  med: Medicine;
  qty: number;
}

type PharmTab = "dashboard" | "counter" | "dispensing" | "stock" | "purchases" | "master" | "expiry" | "suppliers" | "rack" | "reports";

export function PharmacyDashboard() {
  const { account } = useAuth();
  const { dispenses, purchases, medicines } = useStore();
  const [tab, setTab] = useState<PharmTab>("dashboard");

  const todayDispenses = dispenses.filter((d) => d.timestamp?.startsWith(new Date().toLocaleDateString("en-IN")));
  const todayRevenue = todayDispenses.reduce((s, d) => s + d.amount, 0);
  const lowStock = medicines.filter((m) => m.stock <= 10);
  const nearExpiry = medicines.filter((m) => {
    const b = m.batch;
    // Simple expiry check — if batch contains year like 2025, it's near
    const yrMatch = b?.match(/\b(2025|2026)\b/);
    return yrMatch && yrMatch[0] === "2025";
  });

  const tabs = [
    { key: "dashboard" as PharmTab, label: "Dashboard", icon: BarChart3, count: 0 },
    { key: "counter" as PharmTab, label: "Counter Sales", icon: ShoppingCart, count: 0 },
    { key: "dispensing" as PharmTab, label: "Dispensing", icon: Pill, count: 0 },
    { key: "stock" as PharmTab, label: "Stock Ledger", icon: Box, count: lowStock.length },
    { key: "purchases" as PharmTab, label: "Purchases", icon: Truck, count: 0 },
    { key: "master" as PharmTab, label: "Medicine Master", icon: Tablet, count: 0 },
    { key: "expiry" as PharmTab, label: "Expiry Tracking", icon: Thermometer, count: nearExpiry.length },
    { key: "suppliers" as PharmTab, label: "Suppliers", icon: Users, count: 0 },
    { key: "rack" as PharmTab, label: "AI Rack", icon: Snowflake, count: 0 },
    { key: "reports" as PharmTab, label: "Reports", icon: BarChart3, count: 0 },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient">Pharmacy Management</h1>
          <p className="text-sm text-slate-400 mt-1">{account?.name ?? "Pharmacist"} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="cyan" className="!text-[10px]"><DollarSign size={12} className="mr-1" /> Today: {fmtINR(todayRevenue)}</Badge>
          <Badge tone={lowStock.length > 0 ? "amber" : "green"} className="!text-[10px]"><Box size={12} className="mr-1" /> {lowStock.length} low stock</Badge>
          <Badge tone={nearExpiry.length > 0 ? "red" : "green"} className="!text-[10px]"><Thermometer size={12} className="mr-1" /> {nearExpiry.length} expiring</Badge>
        </div>
      </div>

      <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-all border",
              tab === key ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_14px_rgba(212,175,55,0.25)]"
              : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white hover:bg-white/[0.06]"
            )}>
            <Icon size={14} className={tab === key ? "text-neon-cyan" : ""} /> {label}
            {count > 0 && <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-red-500/20 text-red-300">{count}</span>}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <PharmDashboard />}
      {tab === "counter" && <CounterSales />}
      {tab === "dispensing" && <DispensingQueue />}
      {tab === "stock" && <StockLedger />}
      {tab === "purchases" && <PurchaseRegister />}
      {tab === "master" && <MedicineMaster />}
      {tab === "expiry" && <ExpiryTracking />}
      {tab === "suppliers" && <SupplierManagement />}
      {tab === "rack" && <AIRackSuggestion />}
      {tab === "reports" && <PharmacyReports />}
    </div>
  );
}

// Dashboard summary
function PharmDashboard() {
  const { medicines, dispenses, purchases } = useStore();
  const totalStock = medicines.reduce((s, m) => s + m.stock, 0);
  const totalValue = medicines.reduce((s, m) => s + m.stock * m.price, 0);
  const totalSales = dispenses.reduce((s, d) => s + d.amount, 0);
  const totalPurchases = purchases.reduce((s, p) => s + p.amount, 0);
  const profit = totalSales - totalPurchases;
  const distinctItems = new Set(dispenses.map((d) => d.item)).size;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
      <GlassCard><p className="text-2xl font-bold text-white">{medicines.length}</p><p className="text-xs text-slate-400">Medicines in Master</p></GlassCard>
      <GlassCard><p className="text-2xl font-bold text-cyan-300">{totalStock}</p><p className="text-xs text-slate-400">Total Units in Stock</p></GlassCard>
      <GlassCard><p className="text-2xl font-bold text-violet-300">{fmtINR(totalValue)}</p><p className="text-xs text-slate-400">Stock Value</p></GlassCard>
      <GlassCard><p className="text-2xl font-bold text-green-300">{fmtINR(totalSales)}</p><p className="text-xs text-slate-400">Total Sales (all time)</p></GlassCard>
      <GlassCard>
        <p className={cn("text-2xl font-bold", profit >= 0 ? "text-emerald-300" : "text-red-300")}>{fmtINR(profit)}</p>
        <p className="text-xs text-slate-400">Gross Profit (Sales - Purchases)</p>
      </GlassCard>
      <GlassCard><p className="text-2xl font-bold text-amber-300">{distinctItems}</p><p className="text-xs text-slate-400">Unique Items Dispensed</p></GlassCard>
      <GlassCard><p className="text-2xl font-bold text-white">{dispenses.length}</p><p className="text-xs text-slate-400">Total Dispenses</p></GlassCard>
      <GlassCard><p className="text-2xl font-bold text-cyan-300">{purchases.length}</p><p className="text-xs text-slate-400">Purchase Orders</p></GlassCard>
    </div>
  );
}

// Counter Sales
function CounterSales() {
  const { medicines, addBill, addDispense, logAudit, staff } = useStore();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [dStaff, setDStaff] = useState(staff.find((s) => s.role.toLowerCase().includes("pharmac"))?.name ?? staff[0]?.name ?? "");

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return medicines.filter((m) => m.name.toLowerCase().includes(q) || m.generic.toLowerCase().includes(q)).slice(0, 6);
  }, [search, medicines]);

  const addToCart = (m: Medicine) => {
    setCart((c) => { const ex = c.find((x) => x.med.id === m.id); return ex ? c.map((x) => x.med.id === m.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { med: m, qty: 1 }]; });
    setSearch("");
  };

  const cartTotal = cart.reduce((s, x) => s + x.med.price * x.qty, 0);

  const checkout = () => {
    if (!cart.length) return;
    cart.forEach((x) => addDispense({ patientId: "WALK-IN", item: x.med.name, qty: x.qty, amount: x.med.price * x.qty, staffName: dStaff, timestamp: nowTime() }));
    const bill = addBill({
      patientId: "WALK-IN", kind: "OP", service: `Pharmacy counter (${cart.length} items)`, amount: cartTotal,
      staffName: dStaff, timestamp: nowTime(), mode: "UPI", reference: "PHARM-COUNTER",
    });
    logAudit("Counter sale", `${bill.receiptNo} — ${cart.length} item(s) · ${fmtINR(cartTotal)}`, dStaff);
    toast.success(`Checked out — ${bill.receiptNo} · ${fmtINR(cartTotal)}`);
    setCart([]);
  };

  // Stock update helper
  const updateStock = (item: string, delta: number, price?: number) => {
    // handled via addDispense pattern in store
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <SectionTitle title="Counter Sales" subtitle="Search → add to cart → checkout" />
        <Badge tone="cyan" className="!text-[9px]"><ShoppingCart size={10} className="mr-1" /> {cart.length} in cart</Badge>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-slate-500">Staff:</span>
        <select className="input-dark !w-56 !py-1.5" value={dStaff} onChange={(e) => setDStaff(e.target.value)}>
          {staff.map((s) => <option key={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-500" />
          <input className="input-dark !pl-9" placeholder="Search medicine name or generic…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && matches.length) addToCart(matches[0]); }} />
          {matches.length > 0 && (
            <div className="absolute z-20 mt-1 w-full glass p-1.5 space-y-0.5">
              {matches.map((m, i) => (
                <button key={m.id} className={cn("w-full text-left rounded-md px-2.5 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2", i === 0 && "border border-cyan-400/30")}
                  onClick={() => addToCart(m)}>
                  <Pill size={11} className="text-violet-300 shrink-0" />
                  <span className="text-slate-200 flex-1 truncate">{m.name} <span className="text-slate-500">({m.generic})</span></span>
                  <span className="text-[10px] text-slate-500">stock {m.stock} · {m.rack}</span>
                  <span className="text-violet-300 font-semibold">{fmtINR(m.price)}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-600 mt-1.5">{medicines.length} items · batch & stock shown per match</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          {cart.length === 0 ? <p className="text-xs text-slate-500 py-2 text-center">Cart empty</p> : (
            <div className="space-y-1.5">
              {cart.map((x) => (
                <div key={x.med.id} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-200 flex-1 truncate">{x.med.name}</span>
                  <div className="flex items-center gap-1">
                    <button className="btn-ghost !p-1 !text-[10px]" onClick={() => setCart((c) => c.map((y) => y.med.id === x.med.id ? { ...y, qty: Math.max(1, y.qty - 1) } : y))}>−</button>
                    <span className="w-6 text-center text-white font-semibold">{x.qty}</span>
                    <button className="btn-ghost !p-1 !text-[10px]" onClick={() => setCart((c) => c.map((y) => y.med.id === x.med.id ? { ...y, qty: y.qty + 1 } : y))}>+</button>
                  </div>
                  <span className="text-violet-300 font-semibold w-16 text-right">{fmtINR(x.med.price * x.qty)}</span>
                  <button className="text-slate-500 hover:text-red-300" onClick={() => setCart((c) => c.filter((y) => y.med.id !== x.med.id))}><Trash2 size={12} /></button>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-white/10 pt-2 mt-1">
                <span className="text-xs text-slate-400">Total</span>
                <span className="text-base font-bold text-white">{fmtINR(cartTotal)}</span>
              </div>
              <button className="btn-neon w-full !text-xs" onClick={checkout}><CheckCircle2 size={13} /> Checkout — {cart.length} item(s)</button>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

// Dispensing Queue from doctor orders
function DispensingQueue() {
  const { orders, setOrders, addIssue, staff, addBill, addDispense, logAudit, medicines } = useStore();
  const now = useNow();
  useOrderEscalation(orders, setOrders, addIssue, "Pharmacy");
  const [dispensing, setDispensing] = useState<HospitalOrder | null>(null);
  const [dItem, setDItem] = useState("");
  const [dQty, setDQty] = useState("1");
  const [dPrice, setDPrice] = useState("");
  const [dStaff, setDStaff] = useState(staff.find((s) => s.role.toLowerCase().includes("pharmac"))?.name ?? staff[0]?.name ?? "");

  const queue = orders
    .filter((o) => (o.targetDept ?? "Ward") === "Pharmacy")
    .sort((a, b) => Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt) || b.createdTs - a.createdTs);

  const openDispense = (o: HospitalOrder) => {
    setDispensing(o);
    setDItem(o.drug ?? "");
    setDQty(String(o.qty ?? 1));
    const master = medicines.find((m) => o.drug && m.name.toLowerCase().includes(o.drug.toLowerCase().split(" ")[0]));
    setDPrice(String(o.unitPrice ?? master?.price ?? ""));
  };

  const confirmDispense = () => {
    if (!dispensing || !dItem.trim()) return;
    const q = Math.max(1, Number(dQty) || 1);
    const price = Number(dPrice) || 0;
    const amount = q * price;
    addDispense({ orderId: dispensing.id, patientId: dispensing.patientId, item: dItem.trim(), qty: q, amount, staffName: dStaff, timestamp: nowTime() });
    const bill = addBill({
      patientId: dispensing.patientId, kind: "OP", service: `Pharmacy — ${dItem.trim()} ×${q}`, amount,
      staffName: dStaff, timestamp: nowTime(), mode: "UPI", reference: "PHARM-DISPENSE",
    });
    setOrders(orders.map((x) => x.id === dispensing.id ? { ...x, acknowledgedBy: dStaff, acknowledgedAt: nowTime(), proofNote: `Dispensed ${q} × ${dItem.trim()} (${bill.receiptNo})`, proofPhoto: false, proofVoice: false } : x));
    logAudit("Dispense", `${dispensing.patientId} — ${q} × ${dItem.trim()} · ${fmtINR(amount)} · ${bill.receiptNo}`, dStaff);
    toast.success(`Dispensed · ${bill.receiptNo} · ${fmtINR(amount)}`);
    setDispensing(null);
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <SectionTitle title="Dispensing Queue" subtitle="Doctor orders → dispense → auto-bill" />
        <Badge tone="amber" className="!text-[9px]"><Pill size={10} className="mr-1" /> {queue.filter((o) => !o.acknowledgedAt).length} pending</Badge>
      </div>
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-slate-500">Dispensing as:</span>
        <select className="input-dark !w-56 !py-1.5" value={dStaff} onChange={(e) => setDStaff(e.target.value)}>
          {staff.map((s) => <option key={s.id}>{s.name}</option>)}
        </select>
      </div>
      {queue.length === 0 && <p className="text-xs text-slate-500">No pharmacy orders yet.</p>}
      <div className="space-y-2">{queue.map((o) => <OrderQueueRow key={o.id} o={o} now={now} actionLabel="Dispense" onAction={openDispense} />)}</div>

      <Modal open={!!dispensing} onClose={() => setDispensing(null)} title={`Dispense — ${dispensing?.patientId ?? ""}`} wide>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Order: <span className="text-slate-200">{dispensing?.orderText}</span></p>
          <div className="grid grid-cols-2 gap-3">
            <input className="input-dark col-span-2" placeholder="Item *" value={dItem} onChange={(e) => setDItem(e.target.value)} />
            <input className="input-dark" placeholder="Qty" value={dQty} onChange={(e) => setDQty(e.target.value.replace(/\D/g, ""))} />
            <input className="input-dark" placeholder="Unit price ₹" value={dPrice} onChange={(e) => setDPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
            <span className="text-slate-400">Total</span>
            <span className="text-violet-300 font-bold">{fmtINR((Number(dQty) || 0) * (Number(dPrice) || 0))}</span>
          </div>
          <button className="btn-neon w-full" disabled={!dItem.trim() || !(Number(dQty) > 0)} onClick={confirmDispense}>
            <Pill size={14} /> Dispense & post bill
          </button>
        </div>
      </Modal>
    </GlassCard>
  );
}

// Stock Ledger
function StockLedger() {
  const { medicines } = useStore();
  const [search, setSearch] = useState("");
  const filtered = search.trim() ? medicines.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.generic.toLowerCase().includes(search.toLowerCase())) : medicines;

  return (
    <GlassCard>
      <SectionTitle title="Stock Ledger" subtitle={`${medicines.length} items · real-time stock`} />
      <input className="input-dark mb-3" placeholder="Search medicine…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500 border-b border-white/10">
            <th className="pb-2 pr-2">Item</th><th className="pb-2 pr-2">Generic</th><th className="pb-2 pr-2">Batch</th>
            <th className="pb-2 pr-2 text-right">Stock</th><th className="pb-2 pr-2 text-right">Price</th><th className="pb-2 pr-2">Rack</th>
            <th className="pb-2">Status</th>
          </tr></thead>
          <tbody>
            {filtered.map((m) => {
              const low = m.stock <= 10;
              return (<tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="py-2 pr-2 text-slate-200">{m.name}</td>
                <td className="py-2 pr-2 text-slate-500">{m.generic}</td>
                <td className="py-2 pr-2 text-slate-400 font-mono text-[10px]">{m.batch}</td>
                <td className={cn("py-2 pr-2 text-right font-semibold", low ? "text-red-300" : "text-emerald-300")}>{m.stock}</td>
                <td className="py-2 pr-2 text-right text-violet-300">{fmtINR(m.price)}</td>
                <td className="py-2 pr-2 text-slate-500 text-[10px]">{m.rack}</td>
                <td className="py-2">{low ? <Badge tone="red" className="!text-[9px]">Low stock</Badge> : <Badge tone="green" className="!text-[9px]">OK</Badge>}</td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// Purchase Register with scan
function PurchaseRegister() {
  const { medicines, addPurchases, addApproval, addSendLog, logAudit } = useStore();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [scanFile, setScanFile] = useState<string | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<PurchaseDraft[] | null>(null);
  const [dStaff] = useState("Sana Iqbal");

  const acceptFile = async (f: File) => {
    if (!/^image\//i.test(f.type) && !/pdf$/i.test(f.type)) { toast.error("Unsupported file"); return; }
    if (scanPreview) URL.revokeObjectURL(scanPreview);
    setScanFile(f.name);
    setScanPreview(/^image\//i.test(f.type) ? URL.createObjectURL(f) : null);
    setDraft(null); setScanning(true);
    await sleep(SCAN_MS);
    setDraft([
      { supplier: "MedPlus Distributors", invoiceNo: "INV-88214", item: "Ceftriaxone 1g Inj", qty: "50", amount: "6100" },
      { supplier: "MedPlus Distributors", invoiceNo: "INV-88214", item: "Paracetamol 650mg Tab", qty: "400", amount: "800" },
    ]);
    setScanning(false);
    toast.success("Purchase bill scanned");
  };

  const updDraft = (i: number, k: keyof PurchaseDraft, v: string) => setDraft((d) => (d ? d.map((r, j) => (j === i ? { ...r, [k]: v } : r)) : d));
  const clearScan = () => { setScanFile(null); setDraft(null); if (scanPreview) URL.revokeObjectURL(scanPreview); setScanPreview(null); };

  const postPurchases = () => {
    if (!draft?.length) return;
    const rows = draft.map((r) => ({ supplier: r.supplier.trim() || "Unknown", invoiceNo: r.invoiceNo.trim() || "—", item: r.item.trim(), qty: Number(r.qty) || 0, amount: Number(r.amount) || 0 }));
    const total = rows.reduce((s, r) => s + r.amount, 0);
    if (total > APPROVAL_THRESHOLD) {
      addApproval({ kind: "purchase", title: `Purchase — ${rows[0].supplier} (${fmtINR(total)})`, detail: `${rows.length} line(s). Needs approval.`, amount: total, requestedBy: dStaff, requestedByRole: "pharmacy", payload: JSON.stringify({ rows }) });
      toast.info(`High-value purchase sent for approval (${fmtINR(total)})`);
      clearScan(); return;
    }
    addPurchases(rows);
    addSendLog({ provider: "WhatsApp", template: "purchase_posted", recipient: dStaff, status: "sent" });
    logAudit("Purchase register", `${rows.length} line(s) · ${fmtINR(total)}`, dStaff);
    toast.success(`${rows.length} purchase line(s) posted · ${fmtINR(total)}`);
    clearScan();
  };

  return (
    <GlassCard>
      <SectionTitle title="Purchase Register" subtitle={`Scan bill → extract → post · above ${fmtINR(APPROVAL_THRESHOLD)} needs approval`} />
      {!scanFile ? (
        <button type="button" className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/15 bg-white/[0.02] hover:border-cyan-400/40 transition-colors"
          onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void acceptFile(f); }}>
          <UploadCloud size={30} className="text-slate-500" />
          <p className="text-xs text-slate-400">Drop purchase bill here, or click to browse</p>
        </button>
      ) : (
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <div className="relative flex h-32 items-center justify-center bg-black/40">
            {scanPreview ? <img src={scanPreview} alt="Bill" className="max-h-32 object-contain" /> : <div className="flex items-center gap-2 text-slate-400"><FileText size={26} /><span className="text-xs">{scanFile}</span></div>}
            {scanning && <div className="scanline" />}
            <button className="absolute right-2 top-2 rounded-md border border-white/15 bg-black/70 p-1 text-slate-400 hover:text-white" onClick={clearScan}><X size={13} /></button>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void acceptFile(f); e.target.value = ""; }} />
      {draft && (
        <div className="mt-3 space-y-2">
          {draft.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-1.5">
              <input className="input-dark col-span-4 !py-1 !text-[11px]" value={r.item} onChange={(e) => updDraft(i, "item", e.target.value)} />
              <input className="input-dark col-span-3 !py-1 !text-[11px]" value={r.supplier} onChange={(e) => updDraft(i, "supplier", e.target.value)} />
              <input className="input-dark col-span-2 !py-1 !text-[11px]" value={r.invoiceNo} onChange={(e) => updDraft(i, "invoiceNo", e.target.value)} />
              <input className="input-dark col-span-1 !py-1 !text-[11px]" value={r.qty} onChange={(e) => updDraft(i, "qty", e.target.value.replace(/\D/g, ""))} />
              <input className="input-dark col-span-2 !py-1 !text-[11px]" value={r.amount} onChange={(e) => updDraft(i, "amount", e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
          ))}
          <button className="btn-neon w-full !text-xs" onClick={postPurchases}><CheckCircle2 size={13} /> Post to register ({draft.length} lines)</button>
        </div>
      )}
    </GlassCard>
  );
}

// Medicine Master
function MedicineMaster() {
  const { medicines, setMedicines } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [generic, setGeneric] = useState(""); const [price, setPrice] = useState(""); const [stock, setStock] = useState(""); const [batch, setBatch] = useState(""); const [rack, setRack] = useState("");

  const addMedicine = () => {
    if (!name.trim()) return;
    setMedicines([...medicines, { id: uid("med"), name: name.trim(), generic: generic.trim() || name.trim().split(" ")[0], batch: batch || `B${2500 + medicines.length}`, stock: Number(stock) || 0, price: Number(price) || 0, rack: rack || `R${(medicines.length % 3) + 1}-S${(medicines.length % 4) + 1}` }]);
    toast.success(`${name.trim()} added to medicine master`);
    setOpen(false); setName(""); setGeneric(""); setPrice(""); setStock(""); setBatch(""); setRack("");
  };

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <SectionTitle title="Medicine Master" subtitle={`${medicines.length} items — add, edit, manage`} />
        <button className="btn-neon !text-xs !py-1.5" onClick={() => setOpen(true)}><Plus size={13} /> Add Medicine</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500 border-b border-white/10">
            <th className="pb-2 pr-2">Name</th><th className="pb-2 pr-2">Generic</th><th className="pb-2 pr-2">Batch</th>
            <th className="pb-2 pr-2 text-right">Stock</th><th className="pb-2 pr-2 text-right">Price</th><th className="pb-2 pr-2">Rack</th>
          </tr></thead>
          <tbody>
            {medicines.map((m) => (
              <tr key={m.id} className="border-b border-white/5">
                <td className="py-2 pr-2 text-slate-200">{m.name}</td>
                <td className="py-2 pr-2 text-slate-500">{m.generic}</td>
                <td className="py-2 pr-2 text-slate-400 font-mono text-[10px]">{m.batch}</td>
                <td className="py-2 pr-2 text-right text-white">{m.stock}</td>
                <td className="py-2 pr-2 text-right text-violet-300">{fmtINR(m.price)}</td>
                <td className="py-2 pr-2 text-slate-500 text-[10px]">{m.rack}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Medicine">
        <div className="space-y-2">
          <input className="input-dark" placeholder="Medicine name *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input-dark" placeholder="Generic name" value={generic} onChange={(e) => setGeneric(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input-dark" placeholder="Price ₹" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            <input className="input-dark" placeholder="Opening stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-dark" placeholder="Batch no." value={batch} onChange={(e) => setBatch(e.target.value)} />
            <input className="input-dark" placeholder="Rack (e.g. R1-S2)" value={rack} onChange={(e) => setRack(e.target.value)} />
          </div>
          <button className="btn-neon w-full" disabled={!name.trim()} onClick={addMedicine}>Add to Master</button>
        </div>
      </Modal>
    </GlassCard>
  );
}

// Expiry Tracking
function ExpiryTracking() {
  const { medicines } = useStore();
  return (
    <GlassCard>
      <SectionTitle title="Expiry Tracking" subtitle="Monitor batch expiry dates" />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500 border-b border-white/10">
            <th className="pb-2 pr-2">Item</th><th className="pb-2 pr-2">Batch</th><th className="pb-2 pr-2">Stock</th><th className="pb-2">Status</th>
          </tr></thead>
          <tbody>
            {medicines.map((m) => {
              const yrMatch = m.batch?.match(/\b(202[4-9]|2030)\b/);
              const yr = yrMatch ? parseInt(yrMatch[0]) : 2027;
              const now = new Date().getFullYear();
              const status = yr < now ? "expired" : yr === now ? "expiring" : yr <= now + 1 ? "near" : "ok";
              return (<tr key={m.id} className="border-b border-white/5">
                <td className="py-2 pr-2 text-slate-200">{m.name}</td>
                <td className="py-2 pr-2 text-slate-400 font-mono text-[10px]">{m.batch}</td>
                <td className="py-2 pr-2 text-white">{m.stock}</td>
                <td className="py-2">{status === "expired" ? <Badge tone="red">EXPIRED</Badge> : status === "expiring" ? <Badge tone="amber">Expiring {yr}</Badge> : status === "near" ? <Badge tone="amber">Near {yr}</Badge> : <Badge tone="green">OK</Badge>}</td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// Supplier Management
function SupplierManagement() {
  const [suppliers] = useState([
    { name: "MedPlus Distributors", contact: "Suresh", phone: "9876543210", items: 45, lastDelivery: "2026-07-20" },
    { name: "Apollo Pharmacy Wholesale", contact: "Rajesh", phone: "9876543211", items: 120, lastDelivery: "2026-07-18" },
    { name: "Vijay Medical Store", contact: "Vijay", phone: "9876543212", items: 30, lastDelivery: "2026-07-15" },
    { name: "PharmaCorp India", contact: "Amit", phone: "9876543213", items: 80, lastDelivery: "2026-07-10" },
  ]);

  return (
    <GlassCard>
      <SectionTitle title="Supplier Management" subtitle={`${suppliers.length} registered suppliers`} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500 border-b border-white/10">
            <th className="pb-2 pr-2">Supplier</th><th className="pb-2 pr-2">Contact</th><th className="pb-2 pr-2">Phone</th>
            <th className="pb-2 pr-2 text-right">Items</th><th className="pb-2">Last Delivery</th>
          </tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.name} className="border-b border-white/5">
                <td className="py-2 pr-2 text-slate-200 font-semibold">{s.name}</td>
                <td className="py-2 pr-2 text-slate-400">{s.contact}</td>
                <td className="py-2 pr-2 text-slate-300">{s.phone}</td>
                <td className="py-2 pr-2 text-right text-white">{s.items}</td>
                <td className="py-2 text-slate-500">{s.lastDelivery}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// AI Rack Suggestion
function AIRackSuggestion() {
  const rackInputRef = useRef<HTMLInputElement | null>(null);
  const [rackScanning, setRackScanning] = useState(false);
  const [rackPlan, setRackPlan] = useState<string | null>(null);

  const runRackAnalysis = async (f: File) => {
    if (!/^image\//i.test(f.type)) { toast.error("Upload a pharmacy rack photo"); return; }
    setRackScanning(true); setRackPlan(null);
    await sleep(SCAN_MS);
    setRackPlan(f.name); setRackScanning(false);
    toast.success("Rack analysis complete");
  };

  const rackGrid = [
    { rack: "Rack 1 — Fast movers (counter-front)", items: ["Paracetamol 650mg Tab", "ORS Sachet", "Azithromycin 500mg Tab", "Antacid Gel 200ml"] },
    { rack: "Rack 2 — Alphabetical general", items: ["Amoxicillin 500mg Cap", "Cetirizine 10mg", "Ceftriaxone 1g Inj", "Vitamin D3 sachet"] },
    { rack: "Rack 3 — Schedule H (locked)", items: ["Tramadol 50mg", "Alprazolam 0.25mg"] },
  ];

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <SectionTitle title="AI Rack Suggestion" subtitle="Upload photo → placement plan" />
        <button className="btn-ghost !text-xs !py-1.5" disabled={rackScanning} onClick={() => rackInputRef.current?.click()}>
          {rackScanning ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />} Upload photo
        </button>
        <input ref={rackInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void runRackAnalysis(f); e.target.value = ""; }} />
      </div>
      {rackScanning && <div className="relative h-24 rounded-lg border border-white/10 bg-black/40 flex items-center justify-center"><p className="text-xs text-cyan-300"><Loader2 size={13} className="animate-spin mr-2" /> Analyzing…</p><div className="scanline" /></div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {rackGrid.map((r) => (
          <div key={r.rack} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] font-semibold text-cyan-300 mb-2">{r.rack}</p>
            {r.items.map((it) => (
              <div key={it} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-slate-200 flex items-center gap-1.5 mb-1">
                <Pill size={10} className="text-violet-300 shrink-0" /> {it}
              </div>
            ))}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// Pharmacy Reports
function PharmacyReports() {
  const { dispenses, purchases, medicines } = useStore();
  const totalSales = dispenses.reduce((s, d) => s + d.amount, 0);
  const totalPurchases = purchases.reduce((s, p) => s + p.amount, 0);
  const profit = totalSales - totalPurchases;

  const topItems = useMemo(() => {
    const map = new Map<string, number>();
    dispenses.forEach((d) => map.set(d.item, (map.get(d.item) || 0) + d.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [dispenses]);

  return (
    <div className="space-y-4">
      <GlassCard>
        <SectionTitle title="Pharmacy Profit Analysis (CEO View)" subtitle="Sales vs Purchases summary" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><p className="text-xl font-bold text-white">{fmtINR(totalSales)}</p><p className="text-xs text-slate-400">Total Sales (all time)</p></div>
          <div><p className="text-xl font-bold text-amber-300">{fmtINR(totalPurchases)}</p><p className="text-xs text-slate-400">Total Purchases</p></div>
          <div><p className={cn("text-xl font-bold", profit >= 0 ? "text-emerald-300" : "text-red-300")}>{fmtINR(profit)}</p><p className="text-xs text-slate-400">Gross Profit</p></div>
          <div><p className="text-xl font-bold text-cyan-300">{medicines.length}</p><p className="text-xs text-slate-400">Medicines Managed</p></div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionTitle title="Top Selling Items (by revenue)" subtitle="For procurement planning" />
        <div className="space-y-1">
          {topItems.map(([item, amount], i) => (
            <div key={item} className="flex items-center gap-2 text-xs rounded border border-white/5 bg-white/[0.02] px-3 py-2">
              <span className="text-slate-500 w-4">{i + 1}.</span>
              <span className="text-slate-200 flex-1">{item}</span>
              <span className="text-violet-300 font-semibold">{fmtINR(amount)}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Stock valuation */}
      <GlassCard>
        <SectionTitle title="Stock Valuation" subtitle="Current stock value at selling price" />
        <div className="space-y-1">
          {medicines.filter((m) => m.stock > 0).sort((a, b) => (b.stock * b.price) - (a.stock * a.price)).slice(0, 15).map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-xs rounded border border-white/5 bg-white/[0.02] px-3 py-1.5">
              <span className="text-slate-200 flex-1">{m.name}</span>
              <span className="text-slate-500">{m.stock} × {fmtINR(m.price)}</span>
              <span className="text-violet-300 font-semibold w-20 text-right">{fmtINR(m.stock * m.price)}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
