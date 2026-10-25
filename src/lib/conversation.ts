// Session conversation memory — ONE context shared by text and voice.
//
// Follow-up questions ("open that patient", "send it now", "continue") resolve
// against the previous exchange instead of being treated as brand-new input.
// Telugu command phrases are normalised to their English equivalents so the
// offline command engine understands mixed-language asks, e.g.
//   "ఈ patient కి CBC order చేయండి" → "send CBC for this patient"

export interface ConversationContext {
  patientUhid?: string;
  patientName?: string;
  department?: string;
  lastTopic?: string;
  lastIntent?: string;
  /** last order/test referenced in conversation (e.g. "CBC") */
  lastOrder?: string;
  /** last order department (lab/radiology/pharmacy/ward) */
  lastOrderDept?: string;
  /** last command key executed */
  lastCommandKey?: string;
}

const SESSION_KEY = "Astra.session.ctx";

export function loadConversation(): ConversationContext {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ConversationContext) : {};
  } catch {
    return {};
  }
}

export function saveConversation(ctx: ConversationContext): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(ctx));
  } catch {
    /* private mode — in-memory only */
  }
}

export function clearConversation(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

const PROMPT_KEY = "Astra.pendingPrompt";

/** Queue a prompt for the AI Command chat (consumed on next mount). */
export function queuePrompt(text: string): void {
  try {
    localStorage.setItem(PROMPT_KEY, text);
  } catch {
    /* noop */
  }
}

/** Take (and clear) the queued prompt, if any. */
export function takePrompt(): string | null {
  try {
    const v = localStorage.getItem(PROMPT_KEY);
    if (v) localStorage.removeItem(PROMPT_KEY);
    return v;
  } catch {
    return null;
  }
}

/* ---------------- Telugu → English normalisation for the command engine ---------------- */

const TE_TABLE: Array<[RegExp, string]> = [
  [/ఈ\s+/g, "this "],
  [/ఈయన/g, "this patient"],
  [/కోసం|కొరకు/g, "for"],
  [/నమోదు/g, "register"],
  [/రోగిని|రోగి/g, "patient"],
  [/డిశ్చార్జ్\s*/gi, "discharge "],
  [/బిల్లు|బిల్/g, "bill"],
  [/ల్యాబ్|లాబ్|లాబోరేటరీ/g, "lab"],
  [/ఫార్మసీ|మందుల/g, "pharmacy"],
  [/ఈరోజు|నేడు/g, "today"],
  [/షెడ్యూల్/g, "schedule"],
  [/క్యూ/g, "queue"],
  [/ఎంతమంది/g, "how many"],
  [/ఎన్ని/g, "how many"],
  [/ఉందా|ఉన్నా/g, ""],
  [/పంపండి|పంపు|చేయండి|చేయి|చెయ్యి/g, ""],
  [/\s{2,}/g, " "],
];

/**
 * Rewrite a mixed-language utterance into an English command-engine query.
 * Non-Telugu text is returned untouched.
 */
export function normaliseForEngine(text: string): string {
  let out = text;
  for (const [re, rep] of TE_TABLE) out = out.replace(re, rep);
  out = out.trim();
  return out;
}

/* ---------------- follow-up resolution ---------------- */

export interface FollowUpResult {
  /** text to route (already normalised) */
  text: string;
  /** true when the text was rewritten for the command engine */
  asCommand?: boolean;
  note?: string;
}

export const CONFIRM_WORDS = /^(yes|yeah|yep|proceed|go ahead|send it|do it|confirm|ok|okay|done|అవును)\b.*$/i;

/**
 * Work out what a new utterance means given session memory.
 * "continue/stop" are handled by the voice layer, not here.
 */
export function resolveFollowUp(raw: string, ctx: ConversationContext): FollowUpResult {
  const q = raw.trim().toLowerCase();
  if (!q) return { text: raw };

  if (CONFIRM_WORDS.test(q) && ctx.lastIntent) {
    return { text: "confirm", asCommand: true, note: "Confirming the pending action." };
  }

  // Contextual patient reference: "his", "her", "that patient", "this patient"
  if (ctx.patientUhid || ctx.patientName) {
    const uhid = ctx.patientUhid ? ` UHID ${ctx.patientUhid}` : "";
    const patientRef = ctx.patientName ?? "patient";

    // "show his previous CBC" / "show his reports" / "open his reports"
    if (/(show|open|view|get|display|see)\s+(his|her|their|that|this)\s+(previous|old|past|last|recent|latest)?\s*(cbc|lft|rft|reports?|labs?|results?|investigations?|orders?|medications?|notes?|x-?rays?|usg|ct|mri|ecg|echo|tests?)/.test(q)) {
      const test = q.match(/(cbc|lft|rft|reports?|labs?|results?|investigations?|orders?|medications?|notes?|x-?rays?|usg|ct|mri|ecg|echo|tests?)/)?.[1] ?? "reports";
      return {
        text: `what changed for ${patientRef}${uhid} since yesterday`,
        asCommand: true,
        note: `Context: ${patientRef}${uhid} · ${test}`,
      };
    }

    // "what's abnormal" / "what's abnormal about him"
    if (/(what'?s|what is)\s+(abnormal|wrong|concerning|unusual)/.test(q)) {
      return {
        text: `safety review for ${patientRef}${uhid}`,
        asCommand: true,
        note: `Context: ${patientRef}${uhid} · safety review`,
      };
    }

    // "repeat CBC" / "repeat CBC and platelet count" — uses patient context
    if (/repeat\s+(cbc|platelet|lft|rft|blood|test|investigation|scan|x-?ray|usg|ct|mri)/.test(q)) {
      const test = q.match(/repeat\s+(cbc|platelet|lft|rft|blood|test|investigation|scan|x-?ray|usg|ct|mri)/)?.[1] ?? "CBC";
      return {
        text: `order ${test} for ${patientRef}${uhid}`,
        asCommand: true,
        note: `Context: ${patientRef}${uhid} · repeat ${test}`,
      };
    }

    // "send it to lab" / "send it to pharmacy" — uses last order context
    if (/send\s+(it|this|that)\s+to\s+(the\s+)?(lab|laboratory|pharmacy|radiology|ward)/.test(q)) {
      const dept = q.match(/send\s+(it|this|that)\s+to\s+(the\s+)?(lab|laboratory|pharmacy|radiology|ward)/)?.[3] ?? "lab";
      const order = ctx.lastOrder ?? "investigation";
      const deptMap: Record<string, string> = {
        lab: "lab", laboratory: "lab", pharmacy: "pharmacy", radiology: "radiology", ward: "ward",
      };
      return {
        text: `order ${order} for ${patientRef}${uhid}`,
        asCommand: true,
        note: `Context: ${patientRef}${uhid} · send ${order} to ${deptMap[dept] ?? "lab"}`,
      };
    }

    // "order CBC for him" / "order chest X-ray for him"
    if (/order\s+(a\s+|an\s+|the\s+)?(cbc|lft|rft|platelet|blood|urine|esr|crp|x-?ray|usg|ultrasound|ct|mri|ecg|echo|troponin|d-dimer|electrolyte|lipid|thyroid|hba1c|sugar|amylase|lipase|bilirubin|sgpt|sgot|creatinine|urea|sodium|potassium|blood culture|dengue|malaria|widal|pt\/inr|aptt|blood group|cross match|nursing instruction|monitor vitals|observe)\s+(for|on)\s+(him|her|them|this patient|that patient|this|that)/.test(q)) {
      const test = q.match(/order\s+(a\s+|an\s+|the\s+)?(cbc|lft|rft|platelet|blood|urine|esr|crp|x-?ray|usg|ultrasound|ct|mri|ecg|echo|troponin|d-dimer|electrolyte|lipid|thyroid|hba1c|sugar|amylase|lipase|bilirubin|sgpt|sgot|creatinine|urea|sodium|potassium|blood culture|dengue|malaria|widal|pt\/inr|aptt|blood group|cross match|nursing instruction|monitor vitals|observe)/)?.[2] ?? "CBC";
      return {
        text: `order ${test} for ${patientRef}${uhid}`,
        asCommand: true,
        note: `Context: ${patientRef}${uhid} · order ${test}`,
      };
    }

    // "open that patient" / "show him" / "view her"
    if (/(open|show|view|display|see)\s+(him|her|them|that patient|this patient|that|this)/.test(q)) {
      return {
        text: `where is ${patientRef}${uhid} journey`,
        asCommand: true,
        note: `Context: ${patientRef}${uhid}`,
      };
    }
  }

  return { text: raw };
}

/** Extra system-prompt context sentence for the LLM when session memory is hot. */
export function systemContextFor(ctx: ConversationContext): string {
  const parts: string[] = [];
  if (ctx.patientUhid) parts.push(`Conversation context — focused patient: ${ctx.patientName ?? "unnamed"} (UHID ${ctx.patientUhid}).`);
  if (ctx.department) parts.push(`Conversation context — department: ${ctx.department}.`);
  if (ctx.lastTopic) parts.push(`Conversation context — last topic discussed: ${ctx.lastTopic}.`);
  return parts.join(" ");
}

/** Pull a 4-digit UHID and/or a patient name out of free text. */
export function patientRefFromText(text: string): { uhid?: string; name?: string } {
  const t = text.trim();
  const uhid = t.match(/\b(\d{4})\b/)?.[1];
  const nameMatch = t.match(/patient (?:(?:is|name is|named|name) )?([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/);
  return { uhid, name: nameMatch?.[1] };
}

/** After a command outcome, remember what we were working on. */
export function contextFromOutcome(title: string, lines: string[]): { patientUhid?: string; department?: string; lastTopic?: string } {
  const blob = [title, ...lines].join(" · ");
  const uhid = blob.match(/\b(\d{4})\b/)?.[1];
  let department: string | undefined;
  const known = ["Laboratory", "Pharmacy", "Radiology", "OT", "Ward", "Reception", "Billing", "HR", "Nursing"];
  for (const d of known) if (new RegExp(`\\b${d}\\b`, "i").test(blob)) department = d;
  return { patientUhid: uhid, department, lastTopic: title.slice(0, 120) };
}
