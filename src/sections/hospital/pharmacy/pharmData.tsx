// SpartaHMS-style pharmacy data layer — self-contained, localStorage-persisted
// ("astra.pharm.v1"). Integration with the wider HMS happens inside the screens
// via useStore (billing ledger, approvals inbox, send-log, patient registry,
// doctor-order indents). NO image scan / photo upload anywhere — manual fast
// entry only; barcode is a keyboard text field.

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadLS, saveLS, uid } from "@/lib/utils";

/* ============================== types ============================== */

export interface PharmItem {
  id: string;
  name: string;
  itemType: string;      // ItemType name (TAB, INJ, SURG…)
  invType: string;       // inventory type (TABLET/INJECTION/SURGICALS…)
  manufacture: string;
  taxCat: string;        // GST-0/5/12/18/28
  rack: string;          // "1".."7"
  hsn: string;
  composition: string;
  drugCombo: string;
  barcode: string;
  mrp: number;
  rate: number;          // purchase rate
  reorder: number;
}

export interface Batch {
  id: string;
  itemId: string;
  batchNo: string;
  purchaseDate: string;  // ISO yyyy-mm-dd
  expDate: string;       // ISO yyyy-mm-dd
  origQty: number;
  qty: number;           // current stock
  mrp: number;
  rate: number;
}

export interface SaleItem {
  itemId: string;
  name: string;
  batchNo: string;
  oldTax: number;
  newTax: number;
  gmId: string;
  qty: number;
  mrp: number;
  amount: number;
}

export type InvKind = "OP" | "IP" | "Direct";
export type InvMode = "Cash" | "Card" | "UPI" | "Due";

export interface Invoice {
  id: string;
  invNo: string;
  date: string;          // ISO date
  time: string;
  kind: InvKind;
  patientRegNo: string;
  mobile: string;
  patientName: string;
  ageGender: string;
  doctor: string;
  store: string;
  items: SaleItem[];
  total: number;
  discPct: number;
  discAmt: number;
  net: number;
  mode: InvMode;
  paid: number;
  due: number;
  remarks: string;
  status: "submitted" | "draft";
  indentOrderId?: string;
}

export interface SaleReturn {
  id: string;
  retNo: string;
  date: string;
  invNo: string;
  kind: InvKind;
  items: { name: string; batchNo: string; qty: number; amount: number }[];
  total: number;
}

export interface PharmExpense {
  id: string;
  date: string;
  head: string;
  amount: number;
  mode: "Cash" | "Card" | "UPI";
  remark: string;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  poDate: string;
  validTill: string;
  invType: string;
  supplier: string;
  createdBy: string;
  status: "open" | "received" | "cancelled";
  cancelReason?: string;
  items: { itemId: string; name: string; qty: number; rate: number }[];
  total: number;
}

export interface StockAdjustment {
  id: string;
  date: string;
  itemId: string;
  batchNo: string;
  delta: number;
  reason: string;
  note: string;
}

export interface PharmPackage {
  id: string;
  name: string;
  items: { itemId: string; name: string; gmId: string; qty: number; mrp: number; amount: number }[];
}

export interface DrugCombo {
  id: string;
  name: string;
  items: string[];
}

export interface Supplier {
  id: string;
  name: string;
  invTypes: string[];
  vatNo: string;
  contactPerson: string;
  contactNo: string;
  email: string;
  gstNo: string;
  pinCode: string;
  address: string;
  fax: string;
  altContactNo: string;
  website: string;
  remarks: string;
  apgstNo: string;
  cstNo: string;
  dlNo: string;
  panNo: string;
  active: boolean;
}

export interface ItemTypeRow { name: string; inventory: string; active: boolean; }
export interface TaxCat { name: string; pct: number; }

export interface PharmState {
  invTypes: string[];
  itemTypes: ItemTypeRow[];
  manufactures: string[];
  suppliers: Supplier[];
  taxCats: TaxCat[];
  racks: string[];
  items: PharmItem[];
  batches: Batch[];
  packages: PharmPackage[];
  drugCombos: DrugCombo[];
  invoices: Invoice[];
  returns: SaleReturn[];
  expenses: PharmExpense[];
  pos: PurchaseOrder[];
  adjustments: StockAdjustment[];
  invCounter: number;
  poCounter: number;
  retCounter: number;
}

