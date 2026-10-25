/**
 * ASTRA SAARATHI — Local Intent Brain.
 * ====================================
 * Deterministic, dependency-free, ZERO-NETWORK intent classification that runs
 * BEFORE any model call.
 *
 * WHY IT EXISTS (repair prompt §E)
 * --------------------------------
 * "Who are you?" reached an external model and failed whenever that model was
 * rate-limited, empty or offline — so the single most basic question about the
 * assistant could not be answered. Identity, help, stop, dashboard and status
 * questions are SYSTEM facts, not knowledge: Saarathi knows them locally.
 *
 * GUARANTEE: every reply returned here must be producible with every LLM, every
 * cloud provider and the entire network switched off.
 */

import type { AstraDashboard, AstraLanguage } from "@/astra/voice/roundTrip/contracts";

export type LocalIntentId =
  | "WHO_ARE_YOU"
  | "YOUR_NAME"
  | "WHAT_CAN_YOU_DO"
  | "HELP"
  | "STOP"
  | "CANCEL"
  | "PAUSE"
  | "RESUME"
  | "CURRENT_DASHBOARD"
  | "VOICE_STATUS"
  | "SYSTEM_STATUS"
  | "GREETING"
  | "THANKS"
  | "OPEN_BED"
  | "SELECT_PATIENT"
  | "OPEN_DASHBOARD"
  | "OUT_OF_SCOPE";

export interface LocalIntentEntities {
  /** Bed label as spoken, e.g. "2" / "BED-02". */
  bed?: string;
  /** Target dashboard id when navigating. */
  dashboard?: string;
  /** Raw patient/bed phrase the clinician pointed at. */
  reference?: string;
}

export interface LocalIntentMatch {
  intent: LocalIntentId;
  confidence: number;
  entities: LocalIntentEntities;
  /** Deterministic answer — ready to speak and to display. */
  reply: string;
  /**
   * true when the workspace policy refused an unrelated request. Callers can use
   * this to skip the model call entirely (a reception terminal must not answer
   * general-knowledge questions).
   */
  scopeRestricted?: boolean;
}

export interface LocalIntentContext {
  workspace: AstraDashboard;
  role: string;
  language: AstraLanguage;
  /** Human label of the current screen, e.g. "Doctor Command Centre". */
  dashboardLabel?: string;
  /** One-line TRUE voice-provider summary, e.g. "Voicebox ready; speech is local". */
  voiceSummary?: string;
  /** One-line TRUE system summary, e.g. "5 of 5 providers ready". */
  systemSummary?: string;
  /** Display name of the signed-in clinician, when known. */
  userName?: string;
}

/**
 * The canonical Dr Mayin identity answer.
 * Saarathi, Sanjeevani, and Jarvis are operational facets of Dr Mayin —
 * this is the single answer for all identity questions.
 * Do not paraphrase it into something vague.
 */
export function mayinIdentity(language: AstraLanguage, opts: { userName?: string } = {}): string {
  const address = opts.userName?.trim() ? `, ${opts.userName.trim()}` : "";
  switch (language) {
    case "te":
      return `నేను డాక్టర్ మయిన౏${address} — ASTRA AI హాస్పిటల్ OS యొక్క ఏకీకృత AI ఓర్కెస్ట్రేటర్. శారథి, సంజీవని మరియు జార్విస్ నా సామర్థ్యాల పేర్లు. క్లినికల్ రీజనింగ్, రోగులు, ఆసుపత్రి కార్యకలాపాలు మరియు అధికారం ఉన్న ఆదేశాలలో మీకు సహాయం చేస్తాను. మీరు ఏమి చూడాలనుకుంటున్నారు?`;
    case "hi":
      return `मैं डॉक्टर मयिन${address} हूँ — ASTRA AI हॉस्पिटल OS के एकीकृत AI ऑर्केस्ट्रेटर। सारथी, संजीवनी और जार्विस मेरी क्षमताओं के नाम हैं। मैं क्लिनिकल रीज़निंग, मरीज़ों, अस्पताल संचालन और अधिकृत निर्देशों में सहायता करता हूँ। आप क्या देखना चाहेंगे?`;
    case "tenglish":
      return `Nenu Dr. Mayin${address} — ASTRA AI Hospital OS unified AI orchestrator. Saarathi, Sanjeevani, Jarvis anni na capabilities. Clinical reasoning, patients, hospital operations, authorized commands — anni lo help chestanu. Em chudali?`;
    case "hinglish":
      return `Main Dr. Mayin hoon${address} — ASTRA AI Hospital OS ka unified AI orchestrator. Saarathi, Sanjeevani aur Jarvis mere capabilities ke naam hain. Clinical reasoning, patients, hospital operations aur authorized commands mein help karunga. Kya dekhna hai?`;
    default:
      return `I'm Dr. Mayin${address}, the unified AI orchestrator of ASTRA Hospital OS. Saarathi, Sanjeevani, and Jarvis are operational names for my capabilities — not separate agents. I assist with clinical reasoning, patients, hospital operations and authorized commands across every dashboard. What would you like me to review?`;
  }
}

