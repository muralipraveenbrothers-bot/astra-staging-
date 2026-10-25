// Pharmacy module — dispensing queue fed by doctor orders, counter-sales
// search + cart over the medicine master, purchase register with scan-and-post
// (high-value posts route to the approvals inbox), stock ledger, and the
// AI rack-suggestion planner (simulated vision with a FreeLLMAPI plug-in point).

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  MessageCircle,
  Pill,
  ScanLine,
  Search,
  ShoppingCart,
  Snowflake,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { initialPharmacyStock } from "@/lib/mock";
import { cn, fmtINR, nowTime, sleep, uid } from "@/lib/utils";
import { OrderQueueRow, useNow, useOrderEscalation } from "./deptOrders";
import type { HospitalOrder, Medicine } from "@/lib/types";

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

export function Pharmacy() {
  const {
    orders, setOrders, addIssue, staff, addBill, addDispense, dispenses,
    purchases, addPurchases, addSendLog, logAudit, addApproval, medicines, setMedicines,
  } = useStore();
  const { account } = useAuth();
  const now = useNow();
  useOrderEscalation(orders, setOrders, addIssue, "Pharmacy");

  const effective = orders;
  const queue = effective
    .filter((o) => (o.targetDept ?? "Ward") === "Pharmacy")
    .sort((a, b) => Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt) || b.createdTs - a.createdTs);

  /* ---------------- medicine master helpers ---------------- */
  const bumpMaster = (item: string, delta: number, price?: number) => {
    const idx = medicines.findIndex((m) => m.name.toLowerCase() === item.toLowerCase());
    if (idx >= 0) {
      setMedicines(medicines.map((m, i) => (i === idx ? { ...m, stock: Math.max(0, m.stock + delta), price: price ?? m.price } : m)));
    } else if (delta > 0) {
      const rack = `R${(medicines.length % 3) + 1}-S${(medicines.length % 4) + 1}`;
      setMedicines([...medicines, { id: uid("med"), name: item, generic: item.split(" ")[0], batch: `B${2500 + medicines.length}`, stock: delta, price: price ?? 0, rack }]);
    }
  };

  /* ---------------- dispensing queue ---------------- */
  const [dispensing, setDispensing] = useState<HospitalOrder | null>(null);
  const [dItem, setDItem] = useState("");
  const [dQty, setDQty] = useState("1");
  const [dPrice, setDPrice] = useState("");
  const [dStaff, setDStaff] = useState(staff.find((s) => s.role.toLowerCase().includes("pharmac"))?.name ?? staff[0]?.name ?? "");

  const openDispense = (o: HospitalOrder) => {
    setDispensing(o);
    setDItem(o.drug ?? "");
    setDQty(String(o.qty ?? 1));
    const seed = initialPharmacyStock.find((s) => o.drug && s.item.toLowerCase().includes(o.drug.toLowerCase().split(" ")[0]));
    const master = medicines.find((m) => o.drug && m.name.toLowerCase().includes(o.drug.toLowerCase().split(" ")[0]));
    setDPrice(String(o.unitPrice ?? master?.price ?? seed?.unitPrice ?? ""));
  };

  const confirmDispense = () => {
    if (!dispensing || !dItem.trim()) return;
    const q = Math.max(1, Number(dQty) || 1);
    const price = Number(dPrice) || 0;
    const amount = q * price;
    addDispense({ orderId: dispensing.id, patientId: dispensing.patientId, item: dItem.trim(), qty: q, amount, staffName: dStaff, timestamp: nowTime() });
    bumpMaster(dItem.trim(), -q, price || undefined);
    const bill = addBill({
      patientId: dispensing.patientId,
      kind: "OP",
      service: `Pharmacy — ${dItem.trim()} ×${q}`,
      amount,
      staffName: dStaff,
      timestamp: nowTime(),
      mode: "UPI",
      reference: "PHARM-COUNTER",
    });
    const at = nowTime();
    setOrders(
      orders.map((x) =>
        x.id === dispensing.id
          ? { ...x, acknowledgedBy: dStaff, acknowledgedAt: at, proofNote: `Dispensed ${q} × ${dItem.trim()} (${bill.receiptNo})`, proofPhoto: false, proofVoice: false }
          : x
      )
    );
    logAudit("Pharmacy dispense", `${dispensing.patientId} — ${q} × ${dItem.trim()} · ${fmtINR(amount)} · ${bill.receiptNo}`, dStaff);
    toast.success("Dispensed + billed", { description: `${bill.receiptNo} · ${fmtINR(amount)} appended to the billing ledger (sequential receipt).` });
    setDispensing(null);
  };

  /* ---------------- counter sales (search + cart) ---------------- */
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return medicines
      .filter((m) => m.name.toLowerCase().includes(q) || m.generic.toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, medicines]);

  const addToCart = (m: Medicine) => {
    setCart((c) => {
      const ex = c.find((x) => x.med.id === m.id);
      if (ex) return c.map((x) => (x.med.id === m.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { med: m, qty: 1 }];
    });
    setSearch("");
  };

  const cartTotal = cart.reduce((s, x) => s + x.med.price * x.qty, 0);

  const checkout = () => {
    if (!cart.length) return;
    cart.forEach((x) => {
      addDispense({ patientId: "WALK-IN", item: x.med.name, qty: x.qty, amount: x.med.price * x.qty, staffName: dStaff, timestamp: nowTime() });
      bumpMaster(x.med.name, -x.qty);
    });
    const bill = addBill({
      patientId: "WALK-IN",
      kind: "OP",
      service: `Pharmacy — counter sale (${cart.length} item${cart.length > 1 ? "s" : ""})`,
      amount: cartTotal,
      staffName: dStaff,
      timestamp: nowTime(),
      mode: "UPI",
      reference: "PHARM-COUNTER",
    });
    logAudit("Counter sale", `${bill.receiptNo} — ${cart.length} item(s) · ${fmtINR(cartTotal)}`, dStaff);
    toast.success("Sale checked out", { description: `${bill.receiptNo} · ${fmtINR(cartTotal)} · stock + ledger updated.` });
    setCart([]);
  };

  /* ---------------- purchase register scan ---------------- */
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [scanFile, setScanFile] = useState<string | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<PurchaseDraft[] | null>(null);

  const acceptFile = async (f: File) => {
    const ok = /^image\//i.test(f.type) || /pdf$/i.test(f.type) || /\.(png|jpe?g|webp|gif|pdf)$/i.test(f.name);
    if (!ok) {
      toast.error("Unsupported file — drop an image or PDF");
      return;
    }
    if (scanPreview) URL.revokeObjectURL(scanPreview);
    setScanFile(f.name);
    setScanPreview(/^image\//i.test(f.type) ? URL.createObjectURL(f) : null);
    setDraft(null);
    setScanning(true);
    await sleep(SCAN_MS);
    // Simulated supplier-bill extraction — clearly labeled placeholder values.
    setDraft([
      { supplier: "MedPlus Distributors", invoiceNo: "INV-88214", item: "Ceftriaxone 1g Inj", qty: "50", amount: "6100" },
      { supplier: "MedPlus Distributors", invoiceNo: "INV-88214", item: "Paracetamol 650mg Tab", qty: "400", amount: "800" },
      { supplier: "MedPlus Distributors", invoiceNo: "INV-88214", item: "Insulin Glargine 10ml", qty: "10", amount: "5900" },
    ]);
    setScanning(false);
    toast.success("Purchase bill scanned — review the extracted rows");
  };

  const updDraft = (i: number, k: keyof PurchaseDraft, v: string) =>
    setDraft((d) => (d ? d.map((r, j) => (j === i ? { ...r, [k]: v } : r)) : d));

  const clearScan = () => {
    setScanFile(null);
    setDraft(null);
    if (scanPreview) URL.revokeObjectURL(scanPreview);
    setScanPreview(null);
  };

  const postPurchases = () => {
    if (!draft || !draft.length) return;
    const rows = draft.map((r) => ({
      supplier: r.supplier.trim() || "Unknown supplier",
      invoiceNo: r.invoiceNo.trim() || "—",
      item: r.item.trim(),
      qty: Number(r.qty) || 0,
      amount: Number(r.amount) || 0,
    }));
    const total = rows.reduce((s, r) => s + r.amount, 0);

    // high-value purchases require Doctor/CEO approval before posting
    if (total > APPROVAL_THRESHOLD) {
      addApproval({
        kind: "purchase",
        title: `Purchase posting — ${rows[0].supplier} ${rows[0].invoiceNo} (${fmtINR(total)})`,
        detail: `${rows.length} line(s): ${rows.map((r) => `${r.item} ×${r.qty}`).join(", ")}. Exceeds the ${fmtINR(APPROVAL_THRESHOLD)} auto-post limit — posts to the register only on approval.`,
        amount: total,
        requestedBy: account?.name ?? dStaff,
        requestedByRole: account?.role ?? "pharmacy",
        payload: JSON.stringify({ rows }),
      });
      toast.info("High-value purchase sent for approval", { description: `${fmtINR(total)} → Doctor/CEO bell · Approvals. Register updates on approval.` });
      clearScan();
      return;
    }

    addPurchases(rows);
    const newItems = rows.filter((r) => !medicines.some((m) => m.name.toLowerCase() === r.item.toLowerCase()));
    rows.forEach((r) => bumpMaster(r.item, r.qty, r.qty > 0 ? Math.round(r.amount / r.qty) : undefined));
    addSendLog({ provider: "WhatsApp", template: "purchase_posted", recipient: "Sana Iqbal (Chief Pharmacist)", status: "sent" });
    logAudit("Purchase register", `${rows.length} line(s) posted · ${fmtINR(total)}`, dStaff);
    toast.success("Auto-update complete", {
      description: `✓ ${rows.length} purchase line(s) posted (${fmtINR(total)}) · ✓ stock ledger updated · ✓ medicine master ${newItems.length ? `+${newItems.length} new item(s)` : "refreshed"} · ✓ WhatsApp notify logged.`,
    });
    clearScan();
  };

  /* ---------------- stock ledger ---------------- */
  const stockRows = useMemo(() => {
    const names = new Set<string>(initialPharmacyStock.map((s) => s.item));
    purchases.forEach((p) => names.add(p.item));
    dispenses.forEach((d) => names.add(d.item));
    return [...names].map((item) => {
      const seed = initialPharmacyStock.find((s) => s.item === item);
      const opening = seed?.opening ?? 0;
      const purchased = purchases.filter((p) => p.item === item).reduce((s, p) => s + p.qty, 0);
      const sold = dispenses.filter((d) => d.item === item).reduce((s, d) => s + d.qty, 0);
      const closing = opening + purchased - sold;
      return { item, opening, purchased, sold, closing, reorderLevel: seed?.reorderLevel ?? 10, seeded: !!seed };
    });
  }, [purchases, dispenses]);

  const lowStock = stockRows.filter((r) => r.closing <= r.reorderLevel && r.closing >= 0);
  const negative = stockRows.filter((r) => r.closing < 0);

  const sendLowStockAlert = () => {
    addSendLog({ provider: "WhatsApp", template: "low_stock_alert", recipient: "Sana Iqbal (Chief Pharmacist)", status: "sent" });
    toast.success("Low-stock WhatsApp alert logged", { description: `${lowStock.length + negative.length} item(s) flagged → notification send-log.` });
  };

  /* ---------------- AI rack suggestion ---------------- */
  const rackInputRef = useRef<HTMLInputElement | null>(null);
  const [rackScanning, setRackScanning] = useState(false);
  const [rackPlan, setRackPlan] = useState<string | null>(null);

  const runRackAnalysis = async (f: File) => {
    const ok = /^image\//i.test(f.type);
    if (!ok) {
      toast.error("Upload a pharmacy rack photo (image)");
      return;
    }
    setRackScanning(true);
    setRackPlan(null);
    await sleep(SCAN_MS);
    // Simulated vision analysis — a FreeLLMAPI image call plugs in here
    // (same pattern as OPScan's commented callAIExtraction stub).
    setRackPlan(f.name);
    setRackScanning(false);
    toast.success("Rack analysis complete — placement plan ready");
  };

  const rackGrid = [
    { rack: "Rack 1 — Counter-front (fast movers)", items: ["Paracetamol 650mg Tab", "ORS Sachet", "Azithromycin 500mg Tab", "Antacid Gel 200ml"] },
    { rack: "Rack 2 — Alphabetical general", items: ["Amoxicillin 500mg Cap", "Cetirizine 10mg", "Ceftriaxone 1g Inj", "Vitamin D3 sachet"] },
    { rack: "Rack 3 — Schedule H (locked, separate register)", items: ["Tramadol 50mg", "Alprazolam 0.25mg"] },
  ];

  return (
    <div className="space-y-4">
      {/* ---------------- counter sales ---------------- */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <SectionTitle title="Counter Sales" subtitle="Keyboard-first — type, Enter to add, checkout posts one receipt" />
          <Badge tone="cyan" className="!text-[9px]"><ShoppingCart size={10} className="mr-1" /> {cart.length} in cart</Badge>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input-dark !pl-9"
              placeholder="Search medicine name or generic… (Enter adds first match)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches.length) addToCart(matches[0]);
              }}
            />
            {matches.length > 0 && (
              <div className="absolute z-20 mt-1 w-full glass p-1.5 space-y-0.5">
                {matches.map((m, i) => (
                  <button
                    key={m.id}
                    className={cn("w-full text-left rounded-md px-2.5 py-1.5 text-xs hover:bg-white/5 flex items-center gap-2", i === 0 && "border border-cyan-400/30")}
                    onClick={() => addToCart(m)}
                  >
                    <Pill size={11} className="text-violet-300 shrink-0" />
                    <span className="text-slate-200 flex-1 truncate">{m.name} <span className="text-slate-500">({m.generic})</span></span>
                    <span className="text-[10px] text-slate-500 shrink-0">{m.batch} · stock {m.stock} · {m.rack}</span>
                    <span className="text-violet-300 font-semibold shrink-0">{fmtINR(m.price)}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-600 mt-1.5">{medicines.length} items in the medicine master · batch, live stock, rack shown per match</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
            {cart.length === 0 ? (
              <p className="text-xs text-slate-500 py-2 text-center">Cart empty — search above to add items.</p>
            ) : (
              <div className="space-y-1.5">
                {cart.map((x) => (
                  <div key={x.med.id} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-200 flex-1 truncate">{x.med.name}</span>
                    <div className="flex items-center gap-1">
                      <button className="btn-ghost !p-1 !text-[10px]" onClick={() => setCart((c) => c.map((y) => (y.med.id === x.med.id ? { ...y, qty: Math.max(1, y.qty - 1) } : y)))}>−</button>
                      <span className="w-6 text-center text-white font-semibold">{x.qty}</span>
                      <button className="btn-ghost !p-1 !text-[10px]" onClick={() => setCart((c) => c.map((y) => (y.med.id === x.med.id ? { ...y, qty: y.qty + 1 } : y)))}>+</button>
                    </div>
                    <span className="text-violet-300 font-semibold w-16 text-right">{fmtINR(x.med.price * x.qty)}</span>
                    <button className="text-slate-500 hover:text-red-300" onClick={() => setCart((c) => c.filter((y) => y.med.id !== x.med.id))}><Trash2 size={12} /></button>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-white/10 pt-2 mt-1">
                  <span className="text-xs text-slate-400">Total</span>
                  <span className="text-base font-bold text-white">{fmtINR(cartTotal)}</span>
                </div>
                <button className="btn-neon w-full !text-xs" onClick={checkout}>
                  <CheckCircle2 size={13} /> Checkout — post receipt & update stock
                </button>
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ---------------- dispensing queue ---------------- */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SectionTitle title="Dispensing Queue" subtitle="Doctor medication orders route here instantly — dispense posts a bill line" />
          <Badge tone="amber" className="!text-[9px]">
            <Pill size={10} className="mr-1" /> {queue.filter((o) => !o.acknowledgedAt).length} pending
          </Badge>
        </div>
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-slate-500">Dispensing as:</span>
          <select className="input-dark !w-56 !py-1.5" value={dStaff} onChange={(e) => setDStaff(e.target.value)}>
            {staff.map((s) => <option key={s.id}>{s.name}</option>)}
          </select>
        </div>
        {queue.length === 0 && (
          <p className="text-xs text-slate-500">No pharmacy orders yet — route one from Orders (IP) with target department = Pharmacy.</p>
        )}
        <div className="space-y-2.5">
          {queue.map((o) => (
            <OrderQueueRow key={o.id} o={o} now={now} actionLabel="Dispense" onAction={openDispense} />
          ))}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ---------------- purchase register ---------------- */}
        <GlassCard>
          <SectionTitle title="Purchase Register" subtitle={`Scan → extract → post · above ${fmtINR(APPROVAL_THRESHOLD)} needs approval`} />
          {!scanFile ? (
            <button
              type="button"
              className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/15 bg-white/[0.02] hover:border-cyan-400/40 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void acceptFile(f);
              }}
            >
              <UploadCloud size={30} className="text-slate-500" />
              <p className="text-xs text-slate-400">Drop the purchasing bill here, or click to browse</p>
              <p className="text-[10px] text-slate-600">PNG / JPG / PDF · same scanline pipeline as OP Scan</p>
            </button>
          ) : (
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <div className="relative flex h-32 items-center justify-center bg-black/40">
                {scanPreview ? (
                  <img src={scanPreview} alt="Supplier bill" className="max-h-32 object-contain" />
                ) : (
                  <div className="flex items-center gap-2 text-slate-400">
                    <FileText size={26} />
                    <span className="text-xs">{scanFile}</span>
                  </div>
                )}
                {scanning && <div className="scanline" />}
                <button className="absolute right-2 top-2 rounded-md border border-white/15 bg-black/70 p-1 text-slate-400 hover:text-white" onClick={clearScan}>
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void acceptFile(f);
              e.target.value = "";
            }}
          />

          {scanning && (
            <p className="flex items-center gap-2 text-xs text-cyan-300 mt-3">
              <Loader2 size={13} className="animate-spin" /> Extracting supplier, invoice & line items…
            </p>
          )}

          {draft && (
            <div className="mt-3 space-y-2">
              <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-2">
                <Sparkles size={12} /> Simulated extraction (placeholder values) — edit before posting.
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-1.5 text-[10px] text-slate-500 px-1">
                  <span className="col-span-4">Item</span><span className="col-span-3">Supplier</span><span className="col-span-2">Invoice</span><span className="col-span-1">Qty</span><span className="col-span-2">Amount ₹</span>
                </div>
                {draft.map((r, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5">
                    <input className="input-dark col-span-4 !py-1 !text-[11px]" value={r.item} onChange={(e) => updDraft(i, "item", e.target.value)} />
                    <input className="input-dark col-span-3 !py-1 !text-[11px]" value={r.supplier} onChange={(e) => updDraft(i, "supplier", e.target.value)} />
                    <input className="input-dark col-span-2 !py-1 !text-[11px]" value={r.invoiceNo} onChange={(e) => updDraft(i, "invoiceNo", e.target.value)} />
                    <input className="input-dark col-span-1 !py-1 !text-[11px]" value={r.qty} onChange={(e) => updDraft(i, "qty", e.target.value.replace(/\D/g, ""))} />
                    <input className="input-dark col-span-2 !py-1 !text-[11px]" value={r.amount} onChange={(e) => updDraft(i, "amount", e.target.value.replace(/[^\d.]/g, ""))} />
                  </div>
                ))}
              </div>
              <button className="btn-neon w-full !text-xs" onClick={postPurchases}>
                <CheckCircle2 size={13} /> Post to purchase register ({draft.length} lines · {fmtINR(draft.reduce((s, r) => s + (Number(r.amount) || 0), 0))})
              </button>
              <p className="text-[10px] text-slate-600">
                Posting auto-updates the stock ledger + medicine master + valuation in one step. Above {fmtINR(APPROVAL_THRESHOLD)} it routes to the approvals inbox instead.
              </p>
            </div>
          )}

          {/* posted ledger */}
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Posted purchases ({purchases.length}) · total {fmtINR(purchases.reduce((s, p) => s + p.amount, 0))}
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {purchases.length === 0 && <p className="text-[11px] text-slate-600">Nothing posted yet.</p>}
              {purchases.slice().reverse().slice(0, 12).map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-[11px] rounded border border-white/5 bg-white/[0.02] px-2 py-1.5">
                  <ScanLine size={11} className="text-slate-500 shrink-0" />
                  <span className="text-slate-300 flex-1 truncate">{p.item} ×{p.qty}</span>
                  <span className="text-slate-500">{p.supplier} · {p.invoiceNo}</span>
                  <span className="text-violet-300 font-semibold">{fmtINR(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* ---------------- stock ledger ---------------- */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <SectionTitle title="Stock Ledger" subtitle="opening + purchased − sold = closing" />
            {(lowStock.length > 0 || negative.length > 0) && (
              <button className="btn-ghost !text-[11px] !py-1 !border-amber-400/50 !text-amber-300" onClick={sendLowStockAlert}>
                <MessageCircle size={12} /> WhatsApp low-stock alert
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-white/10">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 font-medium text-right">Opening</th>
                  <th className="pb-2 font-medium text-right">Purchased</th>
                  <th className="pb-2 font-medium text-right">Sold</th>
                  <th className="pb-2 font-medium text-right">Closing</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.map((r) => {
                  const neg = r.closing < 0;
                  const low = !neg && r.closing <= r.reorderLevel;
                  return (
                    <tr key={r.item} className="border-b border-white/5">
                      <td className="py-2 pr-2 text-slate-200">{r.item}{!r.seeded && <span className="text-[9px] text-slate-500"> (new)</span>}</td>
                      <td className="py-2 pr-2 text-right text-slate-400">{r.opening}</td>
                      <td className="py-2 pr-2 text-right text-cyan-300">+{r.purchased}</td>
                      <td className="py-2 pr-2 text-right text-amber-300">−{r.sold}</td>
                      <td className={cn("py-2 pr-2 text-right font-bold", neg ? "text-red-300" : low ? "text-amber-300" : "text-emerald-300")}>{r.closing}</td>
                      <td className="py-2">
                        {neg ? (
                          <Badge tone="red" className="!text-[9px]"><AlertTriangle size={9} className="mr-0.5" /> mismatch — negative</Badge>
                        ) : low ? (
                          <Badge tone="amber" className="!text-[9px]">low stock</Badge>
                        ) : (
                          <Badge tone="green" className="!text-[9px]">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-600 mt-3">
            Negative closing means more went out than came in — recount the shelf and reconcile against the purchase register.
          </p>
        </GlassCard>
      </div>

      {/* ---------------- AI rack suggestion ---------------- */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <SectionTitle title="AI Rack Suggestion" subtitle="Upload a pharmacy photo → placement plan (simulated vision, FreeLLMAPI plug-in point)" />
          <button className="btn-ghost !text-xs !py-1.5" disabled={rackScanning} onClick={() => rackInputRef.current?.click()}>
            {rackScanning ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
            {rackPlan ? "Re-run with new photo" : "Upload pharmacy photo"}
          </button>
          <input
            ref={rackInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void runRackAnalysis(f);
              e.target.value = "";
            }}
          />
        </div>
        {rackScanning && (
          <div className="relative h-24 rounded-lg border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center">
            <p className="text-xs text-cyan-300 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Analyzing rack layout…</p>
            <div className="scanline" />
          </div>
        )}
        {rackPlan && !rackScanning && (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-2">
              <Sparkles size={12} /> Simulated analysis of “{rackPlan}” (placeholder) — a FreeLLMAPI vision call plugs in where marked in code.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {rackGrid.map((r) => (
                <div key={r.rack} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] font-semibold text-cyan-300 mb-2">{r.rack}</p>
                  <div className="space-y-1">
                    {r.items.map((it) => (
                      <div key={it} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-slate-200 flex items-center gap-1.5">
                        <Pill size={10} className="text-violet-300 shrink-0" /> {it}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Placement checklist</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-300">
                <p>✓ Fast-movers within arm's reach of the billing counter</p>
                <p>✓ Alphabetical order inside each category shelf</p>
                <p>✓ Earliest expiry at the front of every row (FEFO)</p>
                <p className="flex items-center gap-1">✓ <Snowflake size={11} className="text-cyan-300" /> Cold-chain items (Insulin Glargine) → fridge box, 2–8 °C log</p>
                <p>✓ Schedule H locked rack + separate issue register</p>
                <p>✓ Heavy/bulk stock on the bottom shelf only</p>
              </div>
            </div>
          </div>
        )}
        {!rackPlan && !rackScanning && (
          <p className="text-xs text-slate-500">No analysis yet — upload a photo of the pharmacy racks to get a placement plan. You can re-run anytime.</p>
        )}
      </GlassCard>

      {/* dispense modal */}
      <Modal open={!!dispensing} onClose={() => setDispensing(null)} title={`Dispense — ${dispensing?.patientId ?? ""}`} wide>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Order: <span className="text-slate-200">{dispensing?.orderText}</span></p>
          <div className="grid grid-cols-2 gap-3">
            <input className="input-dark col-span-2" placeholder="Item *" value={dItem} onChange={(e) => setDItem(e.target.value)} />
            <input className="input-dark" placeholder="Qty" value={dQty} onChange={(e) => setDQty(e.target.value.replace(/\D/g, ""))} />
            <input className="input-dark" placeholder="Unit price ₹" value={dPrice} onChange={(e) => setDPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
            <span className="text-slate-400">Bill line total</span>
            <span className="text-violet-300 font-bold">{fmtINR((Number(dQty) || 0) * (Number(dPrice) || 0))}</span>
          </div>
          <button className="btn-neon w-full" disabled={!dItem.trim() || !(Number(dQty) > 0)} onClick={confirmDispense}>
            <Pill size={14} /> Dispense & post bill line ({dStaff})
          </button>
          <p className="text-[10px] text-slate-600">
            Posts a sequential pharmacy receipt into the billing ledger (append-only), records the stock outflow, and closes the
            order with dispense proof (staff + timestamp).
          </p>
        </div>
      </Modal>
    </div>
  );
}
