// Sparta pharmacy Masters — the 9 setup masters behind an internal tab bar:
// Inventory Type / Item Type / Manufacture / Supplier / Tax Categories /
// Rack Master / Item Master / Item Package Master / Drug Combination.
// All CRUD flows through usePharm() setPh against the existing PharmState
// collections (invTypes, itemTypes, manufactures, suppliers, taxCats, racks,
// items, packages, drugCombos) — no pharmData changes required.

import { useMemo, useState } from "react";
import {
  Boxes, Check, Database, Download, Layers, Pencil, Pill, Plus,
  Search, Tag, Trash2, Truck, X,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard, Modal } from "@/components/ui";
import { cn, fmtINR } from "@/lib/utils";
import { downloadCsv, uid, usePharm } from "../pharmData";
import type { ItemTypeRow, PharmItem, PharmPackage, PharmState, Supplier, TaxCat } from "../pharmData";

type MasterTab =
  | "invType" | "itemType" | "manufacture" | "supplier" | "tax"
  | "rack" | "item" | "package" | "combo";

const TABS: { key: MasterTab; label: string }[] = [
  { key: "invType", label: "Inventory Type" },
  { key: "itemType", label: "Item Type" },
  { key: "manufacture", label: "Manufacture" },
  { key: "supplier", label: "Supplier" },
  { key: "tax", label: "Tax Categories" },
  { key: "rack", label: "Rack Master" },
  { key: "item", label: "Item Master" },
  { key: "package", label: "Item Package Master" },
  { key: "combo", label: "Drug Combination" },
];

/** Canonical inventory dropdown (ref 158). */
const INV_OPTIONS = [
  "TABLET", "CAPSULES", "INJECTION", "SURGICALS", "GENERALS", "OINTMENT", "CREAM",
  "DROPS", "POWDER", "LOTIONS", "SACHETS", "FLUIDS", "SPRAY", "SYRUP",
];

/* ---------------- shared atoms ---------------- */

const thCls = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-500/80 border-b border-white/10 whitespace-nowrap";
const tdCls = "px-3 py-2 text-xs text-slate-300 border-b border-white/5";

function L({ children, req }: { children: React.ReactNode; req?: boolean }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1">
      {req && <span className="text-red-400 mr-0.5">*</span>}
      {children}
    </label>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-56">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        className="input-dark !pl-8 !py-1.5 !text-xs"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function MasterHeader({ title, addLabel, onAdd, search, extra }: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  search?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
      <div className="flex items-center gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500/80">Masters · {title}</p>
        <button className="btn-neon !px-3 !py-1.5 !text-xs" onClick={onAdd}>
          <Plus size={13} /> {addLabel}
        </button>
        {extra}
      </div>
      {search}
    </div>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-xs text-slate-600 italic">{text}</td>
    </tr>
  );
}

/** Inline edit commit / cancel buttons (Sparta green ✓ / red ✗). */
function EditActions({ editing, onEdit, onSave, onCancel, onDelete }: {
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <button className="p-1 rounded text-emerald-400 hover:bg-emerald-400/10" onClick={onSave} title="Save"><Check size={14} /></button>
        <button className="p-1 rounded text-red-400 hover:bg-red-400/10" onClick={onCancel} title="Cancel"><X size={14} /></button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <button className="p-1 rounded text-slate-400 hover:text-neon-cyan hover:bg-cyan-400/10" onClick={onEdit} title="Edit"><Pencil size={13} /></button>
      {onDelete && (
        <button className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-400/10" onClick={onDelete} title="Delete"><Trash2 size={13} /></button>
      )}
    </div>
  );
}

/** Inline-expanding checkbox multi-select (safe inside scrollable modals). */
function MultiSelect({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <div>
      <button
        type="button"
        className="input-dark flex items-center justify-between !text-xs"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected.length ? "text-slate-200" : "text-slate-500"}>
          {selected.length ? `${selected.length} selected` : "Select inventory types"}
        </span>
        <span className="text-slate-500 text-[10px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-ink-900/80 p-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={selected.includes(o)}
                onChange={() => toggle(o)}
              />
              {o}
            </label>
          ))}
          {!options.length && <p className="text-[11px] text-slate-600 col-span-2">No inventory types yet</p>}
        </div>
      )}
    </div>
  );
}

/* ---------------- 1/3/6 · simple string-list masters ---------------- */
/* Inventory Type (ref 157) · Manufacture · Rack Master (ref 162) */

