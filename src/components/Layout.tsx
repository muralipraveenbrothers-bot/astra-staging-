import React, { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Building2,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  Globe,
  Heart,
  Layers,
  Users,
  LogOut,
  Mic,
  Moon,
  Brain,
  PlusCircle,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sun,
  Volume2,
  XCircle,
  Zap,
  FileText,
  Clock,
  ExternalLink,
  Crosshair,
  Bone,
} from "lucide-react";
import { toast } from "sonner";
import { AvatarOrb } from "./AvatarOrb";
import { AstraAICopilot } from "../sections/AstraAICopilot";
import { useStore } from "@/lib/store";
import { useAuth, ROLE_LABEL, ROLE_NAV, ROLE_HOME_URL, canAccessRoute } from "@/lib/auth";
import { ensureRoleSeeds, notificationAppliesTo, type HospitalNotification, type NotificationSeverity } from "@/lib/notifications";
import { executeApproval } from "@/lib/approvalsExec";
import { cn } from "@/lib/utils";
import { navHash, useHashRoute } from "@/lib/hashRoute";
import { useLang } from "@/lib/i18n";
import { detectVoiceTier, type VoiceTier } from "@/lib/offlineSpeech";
import { SystemHealthTicker } from "./SystemHealthTicker";
import { StaffCallPanel } from "./StaffCallPanel";

interface DeptTab {
  id: string;
  labelEn: string;
  labelTe: string;
  subLabel: string;
  path: string;
  icon: any;
  tone: string;
}

const DEPT_TABS: DeptTab[] = [
  {
    id: "doctor-command-os",
    labelEn: "🩺 Doctor Command OS",
    labelTe: "🩺 డాక్టర్ కమాండ్ OS",
    subLabel: "Clinical Command OS",
    path: "/command-os",
    icon: Stethoscope,
    tone: "from-cyan-500/30 via-teal-500/30 to-emerald-500/30 border-cyan-400/70 text-cyan-200 shadow-lg shadow-cyan-950/50 ring-1 ring-cyan-400/40",
  },
  {
    id: "lab",
    labelEn: "Laboratory",
    labelTe: "లాబొరేటరీ & డయాగ్నోస్టిక్స్",
    subLabel: "Diagnostics",
    path: "/lab",
    icon: ShieldAlert,
    tone: "from-cyan-600/30 to-blue-600/30 border-cyan-400/50 text-cyan-200",
  },
  {
    id: "radiology",
    labelEn: "Radiology & USG",
    labelTe: "రేడియోలజీ & స్కానింగ్",
    subLabel: "Imaging",
    path: "/radiology",
    icon: Sparkles,
    tone: "from-indigo-600/30 to-purple-600/30 border-indigo-400/50 text-indigo-200",
  },
  {
    id: "ward",
    labelEn: "Ward & IP Beds",
    labelTe: "వార్డు & ఐపీ బెడ్స్",
    subLabel: "Inpatient",
    path: "/ward",
    icon: Building2,
    tone: "from-teal-700/30 to-cyan-700/30 border-teal-500/50 text-teal-200",
  },
  {
    id: "pharmacy",
    labelEn: "Pharmacy (Dispensary)",
    labelTe: "ఫార్మసీ (మందుల దుకాణం)",
    subLabel: "Dispensing",
    path: "/pharmacy",
    icon: PlusCircle,
    tone: "from-emerald-600/30 to-teal-600/30 border-emerald-400/50 text-emerald-200",
  },
  {
    id: "billing-cmd",
    labelEn: "Billing Command",
    labelTe: "బిల్లింగ్ కమాండ్",
    subLabel: "Finance",
    path: "/billing",
    icon: Zap,
    tone: "from-blue-700/30 to-cyan-700/30 border-blue-400/50 text-blue-200",
  },
  {
    id: "reception",
    labelEn: "Reception & Print Hub",
    labelTe: "రిసెప్షన్ & ప్రింట్ హబ్",
    subLabel: "Registration",
    path: "/reception",
    icon: FileText,
    tone: "from-sky-600/30 to-blue-600/30 border-sky-400/50 text-sky-200",
  },
  {
    id: "ot-cmd",
    labelEn: "OT Command",
    labelTe: "ఆపరేషన్ థియేటర్ (OT)",
    subLabel: "Surgical",
    path: "/ot",
    icon: Activity,
    tone: "from-purple-600/30 to-indigo-600/30 border-purple-400/50 text-purple-200",
  },
  {
    id: "brain",
    labelEn: "Astra Brain",
    labelTe: "Astra Brain",
    subLabel: "Brain",
    path: "/brain",
    icon: Brain,
    tone: "from-violet-700/30 to-cyan-700/30 border-violet-400/50 text-violet-100",
  },
  {
    id: "health",
    labelEn: "System Health",
    labelTe: "సిస్టమ్ హెల్త్",
    subLabel: "Telemetry",
    path: "/health",
    icon: Activity,
    tone: "from-emerald-700/30 to-teal-700/30 border-emerald-500/50 text-emerald-200",
  },
  {
    id: "hospital-cmd",
    labelEn: "Hospital Command & Task Engine",
    labelTe: "హాస్పిటల్ కమాండ్ & టాస్క్ ఇంజిన్",
    subLabel: "OS & Tasks",
    path: "/hospital",
    icon: Building2,
    tone: "from-blue-600/30 to-indigo-600/30 border-blue-500/50 text-blue-200",
  },
  {
    id: "intelligence-lab",
    labelEn: "Astra Intelligence Lab",
    labelTe: "ఆస్ట్రా ఇంటెలిజెన్స్ ల్యాబ్",
    subLabel: "Micro · Skills · Science",
    path: "/intelligence-lab",
    icon: Brain,
    tone: "from-cyan-600/30 via-violet-600/25 to-amber-600/25 border-cyan-400/50 text-cyan-100",
  },
  {
    id: "staff-cmd",
    labelEn: "Staff Command",
    labelTe: "స్టాఫ్ కమాండ్",
    subLabel: "Work orders",
    path: "/staff",
    icon: Users,
    tone: "from-indigo-600/30 to-blue-600/30 border-indigo-400/50 text-indigo-200",
  },
  {
    id: "ceo-analytics",
    labelEn: "Executive Analytics (CEO)",
    labelTe: "ఎగ్జిక్యూటివ్ అనలిటిక్స్ (CEO)",
    subLabel: "CEO",
    path: "/ceo",
    icon: Layers,
    tone: "from-slate-700/40 to-slate-800/40 border-slate-500/40 text-slate-200",
  },
];

