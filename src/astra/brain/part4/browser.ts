/**
 * Internal Browser nervous system. URLs stay in the existing service registry.
 * This module decides what to open and whether an API should be read first.
 */

export type BrowserMethod =
  | "OPEN_PAGE"
  | "READ_API"
  | "READ_SERVICE_STATUS"
  | "SEARCH_INTERNAL_DATA"
  | "SEARCH_INTERNAL"
  | "SEARCH_WEB"
  | "SEARCH_EXTERNAL"
  | "CLICK_UI"
  | "DOWNLOAD_DOCUMENT"
  | "OPEN_DOCUMENT"
  | "OPEN_SERVICE"
  | "OPEN_PATIENT_VIEW"
  | "RETURN_TO_PATIENT";

export type BrowserMode = "READ" | "ACTION";

export interface BrowserCommand {
  raw: string;
  action: "open-service" | "open-place" | "back" | "forward" | "refresh" | "home" | "close" | "pin" | "split" | "health" | "context" | "blocked";
  serviceId?: string;
  place?: string;
  method: BrowserMethod;
  mode: BrowserMode;
  apiFirst: boolean;
  external: boolean;
  untrusted: boolean;
  modifiesHospitalRecord: false;
  needsApproval: boolean;
  explanation: string;
}

export const SEARCH_ORDER = [
  "Current Patient",
  "Astra Database",
  "Current Encounter",
  "Patient Timeline",
  "Hospital Documents",
  "Memory Fabric",
  "Scientist Knowledge",
  "Internal Services",
  "External Web",
] as const;

export interface ServiceCard {
  serviceId: string;
  title: string;
  primary: string;
  technicalEngine: string;
  secondary: string[];
  buttons: string[];
  externalAi?: boolean;
}

export const SERVICE_CARDS: ServiceCard[] = [
  { serviceId: "voicebox", title: "VOICEBOX", primary: "OFFLINE SPEECH INPUT AND OUTPUT", technicalEngine: "Voicebox", secondary: ["Speech-to-text", "Text-to-speech"], buttons: ["OPEN", "HEALTH", "API"] },
  { serviceId: "hermes", title: "HERMES", primary: "ASTRA EXECUTIVE REASONING BRAIN", technicalEngine: "Hermes", secondary: ["Evolution Room", "Memory", "Skills", "Status"], buttons: ["OPEN BRAIN", "EVOLUTION ROOM", "MEMORY", "SKILLS", "STATUS"] },
  { serviceId: "laya", title: "LAYA", primary: "MAKES FAST DECISIONS BEFORE THE LARGE AI NEEDS TO THINK", technicalEngine: "Laya System-1 Decision Model", secondary: ["Intent", "Urgency", "Routing"], buttons: ["DECISIONS", "ROUTING", "CONFIDENCE", "EVALS"] },
  { serviceId: "langgraph-orchestrator", title: "LANGGRAPH", primary: "ORGANIZES EVERY ASTRA TASK IN THE CORRECT SEQUENCE", technicalEngine: "LangGraph", secondary: ["Workflows", "Checkpoints", "Resume"], buttons: ["WORKFLOWS", "CURRENT STATE", "CHECKPOINTS", "RESUME"] },
  { serviceId: "scientist", title: "SCIENTIST", primary: "VERIFY MEDICAL QUESTIONS AGAINST EVIDENCE", technicalEngine: "Scientist", secondary: ["Guidelines", "Trials", "Papers", "Drugs"], buttons: ["SEARCH", "GUIDELINES", "SOURCES", "HISTORY"] },
  { serviceId: "astra-7d", title: "ASTRA 7D", primary: "COMPLETE CLINICAL REASONING WORKFLOW", technicalEngine: "Astra 7D", secondary: ["Symptoms", "Mechanism", "Differential", "Management"], buttons: ["RUN 7D", "CURRENT CASE", "DIFFERENTIAL", "MANAGEMENT", "PATHOPHYSIOLOGY"] },
  { serviceId: "openclaw", title: "OPENCLAW", primary: "PERSONAL STAFF AGENT AND TOOL OPERATOR", technicalEngine: "OpenClaw", secondary: ["Role tasks", "Tools"], buttons: ["OPEN", "TOOLS", "TASKS", "STATUS"] },
  { serviceId: "n8n", title: "n8n", primary: "HOSPITAL AUTOMATION BUS", technicalEngine: "n8n", secondary: ["Approved workflows"], buttons: ["WORKFLOWS", "EXECUTIONS", "FAILED JOBS", "HEALTH"] },
  { serviceId: "ollama", title: "OLLAMA", primary: "LOCAL PRIVATE AI RUNTIME", technicalEngine: "Ollama", secondary: ["Local models"], buttons: ["MODELS", "RUNNING", "HEALTH"] },
  { serviceId: "freellmapi", title: "FREELLMAPI", primary: "MAIN AI MODEL GATEWAY", technicalEngine: "FreeLLMAPI", secondary: ["Unified model access"], buttons: ["MODELS", "REQUESTS", "PROVIDERS", "HEALTH"] },
  { serviceId: "omniroute", title: "OMNIROUTE", primary: "SECONDARY MODEL ROUTER", technicalEngine: "OmniRoute", secondary: ["Policy routing"], buttons: ["ROUTES", "PROVIDERS", "QUOTA", "HEALTH"] },
  { serviceId: "chatgpt", title: "CHATGPT", primary: "OPTIONAL EXTERNAL AI CONSULTATION", technicalEngine: "ChatGPT", secondary: ["External AI"], buttons: ["OPEN"], externalAi: true },
  { serviceId: "grok", title: "GROK", primary: "OPTIONAL EXTERNAL AI CONSULTATION", technicalEngine: "Grok", secondary: ["External AI"], buttons: ["OPEN"], externalAi: true },
  { serviceId: "kimi", title: "KIMI", primary: "OPTIONAL EXTERNAL AI CONSULTATION", technicalEngine: "Kimi", secondary: ["External AI"], buttons: ["OPEN"], externalAi: true },
];

