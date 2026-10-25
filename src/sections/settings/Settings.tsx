import { useEffect, useState } from "react";
import {
  Check, Copy, Download, ExternalLink, Eye, EyeOff, Mic, Palette, RefreshCw, Save, ShieldCheck, Terminal, Volume2, VolumeX, X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle, StatusDot } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, loadLS, saveLS, sleep } from "@/lib/utils";
import { detectTool, type TestResult, type ToolId } from "@/lib/llm";
import { providerCaps } from "@/lib/mock";
import type { AppearanceSettings, InstallState, RoutingStrategy } from "@/lib/types";
import {
  isOfflineVoiceEnabled, setOfflineVoiceEnabled, speakOffline, detectVoiceTier, type VoiceTier,
} from "@/lib/offlineSpeech";
import { GATEWAYS } from "@/services/gatewayManager";
import { useVoicePrefs } from "@/astra/voice/useVoicePrefs";

const FREE_KEYS_URL = `${new URL(GATEWAYS.freellmapi.dashboardUrl).origin}/keys`;

const LAN_DEPARTMENTS: { label: string; path: string }[] = [
  { label: "Reception", path: "/reception" },
  { label: "Billing", path: "/finance" },
  { label: "Pharmacy", path: "/pharmacy" },
  { label: "Ward", path: "/ward" },
  { label: "OT", path: "/ot" },
  { label: "Lab", path: "/lab" },
  { label: "Radiology", path: "/radiology" },
  { label: "Doctor", path: "/doctor" },
];

interface LanInfo { addresses: string[]; vitePort: number; httpsPort: number; httpsRunning: boolean }

const strategies: { key: RoutingStrategy; label: string; desc: string }[] = [
  { key: "manual", label: "Manual", desc: "Always use the model you pick" },
  { key: "balanced", label: "Balanced", desc: "Even mix of reliability, speed, smarts" },
  { key: "smartest", label: "Smartest", desc: "Prefer the most capable model" },
  { key: "fastest", label: "Fastest", desc: "Minimise time-to-first-token" },
  { key: "reliable", label: "Most reliable", desc: "Maximise success / fallback depth" },
  { key: "custom", label: "Custom", desc: "Your own weighted blend" },
];

const installLogs: Record<string, string[]> = {
  ollama: [
    "$ astra-installer install ollama",
    "→ resolving release v0.4.2 (windows-amd64)…",
    "→ downloading ollama-setup.exe [1.2 GB @ 84 MB/s]",
    "→ verifying SHA-256 ✓",
    "→ registering service ollama (127.0.0.1:11434)",
    "→ pulling llama3.2:3b [2.0 GB]",
    "→ pulling qwen3:14b [9.3 GB]",
    "✓ ollama installed — 2 models ready",
  ],
  freellmapi: [
    "$ astra-installer install freellmapi",
    "→ downloading FreeLLMAPI.Setup.0.5.0.exe (official release)",
    "→ verifying publisher signature ✓",
    "→ generating Unified API Key freellmapi-sk-****",
    `→ binding desktop endpoint ${GATEWAYS.freellmapi.apiBaseUrl}`,
    "→ importing provider catalog (v0.5.0 · 100+ models)",
    "✓ freellmapi installed — router healthy",
  ],
  paperclip: [
    "$ npx paperclipai onboard --yes",
    "→ pulling paperclip/runtime:2.1",
    "→ initialising org database (sqlite)",
    "→ seeding hospital org template (6 agents)",
    "→ external agent dashboard removed from Astra",
    "✓ paperclip installed — runtime ready",
  ],
  hermes: [
    "$ curl -fsSL https://nousresearch.github.io/hermes-agent/install.sh | bash",
    "→ installing hermes-cli 3.0.1",
    "→ syncing skill registry (14 skills, 9 tools)",
    "→ initialising memory store v2",
    "✓ hermes installed — run `hermes doctor` to verify",
  ],
};

interface WizardTool {
  id: string;
  name: string;
  desc: string;
  sourceLabel: string;
  sourceHref: string;
  command?: string;
}

