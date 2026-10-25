import { useEffect, useState, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Toaster } from "sonner";
import { Layout } from "@/components/Layout";
import { Starfield } from "@/components/Starfield";
import { AstraBackground } from "@/components/AstraBackground";
import { LandingHero } from "@/components/LandingHero";
import { StoreProvider, useStore } from "@/lib/store";
import { AuthProvider, useAuth, ROLE_HOME_URL, canAccessRoute } from "@/lib/auth";
import { navHash, useHashRoute } from "@/lib/hashRoute";
import { getServiceIdForPlugin, isHiddenFromDoctor } from "@/services/astraServices";
import { Login, MustChangePin } from "@/sections/auth/Login";
import { PatientProvider } from "@/context/PatientContext";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

function lazyNamed<T extends Record<PropertyKey, unknown>>(
  loader: () => Promise<T>,
  exportName: keyof T,
) {
  return lazy(async () => {
    const m = await loader();
    return { default: m[exportName] as ComponentType<any> };
  });
}

const Dashboard = lazyNamed(() => import("@/sections/dashboard/Dashboard"), "Dashboard");
const Agents = lazyNamed(() => import("@/sections/agents/Agents"), "Agents");
const HospitalOps = lazyNamed(() => import("@/sections/hospital/HospitalOps"), "HospitalOps");
const ReceptionCopilotShell = lazyNamed(() => import("@/sections/hospital/reception/ReceptionCopilotShell"), "ReceptionCopilotShell");
const HospitalCommandCenter = lazyNamed(() => import("@/sections/hospital/HospitalCommandCenter"), "HospitalCommandCenter");
const Settings = lazyNamed(() => import("@/sections/settings/Settings"), "Settings");
const KnowledgeFabric = lazyNamed(() => import("@/sections/knowledge/KnowledgeFabric"), "KnowledgeFabric");
const DoctorDashboard = lazyNamed(() => import("@/sections/hospital/role/DoctorDashboard"), "DoctorDashboard");
const PharmacyDashboard = lazyNamed(() => import("@/sections/hospital/role/PharmacyDashboard"), "PharmacyDashboard");
const LabDashboard = lazyNamed(() => import("@/sections/hospital/role/LabDashboard"), "LabDashboard");
const WardDashboard = lazyNamed(() => import("@/sections/hospital/role/WardDashboard"), "WardDashboard");
const FinanceDashboard = lazyNamed(() => import("@/sections/hospital/role/FinanceDashboard"), "FinanceDashboard");
const HRDashboard = lazyNamed(() => import("@/sections/hospital/role/HRDashboard"), "HRDashboard");
const DoctorEMR = lazyNamed(() => import("@/sections/emr/DoctorEMR"), "DoctorEMR");
const StaffCommandCenter = lazyNamed(() => import("@/sections/hospital/StaffCommandCenter"), "StaffCommandCenter");
const ClinicalReasoningPanel = lazyNamed(() => import("@/sections/hospital/clinical/ClinicalReasoningPanel"), "ClinicalReasoningPanel");
const MarketingDashboard = lazyNamed(() => import("@/sections/hospital/role/MarketingDashboard"), "MarketingDashboard");
const AdminDashboard = lazyNamed(() => import("@/sections/hospital/role/AdminDashboard"), "AdminDashboard");
const Nursing = lazyNamed(() => import("@/sections/hospital/Nursing"), "Nursing");
const Radiology = lazyNamed(() => import("@/sections/hospital/Radiology"), "Radiology");
const Monitoring = lazyNamed(() => import("@/sections/hospital/Monitoring"), "Monitoring");
const Tasks = lazyNamed(() => import("@/sections/hospital/Tasks"), "Tasks");
const PatientJourney = lazyNamed(() => import("@/sections/hospital/PatientJourney"), "PatientJourney");
const Reports = lazyNamed(() => import("@/sections/hospital/Reports"), "Reports");
const NotificationCenter = lazyNamed(() => import("@/sections/hospital/NotificationCenter"), "NotificationCenter");
const AuditTrail = lazyNamed(() => import("@/sections/hospital/AuditTrail"), "AuditTrail");
const PluginCenter = lazyNamed(() => import("@/sections/plugins/PluginCenter"), "PluginCenter");
const PluginManagerPage = lazyNamed(() => import("@/ui/plugins/PluginManagerPage"), "PluginManagerPage");
const SystemHealth = lazyNamed(() => import("@/sections/system/SystemHealth"), "SystemHealth");
const CommandDashboards = lazyNamed(() => import("@/sections/system/CommandDashboards"), "CommandDashboards");
const AstraClinicalCoPilot = lazyNamed(() => import("@/components/AstraClinicalCoPilot"), "AstraClinicalCoPilot");
const AgentRegistryView = lazyNamed(() => import("@/sections/agents/AgentRegistryView"), "AgentRegistryView");
const HospitalSetupWizard = lazyNamed(() => import("@/sections/system/HospitalSetupWizard"), "HospitalSetupWizard");
const InsuranceDashboard = lazyNamed(() => import("@/sections/hospital/role/InsuranceDashboard"), "InsuranceDashboard");
const BillingDashboard = lazyNamed(() => import("@/components/Intelligence/BillingDashboard"), "BillingDashboard");
const OTDashboard = lazyNamed(() => import("@/components/Intelligence/OTDashboard"), "OTDashboard");
const OrthoPlannerDashboard = lazyNamed(() => import("@/components/OrthoPlanner/OrthoPlannerDashboard"), "OrthoPlannerDashboard");
const BoneReconPlannerDashboard = lazyNamed(() => import("@/components/BoneRecon/BoneReconPlannerDashboard"), "BoneReconPlannerDashboard");
const AutoConsentModule = lazyNamed(() => import("@/components/Intelligence/AutoConsentModule"), "AutoConsentModule");
const AstraSupercoreCommand = lazyNamed(() => import("@/sections/AstraSupercoreCommand"), "AstraSupercoreCommand");
const RouterMeshDashboard = lazyNamed(() => import("@/components/Intelligence/RouterMeshDashboard"), "RouterMeshDashboard");
const IntelligenceLabDashboard = lazyNamed(() => import("@/sections/intelligence/IntelligenceLabDashboard"), "IntelligenceLabDashboard");
const AstraCommApp = lazyNamed(() => import("@/components/Communications/AstraCommApp"), "AstraCommApp");
const InternalBrowser = lazy(() => import("@/sections/browser/AstraInternalBrowser"));
const AstraBrain = lazyNamed(() => import("@/sections/brain/AstraBrain"), "AstraBrain");
const MayinCommandCentre = lazyNamed(() => import("@/features/mayin/MayinCommandCentre"), "MayinCommandCentre");
const CentralCommand = lazyNamed(() => import("@/components/CommandCenter/CentralCommand"), "CentralCommand");
const EvolutionRoom = lazyNamed(() => import("@/components/CommandCenter/EvolutionRoom"), "EvolutionRoom");