/* ============================== seeds ============================== */

const INV_TYPES = [
  "SURGICAL BLADES", "SURGICARE GLOVES", "EXAMINATION GLOVES", "POVIDONE-IODINE SOLUTION IP",
  "SPIRIT", "STERILE WATER", "COTTON -15GRAM", "DISPO NEEDLE", "BD SPINAL NEEDLE", "SYRINGES",
  "SUSPENSION/RESPULES", "SYRUP", "SPRAY", "FLUIDS", "SACHETS", "LOTIONS", "POWDER", "DROPS",
  "CREAM", "OINTMENT", "TABLET", "CAPSULES", "INJECTION", "SURGICALS", "GENERALS",
];

const ITEM_TYPES: ItemTypeRow[] = [
  { name: "GELS", inventory: "GENERALS", active: true },
  { name: "SUS/RESP", inventory: "DROPS", active: true },
  { name: "SYP", inventory: "SYRUP", active: true },
  { name: "SPR", inventory: "SPRAY", active: true },
  { name: "FLD", inventory: "FLUIDS", active: true },
  { name: "SACT", inventory: "SACHETS", active: true },
  { name: "LOT", inventory: "LOTIONS", active: true },
  { name: "PWDR", inventory: "POWDER", active: true },
  { name: "DROP", inventory: "DROPS", active: true },
  { name: "CREM", inventory: "CREAM", active: true },
  { name: "TAB", inventory: "TABLET", active: true },
  { name: "CAP", inventory: "CAPSULES", active: true },
  { name: "INJ", inventory: "INJECTION", active: true },
  { name: "SURG", inventory: "SURGICALS", active: true },
  { name: "GEN", inventory: "GENERALS", active: true },
  { name: "OINT", inventory: "OINTMENT", active: true },
];

const MANUFACTURES = ["CIPLA", "DR REDDY'S", "SUN PHARMA", "ZYDUS", "MICRO LABS", "ABBOTT", "ALKEM", "TROIKAA", "HETERO", "AUROBINDO"];

function mkSupplier(p: Partial<Supplier> & { name: string }): Supplier {
  return {
    id: uid("sup"), invTypes: [], vatNo: "", contactPerson: "", contactNo: "", email: "",
    gstNo: "", pinCode: "", address: "", fax: "", altContactNo: "", website: "", remarks: "",
    apgstNo: "", cstNo: "", dlNo: "", panNo: "", active: true, ...p,
  };
}

const SUPPLIERS: Supplier[] = [
  mkSupplier({ name: "SRI LAHARI MEDICAL AND SURGICAL DISTRIBUTORS", invTypes: ["TABLET", "INJECTION", "SURGICALS", "FLUIDS", "SYRUP"], contactNo: "9948981844", email: "SRILAHARIMEDICALS@GMAIL.COM", gstNo: "36AZVPC6166H1ZX", address: "KOTHAGUDEM", contactPerson: "LAHARI PRASAD", dlNo: "DL-TS-2211", panNo: "AZVPC6166H" }),
  mkSupplier({ name: "P J MEDICAL AGENCY", invTypes: ["TABLET", "CAPSULES", "SYRUP"], contactNo: "9059091212", email: "P.JMEDICAL@GMAIL.COM", gstNo: "36AAJFP2210K1Z4", address: "KHAMMAM", contactPerson: "P J RAO" }),
  mkSupplier({ name: "GANGA PHARMA DISTRIBUTORS", invTypes: ["INJECTION", "FLUIDS", "SURGICALS"], contactNo: "9030622020", email: "gangapharmadistributors@yahoo.co.in", address: "WYRA ROAD, KHAMMAM" }),
  mkSupplier({ name: "CRENZA SPERANZA THERAPEUTICS", invTypes: ["INJECTION", "DROPS"], email: "sandhya@crenzaphaema.com", address: "HYDERABAD" }),
  mkSupplier({ name: "ACCURA DIAGNOSTICS INC", invTypes: ["SURGICALS", "GENERALS"], contactNo: "9848018523", email: "accuradiagnostic@gmail.com", address: "VIJAYAWADA" }),
  mkSupplier({ name: "ALL PHARMA MEDICAL SURGICAL", invTypes: ["SURGICALS", "SYRINGES"], contactNo: "9059134567", email: "allpharma@99999gmail.com", address: "KHAMMAM" }),
  mkSupplier({ name: "REDISUN PHARMACEUTICALS", invTypes: ["TABLET", "OINTMENT"], email: "REDISUN@GMAIL.COM", address: "SECUNDERABAD" }),
  mkSupplier({ name: "DWARAKA MEDICAL DISTRIBUTER", invTypes: ["FLUIDS", "SACHETS"], contactNo: "9848626142", email: "dwaraka9848626142@gamil.com", address: "KHAMMAM" }),
];

