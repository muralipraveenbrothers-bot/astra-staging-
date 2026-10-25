import React, { useState, useMemo, useEffect, useRef } from "react";
import { ComingSoonTag, COMING_SOON_TITLE } from "@/components/ComingSoon";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Barcode,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  DollarSign,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Layers,
  Package,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Percent,
  Pill,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Scale,
  Scan,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { HospitalPrintEngine } from "@/lib/printEngine";
import { navHash } from "@/lib/hashRoute";
import { MedicationDraftPanel } from "@/astra/clinical/medication/MedicationDraftPanel";
import { OrderStatusChip } from "@/astra/clinical/workflow/OrderStatusChip";
import { executeWorkflowAction } from "@/astra/clinical/workflow/workflowClient";
import { toStockItems } from "@/astra/clinical/medication/stockCheck";
import { INVENTORY_ITEMS, type InventoryItem } from "./pharmacyInventorySeed";
import { DEMO_STOCK_LABEL, usePharmacyInventory } from "./pharmacyInventoryLive";
import { apiFetch } from "@/services/apiFetch";

type PharmacyNavTab =
  | "dashboard"
  | "pos"
  | "purchases"
  | "inventory"
  | "profit"
  | "orders"
  | "staff"
  | "settings";

function normalizeMedicineText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseVoicePharmacyItems(command: string, stock: readonly InventoryItem[]): Array<{ item: InventoryItem; qty: number }> {
  const normalized = normalizeMedicineText(command);
  return stock.flatMap((item) => {
    const aliases = [item.name, item.generic, item.name.replace(/\d+mg/i, ""), item.brand]
      .map(normalizeMedicineText)
      .filter((alias) => alias.length >= 4);
    const alias = aliases.find((candidate) => normalized.includes(candidate));
    if (!alias) return [];
    const before = normalized.slice(Math.max(0, normalized.indexOf(alias) - 24), normalized.indexOf(alias));
    const after = normalized.slice(normalized.indexOf(alias) + alias.length, normalized.indexOf(alias) + alias.length + 24);
    const quantity = Number((before.match(/(\d+)\s*$/) || after.match(/^\s*(\d+)/))?.[1] ?? 1);
    return [{ item, qty: Math.max(1, quantity) }];
  });
}

/** Pharmacy order as returned by GET /api/hospital/orders?category=pharmacy (server/db.ts HospitalOrder). */
type PharmacyOrder = {
  id: string;
  patientId?: string;
  uhid?: string;
  patientName?: string;
  item?: string;
  dosageOrSpec?: string;
  frequency?: string;
  status?: string;
  orderedBy?: string;
  orderedAt?: string;
};