export const BROWSER_BAR = {
  Patient: ["patient"],
  Clinical: ["astra-7d", "scientist"],
  Evidence: ["scientist"],
  Hospital: ["reception", "opd", "ward", "icu", "ot", "pharmacy", "lab", "usg", "radiology", "billing", "discharge", "cmrf", "admin", "settings"],
  "AI Brain": ["hermes", "laya", "langgraph-orchestrator", "astra-7d", "scientist", "evolution", "freellmapi"],
  Communication: ["contact"],
  Operations: ["n8n"],
} as const;

export const HOSPITAL_PLACES: Record<string, string> = {
  reception: "/reception",
  opd: "/appointments",
  admissions: "/reception",
  ward: "/ward",
  icu: "/ward",
  ot: "/ot",
  pharmacy: "/pharmacy",
  laboratory: "/lab",
  lab: "/lab",
  usg: "/radiology",
  radiology: "/radiology",
  billing: "/billing",
  discharge: "/journey",
  cmrf: "/insurance",
  administration: "/admin",
  admin: "/admin",
  settings: "/settings",
};

const ALIAS: Record<string, string> = {
  voicebox: "voicebox",
  n8n: "n8n",
  openclaw: "openclaw",
  hermes: "hermes",
  "plugin-center": "plugins",
  plugins: "plugins",
  scientist: "scientist",
  memory: "memory",
  evolution: "evolution",
  laya: "laya",
  langgraph: "langgraph-orchestrator",
  "7d": "astra-7d",
  ollama: "ollama",
  freellmapi: "freellmapi",
  omniroute: "omniroute",
  chatgpt: "chatgpt",
  grok: "grok",
  kimi: "kimi",
};

function command(partial: Omit<BrowserCommand, "modifiesHospitalRecord" | "raw"> & { raw: string }): BrowserCommand {
  return { ...partial, modifiesHospitalRecord: false };
}

