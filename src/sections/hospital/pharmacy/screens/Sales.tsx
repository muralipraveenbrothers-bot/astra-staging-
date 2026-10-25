// Sparta pharmacy Sales — the core billing screen (ref: OP Sales screenshot).
// Three internal tabs: OP Sales | Patient Indents | OT/Indents.
// OP Sales replicates the Sparta working style: patient block with Reg-No
// registry lookup (R), +91 mobile, barcode text entry (barcode/HSN/id match),
// Item Details grid (item autocomplete, FEFO batch dropdown, old/new tax, GmId,
// qty, MRP, amount), package & drug-combo insertion, Payment Details with
// discount/paid/due, Save-as-Draft / Submit / Clear. Submit validates, does
// FEFO stock decrement, appends an Invoice, and shows a success overlay with a
// printable (.print-zone) receipt. Indents convert straight into a prefilled
// OP sale. Patient registry (src/lib/store) is used read-only for the R lookup.

import { useEffect, useState } from "react";
import {
  Barcode, CheckCircle2, ClipboardList, FileText, Package, Pill,
  Plus, Printer, RotateCcw, X,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn, fmtINR } from "@/lib/utils";
import {
  fefoBatch, fmtDate, itemById, taxPct, todayISO, uid, usePharm,
} from "../pharmData";
import type {
  Invoice, InvMode, PharmItem, PharmState, SaleItem,
} from "../pharmData";

/* ============================== row model ============================== */

interface SaleRow extends SaleItem { key: string; }

const r2 = (n: number) => Math.round(n * 100) / 100;
const STORES = ["Main Store", "OT Store", "IP Pharmacy"];
const MODES: InvMode[] = ["Cash", "Card", "UPI", "Due"];
const TABS = [
  { k: "op", label: "OP Sales" },
  { k: "ind", label: "Patient Indents" },
  { k: "ot", label: "OT/Indents" },
] as const;
type TabKey = (typeof TABS)[number]["k"];

const emptyRow = (): SaleRow => ({
  key: uid("row"), itemId: "", name: "", batchNo: "", oldTax: 0, newTax: 0,
  gmId: "", qty: 1, mrp: 0, amount: 0,
});

/** Build a grid row from an item master entry — FEFO batch auto-picked. */
function rowFromItem(ph: PharmState, item: PharmItem, qty = 1): SaleRow {
  const b = fefoBatch(ph, item.id);
  const pct = taxPct(ph, item.taxCat);
  const mrp = b?.mrp ?? item.mrp;
  return {
    key: uid("row"), itemId: item.id, name: item.name, batchNo: b?.batchNo ?? "",
    oldTax: pct, newTax: pct, gmId: `G${1000 + ph.items.indexOf(item)}`,
    qty, mrp, amount: r2(mrp * qty),
  };
}

/* ============================== demo indents ============================== */

interface IndentOrder {
  id: string;
  tag: string;
  patientRegNo: string;
  patientName: string;
  ageGender: string;
  mobile: string;
  doctor: string;
  itemName: string;
  dose: string;
  qty: number;
  time: string;
}

const PATIENT_INDENTS: IndentOrder[] = [
  { id: "IND-301", tag: "WARD 3B", patientRegNo: "PT-1087", patientName: "R. Devi", ageGender: "46/F", mobile: "9849011223", doctor: "Dr. Anitha Rao", itemName: "DOLO 650MG TAB", dose: "650 mg PO TDS × 5 days", qty: 15, time: "08:40" },
  { id: "IND-302", tag: "WARD 2A", patientRegNo: "PT-1076", patientName: "M. Singh", ageGender: "58/M", mobile: "9000544777", doctor: "Dr. Karthik Menon", itemName: "ENOXAPARIN SODIUM 40MG INJ", dose: "40 mg SC OD × 3 days", qty: 3, time: "09:15" },
  { id: "IND-303", tag: "WARD 3B", patientRegNo: "PT-1092", patientName: "S. Begum", ageGender: "33/F", mobile: "9908812345", doctor: "Dr. Anitha Rao", itemName: "NUCOOL O", dose: "5 ml PO TDS × 3 days", qty: 1, time: "10:05" },
];