const TAX_CATS: TaxCat[] = [
  { name: "GST-0", pct: 0 }, { name: "GST-5", pct: 5 }, { name: "GST-12", pct: 12 },
  { name: "GST-18", pct: 18 }, { name: "GST-28", pct: 28 },
];

const RACKS = ["1", "2", "3", "4", "5", "6", "7"];

let gmSeq = 1001;
function item(
  name: string, itemType: string, invType: string, manufacture: string, taxCat: string, rack: string,
  hsn: string, composition: string, drugCombo: string, mrp: number, rate: number, reorder: number,
): PharmItem {
  return { id: uid("itm"), name, itemType, invType, manufacture, taxCat, rack, hsn, composition, drugCombo, barcode: `8904${(gmSeq++ * 37) % 900000 + 100000}`, mrp, rate, reorder };
}

const SEED_ITEMS: PharmItem[] = [
  item("NEOMOL IV", "INJ", "FLUIDS", "CIPLA", "GST-5", "1", "30049099", "Paracetamol 1g/100ml IV infusion", "PCM INF CLASS", 489.38, 30, 10),
  item("IV CROS INJ", "INJ", "INJECTION", "TROIKAA", "GST-5", "1", "30049099", "Iron sucrose 100mg/5ml", "HAEMATINIC", 30.89, 10, 20),
  item("RUMAGARD-T", "TAB", "TABLET", "ALKEM", "GST-5", "2", "30049078", "Trypsin-Chymotrypsin 1L units", "PROTEOLYTIC", 185.62, 80.5, 15),
  item("MYOPYROLATE INJ", "INJ", "INJECTION", "ZYDUS", "GST-5", "2", "30039809", "Glycopyrrolate 0.2mg/ml", "ANAESTHESIA PREMED", 105.47, 100, 10),
  item("ENDO TRACHEAL TUBE-7.5", "SURG", "SURGICALS", "ROMSONS", "GST-12", "3", "90189099", "Cuffed ETT 7.5mm sterile", "AIRWAY", 254.06, 75, 5),
  item("MEDAZOLAM 5ML INJ", "INJ", "INJECTION", "SUN PHARMA", "GST-5", "3", "30049099", "Midazolam 1mg/ml 5ml", "SEDATIVE", 67.48, 30, 8),
  item("LORAZEPAM-2MG", "TAB", "TABLET", "CIPLA", "GST-5", "3", "30049077", "Lorazepam 2mg", "ANXIOLYTIC", 11.06, 1, 20),
  item("ENEMA", "GEN", "GENERALS", "ABBOTT", "GST-5", "4", "30049074", "Sodium phosphate enema 100ml", "LAXATIVE", 70.31, 20, 10),
  item("DOLO 650MG TAB", "TAB", "TABLET", "MICRO LABS", "GST-5", "1", "30049099", "Paracetamol 650mg", "ANTIPYRETIC", 2.06, 0.12, 100),
  item("ENOXAPARIN SODIUM 40MG INJ", "INJ", "INJECTION", "DR REDDY'S", "GST-5", "3", "30019099", "Enoxaparin 40mg/0.4ml PFS", "ANTICOAGULANT", 440.62, 190, 10),
  item("PCM INF", "FLD", "FLUIDS", "CIPLA", "GST-5", "1", "30049099", "Paracetamol 1% w/v 100ml", "PCM INF CLASS", 328.12, 35, 10),
  item("ORS-ORANGE", "SACT", "SACHETS", "AUROBINDO", "GST-5", "4", "22029020", "WHO ORS orange flavour 21.8g", "REHYDRATION", 42.19, 22.25, 30),
  item("DEXTROSE 25% INJ", "INJ", "INJECTION", "HETERO", "GST-5", "2", "30049099", "Dextrose 25% w/v 100ml", "IV FLUID", 21, 15.75, 15),
  item("NUCOOL O", "SYP", "SYRUP", "ALKEM", "GST-5", "2", "30049099", "Ondansetron 2mg/5ml syrup", "ANTIEMETIC", 103.12, 50.75, 8),
  item("10CC SYRINGES", "SURG", "SYRINGES", "ROMSONS", "GST-12", "5", "90183100", "Disposable syringe 10ml luer", "CONSUMABLE", 12, 6, 100),
  item("2CC SYRINGES", "SURG", "SYRINGES", "ROMSONS", "GST-12", "5", "90183100", "Disposable syringe 2ml luer", "CONSUMABLE", 6, 3, 150),
  item("5CC SYRINGES", "SURG", "SYRINGES", "ROMSONS", "GST-12", "5", "90183100", "Disposable syringe 5ml luer", "CONSUMABLE", 8, 4, 150),
  item("3% SODIUM CHLORIDE", "FLD", "FLUIDS", "CIPLA", "GST-5", "4", "30049099", "Hypertonic saline 3% 100ml", "IV FLUID", 95, 48, 10),
  item("3-WAY CANNULA", "SURG", "SURGICALS", "ROMSONS", "GST-12", "5", "90183990", "3-way stopcock sterile", "CONSUMABLE", 45, 22, 30),
];

