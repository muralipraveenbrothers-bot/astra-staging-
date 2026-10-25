import { useEffect, useState } from "react";
import {
  BarChart3,
  BedDouble,
  BellRing,
  CalendarDays,
  Cloud,
  CreditCard,
  Fingerprint,
  FlaskConical,
  HeartHandshake,
  Megaphone,
  Mic,
  Pill,
  Radiation,
  ScanLine,
  Scissors,
  Star,
  Stethoscope,
  TrendingUp,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, canSeeSub, firstSubFor } from "@/lib/auth";
import { getHash, deptSubFor } from "@/lib/hashRoute";
import { Departments } from "./Departments";
import { Performance } from "./Performance";
import { Billing } from "./Billing";
import { Attendance } from "./Attendance";
import ClinicalWorkspace from "./clinical/ClinicalWorkspace";
import { Orders } from "./Orders";
import { Lab } from "./Lab";
import { OT } from "./OT";
import { Marketing } from "./Marketing";
import { Reputation } from "./Reputation";
import { Advisor } from "./Advisor";
import { Monitoring } from "./Monitoring";
import { Notifications } from "./Notifications";
import { CloudHMS } from "./CloudHMS";
import { VoiceRegistration } from "./VoiceRegistration";
import OPScan from "./OPScan";
import { PharmacyApp } from "./pharmacy/PharmacyApp";
import { Radiology } from "./Radiology";
import { WardMonitoring } from "./WardMonitoring";
import { Appointments } from "./Appointments";
import { Nursing } from "./Nursing";
import { Reports } from "./Reports";
import { EnhancedReceptionDashboard } from "./EnhancedReceptionDashboard";

export type Sub =
  | "cloud-hms" | "reception" | "voice-reg" | "op-scan" | "appointments"
  | "departments" | "performance" | "billing" | "pharmacy"
  | "ward" | "nursing" | "attendance" | "orders"
  | "lab" | "radiology" | "ot" | "marketing"
  | "reputation" | "clinical" | "advisor" | "reports"
  | "monitoring" | "notifications";

const subs: { key: Sub; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
  { key: "reception", label: "Reception Dashboard", icon: Users2 },
  { key: "departments", label: "Departments & Staff", icon: Users2 },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "billing", label: "Billing & Collections", icon: CreditCard },
  { key: "pharmacy", label: "Pharmacy", icon: Pill },
  { key: "ward", label: "Ward Mgmt + Monitoring", icon: BedDouble },
  { key: "nursing", label: "Nurse Scheduling", icon: BellRing },
  { key: "attendance", label: "Attendance", icon: Fingerprint },
  { key: "orders", label: "Orders (IP)", icon: BedDouble },
  { key: "lab", label: "Lab", icon: FlaskConical },
  { key: "radiology", label: "Radiology", icon: Radiation },
  { key: "ot", label: "OT", icon: Scissors },
  { key: "marketing", label: "Marketing & Outreach", icon: Megaphone },
  { key: "reputation", label: "Reputation", icon: Star },
  { key: "clinical", label: "Clinical Decision Support", icon: Stethoscope },
  { key: "advisor", label: "Advisor & Counseling", icon: HeartHandshake },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "monitoring", label: "Monitoring", icon: TrendingUp },
  { key: "notifications", label: "Notifications", icon: BellRing },
  // legacy Sparta connector — kept for deep links, no longer the default entry
];

const VALID = new Set<string>(subs.map((s) => s.key));

/** Hash-route-driven legacy sub-module viewer (for CEO deep-linking) */
export function HospitalOps() {
  const { account } = useAuth();
  const role = account?.role ?? "ceo";

  const hash = typeof window !== "undefined" ? getHash() : "/";
  const hashSub = deptSubFor(hash);

  // Map hash to sub — if no hash match, use the first allowed sub
  const initialSub = (hashSub && VALID.has(hashSub) ? hashSub : firstSubFor(role)) as Sub;
  const [internal, setInternal] = useState<Sub>(initialSub);

  // Update internal when hash changes
  useEffect(() => {
    const h = getHash();
    const hs = deptSubFor(h);
    if (hs && VALID.has(hs) && hs !== internal) {
      setInternal(hs as Sub);
    }
  }, [hash]);

  const current: Sub = internal;
  const allowedSubs = subs.filter((s) => canSeeSub(role, s.key));
  const blocked = !canSeeSub(role, current);

  // Role guard
  useEffect(() => {
    if (blocked) setInternal(firstSubFor(role) as Sub);
  }, [role, blocked]);

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-5">
        <h1 className="font-display text-3xl font-bold text-gradient">Hospital Ops</h1>
        <p className="text-sm text-slate-400 mt-1">
          Full HMS control plane — accessible to CEO / Admin only
        </p>
      </div>

      {/* Navigation tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {allowedSubs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setInternal(key)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-all border",
              current === key
                ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_14px_rgba(212,175,55,0.25)]"
                : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white hover:bg-white/[0.06]"
            )}
          >
            <Icon size={14} className={current === key ? "text-neon-cyan" : ""} />
            {label}
          </button>
        ))}
      </div>

      {/* Sub-module content */}
      {blocked ? (
        <div className="glass p-8 text-center max-w-lg mx-auto">
          <p className="text-sm font-semibold text-white">No access for your role</p>
          <p className="text-xs text-slate-400 mt-1.5">
            This module isn't available to the current role.
          </p>
        </div>
      ) : (
        <>
          {current === "cloud-hms" && <CloudHMS />}
          {current === "reception" && <ReceptionDashboard />}
          {current === "departments" && <Departments onOpenVoiceReg={() => setInternal("reception")} />}
          {current === "performance" && <Performance />}
          {current === "billing" && <Billing />}
          {current === "pharmacy" && <PharmacyApp />}
          {current === "ward" && <WardMonitoring />}
          {current === "nursing" && <Nursing />}
          {current === "attendance" && <Attendance />}
          {current === "orders" && <Orders />}
          {current === "lab" && <Lab />}
          {current === "radiology" && <Radiology />}
          {current === "ot" && <OT />}
          {current === "marketing" && <Marketing />}
          {current === "reputation" && <Reputation />}
          {current === "clinical" && <ClinicalWorkspace />}
          {current === "advisor" && <Advisor />}
          {current === "reports" && <Reports />}
          {current === "monitoring" && <Monitoring />}
          {current === "notifications" && <Notifications />}
        </>
      )}
    </div>
  );
}

/** Reception workspace — now powered by EnhancedReceptionDashboard with all new tabs. */
export function ReceptionDashboard() {
  return <EnhancedReceptionDashboard />;
}