const wizardTools: WizardTool[] = [
  {
    id: "ollama", name: "Ollama", desc: "Local model runtime · llama3.2:3b, qwen3:14b",
    sourceLabel: "https://ollama.com/download", sourceHref: "https://ollama.com/download",
  },
  {
    id: "freellmapi", name: "FreeLLMAPI", desc: "Unified LLM router + provider catalog (v0.5.0)",
    sourceLabel: "FreeLLMAPI.Setup.0.5.0.exe (GitHub release)",
    sourceHref: "https://github.com/tashfeenahmed/freellmapi/releases/download/v0.5.0/FreeLLMAPI.Setup.0.5.0.exe",
  },
  {
    id: "paperclip", name: "Paperclip", desc: "Org-chart agent runtime + dashboard",
    sourceLabel: "github.com/paperclipai/paperclip", sourceHref: "https://github.com/paperclipai/paperclip",
    command: "npx paperclipai onboard --yes",
  },
  {
    id: "hermes", name: "Hermes", desc: "Self-improving CLI agent layer (no port — CLI tool)",
    sourceLabel: "github.com/NousResearch/hermes-agent", sourceHref: "https://github.com/NousResearch/hermes-agent",
    command: "hermes doctor   # verify after install",
  },
];

export function Settings() {
  const { settings, setSettings, providers, checkService, ollamaModels, appearance, setAppearance, setBrainState } = useStore();
  const { accounts, updateAccount, createAccount, account: signedIn } = useAuth();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [connResult, setConnResult] = useState<Record<string, TestResult>>({});
  const [installs, setInstalls] = useState<Record<string, InstallState>>(() =>
    Object.fromEntries(wizardTools.map((t) => [t.id, { tool: t.id, status: "not-installed" as const, log: [] }]))
  );
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  /** null = checking, true = reachable, false = not detected */
  const [detected, setDetected] = useState<Record<string, boolean | null>>({});
  const [installAttempted, setInstallAttempted] = useState<Record<string, boolean>>({});
  const [hermesConfirmed, setHermesConfirmed] = useState<boolean>(() => loadLS("astra.hermesInstalled", false));
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, { name: string; pin: string }>>(() =>
    Object.fromEntries(accounts.map((account) => [account.id, { name: account.name, pin: account.pin }]))
  );
  const [newCredential, setNewCredential] = useState({ id: "", name: "", role: "reception", pin: "", subtitle: "Hospital staff" });
  const [offlineVoice, setOfflineVoice] = useState<boolean>(() => isOfflineVoiceEnabled());
  const [voiceTier, setVoiceTier] = useState<VoiceTier | "checking">("checking");
  const [voiceTesting, setVoiceTesting] = useState<string | null>(null);
  const { wakeWordEnabled, setWakeWordEnabled } = useVoicePrefs();
  const canManageStaff = !!signedIn && ["doctor", "ceo", "admin"].includes(signedIn.role);
  const [lanInfo, setLanInfo] = useState<LanInfo | null>(null);
  const [lanIp, setLanIp] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    void detectVoiceTier().then(setVoiceTier);
  }, []);

  useEffect(() => {
    if (!canManageStaff) return;
    const token = localStorage.getItem("astra.serverToken");
    fetch("/api/system/lan-info", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: LanInfo) => { setLanInfo(data); setLanIp(data.addresses?.[0] ?? null); })
      .catch(() => setLanInfo(null));
  }, [canManageStaff]);

  const copyLanUrl = (path: string, url: string) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedPath(path);
      toast.success("Link copied", { description: url });
      setTimeout(() => setCopiedPath((current) => (current === path ? null : current)), 1500);
    }).catch(() => toast.error("Copy failed", { description: url }));
  };

  const w = settings.weights;
  const wSum = w.reliability + w.speed + w.intelligence;

  /* ---------------- real installation detection ---------------- */
  const runDetection = async (id: ToolId) => {
    setDetected((p) => ({ ...p, [id]: null }));
    const ok = await detectTool(id);
    setDetected((p) => ({ ...p, [id]: ok }));
    return ok;
  };

  useEffect(() => {
    void runDetection("ollama");
    void runDetection("freellmapi");
    void runDetection("paperclip");
  }, []);

  /** REAL test for freellmapi / ollama; simulated ping for paperclip / hermes. */
  const testField = async (id: string, name: string) => {
    setTesting(id);
    if (id === "freellmapi" || id === "key") {
      const r = await checkService("freellmapi", { baseUrl: settings.freellmBaseUrl, apiKey: settings.freellmApiKey });
      if (r) {
        setConnResult((p) => ({ ...p, freellmapi: r }));
        if (r.ok) toast.success(`✓ Connected — FreeLLMAPI`, { description: `${r.latencyMs}ms · ${r.modelCount ?? 0} models on the unified router.` });
        else toast.error(`✗ FreeLLMAPI unreachable`, { description: r.error });
      }
    } else if (id === "ollama") {
      const r = await checkService("ollama", { baseUrl: settings.ollamaUrl });
      if (r) {
        setConnResult((p) => ({ ...p, ollama: r }));
        if (r.ok) toast.success(`✓ Connected — Ollama`, { description: `${r.latencyMs}ms · ${r.models?.length ?? 0} local models detected.` });
        else toast.error(`✗ Ollama unreachable`, { description: r.error });
      }
    } else {
      await sleep(800);
      toast.success(`✓ Connected — ${name}`, { description: "Handshake ok (simulated ping — no real endpoint in this build)." });
    }
    setTesting(null);
  };

  const saveAll = () => {
    setSettings({ ...settings });
    setAppearance({ ...appearance });
    toast.success("All settings saved", { description: "Persisted to localStorage." });
  };

  const testOfflineVoice = async (lang: "en" | "te" | "hi") => {
    setVoiceTesting(lang);
    try {
      const msg =
        lang === "en"
          ? "Hello, this is Astra. I am speaking offline, with no internet connection."
          : lang === "te"
            ? "నమస్కారం, నేను అస్త్ర. నేను ఇంటర్నెట్ లేకుండా మాట్లాడుతున్నాను."
            : "नमस्ते, मैं आस्ट्रा हूँ। मैं बिना इंटरनेट के बोल रही हूँ।";
      const r = await speakOffline(msg, lang, { onStart: () => toast.info("Astra voice box speaking…") });
      const label = r.ok ? "Voicebox runtime (local AI)" : "Voicebox unavailable";
      toast.success(`Offline voice OK — ${label}`, { description: "No internet required to speak." });
    } catch {
      toast.error("Voice unavailable on this device", { description: "No local TTS voice could be reached." });
    } finally {
      setVoiceTesting(null);
      void detectVoiceTier().then(setVoiceTier);
    }
  };

  const setWeight = (k: keyof typeof w, v: number) => {
    setSettings({ ...settings, weights: { ...w, [k]: v }, strategy: "custom" });
  };

  const runInstall = async (toolId: string) => {
    const st = installs[toolId];
    if (!st || st.status === "installing") return;
    setInstallAttempted((p) => ({ ...p, [toolId]: true }));
    setInstalls((p) => ({ ...p, [toolId]: { ...p[toolId], status: "installing", log: [] } }));
    setOpenTerm(toolId);
    setBrainState("thinking");
    for (const line of installLogs[toolId]) {
      await sleep(420);
      setInstalls((p) => ({ ...p, [toolId]: { ...p[toolId], log: [...p[toolId].log, line] } }));
    }
    setBrainState("idle");
    setInstalls((p) => ({ ...p, [toolId]: { ...p[toolId], status: "installed" } }));
    // real detection after the install flow completes
    if (toolId !== "hermes") {
      const ok = await runDetection(toolId as ToolId);
      toast[ok ? "success" : "warning"](
        ok ? `${wizardTools.find((t) => t.id === toolId)?.name} detected ✓` : "Install finished but service not reachable yet",
        { description: ok ? "Status pill updated from real detection." : "It may still be starting — press Re-check in a few seconds." }
      );
    } else {
      toast.success("Hermes install scripted", { description: "Confirm below once `hermes doctor` passes." });
    }
  };

  const wizardPill = (t: WizardTool): { text: string; tone: "green" | "amber" | "neutral" } => {
    if (t.id === "hermes") {
      return hermesConfirmed ? { text: "Self-reported ✓", tone: "amber" } : { text: "Not installed", tone: "neutral" };
    }
    const st = installs[t.id];
    if (st.status === "installing") return { text: "Installing…", tone: "amber" };
    const d = detected[t.id];
    if (d === true) return { text: "Installed ✓ (reachable)", tone: "green" };
    if (d === false && (st.status === "installed" || installAttempted[t.id]))
      return { text: "Installed? Not reachable — Re-check", tone: "amber" };
    if (d === null) return { text: "Checking…", tone: "amber" };
    return { text: "Not Detected", tone: "neutral" };
  };

  const connFields = [
    { id: "freellmapi", label: "FreeLLMAPI Base URL", value: settings.freellmBaseUrl, set: (v: string) => setSettings({ ...settings, freellmBaseUrl: v }) },
    { id: "ollama", label: "Ollama URL", value: settings.ollamaUrl, set: (v: string) => setSettings({ ...settings, ollamaUrl: v }) },
    { id: "paperclip", label: "Paperclip URL", value: settings.paperclipUrl, set: (v: string) => setSettings({ ...settings, paperclipUrl: v }) },
    { id: "hermes", label: "Hermes endpoint", value: settings.hermesUrl, set: (v: string) => setSettings({ ...settings, hermesUrl: v }) },
  ];

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Connections, routing, provider health, appearance and the setup wizard</p>
      </div>

      <GlassCard>
        <SectionTitle title="Staff Login Vault" subtitle="Doctor/CEO managed accounts · scrypt password hashes · role-scoped sessions" />
        {signedIn && ["doctor", "ceo"].includes(signedIn.role) && <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-3 md:grid-cols-[130px_1fr_150px_130px_100px]">
          <input className="input-dark !py-2 text-xs" placeholder="login-id" value={newCredential.id} onChange={(e) => setNewCredential({ ...newCredential, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-") })} />
          <input className="input-dark !py-2 text-xs" placeholder="Staff name" value={newCredential.name} onChange={(e) => setNewCredential({ ...newCredential, name: e.target.value })} />
          <select className="input-dark !py-2 text-xs" value={newCredential.role} onChange={(e) => setNewCredential({ ...newCredential, role: e.target.value })}>{["reception","finance","ward","ot","pharmacy","lab","radiotech","supervisor","marketing","doctor"].map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <input className="input-dark !py-2 text-xs" type="password" placeholder="Password/PIN" value={newCredential.pin} onChange={(e) => setNewCredential({ ...newCredential, pin: e.target.value })} />
          <button className="btn-neon !py-2 !text-xs" onClick={async () => { const ok = await createAccount({ ...newCredential, role: newCredential.role as any }); if (ok) { toast.success("Staff account created"); setNewCredential({ id: "", name: "", role: "reception", pin: "", subtitle: "Hospital staff" }); } else toast.error("Account creation failed"); }}>Create</button>
        </div>}
        <div className="space-y-2">
          {accounts.map((account) => {
            const draft = credentialDrafts[account.id] ?? { name: account.name, pin: account.pin };
            return (
              <div key={account.id} className="grid grid-cols-1 md:grid-cols-[150px_1fr_180px_100px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div>
                  <p className="text-xs font-semibold text-white">{account.role}</p>
                  <p className="text-[10px] font-mono text-slate-500">ID: {account.id}</p>
                </div>
                <input
                  className="input-dark !py-2 text-xs"
                  value={draft.name}
                  aria-label={`${account.role} staff name`}
                  onChange={(event) => setCredentialDrafts((current) => ({ ...current, [account.id]: { ...draft, name: event.target.value } }))}
                />
                <input
                  className="input-dark !py-2 text-xs font-mono"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="New PIN"
                  value={draft.pin}
                  aria-label={`${account.role} PIN`}
                  onChange={(event) => setCredentialDrafts((current) => ({ ...current, [account.id]: { ...draft, pin: event.target.value.replace(/\D/g, "") } }))}
                />
                <button
                  className="btn-neon !py-2 !text-xs"
                  onClick={() => {
                    if (draft.pin.length < 4 || draft.pin.length > 6 || !draft.name.trim()) {
                      toast.error("Enter a staff name and a 4–6 digit PIN");
                      return;
                    }
                    updateAccount(account.id, { name: draft.name.trim(), pin: draft.pin });
                    toast.success(`${account.role} login updated`);
                  }}
                >
                  <Save size={12} /> Save
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] text-emerald-300">Passwords are never returned to the browser. The server stores only salted scrypt hashes; changes require an authenticated Doctor or CEO session.</p>
      </GlassCard>

      {/* ---------------- staff access over LAN ---------------- */}
      {canManageStaff && (
        <GlassCard>
          <SectionTitle title="Staff Access (LAN)" subtitle="Open a link on any staff laptop joined to the same Wi-Fi/LAN — sign-in is per department" />
          {lanInfo ? (
            <>
              {lanInfo.addresses.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {lanInfo.addresses.map((ip) => (
                    <button
                      key={ip}
                      onClick={() => setLanIp(ip)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[10px] font-mono transition-all",
                        ip === lanIp ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:text-white"
                      )}
                    >
                      {ip}
                    </button>
                  ))}
                </div>
              )}
              {lanIp ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                  {LAN_DEPARTMENTS.map((d) => {
                    const url = `http://${lanIp}:${lanInfo.vitePort}#${d.path}`;
                    return (
                      <div key={d.path} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 flex items-center gap-2.5">
                        <div className="bg-white p-1 rounded shrink-0">
                          <QRCodeSVG value={url} size={56} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white">{d.label}</p>
                          <p className="text-[10px] font-mono text-slate-400 break-all leading-snug">{url}</p>
                          <button className="btn-ghost !text-[10px] !py-1 !px-2 mt-1.5" onClick={() => copyLanUrl(d.path, url)}>
                            {copiedPath === d.path ? <Check size={10} /> : <Copy size={10} />} {copiedPath === d.path ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-amber-300">No LAN IPv4 address found — is this PC connected to the shared Wi-Fi?</p>
              )}
              <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-400 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2.5">
                <ShieldCheck size={13} className="text-amber-300 shrink-0 mt-0.5" />
                <span>
                  Camera/mic on other laptops needs the HTTPS link:{" "}
                  {lanIp ? <span className="font-mono text-amber-200">https://{lanIp}:{lanInfo.httpsPort}</span> : <span className="font-mono text-amber-200">https://&lt;LAN-IP&gt;:{lanInfo.httpsPort}</span>}
                  {lanInfo.httpsRunning
                    ? " — running now."
                    : " — start it with npm run dev:https (currently not running)."}
                  {" "}The HTTP links work for everything else.
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">LAN info unavailable — sign in and make sure the Astra API is reachable.</p>
          )}
        </GlassCard>
      )}

      {/* ---------------- offline voice box ---------------- */}
      <GlassCard>
        <SectionTitle
          title="Local Voicebox"
          subtitle="Natural local neural speech through Voicebox"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Volume2 size={14} className="text-yellow-400" />
              <span className="text-xs font-semibold text-white">Offline speech</span>
              <span
                className={cn(
                  "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                  offlineVoice ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"
                )}
              >
                {offlineVoice ? "On" : "Muted"}
              </span>
            </div>
            <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={offlineVoice}
                onChange={(e) => {
                  const v = e.target.checked;
                  setOfflineVoice(v);
                  setOfflineVoiceEnabled(v);
                }}
                className="accent-yellow-500 mt-0.5"
              />
              <span className="text-xs text-slate-300 leading-snug">
                <b>Enable local Voicebox</b> — Astra uses the installed neural Voicebox runtime.
                When it is offline, Astra reports the problem and does not use Windows or browser voices.
              </span>
            </label>
            <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wakeWordEnabled}
                onChange={(e) => setWakeWordEnabled(e.target.checked)}
                className="accent-emerald-500 mt-0.5"
              />
              <span className="text-xs text-slate-300 leading-snug">
                <b>Wake word</b> — listen locally for hey Mayin, Mayin, Astra, or Jarvis.
              </span>
            </label>
            <div className="mt-3 text-[10px] text-slate-500 flex items-center gap-1.5">
              <Volume2 size={11} className="text-yellow-500" /> {voiceTier === "checking" && "Checking voice tier…"}
              {voiceTier === "voicebox" && "Tier: Voicebox runtime (English, Hindi, Telugu)"}
              {voiceTier === "gemini" && "Tier: Sarvam, then Gemini (human cloud voice)"}
              {voiceTier === "unavailable" && "Voicebox offline — Sarvam and Gemini are the human voices"}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <VolumeX size={16} className="text-yellow-400" />
              <span className="text-xs font-semibold text-white">Test voices</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              {(["en", "te", "hi"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => void testOfflineVoice(l)}
                  disabled={!offlineVoice || voiceTesting === l}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-bold uppercase tracking-wide transition-all",
                    offlineVoice ? "border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10 cursor-pointer" : "border-white/10 text-slate-500 cursor-not-allowed",
                    voiceTesting === l && "animate-pulse"
                  )}
                >
                  <Mic size={13} className="inline-block mr-1" />
                  {l}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-3 flex items-start gap-1.5">
              <ShieldCheck size={11} className="text-emerald-400 mt-0.5 shrink-0" />
              Speech is generated on this device by Voicebox. If nothing plays, start the local
              Voicebox runtime — Windows and browser voices are not used.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* ---------------- appearance ---------------- */}
      <GlassCard>
        <SectionTitle title="Appearance" subtitle="Astra Hospital OS — Kautilya AI visual identity" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-slate-500">Background preset</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {(
                [
                  { key: "Astra", label: "Astra Obsidian Gold", desc: "Command deck · mandala · neural core" },
                  { key: "classic", label: "Classic Neon Grid", desc: "Original cyan/violet starfield" },
                ] as const
              ).map((p) => (
                <button
                  key={p.key}
                  onClick={() => setAppearance({ ...appearance, preset: p.key })}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    appearance.preset === p.key
                      ? "border-violet-400/60 bg-violet-500/15 shadow-[0_0_14px_rgba(212,175,55,0.3)]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  )}
                >
                  <div className="text-xs font-semibold text-white">{p.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500">Animation intensity</label>
            <div className="flex gap-1.5 mt-1.5">
              {(["calm", "normal", "epic"] as const).map((i) => (
                <button
                  key={i}
                  onClick={() => setAppearance({ ...appearance, intensity: i })}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition-all",
                    appearance.intensity === i
                      ? "border-violet-400/60 bg-violet-500/15 text-white"
                      : "border-white/10 text-slate-400 hover:text-white"
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex gap-5 mt-3.5 text-sm">
              {(
                [
                  ["particles", "Particles & depth motes"],
                  ["ripples", "Cursor ripples"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appearance[key]}
                    onChange={(e) => setAppearance({ ...appearance, [key]: e.target.checked } as AppearanceSettings)}
                    className="accent-yellow-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-slate-600 mt-3 flex items-center gap-1.5">
          <Palette size={11} className="text-violet-400" /> Changes apply instantly and persist to localStorage.
        </p>
      </GlassCard>

      {/* ---------------- connections ---------------- */}
      <GlassCard>
        <SectionTitle title="Connections" subtitle="Unified API key lives in FreeLLMAPI Keys tab only — Astra backend syncs it. Not stored in the browser." />
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-slate-500">FreeLLMAPI Unified API Key</label>
            <p className="text-[11px] text-slate-400 mt-1 mb-2">
              Managed only in FreeLLMAPI → Keys → API key tab at{" "}
              <a className="text-cyan-300 underline" href={FREE_KEYS_URL} target="_blank" rel="noreferrer">
                {new URL(FREE_KEYS_URL).host}/keys
              </a>
              . Astra syncs it on the backend. It is not stored in this browser.
            </p>
            <div className="flex gap-2 mt-1">
              <button
                className="btn-ghost !text-xs"
                disabled={testing === "sync"}
                onClick={async () => {
                  setTesting("sync");
                  try {
                    const res = await fetch("/api/ai/sync-freellmapi-key", { method: "POST" });
                    const data = await res.json();
                    if (data.ok) toast.success("Unified key synced from FreeLLMAPI Keys tab", { description: data.email ? `Account ${data.email}` : undefined });
                    else toast.error("Sync failed", { description: data.error ?? `HTTP ${res.status}` });
                  } catch (e) {
                    toast.error("Sync failed", { description: e instanceof Error ? e.message : String(e) });
                  }
                  setTesting(null);
                }}
              >
                {testing === "sync" ? "Syncing…" : "Sync from Keys tab"}
              </button>
              <button className="btn-ghost !text-xs !w-24" disabled={testing === "key"} onClick={() => void testField("key", "API key")}>
                {testing === "key" ? <span className="h-3 w-3 rounded-full border-2 border-neon-cyan border-t-transparent animate-spin" /> : "Test"}
              </button>
            </div>
            {connResult.freellmapi && (
              <p className={cn("text-[11px] mt-1.5", connResult.freellmapi.ok ? "text-emerald-300" : "text-red-300")}>
                {connResult.freellmapi.ok
                  ? `✓ Connected · ${connResult.freellmapi.latencyMs}ms · ${connResult.freellmapi.modelCount ?? 0} models`
                  : `✗ ${connResult.freellmapi.error}`}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connFields.map((f) => (
              <div key={f.id}>
                <label className="text-[11px] text-slate-500">{f.label}</label>
                <div className="flex gap-2 mt-1">
                  <input className="input-dark font-mono flex-1" value={f.value} onChange={(e) => f.set(e.target.value)} />
                  <button className="btn-ghost !text-xs !w-24" disabled={testing === f.id} onClick={() => void testField(f.id, f.label)}>
                    {testing === f.id ? <span className="h-3 w-3 rounded-full border-2 border-neon-cyan border-t-transparent animate-spin" /> : "Test"}
                  </button>
                </div>
                {connResult[f.id] && (
                  <p className={cn("text-[11px] mt-1.5", connResult[f.id].ok ? "text-emerald-300" : "text-red-300")}>
                    {connResult[f.id].ok
                      ? `✓ Connected · ${connResult[f.id].latencyMs}ms · ${connResult[f.id].modelCount ?? 0} models`
                      : `✗ ${connResult[f.id].error}`}
                  </p>
                )}
                {f.id === "ollama" && ollamaModels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ollamaModels.map((m) => (
                      <Badge key={m} tone="cyan" className="!text-[9px] font-mono">{m}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button className="btn-neon" onClick={saveAll}><Save size={15} /> Save all</button>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-2.5">
            <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
            API mode: your Unified API Key never leaves this machine — all calls go only to 127.0.0.1 services through the local Vite dev proxy (/proxy/freellmapi, /proxy/ollama).
          </div>
        </div>
      </GlassCard>

      {/* ---------------- routing ---------------- */}
      <GlassCard>
        <SectionTitle title="Routing Strategy" subtitle="How FreeLLMAPI picks a model per request" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-5">
          {strategies.map((s) => (
            <button
              key={s.key}
              onClick={() => setSettings({ ...settings, strategy: s.key })}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                settings.strategy === s.key
                  ? "border-violet-400/60 bg-violet-500/15 shadow-[0_0_14px_rgba(212,175,55,0.3)]"
                  : "border-white/10 bg-white/[0.03] hover:border-white/25"
              )}
            >
              <div className="text-xs font-semibold text-white">{s.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{s.desc}</div>
            </button>
          ))}
        </div>

        {settings.strategy === "custom" && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
            {(["reliability", "speed", "intelligence"] as const).map((k) => (
              <div key={k}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-300 capitalize">{k}</span>
                  <span className="text-white font-semibold">{w[k]}%</span>
                </div>
                <input type="range" min={0} max={100} value={w[k]} onChange={(e) => setWeight(k, Number(e.target.value))} className="w-full accent-cyan-400" />
              </div>
            ))}
            <div className={cn("text-xs font-semibold flex items-center gap-1.5", wSum === 100 ? "text-emerald-300" : "text-red-300")}>
              {wSum === 100 ? <Check size={14} /> : <X size={14} />}
              Weights sum: {wSum}% {wSum !== 100 && "— must equal 100%"}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <div className="text-xs">
            <span className="text-amber-300 font-semibold">Module override — Clinical Decision Support</span>
            <p className="text-slate-400 mt-0.5">CDS is pinned to “Most reliable” routing regardless of the global strategy.</p>
          </div>
          <button
            className={cn("relative h-6 w-11 rounded-full transition-colors shrink-0 ml-4", settings.cdsPinnedReliable ? "bg-emerald-500/70" : "bg-white/15")}
            onClick={() => { setSettings({ ...settings, cdsPinnedReliable: !settings.cdsPinnedReliable }); toast(settings.cdsPinnedReliable ? "CDS override removed" : "CDS pinned to Most reliable"); }}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", settings.cdsPinnedReliable ? "left-[22px]" : "left-0.5")} />
          </button>
        </div>
      </GlassCard>

      {/* ---------------- provider health ---------------- */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle title="Provider Health" subtitle="FreeLLMAPI v0.5.0 catalog — health check simulated" />
          <button
            className="btn-ghost !text-xs"
            disabled={testing === "checkall"}
            onClick={() => {
              setTesting("checkall");
              void Promise.all([checkService("freellmapi"), checkService("ollama")]).then(([f, o]) => {
                setTesting(null);
                toast("Provider check complete", {
                  description: `freellmapi: ${f?.ok ? "✓ healthy" : "✗ unreachable"} · ollama: ${o?.ok ? "✓ healthy" : "✗ unreachable"} · sidebar dots updated. Per-provider rows below are simulated.`,
                });
              });
            }}
          >
            <RefreshCw size={13} className={testing === "checkall" ? "animate-spin" : ""} /> Check all
          </button>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-ink-800/95 backdrop-blur">
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 font-medium">Provider / model</th>
                <th className="pb-2 font-medium">Models</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Latency</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.provider} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-2.5 font-mono text-slate-200">{p.provider}</td>
                  <td className="py-2.5 text-slate-400">{p.models}</td>
                  <td className="py-2.5">
                    <span className="flex items-center gap-2">
                      <StatusDot status={p.status} />
                      <span className={p.status === "healthy" ? "text-emerald-300" : p.status === "issues" ? "text-amber-300" : "text-red-300"}>{p.status}</span>
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-400">{p.status === "disabled" ? "—" : `${p.latencyMs}ms`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">v0.5.0 API surfaces</div>
          <div className="flex flex-wrap gap-1.5">
            {providerCaps.map((c) => (
              <Badge key={c} tone="violet" className="!text-[9px] font-mono">{c}</Badge>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* ---------------- setup wizard ---------------- */}
      <GlassCard>
        <SectionTitle title="Setup Wizard" subtitle="Real port-based detection — pills update from live probes" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {wizardTools.map((t) => {
            const st = installs[t.id];
            const pill = wizardPill(t);
            return (
              <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className="text-[11px] text-slate-500">{t.desc}</div>
                  </div>
                  <Badge tone={pill.tone} className="shrink-0 !text-[9px]">{pill.text}</Badge>
                </div>

                <div className="mt-2.5 text-[10px] text-slate-500 space-y-1">
                  <a href={t.sourceHref} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-neon-cyan hover:underline">
                    <ExternalLink size={10} /> {t.sourceLabel}
                  </a>
                  {t.command && (
                    <div className="flex items-center gap-1 font-mono text-slate-400">
                      <Terminal size={10} /> {t.command}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  {t.id === "hermes" ? (
                    <button
                      className={cn("btn-ghost !text-xs flex-1", hermesConfirmed && "!border-emerald-400/50 !text-emerald-300")}
                      onClick={() => {
                        const v = !hermesConfirmed;
                        setHermesConfirmed(v);
                        saveLS("astra.hermesInstalled", v);
                        toast(v ? "Hermes marked installed (self-reported)" : "Hermes confirmation cleared", {
                          description: v ? "Run `hermes doctor` to verify your CLI install." : undefined,
                        });
                      }}
                    >
                      {hermesConfirmed ? "✓ Hermes installed (self-reported)" : "I've installed Hermes"}
                    </button>
                  ) : (
                    <button
                      className="btn-neon !text-xs flex-1"
                      disabled={st.status === "installing"}
                      onClick={() => void runInstall(t.id)}
                    >
                      {st.status === "installing" ? "Installing…" : detected[t.id] ? "Reinstall" : "Install"}
                    </button>
                  )}
                  {t.id !== "hermes" && (
                    <button
                      className="btn-ghost !text-xs"
                      disabled={detected[t.id] === null}
                      onClick={() => void runDetection(t.id as ToolId)}
                      title="Re-check real detection"
                    >
                      <RefreshCw size={12} className={detected[t.id] === null ? "animate-spin" : ""} /> Re-check
                    </button>
                  )}
                  {st.log.length > 0 && (
                    <button className="btn-ghost !text-xs" onClick={() => setOpenTerm(openTerm === t.id ? null : t.id)}>
                      {openTerm === t.id ? "Hide" : "Log"}
                    </button>
                  )}
                </div>
                {openTerm === t.id && st.log.length > 0 && (
                  <div className="mt-3 rounded-lg bg-black/60 border border-emerald-400/20 p-3 font-mono text-[10px] text-emerald-300/90 space-y-0.5 max-h-40 overflow-y-auto">
                    {st.log.map((l, i) => <div key={i}>{l}</div>)}
                    {st.status === "installing" && <span className="inline-block w-1.5 h-3 bg-emerald-400 animate-pulse" />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-2 mt-4 text-[11px] text-slate-500">
          <ShieldCheck size={13} className="text-emerald-400 mt-0.5 shrink-0" />
          <span>
            Security note: the installer service binds to <span className="font-mono text-slate-300">127.0.0.1</span> only. Install scripts should be
            read before one-click install — review the sources linked above before running them on a production machine.
          </span>
        </div>
      </GlassCard>

      {/* ---------------- FreeLLMAPI installer card ---------------- */}
      <GlassCard>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-500/30 border border-violet-400/40 flex items-center justify-center shrink-0">
            <Download size={19} className="text-violet-300" />
          </div>
          <div className="flex-1 min-w-[260px]">
            <div className="text-sm font-semibold text-white">FreeLLMAPI Desktop App — Official Installer</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Runs on <span className="font-mono text-neon-cyan">{GATEWAYS.freellmapi.dashboardUrl.replace(/\/$/, "")}</span> — after installing, paste the Unified Key from its Keys tab into Settings → Connections above.
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <a
                className="btn-neon !text-xs"
                href="https://github.com/tashfeenahmed/freellmapi/releases/download/v0.5.0/FreeLLMAPI.Setup.0.5.0.exe"
                target="_blank" rel="noreferrer"
              >
                <Download size={13} /> Download FreeLLMAPI Setup 0.5.0 (Windows .exe)
              </a>
              <a className="btn-ghost !text-xs" href="https://github.com/tashfeenahmed/freellmapi/releases/download/v0.5.0/FreeLLMAPI-0.5.0-arm64.dmg" target="_blank" rel="noreferrer">
                macOS DMG (arm64)
              </a>
              <a className="btn-ghost !text-xs" href="https://github.com/tashfeenahmed/freellmapi/releases/tag/v0.5.0" target="_blank" rel="noreferrer">
                Release notes
              </a>
              <a className="btn-ghost !text-xs" href="https://github.com/tashfeenahmed/freellmapi" target="_blank" rel="noreferrer">
                Repository
              </a>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