const SEVERITY_STYLE: Record<NotificationSeverity, string> = {
  critical: "border-red-400/40 bg-red-400/[0.07]",
  high: "border-amber-400/40 bg-amber-400/[0.06]",
  normal: "border-cyan-400/25 bg-cyan-400/[0.04]",
  info: "border-white/10 bg-white/[0.02]",
};

export function Layout({ children }: { children?: React.ReactNode }) {
  const { approvals, decideApproval, addPurchases, addBill, markDischarged, logAudit, notifications, addNotification, acknowledgeNotification, resolveNotification } = useStore();
  const { account, logout } = useAuth();
  const hash = useHashRoute();
  const [lang, setLang] = useLang();
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [darkTheme, setDarkTheme] = useState(true);
  const [voiceTier, setVoiceTier] = useState<VoiceTier | "checking">("checking");

  useEffect(() => {
    void detectVoiceTier().then((t) => setVoiceTier(t));
  }, []);

  // Seed notifications once per role
  useEffect(() => {
    if (account) ensureRoleSeeds(account.role, notifications, addNotification);
  }, [account?.id]);

  if (!account) return <>{children}</>;

  const role = account.role;
  const canDecide = role === "ceo" || role === "doctor" || role === "admin";
  const pendingApprovals = canDecide ? approvals.filter((a) => a.status === "pending") : [];
  const myNotifications = notifications
    .filter((n) => notificationAppliesTo(n, role))
    .sort((a, b) => b.createdTs - a.createdTs);
  const openNotifications = myNotifications.filter((n) => n.status !== "RESOLVED");
  const bellCount = openNotifications.length + pendingApprovals.length;

  const decide = (id: string, approve: boolean) => {
    const req = approvals.find((a) => a.id === id);
    if (!req || !account) return;
    decideApproval(id, approve, account.name);
    let outcome = "Decision logged.";
    if (approve) outcome = executeApproval(req, { addPurchases, addBill, markDischarged });
    logAudit(approve ? "Approval granted" : "Approval rejected", `${req.title} — by ${account.name} · ${outcome}`, account.name);
    toast[approve ? "success" : "error"](approve ? "Approved" : "Rejected", {
      description: `${req.title} · ${outcome}`,
    });
  };

  const pathOnly = hash.split("?")[0];
  const isImmersive =
    pathOnly === "/brain" ||
    pathOnly === "/browser" ||
    pathOnly.startsWith("/browser") ||
    pathOnly === "/command-os" ||
    pathOnly === "/doctor" ||
    pathOnly === "/doctor-command" ||
    pathOnly === "/command_os" ||
    (pathOnly.startsWith("/plugins/") && pathOnly !== "/plugins");

  const isDoctorCommandOs =
    pathOnly === "/command-os" ||
    pathOnly === "/doctor" ||
    pathOnly === "/doctor-command" ||
    pathOnly === "/command_os";

  const isActive = (path: string) => {
    if (path === "/ceo" && (pathOnly === "/ceo" || pathOnly === "/dashboard")) return true;
    if (path === "/hospital" && pathOnly === "/hospital") return true;
    if (path === "/supercore" && pathOnly === "/supercore") return true;
    if (path === "/clinical" && (pathOnly === "/clinical" || pathOnly === "/chat" || pathOnly === "/command")) return true;
    if (path === "/chat" && (pathOnly === "/clinical" || pathOnly === "/chat" || pathOnly === "/command")) return true;
    if (path === "/brain" || path.startsWith("/brain?")) return pathOnly === "/brain";
    if (path === "/browser") return pathOnly === "/browser" || pathOnly.startsWith("/browser");
    if (path === "/plugins") return pathOnly === "/plugins" || pathOnly.startsWith("/plugins/");
    return pathOnly === path;
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      navHash("/chat");
      toast.info(`AI searching for: "${query}"`);
      setQuery("");
    }
  };

  return (
    <div className={`flex flex-col h-screen overflow-hidden ${darkTheme ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-900"}`}>
      {/* ---------------- Top Astra Navigation Bar ---------------- */}
      <header className="shrink-0 border-b border-amber-500/20 bg-slate-900/80 backdrop-blur-xl px-4 py-2.5 z-40 shadow-lg shadow-black/30">
        <div className="flex items-center justify-between gap-3 max-w-full">
          {/* Left Brand — premium gold + cyan */}
          <div
            onClick={() => { if (account) navHash(ROLE_HOME_URL[account.role]); }}
            className="flex items-center gap-2.5 cursor-pointer select-none group shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 p-0.5 shadow-lg shadow-amber-600/30 ring-1 ring-amber-400/50 flex items-center justify-center group-hover:shadow-amber-500/40 transition-all">
              <div className="w-full h-full rounded-[9px] bg-slate-900/95 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/70 group-hover:text-amber-300 transition-colors">
                PM BROTHERS HOSPITAL
              </div>
              <div className="text-sm font-black tracking-tight text-white flex items-center gap-1.5 leading-none">
                <span className="text-gold-shimmer">ASTRA AI</span>
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Hospital OS
                </span>
              </div>
            </div>
          </div>

          {/* Center Search Bar */}
          <div className="relative flex-1 max-w-xl mx-2 hidden md:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search patient, UHID, order, report, medication..."
              className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all shadow-inner"
            />
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Universal Order Center Button */}
            <button
              onClick={() => navHash("/clinical")}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-900/30 transition-all active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Universal Order Center</span>
              <span className="w-4 h-4 rounded-full bg-blue-400/30 text-[10px] font-bold flex items-center justify-center">
                4
              </span>
            </button>

            {/* Offline Voice Box status chip */}
            <button
              onClick={() => navHash("/chat")}
              title={
                voiceTier === "voicebox"
                  ? "Astra Voicebox runtime connected — natural local AI voice"
                  : "Local Voicebox is offline — Astra is speaking with the browser/OS voice instead"
              }
              className="px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all stat-chip"
            >
              <Volume2 size={13} className={voiceTier === "unavailable" ? "text-rose-400" : "text-emerald-300"} />
              <span className="font-semibold">
                {voiceTier === "voicebox" ? "Voicebox AI" : voiceTier === "gemini" ? "Sarvam / Gemini" : "Voice Unavailable"}
              </span>
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full animate-pulse",
                  voiceTier === "voicebox" ? "bg-emerald-300" : "bg-rose-400"
                )}
              />
            </button>

            {/* Language Switcher */}
            <button
              onClick={() => setLang(lang === "te" ? "en" : "te")}
              className="px-2.5 py-1.5 rounded-lg border border-slate-700/70 bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1.5 transition-all"
              title="Toggle Telugu / English"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-semibold">{lang === "te" ? "తెలుగు" : "English"}</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={() => setDarkTheme(!darkTheme)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-700/70 bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1 transition-all"
              title="Toggle Cockpit Dark / Light Mode"
            >
              {darkTheme ? <Moon className="w-3.5 h-3.5 text-amber-300" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
              <span className="hidden sm:inline">Theme</span>
            </button>

            {/* Bell Notifications */}
            <div className="relative">
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="p-2 rounded-lg border border-slate-700/70 bg-slate-800/80 hover:bg-slate-700 text-slate-300 relative transition-all"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {bellCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                    {bellCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-96 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl z-50 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-cyan-400" /> Notifications & Approvals
                    </span>
                    <button
                      onClick={() => {
                        openNotifications.forEach((n) => resolveNotification(n.id));
                        toast.success("Resolved all notifications");
                      }}
                      className="text-[11px] text-cyan-400 hover:underline"
                    >
                      Resolve all
                    </button>
                  </div>

                  {openNotifications.length === 0 && pendingApprovals.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">All clear! No pending alerts ✨</p>
                  )}

                  <div className="space-y-1.5">
                    {openNotifications.slice(0, 10).map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          "rounded-lg border p-2 text-xs flex items-start gap-2",
                          SEVERITY_STYLE[n.severity]
                        )}
                      >
                        <div className="flex-1">
                          <p className="font-semibold text-slate-100">{n.title}</p>
                          <p className="text-[11px] text-slate-300 mt-0.5">{n.detail}</p>
                        </div>
                        <button
                          onClick={() => resolveNotification(n.id)}
                          className="text-slate-400 hover:text-white"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile User Badge */}
            <div className="relative">
              <button
                onClick={() => setUserOpen(!userOpen)}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700/80 transition-all text-left"
              >
                <div className="w-7 h-7 rounded-full bg-cyan-600/30 border border-cyan-400/50 flex items-center justify-center text-cyan-300 font-bold text-xs">
                  {account.name.charAt(0)}
                </div>
                <div className="leading-tight hidden sm:block">
                  <div className="text-xs font-bold text-white leading-none">{account.name}</div>
                  <div className="text-[10px] text-yellow-400/90 font-medium">{ROLE_LABEL[account.role]}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl z-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Signed in as</p>
                  <p className="text-xs font-bold text-white">{account.name}</p>
                  <p className="text-[11px] text-slate-400 mb-3">{account.subtitle || account.role}</p>
                  <button
                    onClick={() => {
                      setUserOpen(false);
                      logout();
                    }}
                    className="w-full px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out / Switch Role
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      {/* ---------------- Real-Time Diagnostic Health Ticker ---------------- */}
      <SystemHealthTicker />

      {/* ---------------- Sub-Nav Department Pill Bar (premium gold) ---------------- */}
      <div className="shrink-0 border-b border-amber-500/15 bg-slate-900/50 px-3 py-1.5 overflow-x-auto no-scrollbar z-30">
        <div className="flex items-center gap-1.5 min-w-max">
          {DEPT_TABS.filter((tab) => !["lab", "radiology", "ward", "pharmacy", "billing-cmd", "reception", "ot-cmd", "staff-cmd"].includes(tab.id) && canAccessRoute(role, tab.path)).map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            const title = lang === "te" ? tab.labelTe : tab.labelEn;

            return (
              <button
                key={tab.id}
                onClick={() => navHash(tab.path)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all border shrink-0",
                  active
                    ? cn(
                        "bg-gradient-to-r text-white shadow-md shadow-amber-950/40 scale-[1.02] ring-1 ring-amber-400/40",
                        tab.tone
                      )
                    : "bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-amber-200 hover:border-amber-500/30 hover:bg-slate-800"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", active ? "text-amber-100" : "text-slate-400")} />
                <span>{title}</span>
                <span
                  className={cn(
                    "text-[9px] px-1.5 py-0.2 rounded font-mono uppercase font-bold",
                    active ? "bg-amber-400/25 text-amber-100" : "bg-slate-700/60 text-slate-400"
                  )}
                >
                  {tab.subLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- Main Content Workspace ---------------- */}
      <main
        className={
          isDoctorCommandOs
            ? "flex-1 min-h-0 overflow-x-hidden overflow-y-auto scroll-smooth p-0 relative z-10"
            : isImmersive
            ? "flex-1 min-h-0 overflow-hidden p-0 relative z-10 flex flex-col"
            : "flex-1 overflow-y-auto p-4 relative z-10"
        }
      >
        <div className={isDoctorCommandOs ? "min-h-full" : isImmersive ? "flex-1 min-h-0" : "contents"}>{children}</div>
      </main>

      {/* ---------------- Global ASTRA AI Assistant (every dashboard) ----------------
       * AstraAICopilot renders its own floating "ASTRA AI" launcher (fixed
       * bottom-right) and expands into the voice + conversation copilot panel.
       * Mounted HERE in the shared shell so ASTRA AI is available on ALL
       * dashboards - evolved from JARVIS with the same voice features. */}
      {!/^\/(?:doctor|command-os|command-center)(?:\/|$)/.test(hash.split("?")[0]) && <AstraAICopilot />}
      <StaffCallPanel />
    </div>
  );
}
