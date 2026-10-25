// Role-based access for the HMS. Mock auth — the staff-operated hospital
// modules are usable without any AI backend; the AI layer (Chat/Agents/
// Settings) is restricted to Doctor and CEO roles.

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadLS, saveLS } from "./utils";

export type Role = "ceo" | "doctor" | "reception" | "pharmacy" | "ward" | "lab" | "radiotech" | "ot" | "supervisor" | "finance" | "hr" | "marketing" | "admin";

export interface Account {
  id: string;
  name: string;
  role: Role;
  pin: string;
  subtitle: string;
  mustChangePin?: boolean;
}

// Intentionally build-time only: permits an isolated UI preview when the
// staging API and credential vault are unavailable.
export const STAGING_DEMO_AUTH =
  import.meta.env.VITE_ASTRA_STAGING_DEMO_AUTH === "true";

const STAGING_DEMO_PIN = "472946";
const STAGING_RECEPTION_ACCOUNT: Account = {
  id: "reception",
  name: "Meera Nair",
  role: "reception",
  pin: "",
  subtitle: "Front Desk Lead — staging only",
};
const STAGING_CEO_ACCOUNT: Account = { id: "ceo", name: "Dr. Admin", role: "ceo", pin: "", subtitle: "CEO / staging only" };
const STAGING_DEMO_ACCOUNT: Account = {
  id: "staging-demo-doctor",
  name: "Demo Doctor — Staging Only",
  role: "doctor",
  pin: "",
  subtitle: "Synthetic preview — no patient data or live services",
  mustChangePin: false,
};

const ACCOUNT_STORAGE_KEY = "astra.accounts";

// PINs live only in the server vault (scrypt hashes in data/auth-vault.json).
// The client never stores or sees them — accounts load from /api/auth/accounts/public.
export const ACCOUNTS: Account[] = [
  { id: "dr-murali", name: "Dr. Murali Praveen", role: "doctor", pin: "", subtitle: "Chief Medical Director / Doctor Command" },
  { id: "ceo", name: "Dr. Admin", role: "ceo", pin: "", subtitle: "CEO / Hospital Administrator" },
  { id: "dr-anitha", name: "Dr. Anitha", role: "doctor", pin: "", subtitle: "Consultant — General Medicine" },
  { id: "dr-karthik", name: "Dr. Karthik", role: "doctor", pin: "", subtitle: "Consultant — Surgery" },
  { id: "reception", name: "Meera Nair", role: "reception", pin: "", subtitle: "Front Desk Lead" },
  { id: "pharmacy", name: "Sana Iqbal", role: "pharmacy", pin: "", subtitle: "Chief Pharmacist" },
  { id: "ward", name: "Anjali Verma", role: "ward", pin: "", subtitle: "Staff Nurse — Ward" },
  { id: "lab", name: "Prakash T", role: "lab", pin: "", subtitle: "Lab Technologist" },
  { id: "radiotech", name: "Kavya R", role: "radiotech", pin: "", subtitle: "Radiology Technician" },
  { id: "ot", name: "Binu S", role: "ot", pin: "", subtitle: "OT Technician" },
  { id: "supervisor", name: "Aisha Khan", role: "supervisor", pin: "", subtitle: "Reception Supervisor" },
  { id: "finance", name: "Rahul Menon", role: "finance", pin: "", subtitle: "Accounts Manager" },
  { id: "hr", name: "Priya Nair", role: "hr", pin: "", subtitle: "HR Manager" },
  { id: "marketing", name: "Arjun R", role: "marketing", pin: "", subtitle: "Marketing Lead" },
  { id: "admin", name: "System Admin", role: "admin", pin: "", subtitle: "IT Administrator" },
];

function loadAccounts(): Account[] {
  if (STAGING_DEMO_AUTH) return [STAGING_DEMO_ACCOUNT, STAGING_RECEPTION_ACCOUNT, STAGING_CEO_ACCOUNT];

  const loaded = loadLS<Account[]>(ACCOUNT_STORAGE_KEY, ACCOUNTS).map((a) => ({ ...a, pin: "" }));
  if (!loaded.some((a) => a.id === "dr-murali")) {
    return [
      { id: "dr-murali", name: "Dr. Murali Praveen", role: "doctor", pin: "", subtitle: "Chief Medical Director / Doctor Command" },
      ...loaded,
    ];
  }
  return loaded;
}