function seedBatches(items: PharmItem[]): Batch[] {
  const mk = (itm: string, batchNo: string, pd: string, exp: string, orig: number, qty: number, mrp?: number, rate?: number): Batch => {
    const i = items.find((x) => x.name === itm)!;
    return { id: uid("bat"), itemId: i.id, batchNo, purchaseDate: pd, expDate: exp, origQty: orig, qty, mrp: mrp ?? i.mrp, rate: rate ?? i.rate };
  };
  return [
    mk("NEOMOL IV", "383I337", "2024-08-21", "2026-04-03", 50, 50),
    mk("IV CROS INJ", "17916I", "2024-07-29", "2026-03-12", 300, 300),
    mk("RUMAGARD-T", "22DL53R", "2024-07-20", "2024-11-10", 50, 49),
    mk("MYOPYROLATE INJ", "350340", "2024-07-20", "2024-11-20", 30, 22),
    mk("ENDO TRACHEAL TUBE-7.5", "G19122630", "2024-08-05", "2024-11-30", 3, 3),
    mk("ENDO TRACHEAL TUBE-7.5", "220062243", "2024-08-05", "2027-05-30", 3, 2, 279.38),
    mk("MEDAZOLAM 5ML INJ", "V305792", "2024-07-20", "2024-12-12", 20, 8),
    mk("LORAZEPAM-2MG", "HD6028", "2024-07-22", "2025-02-04", 73, 2),
    mk("ENEMA", "ENM-2408", "2024-09-08", "2025-03-06", 20, 18),
    mk("ENEMA", "ENM-2501", "2025-01-30", "2027-03-30", 20, 20),
    mk("DOLO 650MG TAB", "I-23484", "2024-07-18", "2027-03-09", 133, 100),
    mk("ENOXAPARIN SODIUM 40MG INJ", "MN23105D", "2024-10-15", "2027-03-30", 105, 100),
    mk("PCM INF", "232515", "2024-08-03", "2025-05-30", 31, 22),
    mk("ORS-ORANGE", "SK40036B", "2024-07-20", "2027-06-06", 116, 100),
    mk("DEXTROSE 25% INJ", "1240674", "2024-08-08", "2025-06-30", 9, 2),
    mk("NUCOOL O", "NUS24005ED", "2025-01-22", "2025-06-30", 10, 4),
    mk("10CC SYRINGES", "SYR10-24A", "2024-09-01", "2027-08-31", 500, 420),
    mk("2CC SYRINGES", "SYR2-24B", "2024-09-01", "2027-08-31", 800, 560),
    mk("5CC SYRINGES", "SYR5-24C", "2024-09-01", "2027-08-31", 700, 610),
    mk("3% SODIUM CHLORIDE", "NACL3-24", "2024-10-02", "2027-01-15", 60, 55),
    mk("3-WAY CANNULA", "CAN3-24", "2024-09-12", "2027-02-28", 150, 132),
  ];
}