function StringListMaster({ title, addLabel, noun, rows, setRows }: {
  title: string;
  addLabel: string;
  noun: string;
  rows: string[];
  setRows: (fn: (prev: string[]) => string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  const filtered = useMemo(
    () => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  const commitAdd = () => {
    const v = draft.trim().toUpperCase();
    if (!v) return;
    if (rows.some((r) => r.toUpperCase() === v)) {
      toast.error(`${noun} already exists`, { description: v });
      return;
    }
    setRows((prev) => [...prev, v]);
    setDraft(""); setAdding(false);
    toast.success(`${noun} added`, { description: v });
  };

  const commitEdit = (idx: number) => {
    const v = editVal.trim().toUpperCase();
    if (!v) { setEditIdx(null); return; }
    setRows((prev) => prev.map((r, i) => (i === idx ? v : r)));
    setEditIdx(null);
    toast.success(`${noun} updated`, { description: v });
  };

  return (
    <GlassCard className="!p-4">
      <MasterHeader
        title={title}
        addLabel={addLabel}
        onAdd={() => { setAdding(true); setDraft(""); }}
        search={<SearchBox value={q} onChange={setQ} placeholder={noun} />}
      />
      {adding && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg border border-amber-400/30 bg-amber-400/5">
          <input
            autoFocus
            className="input-dark !py-1.5 !text-xs flex-1"
            placeholder={`New ${noun}…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitAdd()}
          />
          <button className="btn-neon !px-3 !py-1.5 !text-xs" onClick={commitAdd}><Check size={13} /> Save</button>
          <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => setAdding(false)}><X size={13} /> Cancel</button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-white/5">
        <table className="w-full">
          <thead className="bg-white/[0.03]">
            <tr>
              <th className={thCls}>Name</th>
              <th className={cn(thCls, "w-20 text-right")}>Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ r, i }) => (
              <tr key={`${i}-${r}`} className="hover:bg-white/[0.03]">
                <td className={tdCls}>
                  {editIdx === i ? (
                    <input
                      autoFocus
                      className="input-dark !py-1 !text-xs"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && commitEdit(i)}
                    />
                  ) : (
                    <span className="font-medium text-slate-200">{r}</span>
                  )}
                </td>
                <td className={cn(tdCls, "text-right")}>
                  <EditActions
                    editing={editIdx === i}
                    onEdit={() => { setEditIdx(i); setEditVal(r); }}
                    onSave={() => commitEdit(i)}
                    onCancel={() => setEditIdx(null)}
                    onDelete={() => {
                      setRows((prev) => prev.filter((_, x) => x !== i));
                      toast.info(`${noun} removed`, { description: r });
                    }}
                  />
                </td>
              </tr>
            ))}
            {!filtered.length && <EmptyRow cols={2} text={`No ${noun.toLowerCase()} records`} />}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Showing {filtered.length} of {rows.length} entries</p>
    </GlassCard>
  );
}

/* ---------------- 2 · Item Type (ref 158) ---------------- */

function ItemTypeMaster() {
  const { ph, setPh } = usePharm();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ItemTypeRow>({ name: "", inventory: "", active: true });
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const rows = ph.itemTypes;
  const filtered = useMemo(
    () => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.name.toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  const patch = (idx: number, p: Partial<ItemTypeRow>) =>
    setPh((s) => ({ ...s, itemTypes: s.itemTypes.map((r, i) => (i === idx ? { ...r, ...p } : r)) }));

  const commitAdd = () => {
    const name = draft.name.trim().toUpperCase();
    if (!name || !draft.inventory) {
      toast.error("Item type and inventory are required");
      return;
    }
    if (rows.some((r) => r.name.toUpperCase() === name)) {
      toast.error("Item type already exists", { description: name });
      return;
    }
    setPh((s) => ({ ...s, itemTypes: [...s.itemTypes, { name, inventory: draft.inventory, active: draft.active }] }));
    setDraft({ name: "", inventory: "", active: true });
    setAdding(false);
    toast.success("Item type added", { description: `${name} · ${draft.inventory}` });
  };

  return (
    <GlassCard className="!p-4">
      <MasterHeader
        title="Item Type"
        addLabel="Add Item Type"
        onAdd={() => setAdding(true)}
        search={<SearchBox value={q} onChange={setQ} placeholder="ItemType" />}
      />
      <div className="overflow-x-auto rounded-lg border border-white/5">
        <table className="w-full">
          <thead className="bg-white/[0.03]">
            <tr>
              <th className={thCls}>ItemType</th>
              <th className={thCls}>Inventory</th>
              <th className={thCls}>IsActive</th>
              <th className={cn(thCls, "w-24 text-right")}>Edit</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="bg-amber-400/5">
                <td className={tdCls}>
                  <input
                    autoFocus
                    className="input-dark !py-1 !text-xs"
                    placeholder="e.g. TAB"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </td>
                <td className={tdCls}>
                  <select
                    className="input-dark !py-1 !text-xs"
                    value={draft.inventory}
                    onChange={(e) => setDraft({ ...draft, inventory: e.target.value })}
                  >
                    <option value="">Select</option>
                    {INV_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className={tdCls}>
                  <select
                    className="input-dark !py-1 !text-xs w-20"
                    value={draft.active ? "true" : "false"}
                    onChange={(e) => setDraft({ ...draft, active: e.target.value === "true" })}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </td>
                <td className={cn(tdCls, "text-right")}>
                  <EditActions editing onEdit={() => {}} onSave={commitAdd} onCancel={() => setAdding(false)} />
                </td>
              </tr>
            )}
            {filtered.map(({ r, i }) => (
              <tr key={`${i}-${r.name}`} className="hover:bg-white/[0.03]">
                <td className={tdCls}>
                  {editIdx === i ? (
                    <input
                      autoFocus
                      className="input-dark !py-1 !text-xs w-28"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          patch(i, { name: editName.trim().toUpperCase() || r.name });
                          setEditIdx(null);
                        }
                      }}
                    />
                  ) : (
                    <span className="font-medium text-slate-200">{r.name}</span>
                  )}
                </td>
                <td className={tdCls}>
                  <select
                    className="input-dark !py-1 !text-xs !bg-transparent !border-white/5 w-36"
                    value={r.inventory}
                    onChange={(e) => patch(i, { inventory: e.target.value })}
                  >
                    {!INV_OPTIONS.includes(r.inventory) && <option value={r.inventory}>{r.inventory}</option>}
                    {INV_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className={tdCls}>
                  <button
                    onClick={() => patch(i, { active: !r.active })}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-semibold border transition-colors",
                      r.active
                        ? "bg-emerald-400/10 text-emerald-300 border-emerald-400/30"
                        : "bg-red-400/10 text-red-300 border-red-400/30"
                    )}
                  >
                    {r.active ? "True" : "False"}
                  </button>
                </td>
                <td className={cn(tdCls, "text-right")}>
                  <EditActions
                    editing={editIdx === i}
                    onEdit={() => { setEditIdx(i); setEditName(r.name); }}
                    onSave={() => {
                      patch(i, { name: editName.trim().toUpperCase() || r.name });
                      setEditIdx(null);
                    }}
                    onCancel={() => setEditIdx(null)}
                    onDelete={() => {
                      setPh((s) => ({ ...s, itemTypes: s.itemTypes.filter((_, x) => x !== i) }));
                      toast.info("Item type removed", { description: r.name });
                    }}
                  />
                </td>
              </tr>
            ))}
            {!filtered.length && <EmptyRow cols={4} text="No item types" />}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Showing {filtered.length} of {rows.length} entries</p>
    </GlassCard>
  );
}

/* ---------------- 5 · Tax Categories (ref 161) ---------------- */

function TaxMaster() {
  const { ph, setPh } = usePharm();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<TaxCat>({ name: "", pct: 0 });
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState<TaxCat>({ name: "", pct: 0 });

  const rows = ph.taxCats;
  const filtered = useMemo(
    () => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.name.toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  const commitAdd = () => {
    const name = draft.name.trim().toUpperCase();
    if (!name) return;
    if (rows.some((r) => r.name.toUpperCase() === name)) {
      toast.error("Tax category already exists", { description: name });
      return;
    }
    setPh((s) => ({ ...s, taxCats: [...s.taxCats, { name, pct: Number(draft.pct) || 0 }] }));
    setDraft({ name: "", pct: 0 });
    setAdding(false);
    toast.success("Tax category added", { description: `${name} · ${draft.pct}%` });
  };

  return (
    <GlassCard className="!p-4">
      <MasterHeader
        title="Tax Categories"
        addLabel="Add Record"
        onAdd={() => { setAdding(true); setDraft({ name: "", pct: 0 }); }}
        search={<SearchBox value={q} onChange={setQ} placeholder="Category" />}
      />
      <div className="overflow-x-auto rounded-lg border border-white/5">
        <table className="w-full">
          <thead className="bg-white/[0.03]">
            <tr>
              <th className={thCls}>Category Name</th>
              <th className={thCls}>Tax Percent(%)</th>
              <th className={cn(thCls, "w-24 text-right")}>Edit</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="bg-amber-400/5">
                <td className={tdCls}>
                  <input
                    autoFocus
                    className="input-dark !py-1 !text-xs w-32"
                    placeholder="GST-5"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </td>
                <td className={tdCls}>
                  <input
                    type="number"
                    className="input-dark !py-1 !text-xs w-24"
                    value={draft.pct || ""}
                    onChange={(e) => setDraft({ ...draft, pct: Number(e.target.value) })}
                  />
                </td>
                <td className={cn(tdCls, "text-right")}>
                  <EditActions editing onEdit={() => {}} onSave={commitAdd} onCancel={() => setAdding(false)} />
                </td>
              </tr>
            )}
            {filtered.map(({ r, i }) => (
              <tr key={`${i}-${r.name}`} className="hover:bg-white/[0.03]">
                {editIdx === i ? (
                  <>
                    <td className={tdCls}>
                      <input
                        autoFocus
                        className="input-dark !py-1 !text-xs w-32"
                        value={editVal.name}
                        onChange={(e) => setEditVal({ ...editVal, name: e.target.value })}
                      />
                    </td>
                    <td className={tdCls}>
                      <input
                        type="number"
                        className="input-dark !py-1 !text-xs w-24"
                        value={editVal.pct}
                        onChange={(e) => setEditVal({ ...editVal, pct: Number(e.target.value) })}
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td className={cn(tdCls, "font-medium text-slate-200")}>{r.name}</td>
                    <td className={cn(tdCls, "font-mono")}>{r.pct}</td>
                  </>
                )}
                <td className={cn(tdCls, "text-right")}>
                  <EditActions
                    editing={editIdx === i}
                    onEdit={() => { setEditIdx(i); setEditVal({ ...r }); }}
                    onSave={() => {
                      const name = editVal.name.trim().toUpperCase() || r.name;
                      setPh((s) => ({
                        ...s,
                        taxCats: s.taxCats.map((t, x) => (x === i ? { name, pct: Number(editVal.pct) || 0 } : t)),
                      }));
                      setEditIdx(null);
                    }}
                    onCancel={() => setEditIdx(null)}
                    onDelete={() => {
                      setPh((s) => ({ ...s, taxCats: s.taxCats.filter((_, x) => x !== i) }));
                      toast.info("Tax category removed", { description: r.name });
                    }}
                  />
                </td>
              </tr>
            ))}
            {!filtered.length && <EmptyRow cols={3} text="No tax categories" />}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Showing {filtered.length} of {rows.length} entries</p>
    </GlassCard>
  );
}

/* ---------------- 4 · Supplier (refs 159 list + 160 full add form) ---------------- */

const blankSupplier = (): Omit<Supplier, "id"> => ({
  name: "", invTypes: [], vatNo: "", contactPerson: "", contactNo: "", email: "",
  gstNo: "", pinCode: "", address: "", fax: "", altContactNo: "", website: "",
  remarks: "", apgstNo: "", cstNo: "", dlNo: "", panNo: "", active: true,
});

function SupplierMaster() {
  const { ph, setPh } = usePharm();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Supplier, "id">>(blankSupplier());

  const filtered = useMemo(
    () => ph.suppliers.filter((s) =>
      s.name.toLowerCase().includes(q.toLowerCase()) || s.contactNo.includes(q)),
    [ph.suppliers, q]
  );

  const openAdd = () => { setEditId(null); setDraft(blankSupplier()); setModal(true); };
  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    const { id: _id, ...rest } = s;
    setDraft(rest);
    setModal(true);
  };

  const save = () => {
    if (!draft.name.trim()) { toast.error("Supplier name is required"); return; }
    if (!draft.email.trim()) { toast.error("Email ID is required"); return; }
    const clean: Supplier = {
      ...draft,
      id: editId ?? uid("sup"),
      name: draft.name.trim().toUpperCase(),
    };
    setPh((s) => ({
      ...s,
      suppliers: editId ? s.suppliers.map((x) => (x.id === editId ? clean : x)) : [...s.suppliers, clean],
    }));
    setModal(false);
    toast.success(editId ? "Supplier updated" : "Supplier added", { description: clean.name });
  };

  const F = (k: keyof Omit<Supplier, "id" | "invTypes" | "active">, label: string, req = false, ph_?: string) => (
    <div>
      <L req={req}>{label}</L>
      <input
        className="input-dark !text-xs"
        placeholder={ph_ ?? label}
        value={draft[k] as string}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      />
    </div>
  );

  return (
    <GlassCard className="!p-4">
      <MasterHeader
        title="Supplier"
        addLabel="Add Supplier"
        onAdd={openAdd}
        extra={
          <button
            className="btn-ghost !px-3 !py-1.5 !text-xs"
            onClick={() =>
              downloadCsv(
                "pharmacy-suppliers.csv",
                ["Supplier", "Contact No", "Email", "GST NO", "DL NO", "Active"],
                ph.suppliers.map((s) => [s.name, s.contactNo, s.email, s.gstNo, s.dlNo, s.active ? "true" : "false"])
              )
            }
          >
            <Download size={13} /> Export
          </button>
        }
        search={<SearchBox value={q} onChange={setQ} placeholder="Supplier/ContactNO" />}
      />
      <div className="overflow-x-auto rounded-lg border border-white/5">
        <table className="w-full">
          <thead className="bg-white/[0.03]">
            <tr>
              <th className={thCls}>Supplier</th>
              <th className={thCls}>Contact Number</th>
              <th className={thCls}>Email Id</th>
              <th className={thCls}>IsActive</th>
              <th className={cn(thCls, "w-16 text-right")}>Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-white/[0.03]">
                <td className={cn(tdCls, "font-medium text-slate-200")}>{s.name}</td>
                <td className={cn(tdCls, "font-mono")}>{s.contactNo || "—"}</td>
                <td className={tdCls}>{s.email || "—"}</td>
                <td className={tdCls}>
                  <button
                    onClick={() =>
                      setPh((p) => ({ ...p, suppliers: p.suppliers.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)) }))
                    }
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-semibold border transition-colors",
                      s.active
                        ? "bg-emerald-400/10 text-emerald-300 border-emerald-400/30"
                        : "bg-red-400/10 text-red-300 border-red-400/30"
                    )}
                  >
                    {s.active ? "true" : "false"}
                  </button>
                </td>
                <td className={cn(tdCls, "text-right")}>
                  <button className="p-1 rounded text-slate-400 hover:text-neon-cyan hover:bg-cyan-400/10" onClick={() => openEdit(s)} title="Edit">
                    <Pencil size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && <EmptyRow cols={5} text="No suppliers" />}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Showing {filtered.length} of {ph.suppliers.length} entries</p>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Supplier : Edit" : "Supplier : Add"} wide>
        <div className="grid grid-cols-2 gap-3">
          {F("name", "Supplier", true)}
          <div>
            <L req>Inventory Type</L>
            <MultiSelect
              options={ph.invTypes}
              selected={draft.invTypes}
              onChange={(v) => setDraft({ ...draft, invTypes: v })}
            />
          </div>
          {F("vatNo", "VAT NO")}
          {F("contactPerson", "Contact Person")}
          {F("contactNo", "Contact No")}
          {F("email", "Email ID", true)}
          {F("gstNo", "GST NO")}
          {F("pinCode", "PinCode")}
          <div>
            <L>Address</L>
            <textarea
              className="input-dark !text-xs min-h-[38px]"
              placeholder="Address"
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </div>
          {F("fax", "Fax")}
          {F("altContactNo", "Alternate Contact No")}
          {F("website", "Website")}
          <div>
            <L>Remarks</L>
            <textarea
              className="input-dark !text-xs min-h-[38px]"
              placeholder="Remarks"
              value={draft.remarks}
              onChange={(e) => setDraft({ ...draft, remarks: e.target.value })}
            />
          </div>
          {F("apgstNo", "APGST NO")}
          {F("cstNo", "CST NO")}
          {F("dlNo", "DL NO")}
          {F("panNo", "PAN NO")}
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              IsActive
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost !text-xs" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-neon !text-xs" onClick={save}><Check size={14} /> {editId ? "Update" : "Submit"}</button>
        </div>
      </Modal>
    </GlassCard>
  );
}

/* ---------------- 7 · Item Master (the big one) ---------------- */

function blankItem(ph: PharmState): PharmItem {
  return {
    id: "",
    name: "",
    itemType: ph.itemTypes[0]?.name ?? "",
    invType: ph.itemTypes[0]?.inventory ?? ph.invTypes[0] ?? "",
    manufacture: ph.manufactures[0] ?? "",
    taxCat: ph.taxCats[0]?.name ?? "",
    rack: ph.racks[0] ?? "",
    hsn: "",
    composition: "",
    drugCombo: "",
    barcode: `8904${Math.floor(100000 + Math.random() * 899999)}`,
    mrp: 0,
    rate: 0,
    reorder: 0,
  };
}

function ItemMaster() {
  const { ph, setPh } = usePharm();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PharmItem>(() => blankItem(ph));

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return ph.items.filter((i) =>
      i.name.toLowerCase().includes(s) ||
      i.composition.toLowerCase().includes(s) ||
      i.hsn.includes(s) ||
      i.manufacture.toLowerCase().includes(s)
    );
  }, [ph.items, q]);

  const openAdd = () => { setEditing(false); setDraft(blankItem(ph)); setModal(true); };
  const openEdit = (i: PharmItem) => { setEditing(true); setDraft({ ...i }); setModal(true); };

  const save = () => {
    if (!draft.name.trim()) { toast.error("Item name is required"); return; }
    const clean: PharmItem = {
      ...draft,
      id: editing ? draft.id : uid("itm"),
      name: draft.name.trim().toUpperCase(),
      mrp: Number(draft.mrp) || 0,
      rate: Number(draft.rate) || 0,
      reorder: Number(draft.reorder) || 0,
    };
    setPh((s) => ({
      ...s,
      items: editing ? s.items.map((x) => (x.id === clean.id ? clean : x)) : [...s.items, clean],
    }));
    setModal(false);
    toast.success(editing ? "Item updated" : "Item added", { description: clean.name });
  };

  const Sel = (label: string, k: keyof PharmItem, opts: string[], req = false) => (
    <div>
      <L req={req}>{label}</L>
      <select
        className="input-dark !text-xs"
        value={draft[k] as string}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      >
        {opts.length === 0 && <option value="">—</option>}
        {draft[k] !== "" && !opts.includes(draft[k] as string) && (
          <option value={draft[k] as string}>{draft[k] as string}</option>
        )}
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <GlassCard className="!p-4">
      <MasterHeader
        title="Item Master"
        addLabel="Add Item"
        onAdd={openAdd}
        extra={
          <button
            className="btn-ghost !px-3 !py-1.5 !text-xs"
            onClick={() =>
              downloadCsv(
                "pharmacy-item-master.csv",
                ["Item", "Type", "Inventory", "Manufacture", "Tax", "Rack", "HSN", "MRP", "Rate", "Reorder"],
                ph.items.map((i) => [i.name, i.itemType, i.invType, i.manufacture, i.taxCat, i.rack, i.hsn, i.mrp, i.rate, i.reorder])
              )
            }
          >
            <Download size={13} /> Export
          </button>
        }
        search={<SearchBox value={q} onChange={setQ} placeholder="Item / HSN / Manufacture" />}
      />
      <div className="overflow-x-auto rounded-lg border border-white/5">
        <table className="w-full">
          <thead className="bg-white/[0.03]">
            <tr>
              <th className={thCls}>Item Name</th>
              <th className={thCls}>Type</th>
              <th className={thCls}>Inventory</th>
              <th className={thCls}>Manufacture</th>
              <th className={thCls}>Tax</th>
              <th className={thCls}>Rack</th>
              <th className={cn(thCls, "text-right")}>MRP ₹</th>
              <th className={cn(thCls, "text-right")}>Rate ₹</th>
              <th className={cn(thCls, "text-right")}>Reorder</th>
              <th className={cn(thCls, "w-16 text-right")}>Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="hover:bg-white/[0.03]">
                <td className={cn(tdCls, "font-medium text-slate-200")}>{i.name}</td>
                <td className={tdCls}>{i.itemType}</td>
                <td className={tdCls}>{i.invType}</td>
                <td className={tdCls}>{i.manufacture}</td>
                <td className={tdCls}>{i.taxCat}</td>
                <td className={tdCls}>{i.rack}</td>
                <td className={cn(tdCls, "text-right font-mono")}>{i.mrp.toFixed(2)}</td>
                <td className={cn(tdCls, "text-right font-mono")}>{i.rate.toFixed(2)}</td>
                <td className={cn(tdCls, "text-right font-mono")}>{i.reorder}</td>
                <td className={cn(tdCls, "text-right")}>
                  <button className="p-1 rounded text-slate-400 hover:text-neon-cyan hover:bg-cyan-400/10" onClick={() => openEdit(i)} title="Edit">
                    <Pencil size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && <EmptyRow cols={10} text="No items match" />}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Showing {filtered.length} of {ph.items.length} entries</p>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Item : Edit" : "Item : Add"} wide>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <L req>Item Name</L>
            <input
              autoFocus
              className="input-dark !text-xs"
              placeholder="e.g. DOLO 650MG TAB"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          {Sel("Item Type", "itemType", ph.itemTypes.map((t) => t.name), true)}
          {Sel("Inventory Type", "invType", ph.invTypes, true)}
          {Sel("Manufacture", "manufacture", ph.manufactures)}
          {Sel("Tax Category", "taxCat", ph.taxCats.map((t) => t.name))}
          {Sel("Rack", "rack", ph.racks)}
          <div>
            <L>HSN Code</L>
            <input className="input-dark !text-xs" placeholder="30049099" value={draft.hsn}
              onChange={(e) => setDraft({ ...draft, hsn: e.target.value })} />
          </div>
          <div>
            <L>Composition</L>
            <input className="input-dark !text-xs" placeholder="Paracetamol 650mg" value={draft.composition}
              onChange={(e) => setDraft({ ...draft, composition: e.target.value })} />
          </div>
          {Sel("Drug Combination", "drugCombo", ph.drugCombos.map((d) => d.name))}
          <div>
            <L>MRP ₹</L>
            <input type="number" step="0.01" className="input-dark !text-xs" value={draft.mrp || ""}
              onChange={(e) => setDraft({ ...draft, mrp: Number(e.target.value) })} />
          </div>
          <div>
            <L>Purchase Rate ₹</L>
            <input type="number" step="0.01" className="input-dark !text-xs" value={draft.rate || ""}
              onChange={(e) => setDraft({ ...draft, rate: Number(e.target.value) })} />
          </div>
          <div>
            <L>Reorder Level</L>
            <input type="number" className="input-dark !text-xs" value={draft.reorder || ""}
              onChange={(e) => setDraft({ ...draft, reorder: Number(e.target.value) })} />
          </div>
          <div>
            <L>Barcode</L>
            <input className="input-dark !text-xs font-mono" value={draft.barcode}
              onChange={(e) => setDraft({ ...draft, barcode: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost !text-xs" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn-neon !text-xs" onClick={save}><Check size={14} /> {editing ? "Update" : "Submit"}</button>
        </div>
      </Modal>
    </GlassCard>
  );
}

/* ---------------- 8 · Item Package Master (ref 163) ---------------- */

interface PkgRow {
  itemId: string;
  qty: number;
}

const gmIdFor = (ph: PharmState, itemId: string) =>
  `G${1000 + Math.max(0, ph.items.findIndex((i) => i.id === itemId))}`;

function PackageMaster() {
  const { ph, setPh } = usePharm();
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<PkgRow[]>([{ itemId: "", qty: 1 }]);

  const reset = () => { setEditId(null); setName(""); setRows([{ itemId: "", qty: 1 }]); };

  const openEdit = (p: PharmPackage) => {
    setEditId(p.id);
    setName(p.name);
    setRows(p.items.map((i) => ({ itemId: i.itemId, qty: i.qty })));
  };

  const lineItem = (r: PkgRow) => ph.items.find((i) => i.id === r.itemId);
  const lineAmt = (r: PkgRow) => {
    const i = lineItem(r);
    return i ? Math.round(i.mrp * (r.qty || 0) * 100) / 100 : 0;
  };
  const total = rows.reduce((s, r) => s + lineAmt(r), 0);

  const submit = () => {
    const nm = name.trim().toUpperCase();
    if (!nm) { toast.error("Package name is required"); return; }
    const valid = rows.filter((r) => r.itemId && r.qty > 0);
    if (!valid.length) { toast.error("Add at least one item row"); return; }
    const pkg: PharmPackage = {
      id: editId ?? uid("pkg"),
      name: nm,
      items: valid.map((r) => {
        const i = lineItem(r)!;
        return { itemId: i.id, name: i.name, gmId: gmIdFor(ph, i.id), qty: r.qty, mrp: i.mrp, amount: lineAmt(r) };
      }),
    };
    setPh((s) => ({
      ...s,
      packages: editId ? s.packages.map((x) => (x.id === editId ? pkg : x)) : [...s.packages, pkg],
    }));
    toast.success(editId ? "Package updated" : "Package saved", {
      description: `${pkg.name} · ${pkg.items.length} items · ${fmtINR(total)}`,
    });
    reset();
  };

  const filtered = ph.packages.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <GlassCard className="!p-4">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500/80">
            Masters · Item Package Master
          </p>
          <div className="flex items-center gap-2">
            <L>Package Name :</L>
            <input
              className="input-dark !py-1.5 !text-xs w-56"
              placeholder="Package Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border border-white/5 overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-500/15 to-violet-500/10 border-b border-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-neon-cyan">
            Item Details
          </div>
          <div className="p-3">
            <button
              className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-neon-cyan hover:text-white"
              onClick={() => setRows((r) => [...r, { itemId: "", qty: 1 }])}
            >
              <Plus size={13} /> Add New
            </button>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={cn(thCls, "w-10")}>SNo</th>
                  <th className={thCls}>Item Name</th>
                  <th className={cn(thCls, "w-20")}>GmId</th>
                  <th className={cn(thCls, "w-20")}>Qty</th>
                  <th className={cn(thCls, "w-24 text-right")}>MRP (₹)</th>
                  <th className={cn(thCls, "w-24 text-right")}>Amount (₹)</th>
                  <th className={cn(thCls, "w-10")} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const it = lineItem(r);
                  return (
                    <tr key={idx}>
                      <td className={tdCls}>{idx + 1}</td>
                      <td className={tdCls}>
                        <select
                          className="input-dark !py-1 !text-xs"
                          value={r.itemId}
                          onChange={(e) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)))}
                        >
                          <option value="">Select item…</option>
                          {ph.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                      </td>
                      <td className={cn(tdCls, "font-mono text-slate-500")}>{it ? gmIdFor(ph, it.id) : "0"}</td>
                      <td className={tdCls}>
                        <input
                          type="number"
                          min={1}
                          className="input-dark !py-1 !text-xs w-16"
                          value={r.qty || ""}
                          onChange={(e) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, qty: Number(e.target.value) } : x)))}
                        />
                      </td>
                      <td className={cn(tdCls, "text-right font-mono")}>{it ? it.mrp.toFixed(2) : "0"}</td>
                      <td className={cn(tdCls, "text-right font-mono")}>{lineAmt(r) ? lineAmt(r).toFixed(2) : "0"}</td>
                      <td className={tdCls}>
                        {rows.length > 1 && (
                          <button
                            className="p-1 rounded text-slate-500 hover:text-red-400"
                            onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-slate-400">Package total: <span className="font-mono text-amber-300">{fmtINR(total)}</span></p>
              <div className="flex gap-2">
                <button className="btn-neon !px-4 !py-1.5 !text-xs" onClick={submit}>
                  <Check size={13} /> Submit
                </button>
                <button className="btn-ghost !px-4 !py-1.5 !text-xs !border-amber-400/40 !text-amber-300" onClick={reset}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500/80">Saved Packages</p>
          <SearchBox value={q} onChange={setQ} placeholder="Package" />
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full">
            <thead className="bg-white/[0.03]">
              <tr>
                <th className={thCls}>Package</th>
                <th className={thCls}>Items</th>
                <th className={cn(thCls, "text-right")}>Amount ₹</th>
                <th className={cn(thCls, "w-20 text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.03]">
                  <td className={cn(tdCls, "font-medium text-slate-200")}>{p.name}</td>
                  <td className={tdCls}>{p.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</td>
                  <td className={cn(tdCls, "text-right font-mono")}>
                    {p.items.reduce((s, i) => s + i.amount, 0).toFixed(2)}
                  </td>
                  <td className={cn(tdCls, "text-right")}>
                    <div className="flex justify-end gap-1">
                      <button className="p-1 rounded text-slate-400 hover:text-neon-cyan hover:bg-cyan-400/10" onClick={() => openEdit(p)} title="Edit">
                        <Pencil size={13} />
                      </button>
                      <button
                        className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-400/10"
                        title="Delete"
                        onClick={() => {
                          setPh((s) => ({ ...s, packages: s.packages.filter((x) => x.id !== p.id) }));
                          toast.info("Package removed", { description: p.name });
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <EmptyRow cols={4} text="No packages saved" />}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

/* ---------------- 9 · Drug Combination ---------------- */

function ComboMaster() {
  const { ph, setPh } = usePharm();
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const reset = () => { setEditId(null); setName(""); setPicked([]); };

  const submit = () => {
    const nm = name.trim().toUpperCase();
    if (!nm) { toast.error("Combination name is required"); return; }
    if (!picked.length) { toast.error("Pick at least one item"); return; }
    setPh((s) => ({
      ...s,
      drugCombos: editId
        ? s.drugCombos.map((c) => (c.id === editId ? { ...c, name: nm, items: picked } : c))
        : [...s.drugCombos, { id: uid("dc"), name: nm, items: picked }],
    }));
    toast.success(editId ? "Combination updated" : "Combination saved", { description: `${nm} · ${picked.length} items` });
    reset();
  };

  const filtered = ph.drugCombos.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <GlassCard className="!p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500/80 mb-3">
          Masters · Drug Combination {editId && <span className="text-neon-cyan normal-case tracking-normal">· editing</span>}
        </p>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <L>Combination Name :</L>
          <input
            className="input-dark !py-1.5 !text-xs w-64"
            placeholder="e.g. FEVER COMBO"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn-neon !px-3 !py-1.5 !text-xs" onClick={submit}>
            <Check size={13} /> {editId ? "Update" : "Submit"}
          </button>
          {editId && (
            <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={reset}><X size={13} /> Cancel</button>
          )}
        </div>
        <div className="rounded-lg border border-white/5 bg-ink-900/50 p-2 max-h-48 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
          {ph.items.map((i) => (
            <label key={i.id} className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={picked.includes(i.name)}
                onChange={() =>
                  setPicked((p) => (p.includes(i.name) ? p.filter((x) => x !== i.name) : [...p, i.name]))
                }
              />
              {i.name}
            </label>
          ))}
        </div>
        {picked.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-500">
            Selected: <span className="text-slate-300">{picked.join(" + ")}</span>
          </p>
        )}
      </GlassCard>

      <GlassCard className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-500/80">Saved Combinations</p>
          <SearchBox value={q} onChange={setQ} placeholder="Combination" />
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full">
            <thead className="bg-white/[0.03]">
              <tr>
                <th className={thCls}>Combination</th>
                <th className={thCls}>Items</th>
                <th className={cn(thCls, "w-20 text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.03]">
                  <td className={cn(tdCls, "font-medium text-slate-200")}>{c.name}</td>
                  <td className={tdCls}>{c.items.join(" + ")}</td>
                  <td className={cn(tdCls, "text-right")}>
                    <div className="flex justify-end gap-1">
                      <button
                        className="p-1 rounded text-slate-400 hover:text-neon-cyan hover:bg-cyan-400/10"
                        title="Edit"
                        onClick={() => { setEditId(c.id); setName(c.name); setPicked([...c.items]); }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-400/10"
                        title="Delete"
                        onClick={() => {
                          setPh((s) => ({ ...s, drugCombos: s.drugCombos.filter((x) => x.id !== c.id) }));
                          toast.info("Combination removed", { description: c.name });
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <EmptyRow cols={3} text="No combinations saved" />}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

/* ---------------- root ---------------- */

const TAB_ICONS: Record<MasterTab, React.ComponentType<{ size?: number | string; className?: string }>> = {
  invType: Database,
  itemType: Tag,
  manufacture: Pill,
  supplier: Truck,
  tax: Tag,
  rack: Boxes,
  item: Pill,
  package: Boxes,
  combo: Layers,
};

export function Masters() {
  const { ph, setPh } = usePharm();
  const [tab, setTab] = useState<MasterTab>("invType");

  return (
    <div className="space-y-3">
      {/* internal masters tab bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(({ key, label }) => {
          const Icon = TAB_ICONS[key];
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all border",
                tab === key
                  ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_12px_rgba(212,175,55,0.22)]"
                  : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white hover:bg-white/[0.06]"
              )}
            >
              <Icon size={12} className={tab === key ? "text-neon-cyan" : ""} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "invType" && (
        <StringListMaster
          title="Inventory Type"
          addLabel="Add Inventory"
          noun="Inventory Type"
          rows={ph.invTypes}
          setRows={(fn) => setPh((s) => ({ ...s, invTypes: fn(s.invTypes) }))}
        />
      )}
      {tab === "itemType" && <ItemTypeMaster />}
      {tab === "manufacture" && (
        <StringListMaster
          title="Manufacture"
          addLabel="Add Manufacture"
          noun="Manufacture"
          rows={ph.manufactures}
          setRows={(fn) => setPh((s) => ({ ...s, manufactures: fn(s.manufactures) }))}
        />
      )}
      {tab === "supplier" && <SupplierMaster />}
      {tab === "tax" && <TaxMaster />}
      {tab === "rack" && (
        <StringListMaster
          title="Rack Master"
          addLabel="Add Rack Name"
          noun="Rack Name"
          rows={ph.racks}
          setRows={(fn) => setPh((s) => ({ ...s, racks: fn(s.racks) }))}
        />
      )}
      {tab === "item" && <ItemMaster />}
      {tab === "package" && <PackageMaster />}
      {tab === "combo" && <ComboMaster />}
    </div>
  );
}
