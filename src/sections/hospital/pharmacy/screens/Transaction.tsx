// SpartaHMS "Transaction" screen — internal tabs:
//   Purchase Order · Goods Received Note · Stock Adjustments · Stock Expiry
// Astra gold/obsidian glass theme, dense working tables. PO form includes
// scan/camera upload + AI OCR receipt auto-fill.

import { useMemo, useRef, useState } from "react";
import {
  Ban, CalendarRange, Camera, CheckCircle2, Download, Image as ImageIcon,
  Loader2, MessageCircle, PackageCheck, Pencil, Plus, ScanLine, Sparkles,
  Trash2, Truck, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, fmtINR } from "@/lib/utils";
import {
  daysToExpiry, downloadCsv, fmtDate, itemById, todayISO, uid, usePharm,
} from "../pharmData";
import type { Batch, PharmItem, PurchaseOrder } from "../pharmData";

type TxTab = "po" | "grn" | "adjust" | "expiry";

const APPROVAL_THRESHOLD = 5000;

const TABS: { key: TxTab; label: string }[] = [
  { key: "po", label: "Purchase Order" },
  { key: "grn", label: "Goods Received Note" },
  { key: "adjust", label: "Stock Adjustments" },
  { key: "expiry", label: "Stock Expiry" },
];

const inputCls = "input-dark !py-1.5 text-xs";
const thCls = "py-2 pr-3 text-left text-[10px] uppercase tracking-wider text-amber-500/80 font-semibold whitespace-nowrap";
const tdCls = "py-2 pr-3 text-xs text-slate-300 align-top";

export function Transaction() {
  const [tab, setTab] = useState<TxTab>("po");
  return (
    <div className="space-y-4">
      <SectionTitle title="Transaction" subtitle="Purchase orders · goods receipt · stock adjustments · expiry watch" />
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium border transition-all",
              tab === t.key
                ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_12px_rgba(212,175,55,0.22)]"
                : "text-slate-400 border-white/10 hover:text-white hover:bg-white/[0.05]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "po" && <PurchaseOrderTab />}
      {tab === "grn" && <GrnTab />}
      {tab === "adjust" && <AdjustTab />}
      {tab === "expiry" && <ExpiryTab />}
    </div>
  );
}

/* ============================ Purchase Order ============================ */

interface PoRow { itemId: string; qty: string; rate: string; }

function emptyPoRow(): PoRow { return { itemId: "", qty: "", rate: "" }; }