function GuardedSuspense({
  resetKey,
  fallback,
  children,
}: {
  resetKey: string;
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <RouteErrorBoundary resetKey={resetKey}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

function RouteFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Loading Astra…</p>
    </div>
  );
}

function ThemedBackground() {
  const { appearance } = useStore();
  return appearance.preset === "classic" ? <Starfield /> : <AstraBackground />;
}


function openingBrain(target: string) {
  const current = window.location.hash.replace(/^#/, "");
  if (current !== target) navHash(target);
  return (
    <div className="h-full flex items-center justify-center text-xs text-slate-400">Opening Astra Brain…</div>
  );
}

function RouteContent() {
  const { account } = useAuth();
  const hash = useHashRoute();

  if (!account) return null;

  const route = hash === "/" ? ROLE_HOME_URL[account.role] : hash;
  const pathOnly = route.split("?")[0];

  // Plugin hashes open inside the Internal Browser so the user-facing URL
  // stays on Astra (http://localhost:5173/#/plugins/<id> or #/browser?service=).
  const pluginRoute = pathOnly;
  const PLUGIN_HASH_ALIASES: Record<string, string> = {
    freellmapi: "freellmapi",
    freellm: "freellmapi",
    "freellm-provider": "freellmapi",
    omniroute: "omniroute",
    "omniroute-gateway": "omniroute",
    paperclip: "paperclip",
    "medical-knowledge-gateway": "paperclip",
    n8n: "n8n",
    "n8n-automation-addon": "n8n",
    hermes: "hermes",
    "astra-brain-core": "hermes",
    voicebox: "voicebox",
    openclaw: "openclaw",
    langgraph: "langgraph-orchestrator",
    "langgraph-orchestrator": "langgraph-orchestrator",
    openhands: "openhands",
    "openhands-executor-addon": "openhands",
    agentzero: "agentzero",
    "agentzero-executor-addon": "agentzero",
    ollama: "ollama",
    litellm: "litellm",
    routellm: "routellm",
    chatgpt: "chatgpt",
    grok: "grok",
    kimi: "kimi",
    "astra-api": "astra-api",
    laya: "laya",
    "astra-micro": "astra-micro",
    minimind: "astra-micro",
    scientist: "scientist",
    "clinical-books": "clinical-books",
    "book-skills": "clinical-books",
    "astra-7d": "astra-7d",
    "7d": "astra-7d",
  };
  const pluginIdSeg = pluginRoute.match(/^\/plugins\/([^/]+)/)?.[1];
  const pluginService =
    pluginIdSeg === "browser-ai-addon" || pluginIdSeg === "browser-home"
      ? "browser-home"
      : pluginIdSeg
        ? (PLUGIN_HASH_ALIASES[pluginIdSeg] ?? getServiceIdForPlugin(pluginIdSeg))
        : undefined;
  if (pluginService === "browser-home") {
    return openingBrain("/brain?tab=browser");
  }
  if (pluginService && isHiddenFromDoctor(pluginService)) {
    return openingBrain("/brain?tab=plugins");
  }
  if (pluginService) {
    return openingBrain(`/brain?tab=browser&service=${encodeURIComponent(pluginService)}`);
  }
  if (pathOnly === "/plugins" || pathOnly.startsWith("/plugins/")) {
    return openingBrain("/brain?tab=plugins");
  }
  if (route.startsWith("/browser")) {
    const params = new URLSearchParams(route.split("?")[1] ?? "");
    const q = new URLSearchParams();
    q.set("tab", "browser");
    const service = params.get("service");
    if (service && !isHiddenFromDoctor(service)) q.set("service", service);
    const url = params.get("url");
    const subPath = params.get("path");
    if (url) q.set("url", url);
    if (subPath) q.set("path", subPath);
    return openingBrain(`/brain?${q.toString()}`);
  }

  // RBAC guard — redirect to role home if route not allowed
  if (!canAccessRoute(account.role, pathOnly)) {
    const home = ROLE_HOME_URL[account.role];
    if (route !== home) {
      navHash(home);
    }
    return (
      <div className="flex items-center justify-center h-full">
        <div className="glass p-8 text-center max-w-md">
          <p className="text-sm font-semibold text-white">Access Restricted</p>
          <p className="text-xs text-slate-400 mt-2">This dashboard is not available for your role.</p>
        </div>
      </div>
    );
  }

  if (pathOnly === "/command-center/evolution") {
    return (
      <GuardedSuspense resetKey={pathOnly} fallback={<RouteFallback />}>
        <EvolutionRoom />
      </GuardedSuspense>
    );
  }
  if (pathOnly === "/command-center") {
    return (
      <GuardedSuspense resetKey={pathOnly} fallback={<RouteFallback />}>
        <CentralCommand />
      </GuardedSuspense>
    );
  }
  if (pathOnly.startsWith("/command-center/patient/")) {
    return (
      <GuardedSuspense resetKey={pathOnly} fallback={<RouteFallback />}>
        <CentralCommand patientId={decodeURIComponent(pathOnly.replace("/command-center/patient/", ""))} />
      </GuardedSuspense>
    );
  }

  switch (pathOnly) {
    case "/ceo":
    case "/dashboard":
      return <Dashboard />;
    case "/setup":
      return <HospitalSetupWizard />;
    case "/hospital":
      return <HospitalCommandCenter />;
    case "/command-os":
      return <DoctorDashboard />;
    case "/clinical":
    case "/chat":
    case "/command":
      return <AstraSupercoreCommand />;
    case "/comm":
      return <AstraCommApp />;
    case "/plugins":
      return openingBrain("/brain?tab=plugins");
    // NOTE: the old duplicate /plugins/freellm and /plugins/omniroute
    // "Router Consoles" (embedded /proxy/omni iframe + key paste UI) were
    // removed — the Plugin Center "Dual API Gateways" cards are the ONLY
    // gateway UI, and their Open Dashboard buttons go directly to the
    // verified external dashboards (FreeLLMAPI registry origin and OmniRoute home).
    case "/copilot":
    case "/clinical-ai":
    case "/supercore":
      return <DoctorDashboard />;
    case "/plugin-manager":
      return <PluginManagerPage />;
    case "/health":
      return <SystemHealth />;
    case "/brain":
      return (
        <GuardedSuspense resetKey={pathOnly} fallback={<div className="h-full flex items-center justify-center text-xs text-slate-400">Loading Astra Brain…</div>}>
          <AstraBrain />
        </GuardedSuspense>
      );
    case "/dashboards":
      return <CommandDashboards />;
    case "/tasks":
      return <Tasks />;
    case "/journey":
      return <PatientJourney />;
    case "/agents":
      return <Agents />;
    case "/agents/registry":
      return <AgentRegistryView />;
    case "/settings":
      return <Settings />;
    case "/knowledge":
      return <KnowledgeFabric />;
    case "/reports":
      return account?.role === "finance" ? <FinanceDashboard /> : <Reports />;
    case "/notifications":
      return <NotificationCenter />;
    case "/audit":
      return <AuditTrail />;
    case "/billing":
      return <BillingDashboard />;
    case "/insurance":
    case "/pmjay":
    case "/nabh":
      return <InsuranceDashboard />;
    case "/monitoring":
      return <Monitoring />;
    case "/emr":
      return <DoctorDashboard initialSurface="emr" />;
    case "/doctor":
      return <DoctorDashboard />;
    case "/reception":
      return <ReceptionCopilotShell />;
    case "/pharmacy":
      return <PharmacyDashboard />;
    case "/lab":
      return <LabDashboard />;
    case "/radiology":
      return <Radiology />;
    case "/ward":
      return <WardDashboard />;
    case "/ot":
      return <OTDashboard />;
    case "/consent":
      return <AutoConsentModule />;
    case "/nursing":
      return <Nursing />;
    case "/finance":
      return <FinanceDashboard />;
    case "/hr":
      return <HRDashboard />;
    case "/staff":
      return <StaffCommandCenter />;
    case "/ortho-planner":
      return <DoctorDashboard initialSurface="ortho" />;
    case "/bone-recon":
      return <DoctorDashboard initialSurface="reconstruction" />;
    case "/marketing":
      return <MarketingDashboard />;
    case "/admin":
      return <AdminDashboard />;
    case "/router":
      return <RouterMeshDashboard />;
    case "/intelligence-lab":
      return <IntelligenceLabDashboard />;
    case "/mayin":
      return <MayinCommandCentre onClose={() => navHash(ROLE_HOME_URL[account?.role ?? "DOCTOR"]) } />;
    default:
      // legacy Hospital Ops sub-pages via deep link
      return <HospitalOps />;
  }
}

function Shell({ onBackToLanding }: { onBackToLanding: () => void }) {
  const { account } = useAuth();
  const hash = useHashRoute();

  // On login — redirect to role home
  useEffect(() => {
    if (account && (hash === "/" || hash === "")) {
      navHash(ROLE_HOME_URL[account.role]);
    }
  }, [account?.id]);

  if (!account) return <Login onBack={onBackToLanding} />;
  // Forced PIN upgrade lands before any workspace content renders.
  if (account.mustChangePin) return <MustChangePin />;

  return (
    <>
      <ThemedBackground />
      <Layout>
        <RouteErrorBoundary resetKey={hash.split("?")[0]}>
          <Suspense fallback={<RouteFallback />}>
            <RouteContent />
          </Suspense>
        </RouteErrorBoundary>
      </Layout>
    </>
  );
}

export default function App() {
  const [showLanding, setShowLanding] = useState(false);

  if (showLanding) {
    return (
      <>
        <LandingHero onEnter={() => setShowLanding(false)} />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(16,20,43,0.92)",
              border: "1px solid rgba(212,175,55,0.35)",
              color: "#e2e8f0",
              backdropFilter: "blur(12px)",
            },
          }}
        />
      </>
    );
  }

  return (
    <PatientProvider>
      <StoreProvider>
        <AuthProvider>
          <Shell onBackToLanding={() => setShowLanding(true)} />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "rgba(16,20,43,0.92)",
                border: "1px solid rgba(212,175,55,0.35)",
                color: "#e2e8f0",
                backdropFilter: "blur(12px)",
              },
            }}
          />
        </AuthProvider>
      </StoreProvider>
    </PatientProvider>
  );
}