function seedInvoices(items: PharmItem[], batches: Batch[]): Invoice[] {
  const si = (name: string, qty: number): SaleItem => {
    const i = items.find((x) => x.name === name)!;
    const b = batches.find((x) => x.itemId === i.id && x.qty > 0)!;
    const pct = Number(i.taxCat.split("-")[1]);
    return { itemId: i.id, name: i.name, batchNo: b.batchNo, oldTax: pct, newTax: pct, gmId: `G${1000 + items.indexOf(i)}`, qty, mrp: i.mrp, amount: Math.round(i.mrp * qty * 100) / 100 };
  };
  const mk = (n: number, kind: InvKind, items: SaleItem[], mode: InvMode, paidRatio: number, extra: Partial<Invoice>): Invoice => {
    const total = items.reduce((s, x) => s + x.amount, 0);
    const paid = Math.round(total * paidRatio * 100) / 100;
    return {
      id: uid("inv"), invNo: `PH-${n}`, date: new Date().toISOString().slice(0, 10), time: "10:3" + (n % 10),
      kind, patientRegNo: "", mobile: "", patientName: "", ageGender: "", doctor: "Dr. Anitha Rao",
      store: "Main Store", items, total, discPct: 0, discAmt: 0, net: total, mode, paid,
      due: Math.round((total - paid) * 100) / 100, remarks: "NA", status: "submitted", ...extra,
    };
  };
  return [
    mk(1001, "OP", [si("DOLO 650MG TAB", 10), si("ORS-ORANGE", 2)], "Cash", 1, { patientRegNo: "PT-1087", patientName: "R. Devi", mobile: "9849011223", ageGender: "46/F" }),
    mk(1002, "IP", [si("NEOMOL IV", 2), si("ENOXAPARIN SODIUM 40MG INJ", 3)], "Due", 0.5, { patientRegNo: "PT-1076", patientName: "M. Singh", mobile: "9000544777", ageGender: "58/M", doctor: "Dr. Karthik Menon" }),
    mk(1003, "Direct", [si("10CC SYRINGES", 20), si("3-WAY CANNULA", 5)], "UPI", 1, { patientName: "Walk-in", doctor: "" }),
    mk(1004, "OP", [si("NUCOOL O", 1), si("DOLO 650MG TAB", 15)], "Card", 1, { patientRegNo: "PT-1092", patientName: "S. Begum", mobile: "9908812345", ageGender: "33/F" }),
  ];
}