export function parseBrowserCommand(text: string): BrowserCommand | null {
  const raw = text.trim();
  const slash = raw.match(/^\/browser\s+(\S+)(?:\s+(.+))?$/i);
  const natural = !slash && /open|back|forward|refresh|home|health|context|cbc|whisper|voicebox settings|update bed|finalize discharge|send message/i.test(raw);
  if (!slash && !natural) return null;
  const verb = (slash?.[1] ?? "").toLowerCase();
  const arg = (slash?.[2] ?? raw).trim();

  if (/latest cbc|open the latest cbc/i.test(raw)) {
    return command({
      raw, action: "open-place", place: "lab", method: "READ_API", mode: "READ", apiFirst: true, external: false, untrusted: false, needsApproval: false,
      explanation: "Patient lab view. The lab record is read through the API. This is not a web search.",
    });
  }
  if (/whisper|voicebox settings/i.test(raw)) {
    return command({
      raw, action: "open-service", serviceId: "voicebox", method: "READ_API", mode: "READ", apiFirst: true, external: false, untrusted: false, needsApproval: false,
      explanation: "Voicebox status is an API question. The model load is not guessed, and the screen opens only to show the panel.",
    });
  }
  if (verb === "back" || /^back$/i.test(arg)) return command({ raw, action: "back", method: "OPEN_PAGE", mode: "READ", apiFirst: false, external: false, untrusted: false, needsApproval: false, explanation: "Back." });
  if (verb === "forward") return command({ raw, action: "forward", method: "OPEN_PAGE", mode: "READ", apiFirst: false, external: false, untrusted: false, needsApproval: false, explanation: "Forward." });
  if (verb === "refresh") return command({ raw, action: "refresh", method: "OPEN_PAGE", mode: "READ", apiFirst: false, external: false, untrusted: false, needsApproval: false, explanation: "Refresh." });
  if (verb === "home") return command({ raw, action: "home", method: "OPEN_PAGE", mode: "READ", apiFirst: false, external: false, untrusted: false, needsApproval: false, explanation: "Home." });
  if (verb === "close") return command({ raw, action: "close", method: "OPEN_PAGE", mode: "READ", apiFirst: false, external: false, untrusted: false, needsApproval: false, explanation: "Close the tab." });
  if (verb === "pin") return command({ raw, action: "pin", method: "OPEN_PAGE", mode: "READ", apiFirst: false, external: false, untrusted: false, needsApproval: false, explanation: "Pin the tab." });
  if (verb === "split") return command({ raw, action: "split", method: "OPEN_PAGE", mode: "READ", apiFirst: false, external: false, untrusted: false, needsApproval: false, explanation: "Split view keeps the workflow beside the page." });
  if (verb === "health") return command({ raw, action: "health", method: "READ_SERVICE_STATUS", mode: "READ", apiFirst: true, external: false, untrusted: false, needsApproval: false, explanation: "Health is read from each service endpoint." });
  if (verb === "context") return command({ raw, action: "context", method: "SEARCH_INTERNAL", mode: "READ", apiFirst: true, external: false, untrusted: false, needsApproval: false, explanation: "Current context." });
  if (verb === "open" || /open /i.test(raw)) {
    const target = (slash ? arg : raw.replace(/^open\s+/i, "")).toLowerCase();
    const place = Object.keys(HOSPITAL_PLACES).find((key) => target.includes(key));
    if (place) {
      return command({
        raw, action: "open-place", place, method: "OPEN_PAGE", mode: "READ", apiFirst: false, external: false, untrusted: false, needsApproval: false,
        explanation: `Open the ${place} workspace.`,
      });
    }
    if (target.includes("patient")) {
      return command({ raw, action: "open-place", place: "patient", method: "OPEN_PATIENT_VIEW", mode: "READ", apiFirst: true, external: false, untrusted: false, needsApproval: false, explanation: "Return to the locked patient." });
    }
    const alias = Object.keys(ALIAS).find((key) => target.includes(key));
    if (alias) {
      const serviceId = ALIAS[alias]!;
      const external = serviceId === "chatgpt" || serviceId === "grok" || serviceId === "kimi";
      return command({
        raw, action: "open-service", serviceId, method: external ? "SEARCH_EXTERNAL" : "OPEN_SERVICE", mode: "READ", apiFirst: !external, external, untrusted: external, needsApproval: external,
        explanation: external ? "External AI stays outside patient facts until the text is classified, redacted, and approved." : "Open the registered service. The API is preferred when it can answer.",
      });
    }
  }
  if (/update bed|finalize discharge|send message/i.test(raw)) {
    return command({
      raw, action: "blocked", method: "CLICK_UI", mode: "ACTION", apiFirst: false, external: false, untrusted: false, needsApproval: true,
      explanation: "Action mode. This page cannot change the hospital record. The command waits for the existing approval path.",
    });
  }
  return null;
}