export const ROLE_LABEL: Record<Role, string> = {
  ceo: "CEO · Administrator",
  doctor: "Doctor",
  reception: "Reception",
  pharmacy: "Pharmacy",
  ward: "Ward / Nurse",
  lab: "Lab",
  radiotech: "Radiology",
  ot: "OT",
  supervisor: "Reception Supervisor",
  finance: "Finance / Accounts",
  hr: "HR",
  marketing: "Marketing",
  admin: "Administration",
};

type TabKeyStr = "dashboard" | "chat" | "agents" | "hospital" | "settings";

/** Sidebar tabs visible per role. */
export const ROLE_TABS: Record<Role, TabKeyStr[]> = {
  ceo: ["dashboard", "chat", "agents", "hospital", "settings"],
  doctor: ["dashboard", "chat", "agents", "hospital", "settings"],
  reception: ["hospital"],
  pharmacy: ["hospital"],
  ward: ["hospital"],
  lab: ["hospital"],
  radiotech: ["hospital"],
  ot: ["hospital"],
  supervisor: ["hospital"],
  finance: ["hospital"],
  hr: ["hospital"],
  marketing: ["hospital"],
  admin: ["hospital"],
};

/** Hospital Ops sub-pages visible per role ("all" = unrestricted). */
export const ROLE_SUBS: Record<Role, string[] | "all"> = {
  ceo: "all",
  doctor: "all",
  reception: ["voice-reg", "op-scan", "appointments", "billing", "reputation", "notifications"],
  pharmacy: ["pharmacy", "notifications"],
  ward: ["ward", "nursing", "attendance", "notifications"],
  lab: ["lab", "notifications"],
  radiotech: ["radiology", "notifications"],
  ot: ["ot", "notifications"],
  supervisor: ["reception", "pharmacy", "ward", "lab", "notifications"],
  finance: ["billing", "reports", "notifications"],
  hr: ["attendance", "reports", "notifications"],
  marketing: ["marketing", "reputation", "notifications"],
  admin: ["departments", "reports", "monitoring", "notifications"],
};

export function canSeeSub(role: Role, sub: string): boolean {
  const allowed = ROLE_SUBS[role];
  return allowed === "all" || allowed.includes(sub);
}

export function firstSubFor(role: Role): string {
  const allowed = ROLE_SUBS[role];
  // CEO defaults to the Departments view — the legacy "Cloud HMS (Sparta)"
  // tile is no longer the entry point of the Hospital Ops control plane.
  return allowed === "all" ? "departments" : allowed[0];
}

/** Default hash route when a role logs in */
export const ROLE_HOME_URL: Record<Role, string> = {
  ceo: "/ceo",
  doctor: "/doctor",
  reception: "/reception",
  pharmacy: "/pharmacy",
  ward: "/ward",
  lab: "/lab",
  radiotech: "/radiology",
  ot: "/ot",
  supervisor: "/reception",
  finance: "/finance",
  hr: "/hr",
  marketing: "/marketing",
  admin: "/admin",
};

/** A department URL always requires the matching staff role. */
const ROLE_FOR_DEPARTMENT_PATH: Partial<Record<string, Role>> = {
  "/reception": "reception",
  "/lab": "lab",
  "/ot": "ot",
  "/ward": "ward",
  "/doctor": "doctor",
  "/radiology": "radiotech",
  "/pharmacy": "pharmacy",
  "/billing": "finance",
  "/reports": "finance",
  "/finance": "finance",
  "/hr": "hr",
};

export function requiredRoleForPath(path: string): Role | null {
  return ROLE_FOR_DEPARTMENT_PATH[path.split("?")[0]] ?? null;
}