function PurchaseOrderTab() {
  const { ph, setPh } = usePharm();
  const { addApproval, logAudit, settings } = useStore();
  const { account } = useAuth();
  const me = account?.name ?? "Sana Iqbal";

  const [from, setFrom] = useState(() => todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const [range, setRange] = useState<[string, string] | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // form state
  const [supplier, setSupplier] = useState("");
  const [validTill, setValidTill] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [invType, setInvType] = useState(ph.invTypes[20] ?? "TABLET");
  const [rows, setRows] = useState<PoRow[]>([emptyPoRow()]);

  // scan / camera state
  const [showScanner, setShowScanner] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [rawReceiptText, setRawReceiptText] = useState("");
  const [parsedReceipt, setParsedReceipt] = useState<{
    supplier?: string; invType?: string; items: { name: string; qty: number; rate: number }[];
  } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    let list = ph.pos;
    if (range) list = list.filter((p) => p.poDate >= range[0] && p.poDate <= range[1]);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        p.poNo.toLowerCase().includes(q) || p.supplier.toLowerCase().includes(q) ||
        p.invType.toLowerCase().includes(q) || p.createdBy.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => b.poDate.localeCompare(a.poDate) || b.poNo.localeCompare(a.poNo));
  }, [ph.pos, range, search]);

  const formTotal = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0);

  function openNew() {
    setEditId(null);
    setSupplier(ph.suppliers[0]?.name ?? "");
    setValidTill(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    setInvType("TABLET");
    setRows([emptyPoRow()]);
    setModalOpen(true);
  }

  function openEdit(po: PurchaseOrder) {
    setEditId(po.id);
    setSupplier(po.supplier);
    setValidTill(po.validTill);
    setInvType(po.invType);
    setRows(po.items.map((i) => ({ itemId: i.itemId, qty: String(i.qty), rate: String(i.rate) })));
    setModalOpen(true);
  }

  function setRow(i: number, patch: Partial<PoRow>) {
    setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  }

  function pickItem(i: number, itemId: string) {
    const it = itemById(ph, itemId);
    setRow(i, { itemId, rate: it ? String(it.rate) : "" });
  }

  function savePo() {
    const items = rows
      .filter((r) => r.itemId && Number(r.qty) > 0)
      .map((r) => {
        const it = itemById(ph, r.itemId);
        return { itemId: r.itemId, name: it?.name ?? r.itemId, qty: Number(r.qty), rate: Number(r.rate) || 0 };
      });
    if (!supplier) { toast.error("Pick a supplier"); return; }
    if (!items.length) { toast.error("Add at least one item with qty"); return; }
    const total = Math.round(items.reduce((s, x) => s + x.qty * x.rate, 0) * 100) / 100;

    if (editId) {
      setPh((prev) => ({
        ...prev,
        pos: prev.pos.map((p) => p.id === editId ? { ...p, supplier, validTill, invType, items, total } : p),
      }));
      logAudit("Pharmacy PO edit", `${ph.pos.find((p) => p.id === editId)?.poNo ?? ""} · ${fmtINR(total)}`, me);
      toast.success("PO updated");
      setModalOpen(false);
      return;
    }

    const poNo = `PO-${ph.poCounter}`;
    const po: PurchaseOrder = {
      id: uid("po"), poNo, poDate: todayISO(), validTill, invType, supplier,
      createdBy: me, status: "open", items, total,
    };
    setPh((prev) => ({ ...prev, pos: [po, ...prev.pos], poCounter: prev.poCounter + 1 }));
    logAudit("Pharmacy PO created", `${poNo} — ${supplier} · ${items.length} line(s) · ${fmtINR(total)}`, me);
    if (total > APPROVAL_THRESHOLD) {
      addApproval({
        kind: "purchase",
        title: `Pharmacy PO ${poNo} — ${supplier} (${fmtINR(total)})`,
        detail: `${items.length} line(s), valid till ${fmtDate(validTill)}. Above ${fmtINR(APPROVAL_THRESHOLD)} — needs approval before execution.`,
        amount: total, requestedBy: me, requestedByRole: "pharmacy",
        payload: JSON.stringify({ poNo, supplier, validTill, invType, items }),
      });
      toast.info(`PO ${poNo} created — ${fmtINR(total)} exceeds ${fmtINR(APPROVAL_THRESHOLD)}, sent for approval`);
    } else {
      toast.success(`PO ${poNo} created · ${fmtINR(total)}`);
    }
    setModalOpen(false);
  }

  function confirmCancel() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { toast.error("Cancel reason is required"); return; }
    setPh((prev) => ({
      ...prev,
      pos: prev.pos.map((p) => p.id === cancelTarget.id ? { ...p, status: "cancelled", cancelReason: cancelReason.trim() } : p),
    }));
    logAudit("Pharmacy PO cancelled", `${cancelTarget.poNo} — ${cancelReason.trim()}`, me);
    toast.success(`PO ${cancelTarget.poNo} cancelled`);
    setCancelTarget(null);
    setCancelReason("");
  }

  function exportCsv() {
    downloadCsv(
      `purchase-orders-${todayISO()}.csv`,
      ["Valid Till", "PO Date", "PO No", "Inventory Type", "Supplier", "Created By", "Status", "Total", "Cancel Reason"],
      shown.map((p) => [fmtDate(p.validTill), fmtDate(p.poDate), p.poNo, p.invType, p.supplier, p.createdBy, p.status, p.total, p.cancelReason ?? ""]),
    );
    toast.success(`Exported ${shown.length} PO(s)`);
  }

  /* ---- Scan / Camera receipt handlers ---- */

  function handleScanFile(file: File) {
    if (!/^image\/(png|jpe?g|webp|gif)/i.test(file.type)) {
      toast.error("Select an image file (PNG, JPG, WEBP)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScanPreview(reader.result as string);
      setParsedReceipt(null);
      setRawReceiptText("");
    };
    reader.readAsDataURL(file);
  }

  function applyParsedReceipt() {
    if (!parsedReceipt) return;
    if (parsedReceipt.supplier && ph.suppliers.some((s) => s.name === parsedReceipt.supplier)) {
      setSupplier(parsedReceipt.supplier);
    } else if (parsedReceipt.supplier) {
      setSupplier(parsedReceipt.supplier);
    }
    if (parsedReceipt.invType && ph.invTypes.includes(parsedReceipt.invType)) {
      setInvType(parsedReceipt.invType);
    }
    const matched = parsedReceipt.items
      .map((it) => {
        const found = ph.items.find((x) => x.name.toLowerCase() === it.name.toLowerCase());
        if (found) return { itemId: found.id, qty: String(it.qty), rate: String(it.rate) };
        const partial = ph.items.find((x) => x.name.toLowerCase().includes(it.name.toLowerCase()) || it.name.toLowerCase().includes(x.name.toLowerCase()));
        if (partial) return { itemId: partial.id, qty: String(it.qty), rate: String(it.rate) };
        return null;
      })
      .filter((x): x is { itemId: string; qty: string; rate: string } => x !== null);
    if (matched.length) {
      setRows(matched);
      toast.success(`Applied ${matched.length} item(s) from receipt`);
    } else {
      toast.info("No items matched the catalog — add manually");
    }
    setShowScanner(false);
  }

  function parseManualText() {
    const text = rawReceiptText.trim();
    if (!text) { toast.error("Paste receipt text first"); return; }
    const lines = text.split("\n").filter(Boolean);
    const items: { name: string; qty: number; rate: number }[] = [];
    let supplier = "";
    for (const line of lines) {
      const l = line.trim();
      const sup = l.match(/^(?:supplier|vendor|from)\s*[:]\s*(.+)/i);
      if (sup) { supplier = sup[1].trim(); continue; }
      const m1 = l.match(/^(.+?)\s{2,}(\d+(?:\.\d+)?)\s{2,}([\d.]+)$/);
      if (m1) { items.push({ name: m1[1].trim(), qty: Number(m1[2]), rate: Number(m1[3]) }); continue; }
      const m2 = l.match(/^(.+?)\s*x\s*(\d+)\s*@?\s*([\d.]+)/i);
      if (m2) { items.push({ name: m2[1].trim(), qty: Number(m2[2]), rate: Number(m2[3]) }); continue; }
    }
    if (!items.length) { toast.error("Could not parse items — use: ItemName  Qty  Rate per line"); return; }
    const matched = items.map((it) => {
      const found = ph.items.find((x) => x.name.toLowerCase() === it.name.toLowerCase());
      if (found) return { itemId: found.id, qty: String(it.qty), rate: String(it.rate) };
      const partial = ph.items.find((x) => x.name.toLowerCase().includes(it.name.toLowerCase()));
      if (partial) return { itemId: partial.id, qty: String(it.qty), rate: String(it.rate) };
      return null;
    }).filter((x): x is { itemId: string; qty: string; rate: string } => x !== null);
    if (matched.length) {
      setRows(matched);
      if (supplier && ph.suppliers.some((s) => s.name.toLowerCase() === supplier.toLowerCase())) {
        setSupplier(ph.suppliers.find((s) => s.name.toLowerCase() === supplier.toLowerCase())!.name);
      }
      toast.success(`Parsed ${matched.length} item(s) from text`);
    } else {
      toast.info("No items matched — add manually after closing");
    }
    setShowScanner(false);
  }

  return (
    <GlassCard className="!p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Start Date</label>
          <input type="date" className={cn(inputCls, "block w-40")} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500">End Date</label>
          <input type="date" className={cn(inputCls, "block w-40")} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn-neon !py-1.5 !px-3 text-xs flex items-center gap-1.5" onClick={() => { setRange([from, to]); toast.success(`POs ${fmtDate(from)} → ${fmtDate(to)}`); }}>
          <CalendarRange size={13} /> Get In Detail
        </button>
        <button className="btn-ghost !py-1.5 !px-3 text-xs flex items-center gap-1.5" onClick={exportCsv}>
          <Download size={13} /> Export
        </button>
        <div className="flex-1" />
        <input className={cn(inputCls, "w-44")} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div>
        <button className="btn-neon !py-1.5 !px-3 text-xs flex items-center gap-1.5" onClick={openNew}>
          <Plus size={13} /> Add New PO
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              <th className={thCls}>Valid Till</th>
              <th className={thCls}>PO Date</th>
              <th className={thCls}>PO No</th>
              <th className={thCls}>Inventory Type</th>
              <th className={thCls}>Supplier</th>
              <th className={thCls}>Created By</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Edit</th>
              <th className={thCls}>Cancel</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={9} className="py-6 text-center text-xs text-slate-500">Details not available.</td></tr>
            )}
            {shown.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className={tdCls}>{fmtDate(p.validTill)}</td>
                <td className={tdCls}>{fmtDate(p.poDate)}</td>
                <td className={cn(tdCls, "text-neon-cyan font-medium")}>{p.poNo}</td>
                <td className={tdCls}>{p.invType}</td>
                <td className={tdCls}>{p.supplier}</td>
                <td className={tdCls}>{p.createdBy}</td>
                <td className={tdCls}>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={p.status === "open" ? "cyan" : p.status === "received" ? "green" : "red"}>{p.status}</Badge>
                    {p.total > APPROVAL_THRESHOLD && p.status !== "cancelled" && (
                      <span title={`PO value ${fmtINR(p.total)} is above ${fmtINR(APPROVAL_THRESHOLD)} — raised in the approvals inbox`}>
                        <Badge tone="amber">Approval required</Badge>
                      </span>
                    )}
                    {p.status === "cancelled" && p.cancelReason && (
                      <span className="text-[10px] text-red-300/70" title={p.cancelReason}>({p.cancelReason})</span>
                    )}
                  </div>
                </td>
                <td className={tdCls}>
                  <button
                    className="btn-ghost !p-1.5 disabled:opacity-30"
                    disabled={p.status !== "open"}
                    onClick={() => openEdit(p)}
                    title="Edit PO"
                  >
                    <Pencil size={13} />
                  </button>
                </td>
                <td className={tdCls}>
                  <button
                    className="btn-ghost !p-1.5 !border-red-400/30 !text-red-300 disabled:opacity-30"
                    disabled={p.status !== "open"}
                    onClick={() => { setCancelTarget(p); setCancelReason(""); }}
                    title="Cancel PO"
                  >
                    <Ban size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-600">Showing {shown.length} of {ph.pos.length} entries · PO above {fmtINR(APPROVAL_THRESHOLD)} goes to the approvals inbox</p>

      {/* ---- Add / Edit PO modal ---- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? "Modify Purchase Order" : "Add New Purchase Order"} wide>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Supplier</label>
              <select className={cn(inputCls, "w-full")} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">— select —</option>
                {ph.suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Valid Till</label>
              <input type="date" className={cn(inputCls, "w-full")} value={validTill} onChange={(e) => setValidTill(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Inventory Type</label>
              <select className={cn(inputCls, "w-full")} value={invType} onChange={(e) => setInvType(e.target.value)}>
                {ph.invTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* ---- Scan receipt ---- */}
          <div className="border-t border-white/5 pt-1.5">
            <button
              className={cn(
                "flex items-center gap-1.5 text-[11px] font-medium transition-all px-1.5 py-1 rounded-md",
                showScanner ? "text-cyan-300 bg-cyan-400/5" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              )}
              onClick={() => setShowScanner(!showScanner)}
            >
              <ScanLine size={13} /> {showScanner ? "Hide Scanner" : "Scan Receipt"}
              <span className="text-[10px] text-slate-600 ml-1">— camera or upload, AI auto-fill</span>
            </button>

            {showScanner && (
              <div className="mt-2 border border-white/10 rounded-lg p-3 bg-black/20 space-y-2">
                {!scanPreview ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="btn-neon !py-1.5 !px-3 text-[11px] flex items-center gap-1.5" onClick={() => scanInputRef.current?.click()}>
                      <Camera size={13} /> Take / Upload Photo
                    </button>
                    <span className="text-[10px] text-slate-500">PNG / JPG of the purchase receipt</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative inline-block rounded-md overflow-hidden border border-white/10">
                      <img src={scanPreview} alt="Receipt scan" className="max-h-28 w-auto object-contain" />
                      <button
                        className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-slate-400 hover:text-white"
                        onClick={() => { setScanPreview(null); setParsedReceipt(null); setRawReceiptText(""); }}
                        title="Remove"
                      >
                        <X size={12} />
                      </button>
                    </div>

                    {!parsedReceipt && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="btn-neon !py-1 !px-2.5 text-[11px] flex items-center gap-1"
                          onClick={async () => {
                            if (!scanPreview) return;
                            setScanning(true);
                            try {
                              const useAi = settings.freellmApiKey.trim().length > 0;
                              const res = await fetch(
                                `/proxy/freellmapi/v1/chat/completions`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    ...(useAi ? { Authorization: `Bearer ${settings.freellmApiKey}` } : {}),
                                  },
                                  body: JSON.stringify({
                                    model: "auto",
                                    messages: [{
                                      role: "user",
                                      content: [
                                        { type: "text", text: "Extract supplier name, items (name, qty, rate), and inventory type from this pharmacy purchase receipt. Return ONLY valid JSON with no markdown: { \"supplier\": string, \"invType\": string, \"items\": [{ \"name\": string, \"qty\": number, \"rate\": number }] }. Use empty string if a field is not visible." },
                                        { type: "image_url", image_url: { url: scanPreview } },
                                      ],
                                    }],
                                  }),
                                },
                              );
                              if (res.ok) {
                                const json = await res.json();
                                const content = json.choices?.[0]?.message?.content ?? "";
                                const cleaned = content.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, "$1").trim();
                                const data = JSON.parse(cleaned);
                                setParsedReceipt(data);
                                toast.success("Receipt extracted via AI — review and Apply");
                              } else {
                                toast.error("AI extraction failed — paste text below instead");
                              }
                            } catch {
                              toast.error("AI extraction failed — paste text below instead");
                            }
                            setScanning(false);
                          }}
                          disabled={scanning}
                        >
                          {scanning ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                          {scanning ? "Extracting…" : "AI Extract"}
                        </button>
                        <span className="text-[10px] text-slate-500">or paste receipt text below</span>
                      </div>
                    )}

                    {parsedReceipt && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                          <CheckCircle2 size={13} /> Extracted {parsedReceipt.items.length} item(s)
                          {parsedReceipt.supplier && <> · Supplier: {parsedReceipt.supplier}</>}
                        </div>
                        <div className="flex gap-2">
                          <button className="btn-neon !py-1 !px-2.5 text-[11px]" onClick={applyParsedReceipt}>
                            <CheckCircle2 size={11} /> Apply to PO
                          </button>
                          <button className="btn-ghost !py-1 !px-2.5 text-[11px]" onClick={() => setParsedReceipt(null)}>
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {!parsedReceipt && (
                      <div className="flex gap-2 items-start">
                        <textarea
                          className="input-dark text-[11px] min-h-[44px] flex-1 resize-none"
                          placeholder="Paste receipt text here as fallback… One item per line: ItemName  Qty  Rate"
                          value={rawReceiptText}
                          onChange={(e) => setRawReceiptText(e.target.value)}
                        />
                        <button
                          className="btn-ghost !py-1.5 !px-2 text-[11px] shrink-0"
                          disabled={!rawReceiptText.trim()}
                          onClick={parseManualText}
                        >
                          Parse
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <input
              ref={scanInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleScanFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_90px_100px_32px] gap-2 text-[10px] uppercase tracking-wider text-slate-500 px-0.5">
              <span>Item</span><span>Qty</span><span>Rate</span><span />
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_100px_32px] gap-2 items-center">
                <select className={cn(inputCls, "w-full")} value={r.itemId} onChange={(e) => pickItem(i, e.target.value)}>
                  <option value="">— item —</option>
                  {ph.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
                <input type="number" min={0} className={cn(inputCls, "w-full")} placeholder="Qty" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
                <input type="number" min={0} step="0.01" className={cn(inputCls, "w-full")} placeholder="Rate" value={r.rate} onChange={(e) => setRow(i, { rate: e.target.value })} />
                <button className="btn-ghost !p-1.5 !text-red-300" onClick={() => setRows((prev) => prev.length > 1 ? prev.filter((_, k) => k !== i) : prev)} title="Remove row">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button className="btn-ghost !py-1 !px-2.5 text-[11px] flex items-center gap-1" onClick={() => setRows((prev) => [...prev, emptyPoRow()])}>
              <Plus size={12} /> Add row
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Total</span>
              <span className="text-base font-bold text-white">{fmtINR(formTotal)}</span>
              {formTotal > APPROVAL_THRESHOLD && <Badge tone="amber">Approval required</Badge>}
            </div>
            <button className="btn-neon !py-1.5 !px-4 text-xs" onClick={savePo}>{editId ? "Save Changes" : "Create PO"}</button>
          </div>
        </div>
      </Modal>

      {/* ---- Cancel reason modal ---- */}
      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title={`Cancel ${cancelTarget?.poNo ?? ""}`}>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Cancelling a purchase order needs a reason — it is kept on record.</p>
          <textarea
            className="input-dark w-full text-xs min-h-[80px]"
            placeholder="Reason for cancellation…"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setCancelTarget(null)}>Back</button>
            <button className="btn-neon !py-1.5 !px-4 text-xs !border-red-400/50" onClick={confirmCancel}>Confirm Cancel</button>
          </div>
        </div>
      </Modal>
    </GlassCard>
  );
}

/* ============================ Goods Received Note ============================ */

interface GrnLine { batchNo: string; purchaseDate: string; expDate: string; qty: string; }

function GrnTab() {
  const { ph, setPh } = usePharm();
  const { logAudit } = useStore();
  const { account } = useAuth();
  const me = account?.name ?? "Sana Iqbal";

  const openPos = ph.pos.filter((p) => p.status === "open");
  const [poId, setPoId] = useState("");
  const [lines, setLines] = useState<Record<number, GrnLine>>({});
  const po = openPos.find((p) => p.id === poId);

  function pickPo(id: string) {
    setPoId(id);
    setLines({});
  }

  function setLine(idx: number, patch: Partial<GrnLine>) {
    setLines((prev) => {
      const empty: GrnLine = { batchNo: "", purchaseDate: todayISO(), expDate: "", qty: "" };
      return { ...prev, [idx]: { ...empty, ...prev[idx], ...patch } };
    });
  }

  function postGrn() {
    if (!po) return;
    const entries = po.items
      .map((it, idx) => ({ it, line: lines[idx] }))
      .filter(({ line }) => line && Number(line.qty) > 0);
    if (!entries.length) { toast.error("Enter received qty for at least one item"); return; }
    for (const { line } of entries) {
      if (!line.batchNo.trim()) { toast.error("Batch no required for every received line"); return; }
      if (!line.expDate) { toast.error("Expiry date required for every received line"); return; }
    }

    setPh((prev) => {
      const items = [...prev.items];
      const batches = [...prev.batches];
      for (const { it, line } of entries) {
        // auto-add unknown items to the item master
        if (!items.some((x) => x.id === it.itemId)) {
          const ni: PharmItem = {
            id: it.itemId || uid("itm"), name: it.name, itemType: "", invType: po.invType,
            manufacture: "", taxCat: "GST-0", rack: "", hsn: "", composition: "", drugCombo: "",
            barcode: "", mrp: it.rate, rate: it.rate, reorder: 0,
          };
          items.push(ni);
        }
        const existing = batches.find((b) => b.itemId === it.itemId && b.batchNo.toLowerCase() === line.batchNo.trim().toLowerCase());
        const q = Number(line.qty);
        const master = items.find((x) => x.id === it.itemId);
        if (existing) {
          existing.qty += q;
          existing.origQty += q;
        } else {
          const nb: Batch = {
            id: uid("bat"), itemId: it.itemId, batchNo: line.batchNo.trim(),
            purchaseDate: line.purchaseDate || todayISO(), expDate: line.expDate,
            origQty: q, qty: q, mrp: master?.mrp ?? it.rate, rate: it.rate,
          };
          batches.push(nb);
        }
      }
      return {
        ...prev, items, batches,
        pos: prev.pos.map((p) => (p.id === po.id ? { ...p, status: "received" as const } : p)),
      };
    });

    logAudit("Pharmacy GRN posted", `${po.poNo} — ${entries.length} line(s) received`, me);
    toast.success(`GRN posted against ${po.poNo} — batches updated, PO marked received`);
    setPoId("");
    setLines({});
  }

  return (
    <GlassCard className="!p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-72">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Open Purchase Order</label>
          <select className={cn(inputCls, "w-full")} value={poId} onChange={(e) => pickPo(e.target.value)}>
            <option value="">— select open PO —</option>
            {openPos.map((p) => <option key={p.id} value={p.id}>{p.poNo} · {p.supplier} · {fmtINR(p.total)}</option>)}
          </select>
        </div>
        {po && (
          <Badge tone="cyan"><Truck size={11} className="mr-1" /> {po.items.length} item(s) · valid till {fmtDate(po.validTill)}</Badge>
        )}
      </div>

      {!po && <p className="text-xs text-slate-500 py-4">{openPos.length ? "Pick an open PO to receive goods against it." : "No open purchase orders — create one in the Purchase Order tab first."}</p>}

      {po && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className={thCls}>Item</th>
                  <th className={thCls}>Ordered</th>
                  <th className={thCls}>Batch No</th>
                  <th className={thCls}>Purchase Date</th>
                  <th className={thCls}>Expiry Date</th>
                  <th className={thCls}>Qty Received</th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((it, idx) => {
                  const l = lines[idx];
                  return (
                    <tr key={idx} className="border-b border-white/5">
                      <td className={cn(tdCls, "font-medium text-white")}>{it.name}</td>
                      <td className={tdCls}>{it.qty} × {fmtINR(it.rate)}</td>
                      <td className={tdCls}>
                        <input className={cn(inputCls, "w-32")} placeholder="Batch no" value={l?.batchNo ?? ""} onChange={(e) => setLine(idx, { batchNo: e.target.value })} />
                      </td>
                      <td className={tdCls}>
                        <input type="date" className={cn(inputCls, "w-36")} value={l?.purchaseDate ?? todayISO()} onChange={(e) => setLine(idx, { purchaseDate: e.target.value })} />
                      </td>
                      <td className={tdCls}>
                        <input type="date" className={cn(inputCls, "w-36")} value={l?.expDate ?? ""} onChange={(e) => setLine(idx, { expDate: e.target.value })} />
                      </td>
                      <td className={tdCls}>
                        <input type="number" min={0} className={cn(inputCls, "w-24")} placeholder="0" value={l?.qty ?? ""} onChange={(e) => setLine(idx, { qty: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <p className="text-[10px] text-slate-500">Posting creates/updates batches · unknown items are added to the item master · PO is marked received</p>
            <button className="btn-neon !py-1.5 !px-4 text-xs flex items-center gap-1.5" onClick={postGrn}>
              <PackageCheck size={13} /> Post GRN
            </button>
          </div>
        </>
      )}
    </GlassCard>
  );
}

/* ============================ Stock Adjustments ============================ */

const ADJ_REASONS = ["Damage", "Transfer", "Correction", "Expiry write-off", "Stock found"];

function AdjustTab() {
  const { ph, setPh } = usePharm();
  const { logAudit } = useStore();
  const { account } = useAuth();
  const me = account?.name ?? "Sana Iqbal";

  const [query, setQuery] = useState("");
  const [openList, setOpenList] = useState(false);
  const [itemId, setItemId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState(ADJ_REASONS[0]);
  const [note, setNote] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ph.items.slice(0, 12);
    return ph.items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 12);
  }, [ph.items, query]);

  const item = itemById(ph, itemId);
  const itemBatches = useMemo(
    () => ph.batches.filter((b) => b.itemId === itemId).sort((a, b) => a.expDate.localeCompare(b.expDate)),
    [ph.batches, itemId],
  );

  function pickItem(it: PharmItem) {
    setItemId(it.id);
    setQuery(it.name);
    setOpenList(false);
    setBatchId("");
    toast.success(`Loaded batches for ${it.name}`);
  }

  function apply() {
    const d = Number(delta);
    if (!item) { toast.error("Pick an item first"); return; }
    if (!batchId) { toast.error("Pick a batch to adjust"); return; }
    if (!d || !Number.isFinite(d)) { toast.error("Enter a non-zero adjustment (+/−)"); return; }
    const batch = itemBatches.find((b) => b.id === batchId);
    if (!batch) return;
    if (batch.qty + d < 0) { toast.error(`Batch ${batch.batchNo} only has ${batch.qty} — cannot remove ${Math.abs(d)}`); return; }

    setPh((prev) => ({
      ...prev,
      batches: prev.batches.map((b) => (b.id === batchId ? { ...b, qty: b.qty + d } : b)),
      adjustments: [
        { id: uid("adj"), date: todayISO(), itemId, batchNo: batch.batchNo, delta: d, reason, note: note.trim() },
        ...prev.adjustments,
      ],
    }));
    logAudit("Stock adjustment", `${item.name} · ${batch.batchNo} · ${d > 0 ? "+" : ""}${d} · ${reason}`, me);
    toast.success(`Adjusted ${item.name} (${batch.batchNo}) ${d > 0 ? "+" : ""}${d} — new qty ${batch.qty + d}`);
    setDelta("");
    setNote("");
  }

  return (
    <GlassCard className="!p-4 space-y-4">
      {/* item autocomplete (ref 156 style) */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-72">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">Item Name</label>
          <input
            className={cn(inputCls, "w-full")}
            placeholder="Select Item Name"
            value={query}
            onFocus={() => setOpenList(true)}
            onBlur={() => setTimeout(() => setOpenList(false), 150)}
            onChange={(e) => { setQuery(e.target.value); setItemId(""); setOpenList(true); }}
          />
          {openList && matches.length > 0 && (
            <div className="absolute z-20 mt-1 w-full glass p-1.5 space-y-0.5 max-h-56 overflow-y-auto">
              {matches.map((it) => (
                <button
                  key={it.id}
                  onMouseDown={() => pickItem(it)}
                  className={cn(
                    "w-full text-left rounded px-2 py-1.5 text-xs hover:bg-white/10 flex justify-between gap-2",
                    it.id === itemId ? "text-neon-cyan bg-cyan-400/10" : "text-slate-300",
                  )}
                >
                  <span>{it.name}</span>
                  <span className="text-slate-500">{it.invType}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn-neon !py-1.5 !px-3 text-xs" onClick={() => item ? toast.success(`Batches refreshed for ${item.name}`) : toast.error("Pick an item first")}>
          GetData
        </button>
      </div>

      {item && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className={thCls}></th>
                  <th className={thCls}>Batch No</th>
                  <th className={thCls}>Purchase</th>
                  <th className={thCls}>Expiry</th>
                  <th className={thCls}>Qty</th>
                  <th className={thCls}>MRP</th>
                  <th className={thCls}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {itemBatches.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-xs text-slate-500">No batches on record for this item.</td></tr>
                )}
                {itemBatches.map((b) => {
                  const d = daysToExpiry(b.expDate);
                  return (
                    <tr key={b.id} className={cn("border-b border-white/5", batchId === b.id && "bg-cyan-400/5")}>
                      <td className={tdCls}>
                        <input type="radio" name="adj-batch" checked={batchId === b.id} onChange={() => setBatchId(b.id)} />
                      </td>
                      <td className={cn(tdCls, "text-neon-cyan")}>{b.batchNo}</td>
                      <td className={tdCls}>{fmtDate(b.purchaseDate)}</td>
                      <td className={cn(tdCls, d < 0 ? "text-red-300" : d < 90 ? "text-amber-300" : "")}>{fmtDate(b.expDate)}</td>
                      <td className={cn(tdCls, "font-semibold text-white")}>{b.qty}</td>
                      <td className={tdCls}>{fmtINR(b.mrp)}</td>
                      <td className={tdCls}>{fmtINR(b.rate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end border-t border-white/10 pt-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Adjust Qty (+/−)</label>
              <input type="number" className={cn(inputCls, "w-full")} placeholder="e.g. -5 or +20" value={delta} onChange={(e) => setDelta(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Reason</label>
              <select className={cn(inputCls, "w-full")} value={reason} onChange={(e) => setReason(e.target.value)}>
                {ADJ_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Note</label>
              <input className={cn(inputCls, "w-full")} placeholder="Optional note…" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button className="btn-neon !py-1.5 !px-4 text-xs" onClick={apply}>Apply Adjustment</button>
          </div>
        </>
      )}

      {/* adjustments log */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-amber-500/80 font-semibold mb-2">Adjustments Log</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className={thCls}>Date</th>
                <th className={thCls}>Item</th>
                <th className={thCls}>Batch</th>
                <th className={thCls}>Δ Qty</th>
                <th className={thCls}>Reason</th>
                <th className={thCls}>Note</th>
              </tr>
            </thead>
            <tbody>
              {ph.adjustments.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-xs text-slate-500">No adjustments yet.</td></tr>
              )}
              {ph.adjustments.map((a) => (
                <tr key={a.id} className="border-b border-white/5">
                  <td className={tdCls}>{fmtDate(a.date)}</td>
                  <td className={tdCls}>{itemById(ph, a.itemId)?.name ?? a.itemId}</td>
                  <td className={cn(tdCls, "text-neon-cyan")}>{a.batchNo}</td>
                  <td className={cn(tdCls, "font-semibold", a.delta > 0 ? "text-emerald-300" : "text-red-300")}>{a.delta > 0 ? "+" : ""}{a.delta}</td>
                  <td className={tdCls}><Badge tone={a.reason === "Damage" || a.reason === "Expiry write-off" ? "red" : a.reason === "Transfer" ? "violet" : "amber"}>{a.reason}</Badge></td>
                  <td className={tdCls}>{a.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </GlassCard>
  );
}

/* ============================ Stock Expiry ============================ */

type ExpFilter = "all" | "expired" | "30" | "90" | "ok";

const EXP_FILTERS: { key: ExpFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "expired", label: "Expired" },
  { key: "30", label: "< 30 days" },
  { key: "90", label: "< 90 days" },
  { key: "ok", label: "OK (90+)" },
];

function ExpiryTab() {
  const { ph } = usePharm();
  const { addSendLog, logAudit } = useStore();
  const { account } = useAuth();
  const me = account?.name ?? "Sana Iqbal";
  const [filter, setFilter] = useState<ExpFilter>("all");

  const rows = useMemo(() => {
    const list = ph.batches
      .map((b) => ({ b, item: itemById(ph, b.itemId), days: daysToExpiry(b.expDate) }))
      .sort((x, y) => x.days - y.days);
    switch (filter) {
      case "expired": return list.filter((r) => r.days < 0);
      case "30": return list.filter((r) => r.days >= 0 && r.days < 30);
      case "90": return list.filter((r) => r.days >= 0 && r.days < 90);
      case "ok": return list.filter((r) => r.days >= 90);
      default: return list;
    }
  }, [ph.batches, ph.items, filter]);

  const expiredCount = ph.batches.filter((b) => daysToExpiry(b.expDate) < 0 && b.qty > 0).length;
  const nearCount = ph.batches.filter((b) => { const d = daysToExpiry(b.expDate); return d >= 0 && d < 90 && b.qty > 0; }).length;

  function whatsappAlert() {
    const hit = ph.batches
      .filter((b) => b.qty > 0 && daysToExpiry(b.expDate) < 90)
      .sort((a, b) => a.expDate.localeCompare(b.expDate));
    if (!hit.length) { toast.success("No stock expiring within 90 days — nothing to alert"); return; }
    const summary = hit.slice(0, 5).map((b) => `${itemById(ph, b.itemId)?.name ?? "?"} (${b.batchNo}, ${daysToExpiry(b.expDate)}d)`).join("; ");
    addSendLog({ provider: "WhatsApp", template: "pharm_expiry_alert", recipient: me, status: "sent" });
    logAudit("Expiry WhatsApp alert", `${hit.length} batch(es) — ${summary}${hit.length > 5 ? "…" : ""}`, me);
    toast.success(`WhatsApp expiry alert logged — ${hit.length} batch(es) under 90 days`);
  }

  return (
    <GlassCard className="!p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {EXP_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium border transition-all",
              filter === f.key
                ? "bg-amber-400/15 text-amber-300 border-amber-400/40 shadow-[0_0_10px_rgba(212,175,55,0.25)]"
                : "text-slate-400 border-white/10 hover:text-white hover:bg-white/[0.05]",
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        <Badge tone="red">{expiredCount} expired</Badge>
        <Badge tone="amber">{nearCount} &lt; 90 days</Badge>
        <button className="btn-ghost !py-1.5 !px-3 text-xs flex items-center gap-1.5 !border-emerald-400/40 !text-emerald-300" onClick={whatsappAlert}>
          <MessageCircle size={13} /> WhatsApp Alert
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-white/10">
              <th className={thCls}>Item</th>
              <th className={thCls}>Batch No</th>
              <th className={thCls}>Expiry</th>
              <th className={thCls}>Days</th>
              <th className={thCls}>Qty</th>
              <th className={thCls}>Rack</th>
              <th className={thCls}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-xs text-slate-500">No batches in this filter.</td></tr>
            )}
            {rows.map(({ b, item, days }) => {
              const tone = days < 0 ? "red" : days < 90 ? "amber" : "ok";
              return (
                <tr key={b.id} className={cn("border-b border-white/5", tone === "red" && "bg-red-500/[0.06]", tone === "amber" && "bg-amber-500/[0.04]")}>
                  <td className={cn(tdCls, "font-medium text-white")}>{item?.name ?? "—"}</td>
                  <td className={cn(tdCls, "text-neon-cyan")}>{b.batchNo}</td>
                  <td className={cn(tdCls, tone === "red" && "text-red-300 font-semibold", tone === "amber" && "text-amber-300")}>{fmtDate(b.expDate)}</td>
                  <td className={tdCls}>
                    {days < 0
                      ? <Badge tone="red">expired {Math.abs(days)}d ago</Badge>
                      : days < 90
                        ? <Badge tone="amber">{days}d left</Badge>
                        : <span className="text-slate-400">{days}d</span>}
                  </td>
                  <td className={cn(tdCls, b.qty === 0 && "text-slate-600 line-through")}>{b.qty}</td>
                  <td className={tdCls}>{item?.rack || "—"}</td>
                  <td className={tdCls}>{fmtINR(b.qty * b.mrp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-600">Sorted nearest-expiry first · expired rows red, under 90 days amber · WhatsApp alert writes to the send log</p>
    </GlassCard>
  );
}