/** @deprecated Use mayinIdentity() instead. Kept for backward compatibility. */
export const saarathiIdentity = mayinIdentity;

/**
 * Deterministic answer tables. Telugu, Hindi and English are written out; the
 * transliterated forms (Tenglish/Hinglish) reuse wording Indian staff already use.
 */
function helpReply(language: AstraLanguage, dashboardLabel?: string): string {
  const where = dashboardLabel ? ` on ${dashboardLabel}` : "";
  switch (language) {
    case "te":
      return "మీకు ఇలా సహాయం చేయగలను: రోగి సందర్భం చూడటం, క్లినికల్ రీజనింగ్, ఆర్డర్లు, ల్యాబ్ ఫలితాలు, డాష్‌బోర్డ్ నేవిగేషన్. మీరు ఏమి చెప్పాలనుకుంటున్నారు?";
    case "hi":
      return "मैं ये कर सकती हूँ: रोगी संदर्भ देखना, क्लिनिकल रीज़निंग, ऑर्डर, लैब रिपोर्ट, डैशबोर्ड नेविगेशन। आप क्या बोलना चाहेंगे?";
    default:
      return `Here is what I can do${where}: open a bed or patient, review vitals and labs, run clinical reasoning through Astra, place an authorised order through the approval pipeline, or open any permitted dashboard. What would you like me to review?`;
  }
}

function stopReply(language: AstraLanguage): string {
  switch (language) {
    case "te": return "ఆపేశాను. వింటున్నాను.";
    case "hi": return "रोक दिया। मैं सुन रहा हूँ।";
    default: return "Stopped. I am listening.";
  }
}

function cancelReply(language: AstraLanguage): string {
  switch (language) {
    case "te": return "రద్దు చేశాను. ఏదీ మార్చలేదు.";
    case "hi": return "రద్దు చేశాను. ఏదీ మార్చలేదు.";
    default: return "Cancelled. Nothing was changed.";
  }
}

function pauseReply(language: AstraLanguage): string {
  switch (language) {
    case "te": return "పాజ్ చేసాను. కొనసాగించడానికి మళ్లీ చెప్పండి.";
    case "hi": return "रोक रखा। जारी रखने के लिए कहें।";
    default: return "Paused. Say resume when you are ready to continue.";
  }
}

function resumeReply(language: AstraLanguage): string {
  switch (language) {
    case "te": return "కొనసాగిస్తున్నాను.";
    case "hi": return "जारी रख रहा हूँ।";
    default: return "Resuming.";
  }
}

function dashboardReply(language: AstraLanguage, dashboardLabel?: string, workspace?: string): string {
  const label = dashboardLabel ?? workspace ?? "the current dashboard";
  switch (language) {
    case "te": return `ప్రస్తుతం మీరు ${label} లో ఉన్నారు.`;
    case "hi": return `इस समय आप ${label} पर हैं।`;
    default: return `You are currently on ${label}.`;
  }
}

function voiceStatusReply(language: AstraLanguage, summary?: string): string {
  const detail = summary?.trim() || "voice status is still being checked";
  switch (language) {
    case "te": return `వాయిస్ స్థితి: ${detail}`;
    case "hi": return `वॉयस स्थिति: ${detail}`;
    default: return `Voice status: ${detail}`;
  }
}

function systemStatusReply(language: AstraLanguage, summary?: string): string {
  const detail = summary?.trim() || "system status is still being checked";
  switch (language) {
    case "te": return `సిస్టమ్ స్థితి: ${detail}`;
    case "hi": return `सिस्टम स्थिति: ${detail}`;
    default: return `System status: ${detail}`;
  }
}