function roleFromCurrentLocation(): Role | null {
  if (typeof window === "undefined") return null;
  const injected = document.querySelector('meta[name="x-role"]')?.getAttribute("content");
  if (injected && injected in ROLE_LABEL) return injected as Role;
  const path = (window.location.hash.replace(/^#/, "") || "/").split("?")[0];
  return ROLE_FOR_DEPARTMENT_PATH[path] ?? null;
}

export const ROLE_ROUTES: Record<Role, string[]> = {
  ceo: ["/supercore", "/clinical", "/clinical-ai", "/staff", "/ceo", "/dashboard", "/copilot", "/hospital", "/setup", "/insurance", "/chat", "/command", "/agents", "/agents/registry", "/dashboards", "/reports", "/monitoring", "/emr", "/settings", "/notifications", "/audit", "/doctor", "/reception", "/pharmacy", "/lab", "/radiology", "/ward", "/ot", "/consent", "/nursing", "/finance", "/billing", "/hr", "/marketing", "/admin", "/tasks", "/journey", "/knowledge", "/plugins", "/plugin-manager", "/browser", "/health", "/brain", "/router"],
  doctor: ["/supercore", "/clinical", "/clinical-ai", "/staff", "/doctor", "/emr", "/monitoring", "/copilot", "/setup", "/settings", "/insurance", "/billing", "/reception", "/pharmacy", "/lab", "/radiology", "/ward", "/ot", "/consent", "/nursing", "/chat", "/command", "/tasks", "/journey", "/reports", "/notifications", "/knowledge", "/plugins", "/plugin-manager", "/browser", "/health", "/agents/registry", "/dashboards", "/brain", "/router", "/ortho-planner", "/bone-recon"],
  reception: ["/supercore", "/clinical", "/reception", "/hospital", "/insurance", "/billing", "/consent", "/chat", "/tasks", "/journey", "/notifications", "/command-center"],
  pharmacy: ["/supercore", "/clinical", "/pharmacy", "/hospital", "/billing", "/chat", "/tasks", "/journey", "/notifications", "/command-center"],
  ward: ["/supercore", "/clinical", "/staff", "/ward", "/hospital", "/nursing", "/ot", "/consent", "/chat", "/tasks", "/journey", "/notifications", "/command-center"],
  lab: ["/supercore", "/clinical", "/lab", "/hospital", "/chat", "/tasks", "/journey", "/notifications", "/command-center"],
  radiotech: ["/supercore", "/clinical", "/radiology", "/hospital", "/chat", "/tasks", "/journey", "/notifications", "/command-center"],
  ot: ["/supercore", "/clinical", "/ot", "/consent", "/hospital", "/ward", "/chat", "/tasks", "/journey", "/notifications", "/command-center"],
  supervisor: ["/supercore", "/clinical", "/reception", "/hospital", "/setup", "/insurance", "/billing", "/pharmacy", "/ward", "/lab", "/radiology", "/consent", "/chat", "/tasks", "/journey", "/notifications"],
  finance: ["/supercore", "/clinical", "/finance", "/billing", "/insurance", "/hospital", "/reports", "/chat", "/tasks", "/journey", "/notifications"],
  hr: ["/supercore", "/clinical", "/hr", "/hospital", "/chat", "/tasks", "/notifications"],
  marketing: ["/supercore", "/clinical", "/marketing", "/hospital", "/chat", "/tasks", "/notifications"],
  admin: ["/supercore", "/clinical", "/clinical-ai", "/intelligence-lab", "/staff", "/admin", "/emr", "/setup", "/hospital", "/insurance", "/billing", "/doctor", "/reception", "/pharmacy", "/lab", "/radiology", "/ward", "/ot", "/consent", "/nursing", "/reports", "/chat", "/command", "/tasks", "/notifications", "/audit", "/monitoring", "/plugins", "/plugin-manager", "/browser", "/health", "/agents/registry", "/dashboards", "/brain", "/router"],
};

/** Check if a role can access a given hash path */
export function canAccessRoute(role: Role, path: string): boolean {
  const allowed = ROLE_ROUTES[role];
  if (!allowed) return false;
  const pathOnly = path.split("?")[0];
  if (pathOnly.startsWith("/command-center/evolution") && !["doctor", "ceo", "admin"].includes(role)) {
    return false;
  }
  if ((pathOnly === "/hospital" || pathOnly === "/intelligence-lab") && !["ceo", "admin"].includes(role)) {
    return false;
  }
  if (pathOnly === "/comm" || pathOnly === "/chat") return true;
  if (allowed.includes(path) || allowed.includes(pathOnly)) return true;
  if (role === "doctor" || role === "ceo" || role === "admin") return true;
  return allowed.some(a => pathOnly.startsWith(a + "/") || pathOnly === a);
}

/** Sidebar navigation items per role — role-specific module links */
export interface NavItem {
  label: string;
  path: string;
  icon: string;
}

/** Keep role navigation honest when a shared menu is rendered. */
export function visibleNavForRole(role: Role, items: NavItem[]): NavItem[] {
  return items.filter((item) => canAccessRoute(role, item.path));
}

export const ROLE_NAV: Record<Role, NavItem[]> = {
  ceo: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Co-Pilot", path: "/copilot", icon: "Stethoscope" },
    { label: "Knowledge", path: "/knowledge", icon: "BookOpen" },
    { label: "Intelligence Lab", path: "/intelligence-lab", icon: "Brain" },
    { label: "Router Mesh", path: "/router", icon: "Server" },
    { label: "Plugins", path: "/brain?tab=plugins", icon: "Blocks" },
    { label: "Plugin Manager", path: "/plugin-manager", icon: "Blocks" },
    { label: "Dashboards", path: "/dashboards", icon: "LayoutDashboard" },
    { label: "System Health", path: "/health", icon: "Activity" },
    { label: "CEO Dashboard", path: "/ceo", icon: "LayoutDashboard" },
    { label: "Clinical AI", path: "/clinical-ai", icon: "Brain" },
    { label: "Staff Command", path: "/staff", icon: "Users" },
    { label: "Doctor Cockpit", path: "/doctor", icon: "Stethoscope" },
    { label: "Agents", path: "/agents", icon: "Cpu" },
    { label: "Agent Registry", path: "/agents/registry", icon: "Users" },
    { label: "Reports", path: "/reports", icon: "FileText" },
    { label: "Audit Log", path: "/audit", icon: "ShieldCheck" },
    { label: "Settings", path: "/settings", icon: "Settings" },
    { label: "Astra Connect", path: "/comm", icon: "MessageSquare" },
  ],
  doctor: [
    { label: "Doctor Command", path: "/command-os", icon: "Stethoscope" },
    { label: "Tasks & Orders", path: "/tasks", icon: "ListTodo" },
    { label: "Laboratory", path: "/lab", icon: "Activity" },
    { label: "Radiology", path: "/radiology", icon: "Sparkles" },
    { label: "Ward & IP Beds", path: "/ward", icon: "Building2" },
    { label: "Pharmacy", path: "/pharmacy", icon: "Pill" },
    { label: "Billing", path: "/billing", icon: "FileText" },
    { label: "Reception", path: "/reception", icon: "LayoutDashboard" },
    { label: "OT", path: "/ot", icon: "Activity" },
    { label: "Astra Brain", path: "/brain", icon: "Brain" },
    { label: "System Health", path: "/health", icon: "Activity" },
    { label: "Command center", path: "/command-center", icon: "LayoutDashboard" },
    { label: "Doctor Cockpit", path: "/doctor", icon: "Stethoscope" },
    { label: "Staff Command", path: "/staff", icon: "Users" },
    { label: "Knowledge", path: "/knowledge", icon: "BookOpen" },
    { label: "Dashboards", path: "/dashboards", icon: "LayoutDashboard" },
    { label: "Patient Journey", path: "/journey", icon: "Footprints" },
    { label: "Reports", path: "/reports", icon: "FileText" },
    { label: "Login Vault", path: "/settings", icon: "Settings" },
    { label: "Astra Connect", path: "/comm", icon: "MessageSquare" },
  ],
  reception: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Reception Workspace", path: "/reception", icon: "LayoutDashboard" },
    { label: "Patients", path: "/journey", icon: "Users2" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  pharmacy: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Pharmacy Workspace", path: "/pharmacy", icon: "LayoutDashboard" },
    { label: "Patients", path: "/journey", icon: "Users2" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  ward: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Nursing & Ward", path: "/ward", icon: "LayoutDashboard" },
    { label: "Patients", path: "/journey", icon: "Users2" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  lab: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Laboratory", path: "/lab", icon: "LayoutDashboard" },
    { label: "Patients", path: "/journey", icon: "Users2" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  radiotech: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Radiology", path: "/radiology", icon: "LayoutDashboard" },
    { label: "Patients", path: "/journey", icon: "Users2" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  ot: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "OT Workspace", path: "/ot", icon: "LayoutDashboard" },
    { label: "Patients", path: "/journey", icon: "Users2" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  supervisor: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Supervisor Desk", path: "/reception", icon: "LayoutDashboard" },
    { label: "Patients", path: "/journey", icon: "Users2" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  finance: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Finance & Billing", path: "/finance", icon: "LayoutDashboard" },
    { label: "Patients", path: "/journey", icon: "Users2" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Reports", path: "/reports", icon: "BarChart3" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  hr: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "HR Workspace", path: "/hr", icon: "LayoutDashboard" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  marketing: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Marketing Hub", path: "/marketing", icon: "LayoutDashboard" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
  ],
  admin: [
    { label: "AI Command", path: "/chat", icon: "Bot" },
    { label: "Admin Workspace", path: "/admin", icon: "LayoutDashboard" },
    { label: "Intelligence Lab", path: "/intelligence-lab", icon: "Brain" },
    { label: "Clinical AI", path: "/clinical-ai", icon: "Brain" },
    { label: "Staff Command", path: "/staff", icon: "Users" },
    { label: "Router Mesh", path: "/router", icon: "Server" },
    { label: "Tasks", path: "/tasks", icon: "Activity" },
    { label: "Reports", path: "/reports", icon: "BarChart3" },
    { label: "Monitoring", path: "/monitoring", icon: "Activity" },
    { label: "Notifications", path: "/notifications", icon: "BellRing" },
    { label: "Audit Trail", path: "/audit", icon: "ShieldCheck" },
  ],
};

interface Session {
  accountId: string;
  token: string;
  at: string;
}

export interface LoginResult {
  ok: boolean;
  message?: string;
  mustChangePin?: boolean;
}

interface AuthCtx {
  account: Account | null;
  requiredRole: Role | null;
  accounts: Account[];
  authServerReachable: boolean;
  updateAccount: (accountId: string, update: Pick<Account, "name" | "pin">) => void;
  createAccount: (account: Account) => Promise<boolean>;
  login: (accountId: string, pin: string) => Promise<LoginResult>;
  changePin: (newPin: string) => Promise<boolean>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>(loadAccounts);
  const [authServerReachable, setAuthServerReachable] = useState(STAGING_DEMO_AUTH);
  const [requiredRole, setRequiredRole] = useState<Role | null>(roleFromCurrentLocation);
  const [session, setSession] = useState<Session | null>(() => {
    const saved = loadLS<Session | null>("astra.session", null);
    return saved?.token ? saved : null;
  });
  const account = useMemo(() => session ? accounts.find((a) => a.id === session.accountId) ?? null : null, [accounts, session]);

  useEffect(() => {
    if (STAGING_DEMO_AUTH) return;

    fetch("/api/auth/accounts/public").then((r) => r.ok ? r.json() : Promise.reject()).then((data) => {
      setAuthServerReachable(true);
      const mapped = (data.accounts ?? []).map((a: any) => ({ ...a, role: a.role === "radiology" ? "radiotech" : a.role === "billing" ? "finance" : a.role, pin: "" })) as Account[];
      setAccounts(mapped);
      localStorage.removeItem(ACCOUNT_STORAGE_KEY);
    }).catch(() => setAuthServerReachable(false));
  }, []);

  useEffect(() => {
    if (STAGING_DEMO_AUTH) return;
    if (!session?.token) return;
    fetch("/api/auth/session", { headers: { Authorization: `Bearer ${session.token}` } }).then((r) => {
      if (!r.ok) logoutSession();
    }).catch(() => logoutSession());
    function logoutSession() { setSession(null); localStorage.removeItem("astra.serverToken"); saveLS<Session | null>("astra.session", null); }
  }, []);

  useEffect(() => {
    const enforceDepartmentRole = () => {
      const nextRole = roleFromCurrentLocation();
      setRequiredRole(nextRole);
    };
    window.addEventListener("hashchange", enforceDepartmentRole);
    return () => window.removeEventListener("hashchange", enforceDepartmentRole);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      account,
      requiredRole,
      accounts,
      authServerReachable,
      updateAccount: (accountId, update) => {
        const target = accounts.find((candidate) => candidate.id === accountId);
        if (!target || !session?.token || !account || !["doctor", "ceo"].includes(account.role)) return;
        const serverRole = target.role === "radiotech" ? "radiology" : target.role === "finance" ? "billing" : target.role;
        void fetch(`/api/auth/accounts/${encodeURIComponent(accountId)}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ name: update.name, password: update.pin || undefined, role: serverRole, subtitle: target.subtitle }) })
          .then((r) => { if (!r.ok) throw new Error("Credential update rejected"); setAccounts((current) => current.map((candidate) => candidate.id === accountId ? { ...candidate, name: update.name, pin: "" } : candidate)); });
      },
      createAccount: async (newAccount) => {
        if (!session?.token || !account || !["doctor", "ceo"].includes(account.role)) return false;
        const serverRole = newAccount.role === "radiotech" ? "radiology" : newAccount.role === "finance" ? "billing" : newAccount.role;
        try {
          const response = await fetch(`/api/auth/accounts/${encodeURIComponent(newAccount.id)}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ name: newAccount.name, password: newAccount.pin, role: serverRole, subtitle: newAccount.subtitle }) });
          if (!response.ok) return false;
          setAccounts((current) => [...current.filter((a) => a.id !== newAccount.id), { ...newAccount, pin: "" }]); return true;
        } catch { return false; }
      },
      login: async (accountId, pin) => {
        // Staging reception can be signed in with the published phone-number ID.
        // Keep the internal account key stable for role routing and session data.
        const normalizedAccountId = STAGING_DEMO_AUTH && accountId === "9492397291" ? "reception" : accountId;
        accountId = normalizedAccountId;
        const requested = accounts.find((a) => a.id === accountId);
        if (!requested || (requiredRole && requested.role !== requiredRole && !["doctor", "ceo", "admin"].includes(requested.role))) return { ok: false };
        if (STAGING_DEMO_AUTH) {
          // Accept the documented staging PIN plus the legacy six-digit demo PIN
          // so an older printed credential card cannot strand the local preview.
          if (![STAGING_DEMO_ACCOUNT.id, "reception", "ceo"].includes(accountId) || ![STAGING_DEMO_PIN, "123456"].includes(pin)) {
            return { ok: false, message: "Use the staging demo PIN." };
          }
          const s: Session = {
            accountId,
            token: "staging-demo-no-api",
            at: new Date().toISOString(),
          };
          setSession(s);
          saveLS("astra.session", s);
          return { ok: true };
        }
        try {
          const response = await fetch("/api/auth/vault-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: accountId, password: pin }) });
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            return { ok: false, message: body?.message ?? (body?.error === "TOO_MANY_ATTEMPTS" ? "Too many attempts, try again later" : undefined) };
          }
          const data = await response.json();
          const s: Session = { accountId, token: data.session.sessionToken, at: new Date().toISOString() };
          setSession(s); saveLS("astra.session", s); localStorage.setItem("astra.serverToken", s.token);
          if (data.account?.mustChangePin) {
            setAccounts((current) => current.map((a) => (a.id === accountId ? { ...a, mustChangePin: true } : a)));
          }
          return { ok: true, mustChangePin: !!data.mustChangePin };
        } catch { return { ok: false }; }
      },
      changePin: async (newPin) => {
        if (!session?.token) return false;
        try {
          const response = await fetch("/api/auth/change-pin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ password: newPin }) });
          if (!response.ok) return false;
          setAccounts((current) => current.map((a) => (a.id === session.accountId ? { ...a, mustChangePin: false } : a)));
          return true;
        } catch { return false; }
      },
      logout: () => {
        setSession(null);
        localStorage.removeItem("astra.serverToken");
        saveLS<Session | null>("astra.session", null);
      },
    }),
    [account, accounts, requiredRole, authServerReachable]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