const OT_INDENTS: IndentOrder[] = [
  { id: "OT-511", tag: "OT-1", patientRegNo: "PT-1101", patientName: "K. Prasad", ageGender: "52/M", mobile: "9848123456", doctor: "Dr. Vivek Sharma", itemName: "MEDAZOLAM 5ML INJ", dose: "2 mg IV pre-induction", qty: 1, time: "07:55" },
  { id: "OT-512", tag: "OT-1", patientRegNo: "PT-1101", patientName: "K. Prasad", ageGender: "52/M", mobile: "9848123456", doctor: "Dr. Vivek Sharma", itemName: "MYOPYROLATE INJ", dose: "0.2 mg IV premed", qty: 1, time: "07:55" },
  { id: "OT-513", tag: "OT-2", patientRegNo: "PT-1104", patientName: "L. Narayana", ageGender: "61/M", mobile: "9900543210", doctor: "Dr. Meena Iyer", itemName: "PCM INF", dose: "100 ml IV STAT post-op", qty: 1, time: "11:20" },
];

/* ============================== small inputs ============================== */

const LBL = "block text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1";
const REQ = <span className="text-red-400 mr-0.5">*</span>;
const IN = "input-dark !px-2 !py-1.5 !text-xs";

/** Item-name autocomplete cell — Enter picks the first suggestion. */
function ItemNameCell({
  row, items, onType, onPick,
}: {
  row: SaleRow;
  items: PharmItem[];
  onType: (v: string) => void;
  onPick: (i: PharmItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = row.name.trim().toUpperCase();
  const sugg = q
    ? items.filter((i) => i.name.toUpperCase().includes(q) || i.composition.toUpperCase().includes(q)).slice(0, 8)
    : [];
  return (
    <div className="relative">
      <input
        className={IN}
        placeholder="Type item name…"
        value={row.name}
        onChange={(e) => { onType(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (sugg[0]) { onPick(sugg[0]); setOpen(false); }
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && sugg.length > 0 && (
        <div className="absolute z-30 left-0 mt-1 w-72 glass !p-1 max-h-56 overflow-y-auto shadow-xl">
          {sugg.map((i) => (
            <button
              key={i.id}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-white/10 text-xs"
              onMouseDown={(e) => { e.preventDefault(); onPick(i); setOpen(false); }}
            >
              <span className="text-slate-200">{i.name}</span>
              <span className="block text-[10px] text-slate-500 truncate">{i.composition} · MRP ₹{i.mrp} · HSN {i.hsn}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Gold panel header bar (Sparta's blue bar, Astra gold). */
function PanelBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-amber-500/25 via-amber-400/10 to-transparent border-b border-amber-400/30">
      <p className="font-display text-sm font-semibold tracking-wide text-amber-200">{title}</p>
      {right}
    </div>
  );
}

/* ============================== receipt (print-zone) ============================== */

function Receipt({ inv }: { inv: Invoice }) {
  return (
    <div className="print-zone rounded-xl bg-white text-black p-6 text-xs max-h-[46vh] overflow-y-auto">
      <div className="text-center border-b border-black/25 pb-2 mb-3">
        <p className="text-base font-bold tracking-widest">Astra AI — HOSPITAL PHARMACY</p>
        <p className="text-[10px]">Pharmacy Sale Invoice · {inv.store}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-3">
        <p><b>Invoice No:</b> {inv.invNo}</p>
        <p><b>Date:</b> {fmtDate(inv.date)} {inv.time}</p>
        <p><b>Patient:</b> {inv.patientName} {inv.ageGender && `(${inv.ageGender})`}</p>
        <p><b>Reg No:</b> {inv.patientRegNo || "—"}</p>
        <p><b>Mobile:</b> {inv.mobile ? `+91 ${inv.mobile}` : "—"}</p>
        <p><b>Doctor:</b> {inv.doctor || "—"}</p>
      </div>
      <table className="w-full border-collapse mb-3">
        <thead>
          <tr className="border-y border-black/40 text-left">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Item</th>
            <th className="py-1 pr-2">Batch</th>
            <th className="py-1 pr-2 text-right">Qty</th>
            <th className="py-1 pr-2 text-right">MRP</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i} className="border-b border-black/10">
              <td className="py-1 pr-2">{i + 1}</td>
              <td className="py-1 pr-2">{it.name}</td>
              <td className="py-1 pr-2">{it.batchNo}</td>
              <td className="py-1 pr-2 text-right">{it.qty}</td>
              <td className="py-1 pr-2 text-right">{it.mrp.toFixed(2)}</td>
              <td className="py-1 text-right">{it.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-56 space-y-0.5">
        <p className="flex justify-between"><span>Total</span><span>₹ {inv.total.toFixed(2)}</span></p>
        <p className="flex justify-between"><span>Discount ({inv.discPct}%)</span><span>− ₹ {inv.discAmt.toFixed(2)}</span></p>
        <p className="flex justify-between font-bold border-t border-black/40 pt-1"><span>Net</span><span>₹ {inv.net.toFixed(2)}</span></p>
        <p className="flex justify-between"><span>Paid ({inv.mode})</span><span>₹ {inv.paid.toFixed(2)}</span></p>
        <p className="flex justify-between"><span>Due</span><span>₹ {inv.due.toFixed(2)}</span></p>
      </div>
      <p className="mt-2"><b>Remarks:</b> {inv.remarks}</p>
      <p className="text-center mt-4 text-[10px] tracking-widest">THANK YOU · GET WELL SOON</p>
    </div>
  );
}

/* ============================== indents table ============================== */

function IndentTable({ title, orders, onConvert }: { title: string; orders: IndentOrder[]; onConvert: (o: IndentOrder) => void }) {
  return (
    <GlassCard className="!p-0 overflow-hidden">
      <PanelBar title={title} right={<ClipboardList size={15} className="text-amber-300/70" />} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/10">
              <th className="py-2 pl-4 pr-2">Order</th>
              <th className="py-2 pr-2">Patient</th>
              <th className="py-2 pr-2">Reg No</th>
              <th className="py-2 pr-2">Age/Gender</th>
              <th className="py-2 pr-2">Drug</th>
              <th className="py-2 pr-2">Dose</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2">Doctor</th>
              <th className="py-2 pr-2">Time</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="py-2.5 pl-4 pr-2 font-mono text-amber-300/90">{o.id}<span className="block text-[9px] text-slate-500">{o.tag}</span></td>
                <td className="py-2.5 pr-2 text-slate-200">{o.patientName}</td>
                <td className="py-2.5 pr-2 text-slate-400">{o.patientRegNo}</td>
                <td className="py-2.5 pr-2 text-slate-400">{o.ageGender}</td>
                <td className="py-2.5 pr-2 text-white font-medium">{o.itemName}</td>
                <td className="py-2.5 pr-2 text-slate-400">{o.dose}</td>
                <td className="py-2.5 pr-2 text-right font-mono text-slate-200">{o.qty}</td>
                <td className="py-2.5 pr-2 text-slate-400">{o.doctor}</td>
                <td className="py-2.5 pr-2 text-slate-400">{o.time}</td>
                <td className="py-2.5 pr-4">
                  <button className="btn-neon !px-3 !py-1 !text-[11px]" onClick={() => onConvert(o)}>Convert to sale</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

/* ============================== main screen ============================== */

export function Sales({ goReturns }: { goReturns: () => void }) {
  const { ph, setPh, prefill, setPrefill } = usePharm();
  const { patients } = useStore();

  const [tab, setTab] = useState<TabKey>("op");

  /* ---- patient block ---- */
  const [regNo, setRegNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [patName, setPatName] = useState("");
  const [ageGender, setAgeGender] = useState("");
  const [doctor, setDoctor] = useState("");
  const [store, setStore] = useState("Main Store");
  const [barcode, setBarcode] = useState("");

  /* ---- item grid ---- */
  const [rows, setRows] = useState<SaleRow[]>([emptyRow()]);

  /* ---- payment ---- */
  const [discPct, setDiscPct] = useState(0);
  const [discAmt, setDiscAmt] = useState(0);
  const [mode, setMode] = useState<InvMode>("Cash");
  const [paid, setPaid] = useState(0);
  const [remarks, setRemarks] = useState("NA");

  /* ---- overlays ---- */
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [done, setDone] = useState<Invoice | null>(null);

  const drafts = ph.invoices.filter((i) => i.status === "draft");
  const validRows = rows.filter((r) => r.itemId && r.qty > 0);
  const total = r2(validRows.reduce((s, r) => s + r.amount, 0));
  const net = r2(Math.max(0, total - discAmt));
  const due = r2(Math.max(0, net - paid));

  /* Paid defaults to Net unless mode is Due. */
  useEffect(() => { if (mode !== "Due") setPaid(net); }, [net, mode]);

  /* Cross-screen prefill (OP Sales prefill contract from pharmData). */
  useEffect(() => {
    if (!prefill) return;
    setRegNo(prefill.patientRegNo ?? "");
    setMobile(prefill.mobile ?? "");
    setPatName(prefill.patientName ?? "");
    setAgeGender(prefill.ageGender ?? "");
    setDoctor(prefill.doctor ?? "");
    if (prefill.store) setStore(prefill.store);
    if (prefill.items?.length) setRows(prefill.items.map((it) => ({ ...it, key: uid("row") })));
    if (prefill.remarks) setRemarks(prefill.remarks);
    setTab("op");
    setPrefill(null);
  }, [prefill, setPrefill]);

  /* ---- row ops ---- */
  const setRow = (key: string, patch: Partial<SaleRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pickItem = (key: string, item: PharmItem) => {
    const cur = rows.find((r) => r.key === key);
    const built = rowFromItem(ph, item, cur && cur.qty > 0 ? cur.qty : 1);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...built, key } : r)));
  };

  const pickBatch = (key: string, batchNo: string) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const b = ph.batches.find((x) => x.itemId === row.itemId && x.batchNo === batchNo);
    const mrp = b?.mrp ?? row.mrp;
    setRow(key, { batchNo, mrp, amount: r2(mrp * row.qty) });
  };

  const addRows = (newRows: SaleRow[]) =>
    setRows((rs) => [...rs.filter((r) => r.itemId || r.name.trim()), ...newRows]);

  const removeRow = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  /* ---- barcode (keyboard text entry — no scanner hardware) ---- */
  const tryBarcode = (code: string) => {
    const c = code.trim();
    if (!c) return;
    const item = ph.items.find((i) => i.barcode === c || i.hsn === c || i.id === c);
    if (!item) { toast.error(`No item matches "${c}" (barcode / HSN / id)`); return; }
    addRows([rowFromItem(ph, item)]);
    setBarcode("");
    toast.success(`Added ${item.name}`);
  };

  /* ---- R lookup: patient registry first, then invoice history ---- */
  const lookupPatient = () => {
    const q = regNo.trim().toLowerCase();
    if (!q) { toast.error("Enter a Patient Reg No first"); return; }
    const reg = patients.find((p) => p.id.toLowerCase() === q);
    if (reg) {
      setPatName(reg.name);
      setMobile(reg.phone ?? "");
      setAgeGender(reg.age ? `${reg.age}/${(reg.gender ?? "").slice(0, 1).toUpperCase()}` : (reg.gender ?? ""));
      if (reg.linkedDoctor) setDoctor(reg.linkedDoctor);
      toast.success(`Loaded ${reg.name} from patient registry`);
      return;
    }
    const inv = [...ph.invoices].reverse().find((i) => i.patientRegNo.toLowerCase() === q);
    if (inv) {
      setPatName(inv.patientName); setMobile(inv.mobile);
      setAgeGender(inv.ageGender); setDoctor(inv.doctor);
      toast.success(`Loaded from invoice ${inv.invNo}`);
      return;
    }
    toast.error(`No patient or bill found for "${regNo.trim()}"`);
  };

  /* ---- package / drug-combo insertion ---- */
  const insertPackage = (pkgId: string) => {
    const pkg = ph.packages.find((p) => p.id === pkgId);
    if (!pkg) return;
    const built = pkg.items
      .map((pi) => {
        const item = itemById(ph, pi.itemId);
        return item ? rowFromItem(ph, item, pi.qty) : null;
      })
      .filter((x): x is SaleRow => !!x);
    if (!built.length) { toast.error("Package items not found in item master"); return; }
    addRows(built);
    toast.success(`Inserted package ${pkg.name} (${built.length} items)`);
  };

  const insertCombo = (comboId: string) => {
    const combo = ph.drugCombos.find((c) => c.id === comboId);
    if (!combo) return;
    const built: SaleRow[] = [];
    const missing: string[] = [];
    combo.items.forEach((name) => {
      const item = ph.items.find((i) => i.name === name);
      if (item) built.push(rowFromItem(ph, item));
      else missing.push(name);
    });
    if (built.length) addRows(built);
    if (missing.length) toast.error(`Not in item master: ${missing.join(", ")}`);
    else toast.success(`Inserted ${combo.name} (${built.length} items)`);
    setComboOpen(false);
  };

  /* ---- indents → OP sale ---- */
  const convertIndent = (o: IndentOrder) => {
    const item = ph.items.find((i) => i.name === o.itemName);
    setRegNo(o.patientRegNo); setPatName(o.patientName); setAgeGender(o.ageGender);
    setMobile(o.mobile); setDoctor(o.doctor);
    setRows(item ? [rowFromItem(ph, item, o.qty)] : [emptyRow()]);
    if (!item) toast.error(`${o.itemName} not in item master`);
    setRemarks(`${o.tag} indent ${o.id}`);
    setTab("op");
    toast.success(`Indent ${o.id} converted — review & submit`);
  };

  /* ---- invoice build / validate ---- */
  const buildInvoice = (status: "submitted" | "draft"): Invoice => {
    const now = new Date();
    return {
      id: uid("inv"), invNo: `PH-${ph.invCounter}`, date: todayISO(),
      time: now.toTimeString().slice(0, 5),
      kind: regNo.trim() ? "OP" : "Direct",
      patientRegNo: regNo.trim(), mobile: mobile.trim(), patientName: patName.trim(),
      ageGender: ageGender.trim(), doctor: doctor.trim(), store,
      items: validRows.map(({ key, ...it }) => it),
      total, discPct, discAmt, net, mode,
      paid: status === "draft" ? 0 : r2(paid),
      due: status === "draft" ? net : due,
      remarks: remarks.trim() || "NA", status,
    };
  };

  const validate = (): string | null => {
    if (!patName.trim()) return "Patient Name is required";
    if (!mobile.trim()) return "Mobile number is required";
    if (!validRows.length) return "Add at least one item row";
    for (const r of validRows) {
      if (!r.batchNo) return `Select a batch for ${r.name}`;
      const b = ph.batches.find((x) => x.itemId === r.itemId && x.batchNo === r.batchNo);
      if (!b) return `Batch ${r.batchNo} not found for ${r.name}`;
      const want = validRows
        .filter((x) => x.itemId === r.itemId && x.batchNo === r.batchNo)
        .reduce((s, x) => s + x.qty, 0);
      if (want > b.qty) return `${r.name} batch ${r.batchNo}: only ${b.qty} in stock`;
    }
    if (paid < 0) return "Paid amount cannot be negative";
    if (Math.abs(paid + due - net) > 0.011) return "Paid + Due must equal Net Amount";
    return null;
  };

  const submit = () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    const inv = buildInvoice("submitted");
    setPh((s) => ({
      ...s,
      invCounter: s.invCounter + 1,
      invoices: [...s.invoices, inv],
      batches: s.batches.map((b) => {
        const take = validRows
          .filter((r) => r.itemId === b.itemId && r.batchNo === b.batchNo)
          .reduce((sum, r) => sum + r.qty, 0);
        return take ? { ...b, qty: b.qty - take } : b;
      }),
    }));
    setDone(inv);
  };

  const clear = () => {
    setRegNo(""); setMobile(""); setPatName(""); setAgeGender(""); setDoctor("");
    setStore("Main Store"); setBarcode(""); setRows([emptyRow()]);
    setDiscPct(0); setDiscAmt(0); setMode("Cash"); setPaid(0); setRemarks("NA");
  };

  const saveDraft = () => {
    if (!validRows.length && !patName.trim()) { toast.error("Nothing to save — add a patient or items"); return; }
    const inv = buildInvoice("draft");
    setPh((s) => ({ ...s, invCounter: s.invCounter + 1, invoices: [...s.invoices, inv] }));
    toast.success(`Saved draft ${inv.invNo}`);
    clear();
  };

  const resumeDraft = (inv: Invoice) => {
    setRegNo(inv.patientRegNo); setMobile(inv.mobile); setPatName(inv.patientName);
    setAgeGender(inv.ageGender); setDoctor(inv.doctor); setStore(inv.store);
    setRows(inv.items.length ? inv.items.map((it) => ({ ...it, key: uid("row") })) : [emptyRow()]);
    setDiscPct(inv.discPct); setDiscAmt(inv.discAmt); setMode(inv.mode); setRemarks(inv.remarks);
    setPh((s) => ({ ...s, invoices: s.invoices.filter((x) => x.id !== inv.id) }));
    setDraftsOpen(false);
    setTab("op");
    toast.success(`Resumed draft ${inv.invNo}`);
  };

  /* ============================== render ============================== */

  return (
    <div className="space-y-4">
      {/* header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-gradient">Pharmacy Sales</h2>
          <p className="text-sm text-slate-400 mt-1">OP billing · doctor indents · FEFO batch allocation</p>
        </div>
        <button
          className="btn-ghost !border-cyan-400/40 !text-cyan-300 hover:!bg-cyan-500/10"
          onClick={() => setDraftsOpen(true)}
        >
          <FileText size={14} /> Get Sale Drafts
          {drafts.length > 0 && (
            <span className="ml-1 rounded-full bg-cyan-400/20 border border-cyan-400/40 px-1.5 text-[10px]">{drafts.length}</span>
          )}
        </button>
      </div>

      {/* internal tabs */}
      <div className="flex gap-1.5 glass !p-1.5 w-fit rounded-xl">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border",
              tab === t.k
                ? "bg-gradient-to-r from-amber-500/25 to-yellow-600/15 text-amber-200 border-amber-400/40 shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                : "text-slate-400 border-transparent hover:text-white hover:bg-white/[0.05]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============================ OP SALES ============================ */}
      {tab === "op" && (
        <div className="space-y-4">
          {/* patient block */}
          <GlassCard className="!p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>{REQ}Patient Reg No</label>
                <div className="flex gap-1.5">
                  <input
                    className={IN}
                    placeholder="Patient Reg No"
                    value={regNo}
                    onChange={(e) => setRegNo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupPatient(); } }}
                  />
                  <button
                    title="Look up registered patient"
                    className="btn-ghost !px-2.5 !py-1 !text-xs !border-amber-400/40 !text-amber-300 font-bold shrink-0"
                    onClick={lookupPatient}
                  >
                    R
                  </button>
                </div>
              </div>
              <div>
                <label className={LBL}>{REQ}Mobile</label>
                <div className="flex gap-1.5">
                  <select className={cn(IN, "!w-[104px] shrink-0")} value="India (+91)" onChange={() => undefined}>
                    <option>India (+91)</option>
                  </select>
                  <input
                    className={IN}
                    placeholder="10-digit mobile"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  />
                </div>
              </div>
              <div>
                <label className={LBL}>{REQ}Patient Name</label>
                <input className={IN} value={patName} onChange={(e) => setPatName(e.target.value)} placeholder="Patient name" />
              </div>
              <div>
                <label className={LBL}>{REQ}Age/Gender</label>
                <input className={IN} value={ageGender} onChange={(e) => setAgeGender(e.target.value)} placeholder="e.g. 46/F" />
              </div>
              <div>
                <label className={LBL}>Doctor Name</label>
                <input className={IN} value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="Consulting doctor" />
              </div>
              <div>
                <label className={LBL}>Select Pharmacy Store</label>
                <select className={IN} value={store} onChange={(e) => setStore(e.target.value)}>
                  {STORES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={LBL}>Barcode</label>
                <div className="relative">
                  <input
                    className={cn(IN, "!pl-8")}
                    placeholder="Scan or enter barcode"
                    value={barcode}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBarcode(v);
                      const hit = ph.items.find((i) => i.barcode === v.trim());
                      if (hit) { addRows([rowFromItem(ph, hit)]); setBarcode(""); toast.success(`Added ${hit.name}`); }
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tryBarcode(barcode); } }}
                  />
                  <Barcode size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
            </div>
          </GlassCard>

          {/* item details */}
          <GlassCard className="!p-0 overflow-hidden">
            <PanelBar
              title="Item Details"
              right={
                <button
                  className="btn-ghost !py-1 !px-2.5 !text-xs !border-amber-400/40 !text-amber-200 hover:!bg-amber-500/10"
                  onClick={goReturns}
                >
                  <RotateCcw size={12} /> Return Medicines
                </button>
              }
            />
            <div className="p-4 space-y-3">
              {/* toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <button className="btn-ghost !py-1.5 !px-3 !text-xs !border-amber-400/40 !text-amber-200" onClick={() => addRows([emptyRow()])}>
                  <Plus size={13} /> Add New
                </button>
                <div className="flex items-center gap-1.5">
                  <Package size={13} className="text-slate-500" />
                  <select
                    className={cn(IN, "!w-44")}
                    value=""
                    onChange={(e) => { if (e.target.value) insertPackage(e.target.value); }}
                  >
                    <option value="">Add Package…</option>
                    {ph.packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <button className="btn-ghost !py-1.5 !px-3 !text-xs ml-auto" onClick={() => setComboOpen(true)}>
                  <Pill size={13} /> Drug Combination
                </button>
              </div>

              {/* grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/10">
                      <th className="py-2 pr-2 w-8">SNo</th>
                      <th className="py-2 pr-2 min-w-[220px]">Item Name</th>
                      <th className="py-2 pr-2 w-44">Batch No</th>
                      <th className="py-2 pr-2 w-16">Old Tax(%)</th>
                      <th className="py-2 pr-2 w-16 text-red-400">New Tax(%)</th>
                      <th className="py-2 pr-2 w-20">GmId</th>
                      <th className="py-2 pr-2 w-16">Qty</th>
                      <th className="py-2 pr-2 w-24">MRP (₹)</th>
                      <th className="py-2 pr-2 w-24">Amount (₹)</th>
                      <th className="py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const itemBatches = r.itemId ? ph.batches.filter((b) => b.itemId === r.itemId) : [];
                      return (
                        <tr key={r.key} className="border-b border-white/5 align-middle">
                          <td className="py-1.5 pr-2 text-slate-500">{i + 1}</td>
                          <td className="py-1.5 pr-2">
                            <ItemNameCell
                              row={r}
                              items={ph.items}
                              onType={(v) => setRow(r.key, { name: v, itemId: "", batchNo: "", mrp: 0, amount: 0 })}
                              onPick={(item) => pickItem(r.key, item)}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            {r.itemId ? (
                              <select className={cn(IN, "!px-1.5")} value={r.batchNo} onChange={(e) => pickBatch(r.key, e.target.value)}>
                                {!r.batchNo && <option value="">— FEFO —</option>}
                                {itemBatches.map((b) => (
                                  <option key={b.id} value={b.batchNo}>
                                    {b.batchNo} · {b.qty} · exp {fmtDate(b.expDate)}
                                  </option>
                                ))}
                                {r.batchNo && !itemBatches.some((b) => b.batchNo === r.batchNo) && (
                                  <option value={r.batchNo}>{r.batchNo}</option>
                                )}
                              </select>
                            ) : (
                              <input className={cn(IN, "opacity-40")} disabled placeholder="—" />
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            <input className={cn(IN, "!px-1.5 text-center opacity-70")} readOnly value={r.oldTax} />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number" min={0} className={cn(IN, "!px-1.5 text-center")}
                              value={r.newTax}
                              onChange={(e) => setRow(r.key, { newTax: Math.max(0, Number(e.target.value) || 0) })}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              className={cn(IN, "!px-1.5 text-center")}
                              value={r.gmId}
                              onChange={(e) => setRow(r.key, { gmId: e.target.value })}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number" min={0} className={cn(IN, "!px-1.5 text-center")}
                              value={r.qty}
                              onChange={(e) => {
                                const q = Math.max(0, Number(e.target.value) || 0);
                                setRow(r.key, { qty: q, amount: r2(q * r.mrp) });
                              }}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input
                              type="number" min={0} step="0.01" className={cn(IN, "!px-1.5 text-right")}
                              value={r.mrp}
                              onChange={(e) => {
                                const m = Math.max(0, Number(e.target.value) || 0);
                                setRow(r.key, { mrp: m, amount: r2(m * r.qty) });
                              }}
                            />
                          </td>
                          <td className="py-1.5 pr-2 text-right font-mono text-slate-200">{r.itemId ? r.amount.toFixed(2) : "0.00"}</td>
                          <td className="py-1.5">
                            <button className="text-slate-500 hover:text-red-400 transition-colors" onClick={() => removeRow(r.key)} aria-label="Remove row">
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </GlassCard>

          {/* payment details */}
          <GlassCard className="!p-0 overflow-hidden">
            <PanelBar title="Payment Details" />
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={LBL}>Total Amount(₹)</label>
                  <input className={cn(IN, "font-mono opacity-80")} readOnly value={total.toFixed(2)} />
                </div>
                <div>
                  <label className={LBL}>Discount(%)</label>
                  <input
                    type="number" min={0} max={100} className={IN}
                    value={discPct}
                    onChange={(e) => {
                      const p = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setDiscPct(p);
                      setDiscAmt(r2((total * p) / 100));
                    }}
                  />
                </div>
                <div>
                  <label className={LBL}>Discount Amount(₹)</label>
                  <input
                    type="number" min={0} step="0.01" className={IN}
                    value={discAmt}
                    onChange={(e) => {
                      const a = Math.min(total, Math.max(0, Number(e.target.value) || 0));
                      setDiscAmt(a);
                      setDiscPct(total ? r2((a / total) * 100) : 0);
                    }}
                  />
                </div>
                <div>
                  <label className={LBL}>Net Amount(₹)</label>
                  <input className={cn(IN, "font-mono text-amber-300 font-semibold opacity-90")} readOnly value={net.toFixed(2)} />
                </div>
                <div>
                  <label className={LBL}>{REQ}Payment Mode</label>
                  <select
                    className={IN}
                    value={mode}
                    onChange={(e) => {
                      const m = e.target.value as InvMode;
                      setMode(m);
                      setPaid(m === "Due" ? 0 : net);
                    }}
                  >
                    {MODES.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LBL}>{REQ}Paid Amount</label>
                  <input
                    type="number" min={0} step="0.01" className={IN}
                    value={paid}
                    onChange={(e) => setPaid(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                <div>
                  <label className={LBL}>{REQ}Due Amount</label>
                  <input className={cn(IN, "font-mono opacity-80", due > 0 && "text-red-300")} readOnly value={due.toFixed(2)} />
                </div>
                <div>
                  <label className={LBL}>{REQ}Remarks</label>
                  <input className={IN} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="NA" />
                </div>
              </div>

              {/* footer buttons */}
              <div className="flex justify-center gap-3 mt-5">
                <button className="btn-ghost !border-amber-400/40 !text-amber-200" onClick={saveDraft}>
                  <FileText size={14} /> Save as Draft
                </button>
                <button className="btn-neon" onClick={submit}>
                  <CheckCircle2 size={15} /> Submit
                </button>
                <button className="btn-ghost" onClick={clear}>
                  <X size={14} /> Clear
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ============================ INDENTS ============================ */}
      {tab === "ind" && (
        <IndentTable title="Patient Indents — Doctor Medication Orders" orders={PATIENT_INDENTS} onConvert={convertIndent} />
      )}
      {tab === "ot" && (
        <IndentTable title="OT / Indents — Theatre Medication Orders" orders={OT_INDENTS} onConvert={convertIndent} />
      )}

      {/* ============================ modals ============================ */}

      {/* drafts */}
      <Modal open={draftsOpen} onClose={() => setDraftsOpen(false)} title="Sale Drafts" wide>
        {drafts.length === 0 ? (
          <p className="text-sm text-slate-400">No saved drafts.</p>
        ) : (
          <div className="space-y-2">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-mono">{d.invNo} <span className="text-slate-500">· {fmtDate(d.date)} {d.time}</span></p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {d.patientName || "—"} {d.patientRegNo && `(${d.patientRegNo})`} · {d.items.length} items · {fmtINR(d.net)}
                  </p>
                </div>
                <button className="btn-neon !px-3 !py-1 !text-[11px]" onClick={() => resumeDraft(d)}>Resume</button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* drug combinations */}
      <Modal open={comboOpen} onClose={() => setComboOpen(false)} title="Drug Combinations">
        {ph.drugCombos.length === 0 ? (
          <p className="text-sm text-slate-400">No combinations defined in Masters.</p>
        ) : (
          <div className="space-y-2">
            {ph.drugCombos.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-amber-200">{c.name}</p>
                  <button className="btn-neon !px-3 !py-1 !text-[11px]" onClick={() => insertCombo(c.id)}>Insert</button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{c.items.join(" + ")}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* success overlay + printable receipt */}
      {done && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setDone(null); clear(); }} />
          <div className="relative z-10 w-full max-w-lg space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="glass p-5 text-center">
              <CheckCircle2 className="mx-auto text-emerald-400 mb-2" size={36} />
              <h3 className="font-display text-lg font-semibold text-white">Sale Submitted</h3>
              <p className="text-sm text-slate-400 mt-1">
                Invoice <span className="text-amber-300 font-mono font-semibold">{done.invNo}</span>
                {" "}· Net {fmtINR(done.net)} · {done.mode}
                {done.due > 0 && <span className="text-red-300"> · Due {fmtINR(done.due)}</span>}
              </p>
              <div className="flex justify-center gap-2 mt-4">
                <button className="btn-neon !py-1.5 !text-xs" onClick={() => window.print()}>
                  <Printer size={13} /> Print Receipt
                </button>
                <button className="btn-ghost !py-1.5 !text-xs" onClick={() => { setDone(null); clear(); }}>
                  New Sale
                </button>
              </div>
            </div>
            <Receipt inv={done} />
          </div>
        </div>
      )}
    </div>
  );
}