export function PharmacyDashboard() {
  const { account } = useAuth();
  const [activeTab, setActiveTab] = useState<PharmacyNavTab>("dashboard");
  const [aiSubTab, setAiSubTab] = useState<"insights" | "druginfo" | "compare">("insights");
  const [searchQuery, setSearchQuery] = useState("");
  const stockState = usePharmacyInventory();
  const inventory = stockState.items;
  const inventoryIsFallback = !stockState.loading && !stockState.live;
  const inventoryRef = useRef<InventoryItem[]>(inventory);
  inventoryRef.current = inventory;
  const [pharmacyOrders, setPharmacyOrders] = useState<PharmacyOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billOcrBusy, setBillOcrBusy] = useState(false);
  const [billOcrResult, setBillOcrResult] = useState<string | null>(null);

  // POS State
  const [posCustomerType, setPosCustomerType] = useState<"op" | "ip" | "otc">("op");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "card" | "credit">("upi");
  const [cart, setCart] = useState<Array<{ item: InventoryItem; qty: number }>>([]);

  async function scanBillImage(file: File) {
    setBillFile(file);
    setBillOcrResult(null);
    setBillOcrBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const response = await fetch("/api/pharmacy/bill-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("astra.serverToken") ?? "pharmacy-token"}` },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64: btoa(binary),
        }),
      });
      const body = await response.json() as { text?: string; error?: string; items?: Array<{ brand?: string; generic?: string; batch?: string; expiry?: string; sheets?: number; tabsPerSheet?: number; ratePerSheet?: number }> };
      if (!response.ok) throw new Error(body.error || "OCR scan failed");
      setBillOcrResult(body.text || "No readable text was found in the bill.");
      if (body.items?.length) setPurchaseRows(body.items.map((row) => ({ brand: row.brand || "", generic: row.generic || "", batch: row.batch || "", expiry: row.expiry || "", sheets: Number(row.sheets || 0), tabsPerSheet: Number(row.tabsPerSheet || 0), ratePerSheet: Number(row.ratePerSheet || 0), lineTotal: Number(row.sheets || 0) * Number(row.ratePerSheet || 0) })));
      toast.success("Bill image scanned", { description: "Review the extracted text before posting stock." });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBillOcrResult(`Scan failed: ${message}`);
      toast.error("Bill OCR failed", { description: message });
    } finally {
      setBillOcrBusy(false);
    }
  }

  // Purchases State
  const [selectedDistributor, setSelectedDistributor] = useState("GlaxoSmithKline India Pharmaceuticals");
  const [purchaseRows, setPurchaseRows] = useState([
    {
      brand: "Augmentin 625mg",
      generic: "Amoxicillin + Clavulanic Acid 625mg",
      batch: "AUG-2026-992",
      expiry: "2027-12-31",
      sheets: 100,
      tabsPerSheet: 10,
      ratePerSheet: 150,
      lineTotal: 15000,
    },
  ]);

  // Doctor Orders State
  const [ordersDispensed, setOrdersDispensed] = useState(false);
  const [overridePin, setOverridePin] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/hospital/orders?category=pharmacy")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json() as { orders?: PharmacyOrder[] };
        const pending = (body.orders ?? []).filter((order) => order.status !== "dispensed" && order.status !== "cancelled");
        if (cancelled) return;
        setPharmacyOrders(pending);
        setSelectedOrderId((current) => current || pending[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setPharmacyOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedOrder = useMemo(() => pharmacyOrders.find((order) => order.id === selectedOrderId) ?? pharmacyOrders[0] ?? null, [pharmacyOrders, selectedOrderId]);
  const selectedOrderPatientUhid = selectedOrder?.uhid || selectedOrder?.patientId || "";
  const selectedOrderPatientName = selectedOrder?.patientName || selectedOrderPatientUhid;
  const pendingOrderCount = pharmacyOrders.length;

  // Settings State
  const [printerLayout, setPrinterLayout] = useState<"thermal" | "laser">("thermal");
  const [waPhones, setWaPhones] = useState("+91 98480 12345, +91 98765 43210");
  const [alertLowStock, setAlertLowStock] = useState(true);
  const [alertExpiry, setAlertExpiry] = useState(true);

  // Staff State
  const [staffList, setStaffList] = useState([
    {
      name: "Dr. Murali Praveen",
      email: "muralipraveen@hospital.org",
      phone: "+91 98480 12345",
      role: "Role: Admin",
      status: "Online",
      badgeColor: "bg-emerald-500/20 text-emerald-300",
    },
    {
      name: "Srinivas Rao, B.Pharm",
      email: "srinivas.pharmacy@hospital.org",
      phone: "+91 98765 43210",
      role: "Role: Pharmacist",
      status: "Online",
      badgeColor: "bg-emerald-500/20 text-emerald-300",
    },
    {
      name: "K. Swathi, D.Pharm",
      email: "swathi.pharmacy@hospital.org",
      phone: "+91 94401 22234",
      role: "Role: Pharmacist",
      status: "On Duty",
      badgeColor: "bg-cyan-500/20 text-cyan-300",
    },
    {
      name: "Ramesh Store Assistant",
      email: "ramesh.store@hospital.org",
      phone: "+91 91234 56789",
      role: "Role: Other Staff",
      status: "Offline",
      badgeColor: "bg-slate-700 text-slate-400",
    },
  ]);

  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, c) => sum + c.item.mrp * c.qty, 0);
  }, [cart]);

  const cartGst = useMemo(() => {
    return +(cartSubtotal * 0.05).toFixed(2);
  }, [cartSubtotal]);

  const cartTotal = useMemo(() => {
    return +(cartSubtotal + cartGst).toFixed(2);
  }, [cartSubtotal, cartGst]);

  const handleCompleteSale = () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setCart([]);
    toast.info("Cart cleared on this computer", {
      description: "Receipt not printed. Stock not updated.",
    });
  };

  useEffect(() => {
    const applyVoiceCommand = (event: Event) => {
      const command = (event as CustomEvent<{ text?: string }>).detail?.text ?? "";
      if (!command) return;
      setActiveTab("pos");
      if (/(?:yes|confirm).*(?:print|bill|sale)/i.test(command)) {
        toast.info("Voice note received", { description: "The cart is only on this computer. Clearing it does not print a receipt or update stock." });
        return;
      }
      const requested = parseVoicePharmacyItems(command, inventoryRef.current.length ? inventoryRef.current : INVENTORY_ITEMS);
      if (requested.length === 0) {
        toast.error("Medicine not recognized", { description: "Say the exact medicine name and quantity, then review the draft." });
        return;
      }
      setCart((previous) => requested.reduce((next, request) => {
        const existing = next.find((entry) => entry.item.id === request.item.id);
        return existing
          ? next.map((entry) => entry.item.id === request.item.id ? { ...entry, qty: entry.qty + request.qty } : entry)
          : [...next, request];
      }, [...previous]));
      toast.success("Voice order prepared", { description: "Review the patient, quantities, and payment mode. Nothing is printed or sent from this step." });
    };
    window.addEventListener("astra-pharmacy-command", applyVoiceCommand);
    const queryCommand = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("voiceCommand");
    if (queryCommand) applyVoiceCommand(new CustomEvent("astra-pharmacy-command", { detail: { text: queryCommand } }));
    return () => window.removeEventListener("astra-pharmacy-command", applyVoiceCommand);
  }, []);

  const handleDispenseDoctorOrder = async () => {
    if (!selectedOrder || !selectedOrderPatientUhid) {
      toast.error("Select a patient");
      return;
    }
    const gate = await executeWorkflowAction({
      action: "dispense",
      patientUhid: selectedOrderPatientUhid,
      orderId: selectedOrder.id,
      department: "pharmacy",
      actorId: account?.id ?? "pharmacy-counter",
      actorRole: account?.role ?? "pharmacy",
      device: "pharmacy-dashboard",
      adminPin: overridePin,
      adminReason: overrideReason,
    });
    if (!gate.allowed) {
      toast.error(gate.message);
      return;
    }
    setOrdersDispensed(true);
    const dispensedId = selectedOrder.id;
    setPharmacyOrders((prev) => prev.filter((order) => order.id !== dispensedId));
    setSelectedOrderId("");
    toast.success(`e-Prescription Dispensed: ${selectedOrderPatientName}`, {
      description: `${selectedOrder.item ?? "Prescription"} (order ${dispensedId}) marked dispensed.`,
    });
  };

  return (
    <div className="space-y-4 max-w-[1550px] mx-auto p-1 text-slate-100">
      {/* ---------------- 1. Top Header Banner ---------------- */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Pill className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                Pharmacy &amp; Dispensing Management
              </h1>
              <Badge tone="cyan">Astra Unified Module</Badge>
              {selectedOrderPatientUhid ? <OrderStatusChip patientUhid={selectedOrderPatientUhid} role="pharmacy" /> : null}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Sales POS, Purchases, Inventory, AI Insights, WhatsApp Alerts, Barcode Invoices &amp; Role Access
            </p>
          </div>
        </div>

        {/* Right Pending Doctor Orders Card */}
        <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800 shrink-0">
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              PENDING DOCTOR ORDERS:
            </span>
            <span className="text-sm font-bold text-cyan-300">
              {pendingOrderCount ? `${pendingOrderCount} Rx Ready` : "Select a patient"}
            </span>
          </div>
          <button
            onClick={() => setActiveTab("orders")}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all active:scale-95"
          >
            Dispense
          </button>
        </div>
      </div>

      {selectedOrderPatientUhid ? (
        <MedicationDraftPanel
          audience="pharmacy"
          patientId={selectedOrderPatientUhid}
          patientName={selectedOrderPatientName}
          inventory={toStockItems(inventory)}
        />
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">Select a patient</div>
      )}
      {inventoryIsFallback && <div data-testid="demo-stock-label" className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs font-bold text-amber-200">{DEMO_STOCK_LABEL}</div>}

      {/* ---------------- 2. Sub-Nav Tabs matching Screenshot ---------------- */}
      <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: "dashboard", label: "Dashboard & AI", icon: LayoutGridIcon },
          { id: "pos", label: "Sales POS", icon: ShoppingCart },
          { id: "purchases", label: "Purchases & OCR", icon: FileSpreadsheet },
          { id: "inventory", label: `Inventory Stock (${inventory.length})${inventoryIsFallback ? " Demo" : ""}`, icon: Package },
          { id: "profit", label: "Profit & GST", icon: TrendingUp },
          { id: "orders", label: `Doctor Orders (${pendingOrderCount})`, icon: ClipboardList },
          { id: "staff", label: "Staff & Roles", icon: Users },
          { id: "settings", label: "Settings & WA", icon: SettingsIcon },
        ].map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                active
                  ? "bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-900/40"
                  : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? "text-white" : "text-slate-400"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------- TAB 1: DASHBOARD & AI ---------------- */}
      {activeTab === "dashboard" && (
        <div className="space-y-4">
          {/* Quick Actions Shortcuts Bar */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400 fill-current" /> QUICK ACTIONS SHORTCUTS
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono font-semibold">
                Pharma Assist OS
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              <button
                onClick={() => setActiveTab("pos")}
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-blue-900/30 transition-all active:scale-95"
              >
                <ShoppingCart className="w-3.5 h-3.5" /> New Sale
              </button>

              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                className="opacity-50 cursor-not-allowed py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <Barcode className="w-3.5 h-3.5 text-cyan-400" /> Scan Barcode
              <ComingSoonTag /></button>

              <button
                onClick={() => setActiveTab("purchases")}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> New Purchase
              </button>

              <button
                onClick={() => setActiveTab("inventory")}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <Search className="w-3.5 h-3.5 text-blue-400" /> Search Medicine
              </button>

              <button
                onClick={() => setActiveTab("profit")}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" /> Profit Reports
              </button>

              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                className="opacity-50 cursor-not-allowed py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Alerts
              <ComingSoonTag /></button>
            </div>
          </div>

          {/* 4 Metric Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TODAY'S PHARMACY SALES</span>
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400"><DollarSign className="w-4 h-4" /></div>
              </div>
              <div className="text-2xl font-black text-white mt-1">₹28,450.00</div>
              <div className="text-[11px] text-emerald-400 font-semibold mt-0.5">↑ +14.2% vs yesterday (142 Invoices)</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">THIS MONTH PROFIT MARGIN</span>
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-cyan-400"><TrendingUp className="w-4 h-4" /></div>
              </div>
              <div className="text-2xl font-black text-white mt-1">₹4,12,800.00</div>
              <div className="text-[11px] text-cyan-300 font-semibold mt-0.5">Avg Margin: 41.8% Across Inventory</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LOW STOCK ITEMS</span>
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400"><AlertTriangle className="w-4 h-4" /></div>
              </div>
              <div className="text-2xl font-black text-amber-400 mt-1">2 Critical Items</div>
              <div className="text-[11px] text-slate-400 font-semibold mt-0.5">Deriphyllin &amp; Augmentin reorder needed</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">EXPIRING SOON (&lt; 60 DAYS)</span>
                <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400"><Shield className="w-4 h-4" /></div>
              </div>
              <div className="text-2xl font-black text-rose-400 mt-1">850 Tablets</div>
              <div className="text-[11px] text-slate-400 font-semibold mt-0.5">Value: ₹2,975 (Distributor return active)</div>
            </div>
          </div>

          {/* PM AI Insights */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 text-cyan-400 border border-blue-500/30"><Sparkles className="w-5 h-5" /></div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">PM AI Insights &amp; Clinical Drug Intelligence</h2>
                    <Badge tone="amber">Local screen. Gemini is not used.</Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Low stock predictions, drug MOA lookup, margin optimization &amp; multi-medicine comparative analysis</p>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button onClick={() => setAiSubTab("insights")} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${aiSubTab === "insights" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}>🔄 Insights</button>
                <button onClick={() => setAiSubTab("druginfo")} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${aiSubTab === "druginfo" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}>🔍 Drug Info</button>
                <button onClick={() => setAiSubTab("compare")} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${aiSubTab === "compare" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}>⚖️ Compare (3)</button>
              </div>
            </div>

            {/* 6 AI Insight Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">Stock-Out Risk</span>
                  <h3 className="text-xs font-bold text-white">Low Stock Prediction: Deriphyllin &amp; Augmentin</h3>
                  <p className="text-[11px] text-slate-300">Based on current IPD bed occupancy (92%) and seasonal respiratory surge, Deriphyllin 150mg &amp; Augmentin 625mg will stock out in 3 days.</p>
                </div>
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold">Auto-Generate PO to Distributor →<ComingSoonTag /></button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">Expiry Risk ₹2,975</span>
                  <h3 className="text-xs font-bold text-white">Expiry Alert: Deriphyllin Retard (Batch DER-1102)</h3>
                  <p className="text-[11px] text-slate-300">85 Sheets (850 Tablets) expiring on Oct 30, 2026. Value: ₹2,975. Recommend immediate return to Zydus Healthcare.</p>
                </div>
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold">Initiate Distributor Return →<ComingSoonTag /></button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">+6% Profit Boost</span>
                  <h3 className="text-xs font-bold text-white">High Margin Opportunity: Dolo 650mg vs Paracetamol Generics</h3>
                  <p className="text-[11px] text-slate-300">Dolo 650 yields 52% gross margin. Recommend stocking Micro-Paracetamol 650 bulk pack for 58% margin.</p>
                </div>
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold">View Profit Comparison →<ComingSoonTag /></button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 font-bold">Patient Savings ~27%</span>
                  <h3 className="text-xs font-bold text-white">Generic Medicine Replacement Suggestion</h3>
                  <p className="text-[11px] text-slate-300">Augmentin 625mg (₹22/tab) can be substituted with Moxikind-CV 625mg (₹16/tab) with identical bioequivalence.</p>
                </div>
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold">Compare Molecules →<ComingSoonTag /></button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">Top Distributor #1</span>
                  <h3 className="text-xs font-bold text-white">Distributor Ranking: Micro Labs vs Mankind Pharma</h3>
                  <p className="text-[11px] text-slate-300">Micro Labs has 98% on-time fulfillment and 2% higher credit discount compared to regional distributors.</p>
                </div>
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold">View Distributor Analytics →<ComingSoonTag /></button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">Dead Stock Clearance</span>
                  <h3 className="text-xs font-bold text-white">Dead Stock Warning: Rare Specialized Antidotes</h3>
                  <p className="text-[11px] text-slate-300">3 items in cabinet 4 showing zero movement in 120 days. Capital tied up: ₹8,400.</p>
                </div>
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold">Clear Dead Stock →<ComingSoonTag /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 2: SALES POS (Screenshot 1) ---------------- */}
      {activeTab === "pos" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-cyan-400" /> Point of Sale (POS) &amp; Invoice Billing
            </h2>
            <div className="flex items-center gap-1">
              <button type="button" aria-current="true" title="Current view" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold shadow">New Sale POS</button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">Sales History (1)<ComingSoonTag /></button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">Sales Returns (0)<ComingSoonTag /></button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Customer Selection & Medicine Grid */}
            <div className="lg:col-span-8 space-y-4">
              {/* Customer Type Bar */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">PATIENT / CUSTOMER TYPE:</span>
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button onClick={() => setPosCustomerType("op")} className={`px-3 py-1 rounded text-xs font-bold ${posCustomerType === "op" ? "bg-blue-600 text-white" : "text-slate-400"}`}>OP</button>
                    <button onClick={() => setPosCustomerType("ip")} className={`px-3 py-1 rounded text-xs font-bold ${posCustomerType === "ip" ? "bg-blue-600 text-white" : "text-slate-400"}`}>IP</button>
                    <button onClick={() => setPosCustomerType("otc")} className={`px-3 py-1 rounded text-xs font-bold ${posCustomerType === "otc" ? "bg-blue-600 text-white" : "text-slate-400"}`}>Over the Counter</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Select Registered Hospital Patient:</label>
                    <select
                      value={selectedPatient}
                      onChange={(e) => {
                        setSelectedPatient(e.target.value);
                        const match = pharmacyOrders.find((order) => e.target.value.includes(order.id) || e.target.value.includes(order.uhid || "") || e.target.value.includes(order.patientId || ""));
                        if (match) setSelectedOrderId(match.id);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-semibold text-xs"
                    >
                      <option value="">-- Choose Patient / Prescribed Rx --</option>
                      {pharmacyOrders.map((order) => {
                        const label = `${order.patientName || order.uhid || order.patientId || "Patient"} (${order.uhid || order.patientId || order.id})`;
                        return <option key={order.id} value={label}>{label}</option>;
                      })}
                      <option value="Ramesh Patel (UHID-2026-8807) - Nephrology">Ramesh Patel (UHID-2026-8807) - Nephrology</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Phone Number:</label>
                    <input type="text" defaultValue="+91 98765 00000" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs" />
                  </div>
                </div>
              </div>

              {/* Barcode & Search */}
              <div className="flex gap-2 text-xs">
                <input type="text" placeholder="Scan Barcode / Enter Batch No..." className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono" />
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-4 py-2 rounded-lg bg-blue-600 text-white font-bold">Scan Item<ComingSoonTag /></button>
              </div>

              {/* Medicine Quick Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {inventory.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <strong className="text-xs font-bold text-white block">{item.name}</strong>
                        <span className="text-[10px] text-slate-400">{item.generic}</span>
                        <span className="text-[9px] text-slate-500 block font-mono">Batch: {item.batch}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-cyan-300 font-mono block">₹{item.mrp}/tab</span>
                        <span className="text-[10px] text-slate-400 font-mono">Stock: {item.stock}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setCart((prev) => {
                          const exist = prev.find((c) => c.item.id === item.id);
                          if (exist) {
                            return prev.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c));
                          }
                          return [...prev, { item, qty: 1 }];
                        });
                        toast.success(`Added ${item.name} to POS Cart`);
                      }}
                      className="w-full py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold transition-all"
                    >
                      + Add to POS Cart
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: POS Sale Cart */}
            <div className="lg:col-span-4 rounded-xl bg-slate-950 p-4 border border-slate-800 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-cyan-400" /> POS Sale Cart ({cart.length} Items)
                  </h3>
                  <Badge tone="cyan">Invoice Draft</Badge>
                </div>

                {cart.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    Cart is empty. Click medicines or scan barcode to add items.
                  </div>
                ) : (
                  <div className="space-y-2 text-xs max-h-[220px] overflow-y-auto pr-1">
                    {cart.map((c, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <div>
                          <strong className="text-white block">{c.item.name}</strong>
                          <span className="text-[10px] text-slate-400">{c.qty} × ₹{c.item.mrp}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-cyan-300">₹{(c.qty * c.item.mrp).toFixed(2)}</span>
                          <button
                            onClick={() => setCart(cart.filter((_, i) => i !== idx))}
                            className="text-slate-500 hover:text-rose-400 p-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Financial Calculation & Payment */}
              <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
                <div className="space-y-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-mono text-white">₹{cartSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount (%):</span>
                    <span className="font-mono text-white">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST Tax (5%):</span>
                    <span className="font-mono text-white">₹{cartGst.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm font-bold text-white pt-2 border-t border-slate-800">
                  <span>Net Total Amount:</span>
                  <span className="text-emerald-400 font-mono text-base font-black">₹{cartTotal.toFixed(2)}</span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-bold block">Select Payment Mode:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "cash", label: "Cash" },
                      { id: "upi", label: "UPI" },
                      { id: "card", label: "Card" },
                      { id: "credit", label: "Insurance / Credit" },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setPaymentMode(mode.id as any)}
                        className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          paymentMode === mode.id
                            ? "bg-blue-600 border-blue-400 text-white shadow"
                            : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleCompleteSale}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Clear cart on this computer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 3: PURCHASES & OCR (Screenshot 2) ---------------- */}
      {activeTab === "purchases" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Purchase &amp; Distributor Supply Chain Management
            </h2>
            <div className="flex items-center gap-1">
              <button type="button" aria-current="true" title="Current view" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold shadow">New Purchase Bill</button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">Add Without Bill<ComingSoonTag /></button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">Purchase Log (1)<ComingSoonTag /></button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">Distributors (4)<ComingSoonTag /></button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <strong className="text-xs font-bold text-white block">New Distributor Purchase Entry</strong>
                <span className="text-[10px] text-slate-400">Upload supplier bill image or manually enter batch stock items</span>
              </div>
              <label className="cursor-pointer px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow">
                <Upload className="w-4 h-4" /> {billOcrBusy ? "Scanning…" : "Upload Bill Image (AI OCR Scan)"}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/*"
                  disabled={billOcrBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void scanBillImage(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <label className="cursor-pointer px-4 py-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 text-xs font-bold flex items-center gap-1.5">
                <Scan className="w-4 h-4" /> Take Bill Photo
                <input type="file" className="sr-only" accept="image/*" capture="environment" disabled={billOcrBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void scanBillImage(file); event.currentTarget.value = ""; }} />
              </label>
            </div>
            {billFile && (
              <div className="rounded-lg border border-blue-400/20 bg-blue-400/[0.06] p-3 text-[10px]">
                <p className="font-bold text-blue-200">{billFile.name}</p>
                {billOcrResult && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-slate-300">{billOcrResult}</pre>}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Select Drug Distributor:</label>
                <select
                  value={selectedDistributor}
                  onChange={(e) => setSelectedDistributor(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                >
                  <option value="GlaxoSmithKline India Pharmaceuticals">GlaxoSmithKline India Pharmaceuticals</option>
                  <option value="Micro Labs Wholesale Agencies">Micro Labs Wholesale Agencies</option>
                  <option value="Mankind Pharma Direct Agency">Mankind Pharma Direct Agency</option>
                  <option value="Alkem & Zydus Consolidated Meds">Alkem &amp; Zydus Consolidated Meds</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Supplier Bill / Invoice No:</label>
                <input type="text" defaultValue="PUR-2026-5972" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Invoice Date:</label>
                <input type="date" defaultValue="2026-08-15" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs" />
              </div>
            </div>

            {/* Line Items Table */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PURCHASED MEDICINE LINE ITEMS:</span>
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                  className="opacity-50 cursor-not-allowed text-xs text-cyan-400 font-bold hover:underline"
                >
                  + Add Medicine Row
                <ComingSoonTag /></button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[9px]">
                    <tr>
                      <th className="p-2">Brand Name</th>
                      <th className="p-2">Generic Molecule</th>
                      <th className="p-2">Batch No</th>
                      <th className="p-2">Expiry Date</th>
                      <th className="p-2">Sheets</th>
                      <th className="p-2">Tabs / Sheet</th>
                      <th className="p-2">Rate / Sheet</th>
                      <th className="p-2">Line Total</th>
                      <th className="p-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {purchaseRows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="p-2"><input type="text" defaultValue={row.brand} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs" /></td>
                        <td className="p-2"><input type="text" defaultValue={row.generic} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs" /></td>
                        <td className="p-2 font-mono"><input type="text" defaultValue={row.batch} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs w-24" /></td>
                        <td className="p-2 font-mono"><input type="date" defaultValue={row.expiry} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs" /></td>
                        <td className="p-2 font-mono"><input type="number" defaultValue={row.sheets} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs w-16" /></td>
                        <td className="p-2 font-mono"><input type="number" defaultValue={row.tabsPerSheet} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs w-16" /></td>
                        <td className="p-2 font-mono"><input type="number" defaultValue={row.ratePerSheet} className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs w-20" /></td>
                        <td className="p-2 font-mono font-bold text-emerald-400">₹{row.lineTotal.toFixed(2)}</td>
                        <td className="p-2"><button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed text-rose-400 p-1"><Trash2 className="w-3.5 h-3.5" /><ComingSoonTag /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-3 flex justify-end">
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                  className="opacity-50 cursor-not-allowed px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-all"
                >
                  ✓ Save Purchase Order &amp; Stock Inventory
                <ComingSoonTag /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 4: INVENTORY STOCK (Screenshot 3) ---------------- */}
      {activeTab === "inventory" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" /> Pharmacy Medicine Stock &amp; Inventory Control
            </h2>
            <div className="flex items-center gap-1">
              <button type="button" aria-current="true" title="Current view" className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold shadow">All Inventory (5)</button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">Low Stock (0)<ComingSoonTag /></button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">Expiring Soon (1)<ComingSoonTag /></button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search brand, generic molecule, batch no..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white text-xs"
              />
            </div>
            <span className="text-slate-400 text-[11px]">Showing 5 of 5 Medicine Batches</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[9px]">
                <tr>
                  <th className="p-3">Brand Name</th>
                  <th className="p-3">Generic Molecule</th>
                  <th className="p-3">Batch No</th>
                  <th className="p-3">Expiry Date</th>
                  <th className="p-3">Stock (Sheets / Tabs)</th>
                  <th className="p-3">Distributor</th>
                  <th className="p-3">MRP / Tab</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {inventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-bold text-white">{item.name}</td>
                    <td className="p-3 text-slate-300">{item.generic}</td>
                    <td className="p-3 font-mono text-cyan-300">{item.batch}</td>
                    <td className="p-3 font-mono text-slate-300">{item.expiry}</td>
                    <td className="p-3 font-mono font-bold text-white">{item.stock} Tabs ({item.sheets} Sheets)</td>
                    <td className="p-3 text-slate-400">{item.distributor}</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">₹{item.mrp}</td>
                    <td className="p-3 flex items-center gap-1.5">
                      <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400">✏️<ComingSoonTag /></button>
                      <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed p-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-400">🗑️<ComingSoonTag /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- TAB 5: PROFIT & GST (Screenshot 4) ---------------- */}
      {activeTab === "profit" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" /> Profit Analytics &amp; Financial Reports
            </h2>
            <div className="flex items-center gap-1">
              <button type="button" aria-current="true" title="Current view" className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold shadow">Profit Analytics</button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">Expiry Loss Report<ComingSoonTag /></button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">% GST Tax Summary<ComingSoonTag /></button>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700">Distributor Comparison<ComingSoonTag /></button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">GROSS SALES REVENUE</span>
              <div className="text-2xl font-black text-cyan-300 mt-1">₹97.12</div>
              <span className="text-[10px] text-slate-400">Across 1 POS bills</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">EST. NET PROFIT MARGIN</span>
              <div className="text-2xl font-black text-emerald-400 mt-1">₹40.79</div>
              <span className="text-[10px] text-slate-400">42.0% Average Gross Margin</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">TOTAL GST TAX COLLECTED</span>
              <div className="text-2xl font-black text-blue-400 mt-1">₹4.86</div>
              <span className="text-[10px] text-slate-400">2.5% CGST + 2.5% SGST</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">EXPIRY LOSS RISK VALUE</span>
              <div className="text-2xl font-black text-rose-400 mt-1">₹2,975.00</div>
              <span className="text-[10px] text-slate-400">850 Tablets (Distributor return active)</span>
            </div>
          </div>

          {/* Per-Medicine Profitability Bars */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Per-Medicine Profitability &amp; Margin Breakdown</span>
              <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1 rounded bg-amber-600 text-white text-xs font-bold">Export CSV<ComingSoonTag /></button>
            </div>

            <div className="space-y-3 text-xs pt-1">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-white font-bold">Dolo 650mg</span>
                  <span className="text-emerald-400 font-bold">52% Margin (Rev: ₹16800)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[52%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-white font-bold">Amlokind 5mg</span>
                  <span className="text-cyan-300 font-bold">45% Margin (Rev: ₹11200)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-cyan-500 w-[45%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-white font-bold">Pan 40mg</span>
                  <span className="text-amber-400 font-bold">42% Margin (Rev: ₹34100)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-amber-500 w-[42%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-white font-bold">Augmentin 625mg</span>
                  <span className="text-purple-400 font-bold">32% Margin (Rev: ₹58800)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-purple-500 w-[32%]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 6: DOCTOR ORDERS (Screenshot 3) ---------------- */}
      {activeTab === "orders" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-cyan-400" /> Doctor Prescriptions Synced from OP/IP Consultation
              </h2>
              <p className="text-xs text-slate-400">Live queue of prescriptions dispatched by consultants for immediate dispensing</p>
            </div>
            <Badge tone={pendingOrderCount === 0 ? "green" : "amber"}>
              {`${pendingOrderCount} Pending Dispense`}
            </Badge>
          </div>

          {pharmacyOrders.length === 0 ? (
            <div className="py-12 text-center text-xs text-emerald-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
              <strong className="text-sm block">{ordersDispensed ? "All Doctor Prescriptions Dispensed" : "No pending prescriptions"}</strong>
              <p className="text-slate-400">New electronic prescriptions from doctors appear here from the hospital order list.</p>
            </div>
          ) : !selectedOrder ? (
            <div className="py-12 text-center text-xs text-slate-400 space-y-2">
              <ClipboardList className="w-8 h-8 mx-auto text-slate-500" />
              <strong className="text-sm block text-slate-200">Select a patient</strong>
              <p>No live pharmacy order is selected.</p>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <label className="block text-[10px] text-slate-400">Pending prescription
                <select value={selectedOrder.id} onChange={(e) => setSelectedOrderId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-semibold text-xs">
                  {pharmacyOrders.map((order) => (
                    <option key={order.id} value={order.id}>{`${order.patientName || order.uhid || order.patientId || "Patient"} (${order.uhid || order.patientId || order.id}) - ${order.item ?? "Prescription"}`}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <strong className="text-sm font-bold text-white">{selectedOrderPatientName || "Patient"} ({selectedOrderPatientUhid || selectedOrder.id})</strong>
                  <p className="text-[10px] text-slate-400">Ordered by: {selectedOrder.orderedBy || "not recorded"} • Ordered at: {selectedOrder.orderedAt ? new Date(selectedOrder.orderedAt).toLocaleString() : "not recorded"}</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold ml-2">{selectedOrder.status || "pending"}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PRESCRIBED MEDICINE:</span>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <strong className="text-white block">{selectedOrder.item || "not recorded"}</strong>
                  <span className="text-[11px] text-slate-400">{[selectedOrder.dosageOrSpec, selectedOrder.frequency].filter(Boolean).join(" • ") || "Dose and frequency not recorded"}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <input type="password" value={overridePin} onChange={(e) => setOverridePin(e.target.value)} placeholder="Admin PIN" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px]" />
                <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Override reason" className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px]" />
                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold">🖨️ Print Rx<ComingSoonTag /></button>
                <button onClick={handleDispenseDoctorOrder} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Mark Dispensed &amp; Deduct Stock
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- TAB 7: STAFF & ROLES (Screenshot 4) ---------------- */}
      {activeTab === "staff" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" /> Pharmacy Staff User Management &amp; Role-Based Access (RBAC)
              </h2>
              <p className="text-xs text-slate-400">Manage Admin, Pharmacist, and Assistant Staff access credentials</p>
            </div>
            <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
              className="opacity-50 cursor-not-allowed px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow flex items-center gap-1.5 transition-all"
            >
              <UserPlus className="w-4 h-4" /> + Invite Staff Member
            <ComingSoonTag /></button>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-cyan-400" /> Active Logged-In Staff Sessions
              </span>
              <span className="text-[10px] text-slate-400 font-mono font-semibold">3 Users Online</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {staffList.map((staff, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <strong className="text-xs font-bold text-white block">{staff.name}</strong>
                    <p className="text-[10px] text-slate-400 font-mono">{staff.email} • {staff.phone}</p>
                    <span className="text-[10px] text-slate-400 font-semibold">{staff.role}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${staff.badgeColor}`}>
                      {staff.status}
                    </span>
                    <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                      className="opacity-50 cursor-not-allowed text-[10px] text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      {staff.status === "Offline" ? "Reactivate" : "Deactivate"}
                    <ComingSoonTag /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 8: SETTINGS & WA (Screenshot 5) ---------------- */}
      {activeTab === "settings" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" /> Pharma Assist Configuration &amp; Profile Settings
            </h2>
            <p className="text-xs text-slate-400">WhatsApp Twilio alerts setup, thermal receipt printer options &amp; avatar profile</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: WhatsApp & Printer */}
            <div className="lg:col-span-6 rounded-xl bg-slate-950 p-4 border border-slate-800 space-y-4">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Send className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp Twilio Alerts &amp; Printer Options
              </span>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">WhatsApp Recipient Phone Numbers (Comma Separated):</label>
                  <input
                    type="text"
                    value={waPhones}
                    onChange={(e) => setWaPhones(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs"
                  />
                  <span className="text-[10px] text-cyan-300 font-semibold block mt-1">✓ Configured for Twilio WhatsApp Business API integration</span>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alertLowStock}
                      onChange={(e) => setAlertLowStock(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                    />
                    <span>Send WhatsApp Alert on Low Stock Thresholds</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alertExpiry}
                      onChange={(e) => setAlertExpiry(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                    />
                    <span>Send WhatsApp Alert 60 Days Prior to Medicine Expiry</span>
                  </label>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <label className="text-[10px] text-slate-400 block">Default POS Receipt Printer Layout:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPrinterLayout("thermal")}
                      className={`py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                        printerLayout === "thermal"
                          ? "bg-blue-600 border-blue-400 text-white shadow"
                          : "bg-slate-900 border-slate-700 text-slate-300"
                      }`}
                    >
                      <Receipt className="w-3.5 h-3.5" /> 80mm Thermal Receipt
                    </button>
                    <button
                      onClick={() => setPrinterLayout("laser")}
                      className={`py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                        printerLayout === "laser"
                          ? "bg-blue-600 border-blue-400 text-white shadow"
                          : "bg-slate-900 border-slate-700 text-slate-300"
                      }`}
                    >
                      <Printer className="w-3.5 h-3.5" /> A4 Laser Full Bill
                    </button>
                  </div>
                </div>

                <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                  className="opacity-50 cursor-not-allowed w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow"
                >
                  💾 Save Notification Preferences
                <ComingSoonTag /></button>
              </div>
            </div>

            {/* Right: User Avatar & Profile */}
            <div className="lg:col-span-6 rounded-xl bg-slate-950 p-4 border border-slate-800 space-y-4">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-cyan-400" /> User Avatar &amp; Personal Profile
              </span>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white text-base">
                  MP
                </div>
                <div>
                  <strong className="text-xs font-bold text-white block">Dr. Murali Praveen</strong>
                  <p className="text-[10px] text-slate-400">Chief Medical Officer &amp; Hospital Admin</p>
                  <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true" className="opacity-50 cursor-not-allowed text-[10px] text-cyan-400 font-bold hover:underline">Change Avatar Image<ComingSoonTag /></button>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Display Name:</label>
                  <input type="text" defaultValue="Dr. Murali Praveen" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Phone Number:</label>
                  <input type="text" defaultValue="+91 98480 12345" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Email Address:</label>
                  <input type="email" defaultValue="muralipraveen@hospital.org" className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LayoutGridIcon(props: any) {
  return <Layers {...props} />;
}

function SettingsIcon(props: any) {
  return <Sparkles {...props} />;
}