/** Restricted-terminal refusal — word-for-word as specified in the design. */
export function outOfScopeReply(workspace: AstraDashboard, dashboardLabel?: string): string {
  const label = dashboardLabel ?? workspace;
  if (workspace === "reception") {
    return "This terminal is restricted to Reception functions. I can help with OP registration, appointments, patient queue, admissions and reception announcements.";
  }
  return `This terminal is restricted to ${label} functions. I can help with the ${label} workflow and its authorised tasks.`;
}

/** General-knowledge patterns a department terminal must refuse. */
const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\b(weather|forecast|rain today|news|headlines|cricket|match score|ipl|movie|film|actor|song)\b/i,
  /\b(who (?:is|was) (?:the )?(?:pm|prime minister|president))\b/i,
  /\b(capital of|currency of|population of)\b/i,
  /\b(tell me a joke|sing|dance|story|poem|shayari)\b/i,
];

const IDENTITY = /\b(who are you|tell me about yourself|introduce yourself|nuvve evaru|meeru evaru|evaru nuvvu|who r u|whats your name|what is your name|nee peru|mee peru|tum kaun ho|aap kaun ho)\b/i;
const WHAT_CAN_YOU_DO = /\b(what can you do|what do you do|em cheyyav|em chestav|tum kya kar sakte ho)\b/i;
const HELP = /^\s*(help|help me|sahayam|sahayatha|madad|kya kar sakta ho)\b/i;
const GREETING = /^\s*(hi|hello|hey|hai|hii|heyy|yo|good (?:morning|afternoon|evening)|namaste|namaskaram|namaskar)\b/i;
const THANKS = /\b(thank you|thanks|thankyou|dhanyavadalu|dhanyavad|shukriya)\b/i;
const STOP = /\b(stop|quiet|silence|stop speaking|aapu|aapandi|chup|ruko|roko|band karo|chup raho)\b/i;
const CANCEL = /\b(cancel|raddu cheyyi|cancel cheyyi|khatam kar do|cancel karo)\b/i;
const PAUSE = /\b(pause|wait|aagu|aagandi|one second|one minute|ruko)\b/i;
const RESUME = /\b(resume|continue|continue cheyyi|jaari rakho|aage badho|start again)\b/i;
const CURRENT_DASHBOARD = /\b(which (?:dashboard|screen|page) (?:am i|are we)|where am i|current dashboard|this dashboard|ee dashboard|ye dashboard)\b/i;
const VOICE_STATUS = /\b(voice status|tts status|speech status|who is speaking|are you using voicebox|voice provider)\b/i;
const SYSTEM_STATUS = /\b(system status|provider status|health status|brain status|are you online|services status|system health)\b/i;
const OPEN_BED = /\b(?:bed\s*(?:no\.?|number|#)?\s*(\d{1,3})|బెడ్?\s*(\d{1,3})|बेड?\s*(\d{1,3}))\b/i;
const SELECT_PATIENT = /\b(this patient|ee patient|ye patient|current patient|selected patient|about this patient|tell me about (?:this|the) patient)\b/i;

/** The nine department dashboards, with the aliases staff actually say. */
const DASHBOARD_ALIASES: Array<{ id: AstraDashboard; label: string; re: RegExp }> = [
  { id: "reception", label: "Reception", re: /\b(reception|front desk|registration)\b|రిసెప్షన్|रिसेप्शन/i },
  { id: "pharmacy", label: "Pharmacy", re: /\b(pharmacy|dispensary|medicine desk)\b|ఫార్మసీ|फार्मेसी/i },
  { id: "lab", label: "Laboratory", re: /\b(lab(?:oratory)?|pathology)\b|ల్యాబ్|लैब/i },
  { id: "radiology", label: "Radiology", re: /\b(radiology|x-?ray|imaging|usg)\b|రేడియాలజీ|रेडियोलॉजी/i },
  { id: "billing", label: "Billing", re: /\b(billing|accounts|cash desk|finance)\b|బిల్లింగ్|बिलिंग/i },
  { id: "ward", label: "Ward", re: /\b(ward|icu|inpatient|nursing)\b|వార్డ్|वार्ड/i },
  { id: "ot", label: "OT", re: /\b(ot|theatre|operation theatre)\b|ఆపరేషన్|ओटी/i },
  { id: "doctor", label: "Doctor Command Centre", re: /\b(doctor|emr|clinical command|command os)\b|డాక్టర్|डॉक्टर/i },
  { id: "general", label: "Astra General", re: /\b(home|hospital overview)\b/i },
];

/**
 * Classify a turn against the LOCAL intent table.
 * Returns `null` when nothing deterministic matches — the caller then hands the
 * turn to the Astra brain router.
 */
export function classifyLocalIntent(text: string, ctx: LocalIntentContext): LocalIntentMatch | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const lang = ctx.language;
  const make = (
    intent: LocalIntentId,
    reply: string,
    confidence: number,
    entities: LocalIntentEntities = {},
    scopeRestricted = false
  ): LocalIntentMatch => ({ intent, confidence, entities, reply, scopeRestricted });

  // ---- scope gate: a department terminal must refuse unrelated requests ----
  const doctorScope = ctx.workspace === "doctor" || ctx.workspace === "general";
  const identityish = IDENTITY.test(raw) || WHAT_CAN_YOU_DO.test(raw) || GREETING.test(raw) || THANKS.test(raw);
  if (!doctorScope && OUT_OF_SCOPE_PATTERNS.some((re) => re.test(raw)) && !identityish) {
    return make("OUT_OF_SCOPE", outOfScopeReply(ctx.workspace, ctx.dashboardLabel), 0.9, {}, true);
  }

  if (IDENTITY.test(raw)) return make("WHO_ARE_YOU", saarathiIdentity(lang, { userName: ctx.userName }), 0.98);
  if (WHAT_CAN_YOU_DO.test(raw) || HELP.test(raw)) {
    return make("WHAT_CAN_YOU_DO", helpReply(lang, ctx.dashboardLabel), 0.94);
  }
  if (STOP.test(raw)) return make("STOP", stopReply(lang), 0.97);
  if (CANCEL.test(raw)) return make("CANCEL", cancelReply(lang), 0.95);
  if (PAUSE.test(raw)) return make("PAUSE", pauseReply(lang), 0.93);
  if (RESUME.test(raw)) return make("RESUME", resumeReply(lang), 0.93);
  if (VOICE_STATUS.test(raw)) return make("VOICE_STATUS", voiceStatusReply(lang, ctx.voiceSummary), 0.92);
  if (SYSTEM_STATUS.test(raw)) return make("SYSTEM_STATUS", systemStatusReply(lang, ctx.systemSummary), 0.92);
  if (CURRENT_DASHBOARD.test(raw)) {
    return make("CURRENT_DASHBOARD", dashboardReply(lang, ctx.dashboardLabel, ctx.workspace), 0.95);
  }

  const bedMatch = OPEN_BED.exec(raw);
  if (bedMatch) {
    const bed = bedMatch[1] ?? bedMatch[2] ?? bedMatch[3];
    return make("OPEN_BED", `Opening bed ${bed}. Resolving the active patient through Astra.`, 0.9, { bed, reference: raw });
  }

  if (SELECT_PATIENT.test(raw)) {
    return make("SELECT_PATIENT", "Using the patient you are pointing at. Resolving the context through Astra.", 0.88, { reference: raw });
  }

  const isNavigate = /\b(open|show|go to|take me|switch to|navigate|kholo|kholiye|dikhao)\b|చూపించు|తెరువు|दिखाओ|खोलो/i.test(raw);
  if (isNavigate) {
    const hit = DASHBOARD_ALIASES.find((d) => d.re.test(raw));
    if (hit) return make("OPEN_DASHBOARD", `Opening ${hit.label}.`, 0.9, { dashboard: hit.id });
  }

  if (GREETING.test(raw)) {
    const name = ctx.userName?.trim();
    return make(
      "GREETING",
      lang === "te"
        ? `నమస్కారం${name ? ` ${name}` : ""}. ఏం చేయాలి?`
        : lang === "hi"
          ? `नमस्ते${name ? ` ${name}` : ""}। क्या करूँ?`
          : `Hello${name ? ` ${name}` : ""}. What can I do for you?`,
      0.85
    );
  }
  if (THANKS.test(raw)) {
    return make("THANKS", lang === "te" ? "సంతోషం." : lang === "hi" ? "संतोष की बात है।" : "Happy to help.", 0.9);
  }

  return null;
}

/** True when Saarathi should answer this turn entirely locally (no model call). */
export function isLocallyAnswerable(text: string, ctx: LocalIntentContext): boolean {
  return classifyLocalIntent(text, ctx) !== null;
}