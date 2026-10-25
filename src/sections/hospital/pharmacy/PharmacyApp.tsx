// SpartaHMS-style Pharmacy module — internal left sub-sidebar + content area.
// Screens mirror the reference build: Dashboard / Masters / Transaction /
// Sales / Sales Returns / Duplicate Invoice / Reports / Due Collections /
// Stock→Item Stock / Expenses. Astra gold-obsidian theming, Sparta working style.

import { useState } from "react";
import {
  BarChart3, Boxes, Database, FileText, Landmark,
  Printer, RotateCcw, ShoppingCart, Truck, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PharmProvider } from "./pharmData";
import { PharmDashboard } from "./screens/Dashboard";
import { Masters } from "./screens/Masters";
import { Transaction } from "./screens/Transaction";
import { Sales } from "./screens/Sales";
import { AfterSales } from "./screens/AfterSales";
import { ReportsStock } from "./screens/ReportsStock";

export type PharmScreen =
  | "dashboard"
  | "masters" | "transaction" | "sales"
  | "returns" | "duplicate" | "reports" | "dues"
  | "stock" | "expenses";

const NAV: { key: PharmScreen; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }>; group: string }[] = [  { key: "dashboard", label: "Dashboard", icon: BarChart3, group: "" },
  { key: "masters", label: "Masters", icon: Database, group: "SETUP" },
  { key: "transaction", label: "Transaction", icon: Truck, group: "" },
  { key: "sales", label: "Sales", icon: ShoppingCart, group: "BILLING" },
  { key: "returns", label: "Sales Returns", icon: RotateCcw, group: "" },
  { key: "duplicate", label: "Duplicate Invoice", icon: Printer, group: "" },
  { key: "reports", label: "Reports", icon: FileText, group: "ANALYSIS" },
  { key: "dues", label: "Due Collections", icon: Wallet, group: "" },
  { key: "stock", label: "Stock · Item Stock", icon: Boxes, group: "INVENTORY" },
  { key: "expenses", label: "Expenses", icon: Landmark, group: "" },
];

export function PharmacyApp() {
  const [screen, setScreen] = useState<PharmScreen>("dashboard");

  return (
    <PharmProvider>
      <div className="flex gap-4 max-w-[1500px] mx-auto items-start">
        {/* -------- internal sub-sidebar (Sparta-style) -------- */}
        <aside className="w-52 shrink-0 glass p-3 space-y-0.5 sticky top-0 max-h-[calc(100vh-120px)] overflow-y-auto">
          <p className="px-2 pb-2 text-[10px] uppercase tracking-[0.2em] text-amber-500/80 font-semibold">Pharmacy</p>
          {NAV.map(({ key, label, icon: Icon, group }) => (
            <div key={key}>
              {group && <p className="px-2 pt-2.5 pb-1 text-[9px] uppercase tracking-[0.18em] text-slate-600">{group}</p>}
              <button
                onClick={() => setScreen(key)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all border text-left",
                  screen === key
                    ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_12px_rgba(212,175,55,0.22)]"
                    : "text-slate-400 border-transparent hover:text-white hover:bg-white/[0.05]"
                )}
              >
                <Icon size={13} className={screen === key ? "text-neon-cyan shrink-0" : "shrink-0"} />
                {label}
              </button>
            </div>
          ))}
        </aside>

        {/* -------- content -------- */}
        <div className="flex-1 min-w-0">
          {screen === "dashboard" && <PharmDashboard />}
          {screen === "masters" && <Masters />}
          {screen === "transaction" && <Transaction />}
          {screen === "sales" && <Sales goReturns={() => setScreen("returns")} />}
          {screen === "returns" && <AfterSales view="returns" />}
          {screen === "duplicate" && <AfterSales view="duplicate" />}
          {screen === "dues" && <AfterSales view="dues" />}
          {screen === "reports" && <ReportsStock view="reports" />}
          {screen === "stock" && <ReportsStock view="stock" />}
          {screen === "expenses" && <ReportsStock view="expenses" />}
        </div>
      </div>
    </PharmProvider>
  );
}