export function externalAiRelease(text: string, userApproved: boolean): { allowed: boolean; redacted: string; label: "UNVERIFIED EXTERNAL AI OUTPUT" } {
  const redacted = text.replace(/\b(mrn|uhid)\s*[-:]?\s*[A-Za-z0-9-]+/gi, "[id]").replace(/\bbed\s*\d+\b/gi, "[bed]");
  return { allowed: userApproved, redacted, label: "UNVERIFIED EXTERNAL AI OUTPUT" };
}

export interface PatientLock {
  name: string;
  mrn: string;
  ageSex: string;
  encounter: string;
  wardBed: string;
  doctor: string;
}

export function patientChange(current: PatientLock | null, nextMrn: string): { needsConfirm: boolean } {
  if (!current) return { needsConfirm: false };
  return { needsConfirm: current.mrn !== nextMrn };
}

export interface ContextPanel {
  patient: string;
  department: string;
  workflow: string;
  openedBy: string;
  reason: string;
  relatedRequest: string;
  activeFunction: string;
}

export function contextFor(commandResult: BrowserCommand | null, patient: PatientLock | null): ContextPanel {
  return {
    patient: patient ? `${patient.name} ${patient.mrn}` : "none",
    department: commandResult?.place ?? "browser",
    workflow: commandResult?.serviceId === "astra-7d" ? "ASTRA 7D" : "navigation",
    openedBy: "Astra",
    reason: commandResult?.explanation ?? "Workspace home",
    relatedRequest: commandResult?.raw ?? "",
    activeFunction: commandResult?.method ?? "OPEN_PAGE",
  };
}

export const CLINICAL_WORKSPACE = [
  "PATIENT OVERVIEW", "TIMELINE", "CURRENT ADMISSION", "SYMPTOMS", "SIGNS", "INVESTIGATIONS", "LAB TRENDS",
  "RADIOLOGY", "MEDICATIONS", "ASTRA 7D", "DIFFERENTIAL", "PATHOPHYSIOLOGY", "MANAGEMENT", "PROCEDURES",
  "COMPLICATION WATCH", "DOCUMENTS", "DISCHARGE",
] as const;

export interface EvidenceHit {
  source: string;
  title: string;
  date: string;
  publication: string;
  evidenceType: string;
  retrievedDate: string;
  relevance: string;
  link: string;
  patientFact: false;
}

export function evidenceHit(partial: Omit<EvidenceHit, "patientFact">): EvidenceHit {
  return { ...partial, patientFact: false };
}

export type HealthWord = "LIVE" | "DEGRADED" | "OFFLINE" | "STARTING" | "ERROR";

export function healthWord(level: "live" | "degraded" | "offline" | undefined, pending = false, failed = false): HealthWord {
  if (pending) return "STARTING";
  if (failed) return "ERROR";
  if (level === "live") return "LIVE";
  if (level === "degraded") return "DEGRADED";
  return "OFFLINE";
}