function seedState(): PharmState {
  const items = SEED_ITEMS;
  const batches = seedBatches(items);
  const invoices = seedInvoices(items, batches);
  return {
    invTypes: INV_TYPES,
    itemTypes: ITEM_TYPES,
    manufactures: MANUFACTURES,
    suppliers: SUPPLIERS,
    taxCats: TAX_CATS,
    racks: RACKS,
    items,
    batches,
    packages: [
      { id: uid("pkg"), name: "POST-OP KIT", items: [
        { itemId: items[8].id, name: "DOLO 650MG TAB", gmId: "G1008", qty: 10, mrp: 2.06, amount: 20.6 },
        { itemId: items[10].id, name: "PCM INF", gmId: "G1010", qty: 1, mrp: 328.12, amount: 328.12 },
        { itemId: items[9].id, name: "ENOXAPARIN SODIUM 40MG INJ", gmId: "G1009", qty: 2, mrp: 440.62, amount: 881.24 },
      ]},
      { id: uid("pkg"), name: "FEVER KIT", items: [
        { itemId: items[8].id, name: "DOLO 650MG TAB", gmId: "G1008", qty: 15, mrp: 2.06, amount: 30.9 },
        { itemId: items[11].id, name: "ORS-ORANGE", gmId: "G1011", qty: 4, mrp: 42.19, amount: 168.76 },
      ]},
    ],
    drugCombos: [
      { id: uid("dc"), name: "FEVER COMBO", items: ["DOLO 650MG TAB", "PCM INF", "ORS-ORANGE"] },
      { id: uid("dc"), name: "SURGERY PREP", items: ["MEDAZOLAM 5ML INJ", "MYOPYROLATE INJ"] },
    ],
    invoices,
    returns: [
      { id: uid("ret"), retNo: "RET-501", date: new Date().toISOString().slice(0, 10), invNo: "PH-1001", kind: "OP",
        items: [{ name: "ORS-ORANGE", batchNo: "SK40036B", qty: 1, amount: 42.19 }], total: 42.19 },
    ],
    expenses: [
      { id: uid("exp"), date: new Date().toISOString().slice(0, 10), head: "Cold-chain electricity", amount: 1450, mode: "Cash", remark: "Monthly estimate" },
      { id: uid("exp"), date: new Date().toISOString().slice(0, 10), head: "Packing material", amount: 620, mode: "UPI", remark: "Covers & labels" },
    ],
    pos: [
      { id: uid("po"), poNo: "PO-101", poDate: new Date().toISOString().slice(0, 10), validTill: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        invType: "TABLET", supplier: "SRI LAHARI MEDICAL AND SURGICAL DISTRIBUTORS", createdBy: "Sana Iqbal", status: "open",
        items: [{ itemId: items[8].id, name: "DOLO 650MG TAB", qty: 500, rate: 0.12 }, { itemId: items[11].id, name: "ORS-ORANGE", qty: 100, rate: 22.25 }], total: 2285 },
    ],
    adjustments: [],
    invCounter: 1005,
    poCounter: 102,
    retCounter: 502,
  };
}

/* ============================== helpers ============================== */

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function taxPct(state: PharmState, taxCat: string): number {
  return state.taxCats.find((t) => t.name === taxCat)?.pct ?? 0;
}

export function effRate(rate: number, pct: number): number {
  return Math.round(rate * (1 + pct / 100) * 100) / 100;
}

export function itemById(state: PharmState, id: string): PharmItem | undefined {
  return state.items.find((i) => i.id === id);
}

/** FEFO — earliest-expiry batch with stock. */
export function fefoBatch(state: PharmState, itemId: string): Batch | undefined {
  return state.batches
    .filter((b) => b.itemId === itemId && b.qty > 0)
    .sort((a, b) => a.expDate.localeCompare(b.expDate))[0];
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function daysToExpiry(exp: string): number {
  return Math.ceil((new Date(exp + "T00:00:00").getTime() - Date.now()) / 86400000);
}

/* ============================== context ============================== */

interface PharmCtx {
  ph: PharmState;
  setPh: React.Dispatch<React.SetStateAction<PharmState>>;
  /** OP Sales prefill — set by Patient/OT Indents "Convert to sale". */
  prefill: Partial<Invoice> | null;
  setPrefill: (p: Partial<Invoice> | null) => void;
}

const Ctx = createContext<PharmCtx | null>(null);

export function PharmProvider({ children }: { children: React.ReactNode }) {
  const [ph, setPh] = useState<PharmState>(() => {
    const loaded = loadLS<PharmState | null>("astra.pharm.v1", null);
    return loaded && Array.isArray(loaded.items) && loaded.items.length ? loaded : seedState();
  });
  const [prefill, setPrefill] = useState<Partial<Invoice> | null>(null);
  useEffect(() => saveLS("astra.pharm.v1", ph), [ph]);
  const value = useMemo(() => ({ ph, setPh, prefill, setPrefill }), [ph, prefill]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePharm(): PharmCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePharm must be used inside PharmProvider");
  return ctx;
}

export { uid };
