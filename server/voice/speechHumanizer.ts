/**
 * ASTRA AI — DR. MAYIN SPEECH HUMANIZER (robotic → real human conversation)
 * =========================================================================
 * WHY THIS FILE EXISTS
 * --------------------
 * Dr. Mayin sounded robotic for three concrete, measured reasons:
 *
 *   1. The English voice profile defaulted to "JARVIS" — a Kokoro `bm_george`
 *      preset the runtime itself describes as "British Intelligent AI Voice
 *      (Jarvis)". A hospital clinician was being voiced by a sci-fi AI persona.
 *   2. `streamSpeech()` handed RAW clinical text to the synthesizer: markdown
 *      fences, "CBC", "SpO2", "65%", numbered order lists. Kokoro reads those
 *      literally ("see bee see", "S P O two") — the robot-reciting-a-chart
 *      effect clinicians complained about.
 *   3. Every sentence chunk was `Buffer.concat`-ed with ZERO silence between
 *      them, so delivery ran on with no breath, no beats, no turn-taking
 *      rhythm. Real speech has pauses; the old pipeline had none.
 *
 * WHAT THIS FILE DOES
 * -------------------
 * Turns command-centre output into something a human colleague would actually
 * say, then paces it like a human says it:
 *
 *   `humanizeConversation()`  → natural spoken wording (never invents facts)
 *   `toBreathGroups()`        → short breath groups + pause lengths
 *   `appendPauseToWav()`      → REAL silence inserted between chunks
 *   `pickHumanProfile()`      → a human voice, never an AI-robot persona
 *
 * SAFETY / HONESTY RULES
 * ----------------------
 * - Purely lexical: no clinical value, number, unit, dose or negation is ever
 *   added, dropped or reordered. Only pronunciation and *pacing* change.
 * - Never throws: any failure returns the input text unchanged.
 */

// ─── 1. Markup / noise removal ──────────────────────────────────────────────

/** Emoji + pictograph ranges (mirrors the client-side cleaner). */
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]|\p{Extended_Pictographic}/gu;

/**
 * Removes everything a speaker must never vocalise: code fences, tables, URLs,
 * markdown emphasis, emoji, and the "AI assistant" disclaimers that make a
 * hospital system sound like a demo.
 */
export function stripMarkup(text: string): string {
  if (!text) return "";
  let out = text;
  out = out.replace(/```[\s\S]*?```/g, " ");          // fenced code
  out = out.replace(/`([^`]*)`/g, "$1");              // inline code → content
  out = out.replace(/^\s*\|.*\|\s*$/gm, " ");         // markdown table rows
  out = out.replace(/^\s*[-:]{3,}\s*$/gm, " ");       // table rules
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"); // images
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");  // links → label
  out = out.replace(/https?:\/\/\S+/g, " ");          // raw URLs
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");        // bold
  out = out.replace(/(\*\*|__|~~|`)/g, " ");          // leftover emphasis
  out = out.replace(/^\s{0,3}#{1,6}\s*/gm, "");       // headings
  out = out.replace(/^\s*>\s?/gm, "");                // block quotes
  out = out.replace(EMOJI_RE, " ");
  // Robot-disclaimer boilerplate no clinician says out loud.
  out = out.replace(/\b(as an? (ai|artificial intelligence|language model|assistant)[^.!?]*[.!?]?)/gi, " ");
  out = out.replace(/\b(i am an? (ai|artificial intelligence|language model)[^.!?]*[.!?]?)/gi, " ");
  out = out.replace(/[ \t]{2,}/g, " ");
  return out.trim();
}

// ─── 2. Pronunciation: abbreviations ────────────────────────────────────────

/**
 * How clinical shorthand must be SPOKEN. Only the pronunciation changes —
 * the meaning is preserved exactly.
 */
export const SPOKEN_ABBREVIATIONS: Record<string, string> = {
  // Labs
  CBC: "complete blood count",
  CRP: "C reactive protein",
  ESR: "erythrocyte sedimentation rate",
  WBC: "white blood cell count",
  RBC: "red blood cell count",
  HbA1c: "hemoglobin A one C",
  Hb: "hemoglobin",
  BUN: "B U N",
  ABG: "arterial blood gas",
  "D-dimer": "D dimer",
  SpO2: "oxygen saturation",
  PaO2: "arterial oxygen",
  FiO2: "fraction of inspired oxygen",
  RBS: "random blood sugar",
  FBS: "fasting blood sugar",
  TLC: "total leukocyte count",
  // Vitals
  BP: "blood pressure",
  HR: "heart rate",
  RR: "respiratory rate",
  Temp: "temperature",
  ECG: "E C G",
  EKG: "E K G",
  USG: "ultrasound",
  // Care settings
  ICU: "I C U",
  NICU: "N I C U",
  PICU: "P I C U",
  CCU: "C C U",
  ER: "emergency room",
  OT: "operation theatre",
  OPD: "outpatient department",
  IPD: "inpatient department",
  HDU: "high dependency unit",
  // Orders & dosing
  STAT: "immediately",
  PRN: "as needed",
  QID: "four times a day",
  TDS: "three times a day",
  TID: "three times a day",
  BD: "twice a day",
  BID: "twice a day",
  OD: "once a day",
  QD: "once a day",
  QOD: "every other day",
  NPO: "nothing by mouth",
  IV: "intravenous",
  IM: "intramuscular",
  SC: "subcutaneous",
  // Command-centre jargon
  UHID: "U H I D",
  MRN: "M R N",
  "R/O": "rule out",
  "H/O": "history of",
  "c/o": "complaining of",
  Dx: "diagnosis",
  Rx: "prescription",
  Tx: "treatment",
  Hx: "history",
  Pt: "patient",
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Expands abbreviations token-by-token so no substring is ever rewritten
 * inside a longer word (e.g. "ct" inside "contact").
 */
export function expandClinicalAbbreviations(text: string): string {
  let out = text;
  for (const [abbr, spoken] of Object.entries(SPOKEN_ABBREVIATIONS)) {
    const re = new RegExp(`(?<![\\w-])${escapeRegex(abbr)}(?![\\w-])`, "g");
    out = out.replace(re, spoken);
  }
  return out;
}


// ─── 3. Pronunciation: numbers & units ──────────────────────────────────────

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Units that must stay in their spoken clinical form. */
const SPOKEN_UNITS: Record<string, string> = {
  "g/dl": "grams per deciliter",
  "gm/dl": "grams per deciliter",
  "mg/dl": "milligrams per deciliter",
  "mmol/l": "millimoles per litre",
  "meq/l": "milliequivalents per litre",
  mmhg: "millimetres of mercury",
  "ml/min": "millilitres per minute",
  "ng/ml": "nanograms per millilitre",
  "pg/ml": "picograms per millilitre",
  "ug/ml": "micrograms per millilitre",
  "mcg/ml": "micrograms per millilitre",
  mcg: "micrograms",
  kg: "kilograms",
  mg: "milligrams",
  ml: "millilitres",
  iu: "international units",
  bpm: "beats per minute",
  mm: "millimetres",
  cm: "centimetres",
};

function smallIntToWords(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

/**
 * Spoken form of a number. Decimals are read digit-by-digit after "point"
 * ("12.5" → "twelve point five") because that is how clinicians say vitals.
 */
export function numberToWords(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  const intPart = Math.floor(abs);
  const str = String(abs);
  const dot = str.indexOf(".");
  const decStr = dot >= 0 ? str.slice(dot + 1) : "";
  const intWords = intPart <= 99
    ? smallIntToWords(intPart)
    : String(intPart).split("").map((d) => ONES[Number(d)]).join(" ");
  const sign = n < 0 ? "minus " : "";
  if (!decStr) return `${sign}${intWords}`;
  const decWords = decStr.split("").map((d) => ONES[Number(d)]).join(" ");
  return `${sign}${intWords} point ${decWords}`;
}

/**
 * Reads numbers the way a person says them, never the way a screen shows them.
 * Conservative by design: years, big identifiers and times are left untouched
 * so nothing clinically meaningful is distorted.
 */
export function normalizeSpokenNumbers(text: string): string {
  let out = text;
  // Percentage: "65%" → "sixty five percent"
  out = out.replace(/(?<![\w.])(\d{1,3}(?:\.\d+)?)\s?(?:%|percent)(?![\w])/gi,
    (_m, num: string) => `${numberToWords(parseFloat(num))} percent`);
  // Value + unit: "12.5 mg/dL", "Troponin 0.02 ng/mL" (labs use nano/micro units).
  out = out.replace(/(?<![\w.])(\d+(?:\.\d+)?)\s*(ng\/ml|pg\/ml|ug\/ml|mcg\/ml|g\/dl|gm\/dl|mg\/dl|mmol\/l|meq\/l|mmhg|ml\/min|mcg|kg|mg|ml|mm|cm|iu|bpm)(?![\w])/gi,
    (_m, num: string, unit: string) =>
      `${numberToWords(parseFloat(num))} ${SPOKEN_UNITS[unit.toLowerCase()] ?? unit}`,
  );
  // Standalone decimals without a unit: "Troponin 0.02" still spoken aloud.
  out = out.replace(/(?<![\w.\-\/])(\d+\.\d+)(?![\w])/g, (dec: string) =>
    numberToWords(parseFloat(dec)),
  );
  // Standalone integers — skip years and hyphen/slash-grouped identifiers
  // (UHID-2026-8801) so bed/patient IDs are never distorted.
  out = out.replace(/(?<![\d.,:\-\/])(\d{1,4})(?![\d.,:\-\/])/g, (m, numStr: string) => {
    const n = parseInt(numStr, 10);
    if (n >= 1900 && n <= 2100) return m; // likely a year
    return numberToWords(n);
  });
  return out;
}


// ─── 4. Conversational phrasing ─────────────────────────────────────────────

/**
 * Rewrites report-speak into colleague-speak. These are wording changes only —
 * urgency, values and instructions keep their exact meaning.
 */
const PHRASE_SOFTENING: Array<[RegExp, string]> = [
  [/\bThe patient presents with\b/gi, "The patient has come in with"],
  [/\bpresents with\b/gi, "has come in with"],
  [/\bPatient is advised\b/gi, "I would advise"],
  [/\bis advised to\b/gi, "you should"],
  [/\bAdminister\b/gi, "Give"],
  [/\bCommence\b/gi, "Start"],
  [/\bInitiate\b/gi, "Begin"],
  [/\bDiscontinue\b/gi, "Stop"],
  [/\bMonitor\b/gi, "keep an eye on"],
  [/\bAssess\b/gi, "Check"],
  [/\bElevated\b/gi, "higher than normal"],
  [/\bWithin normal limits\b/gi, "in the normal range"],
  [/\bUnremarkable\b/gi, "showing nothing unusual"],
  [/\bNegative for\b/gi, "shows no signs of"],
  [/\bPositive for\b/gi, "confirms"],
  [/\bStatus post\b/gi, "recovering from"],
  [/\bIn view of\b/gi, "Because of"],
  [/\bPrior to\b/gi, "Before"],
  [/\bSubsequently\b/gi, "Then"],
  [/\bTherefore\b/gi, "So"],
  [/\bAdditionally\b/gi, "Also"],
  [/\bUtilise\b/gi, "Use"],
  [/\bPerform\b/gi, "Do"],
  [/\bObtain\b/gi, "Get"],
];

export function softenClinicalPhrasing(text: string): string {
  let out = text;
  for (const [re, replacement] of PHRASE_SOFTENING) out = out.replace(re, replacement);
  return out;
}


// ─── 5. Bullet / numbered lists → spoken enumeration ────────────────────────

const ORDINAL_CONNECTIVES = ["First", "Then", "After that", "Next", "Also", "Finally"];
const LIST_MARKER_RE = /^\s*(?:[-*•‣▪]|\(?\d{1,2}[.)]|[a-z][.)])\s+/i;

function stripListMarker(line: string): string {
  return line.replace(LIST_MARKER_RE, "").trim();
}

/**
 * A screen renders "1. … 2. … 3. …" as a tidy list. A speaker renders it as
 * "First … then … finally …". This converts stacked list lines into that
 * spoken flow and removes the bare numbering a machine would read out.
 */
export function speakListsAsFlow(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let run: string[] = [];

  const flush = () => {
    if (run.length === 0) return;
    if (run.length === 1) {
      out.push(`Also, ${run[0].charAt(0).toLowerCase()}${run[0].slice(1)}`);
    } else {
      run.forEach((item, i) => {
        const isLast = i === run.length - 1;
        const connective = isLast
          ? ORDINAL_CONNECTIVES[ORDINAL_CONNECTIVES.length - 1]
          : ORDINAL_CONNECTIVES[i] ?? "Then";
        out.push(`${connective}, ${item.charAt(0).toLowerCase()}${item.slice(1)}`);
      });
    }
    run = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (LIST_MARKER_RE.test(line)) {
      run.push(stripListMarker(line));
      continue;
    }
    flush();
    out.push(line);
  }
  flush();

  return out.join(". ").replace(/\.\s*\./g, ".").replace(/\.\s*([.!?])/g, "$1");
}

// ─── 6. Full conversational pipeline ────────────────────────────────────────

export interface HumanizeConversationOptions {
  /** Warm greeting-style opener for the FIRST turn of a session. */
  opener?: string;
  /** Short conversational acknowledgement placed before the answer. */
  acknowledgement?: string;
  /** Upper bound on spoken characters (protects latency). 0 = unlimited. */
  maxChars?: number;
}

/**
 * The complete "sound like a human" transform.
 * Order matters: clean → speak lists → pronounce → soften → pace hints.
 */
export function humanizeConversation(
  rawText: string,
  options: HumanizeConversationOptions = {},
): string {
  if (!rawText || typeof rawText !== "string") return "";
  try {
    let out = stripMarkup(rawText);
    out = speakListsAsFlow(out);
    out = expandClinicalAbbreviations(out);
    out = normalizeSpokenNumbers(out);
    out = softenClinicalPhrasing(out);
    // Collapse newlines into sentence boundaries so the pacer can see them.
    out = out.replace(/\s*\n+\s*/g, ". ");
    // Slash / dash clusters become comma beats, not robot stutter.
    out = out.replace(/\s*[-–—/]\s*/g, ", ");
    out = out.replace(/([,.;:])\1+/g, "$1");
    out = out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();

    if (options.acknowledgement) out = `${options.acknowledgement.trim()} ${out}`.trim();
    if (options.opener) out = `${options.opener.trim()} ${out}`.trim();

    const limit = options.maxChars ?? 0;
    if (limit > 0 && out.length > limit) {
      const cut = out.slice(0, limit);
      const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
      out = lastStop > limit * 0.5 ? cut.slice(0, lastStop + 1) : `${cut.trim()}…`;
    }
    return out;
  } catch {
    // Degrade safely: never break voice because of a humanizer edge case.
    return rawText;
  }
}


// ─── 7. Breath groups (human pacing) ────────────────────────────────────────

/**
 * One spoken breath group. `pauseAfterMs` is the silence that must FOLLOW it —
 * this is what turns "reading a chart" into "talking to a colleague".
 */
export interface BreathGroup {
  text: string;
  pauseAfterMs: number;
}

export interface BreathGroupOptions {
  /** Soft ceiling on characters per breath group (default 170). */
  maxChars?: number;
  /** Base multiplier for every pause — raise for a calmer, warmer delivery. */
  paceMultiplier?: number;
}

/** Pause lengths in ms — derived from real conversational rhythm. */
const PAUSE_MS = {
  comma: 130,
  clause: 190,
  sentence: 260,
  question: 380,
  critical: 340,
  paragraph: 460,
} as const;

const CRITICAL_RE = /\b(critical|urgent|emergency|immediately|stat|severe|warning|alert|deteriorat)/i;

function pauseForStop(stop: string, sentence: string): number {
  if (stop === "?") return PAUSE_MS.question;
  if (stop === "!") return PAUSE_MS.critical;
  if (stop === ";") return PAUSE_MS.clause;
  if (stop === ",") return PAUSE_MS.comma;
  return CRITICAL_RE.test(sentence) ? PAUSE_MS.critical : PAUSE_MS.sentence;
}

/**
 * Splits humanized text into short, speakable breath groups with a pause hint
 * after each one. Long sentences are broken at the nearest natural clause
 * boundary (comma, "and", "but", "so") so no single utterance runs away.
 */
export function toBreathGroups(text: string, options: BreathGroupOptions = {}): BreathGroup[] {
  if (!text || !text.trim()) return [];
  const maxChars = Math.max(60, options.maxChars ?? 170);
  const pace = options.paceMultiplier ?? 1;

  // Split into sentence-ish units first (keeps danda for Indic text).
  const sentences = text
    .split(/(?<=[.!?।॥…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const groups: BreathGroup[] = [];

  for (const sentence of sentences) {
    const chunks: string[] = [];
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
    } else {
      // Break at commas / clause words, never mid-phrase.
      let remaining = sentence;
      while (remaining.length > maxChars) {
        const window = remaining.slice(0, maxChars);
        const cut = Math.max(
          window.lastIndexOf(", "),
          window.lastIndexOf("; "),
          window.lastIndexOf(" and "),
          window.lastIndexOf(" but "),
          window.lastIndexOf(" so "),
          window.lastIndexOf(" because "),
          window.lastIndexOf(" "),
        );

        const at = cut > maxChars * 0.45 ? cut : maxChars;
        chunks.push(remaining.slice(0, at).trim());
        remaining = remaining.slice(at).trim();
      }
      if (remaining) chunks.push(remaining);
    }

    chunks.forEach((chunk, i) => {
      const isLastOfSentence = i === chunks.length - 1;
      const stop = isLastOfSentence ? (sentence.match(/[.!?।॥…]$/)?.[0] ?? ".") : ",";
      const base = isLastOfSentence
        ? pauseForStop(stop === "…" ? "." : stop, sentence)
        : CRITICAL_RE.test(chunk) ? PAUSE_MS.critical : PAUSE_MS.comma;
      groups.push({
        text: chunk,
        pauseAfterMs: Math.round(base * pace),
      });
    });
  }

  // A trailing pause is noise — the last group ends the turn.
  if (groups.length > 0) groups[groups.length - 1].pauseAfterMs = 0;
  return groups;
}

// ─── 8. Real silence in the audio stream ────────────────────────────────────

export interface WavFormat {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

/**
 * Reads the canonical PCM WAV fmt chunk. Returns null for anything that is not
 * a plain PCM WAV (e.g. MP3 from another provider) so the caller can skip
 * pacing instead of corrupting the clip.
 */
export function readWavFormat(buf: Buffer): WavFormat | null {
  if (!buf || buf.length < 44) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buf.toString("ascii", 8, 12) !== "WAVE") return null;
  const audioFormat = buf.readUInt16LE(20);
  if (audioFormat !== 1) return null; // not linear PCM
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  if (!channels || !sampleRate || !bitsPerSample) return null;
  return { channels, sampleRate, bitsPerSample };
}

/** A valid PCM WAV buffer containing `ms` milliseconds of digital silence. */
export function wavSilence(ms: number, fmt: WavFormat): Buffer {
  const safeMs = Math.max(0, Math.round(ms));
  const bytesPerFrame = (fmt.bitsPerSample / 8) * fmt.channels;
  const frames = Math.round((fmt.sampleRate * safeMs) / 1000);
  const dataSize = frames * bytesPerFrame;
  const buf = Buffer.alloc(44 + dataSize); // zero-filled = silence
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);                                  // PCM
  buf.writeUInt16LE(fmt.channels, 22);
  buf.writeUInt32LE(fmt.sampleRate, 24);
  buf.writeUInt32LE(fmt.sampleRate * bytesPerFrame, 28);     // byte rate
  buf.writeUInt16LE(bytesPerFrame, 32);                      // block align
  buf.writeUInt16LE(fmt.bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

/**
 * Appends `ms` of REAL silence to a PCM WAV clip and rewrites the RIFF/data
 * sizes so the result stays a valid WAV. This is what gives Dr. Mayin her
 * pauses: the route concatenates chunk buffers verbatim, so baking the pause
 * into each chunk is the only place it can be introduced without touching the
 * streaming contract.
 *
 * Non-PCM / malformed input is returned untouched — pacing is never allowed to
 * break audio.
 */
export function appendPauseToWav(wav: Buffer, ms: number): Buffer {
  if (!wav || ms <= 0) return wav;
  const fmt = readWavFormat(wav);
  if (!fmt) return wav;
  try {
    // Locate the data chunk (it is not always at byte 36).
    let offset = 12;
    let dataStart = -1;
    let dataSize = 0;
    while (offset + 8 <= wav.length) {
      const id = wav.toString("ascii", offset, offset + 4);
      const size = wav.readUInt32LE(offset + 4);
      if (id === "data") {
        dataStart = offset + 8;
        dataSize = Math.min(size, wav.length - dataStart);
        break;
      }
      offset += 8 + size + (size % 2); // chunks are word-aligned
    }
    if (dataStart < 0) return wav;

    const silence = wavSilence(ms, fmt);
    const silenceData = silence.subarray(44);
    const head = wav.subarray(0, dataStart + dataSize);
    const tail = wav.subarray(dataStart + dataSize);
    const out = Buffer.concat([head, silenceData, tail]);
    // Keep the container valid: patch the `data` size AND the RIFF size.
    out.writeUInt32LE(dataSize + silenceData.length, dataStart - 4);
    out.writeUInt32LE(out.length - 8, 4);
    return out;
  } catch {
    return wav;
  }
}

// ─── 9. Human voice selection (never an AI-robot persona) ────────────────────

/** Minimal shape of a Voicebox profile row (only what selection needs). */
export interface VoiceboxProfileInfo {
  id?: string;
  name: string;
  language?: string | null;
  description?: string | null;
}

/**
 * Personas that sound like a machine rather than a clinician. The live runtime
 * ships `JARVIS` — "British Intelligent AI Voice (Jarvis)" — which the old code
 * used as the DEFAULT English profile for Dr. Mayin. That single default is why
 * the doctor sounded robotic.
 */
export const ROBOT_PERSONA_RE =
  /\b(jarvis|robot|robotic|android|cyborg|synthetic|machine|computer|assistant|assist(ant)?\s+ai|a\.?i\.?\s*(voice|assistant)?|hal\s*9000|friday)\b/i;

export interface HumanProfileChoice {
  name: string;
  /** True when the profile language actually matches the request. */
  matched: boolean;
  /** True when it passed the robot-persona filter. */
  natural: boolean;
  reason: string;
}

/**
 * Pick the most HUMAN-sounding available voice profile for a language.
 *
 * Ranking (highest first):
 *   1. the operator's explicit `ASTRA_TTS_*_PROFILE` / pinned profile
 *   2. a non-robot profile whose declared language matches the request
 *   3. a non-robot profile of the same base language
 *   4. any non-robot profile
 *   5. the first profile (honestly flagged `natural:false`)
 *
 * A robot persona is only ever returned when nothing else exists, and the
 * `reason` says so — the caller can then disclose it instead of pretending.
 */
export function pickHumanProfile(
  profiles: VoiceboxProfileInfo[],
  language: string,
  preferred?: string | null,
): HumanProfileChoice | null {
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  const lang = (language || "en-IN").toLowerCase();
  const base = lang.split("-")[0];

  const langOf = (p: VoiceboxProfileInfo) => String(p.language ?? "").toLowerCase();
  const isRobot = (p: VoiceboxProfileInfo) =>
    ROBOT_PERSONA_RE.test(p.name) || ROBOT_PERSONA_RE.test(String(p.description ?? ""));

  // 1. Explicitly pinned profile wins — an operator override is deliberate,
  //    even if the persona name looks synthetic.
  const wanted = (preferred ?? "").trim();
  if (wanted) {
    const exact =
      profiles.find((p) => p.name.toLowerCase() === wanted.toLowerCase()) ??
      profiles.find((p) => String(p.id ?? "").toLowerCase() === wanted.toLowerCase());
    if (exact) {
      return {
        name: exact.name,
        matched: langOf(exact).startsWith(base),
        natural: !isRobot(exact),
        reason: "pinned by configuration",
      };
    }
  }

  const humans = profiles.filter((p) => !isRobot(p));
  const pool = humans; // when empty we fall through to the honest synthetic fallback (step 5)

  // 2. Language-matched human voice.
  const exactLang = pool.find((p) => langOf(p).startsWith(lang));
  if (exactLang) {
    return {
      name: exactLang.name,
      matched: true,
      natural: !isRobot(exactLang),
      reason: `human voice matching ${lang}`,
    };
  }

  // 3. Same base language.
  const baseLang = pool.find((p) => langOf(p) === base || langOf(p).startsWith(base));
  if (baseLang) {
    return {
      name: baseLang.name,
      matched: true,
      natural: !isRobot(baseLang),
      reason: `human voice for ${base}`,
    };
  }

  // 4. Any human voice.
  const anyHuman = humans[0];
  if (anyHuman) {
    return {
      name: anyHuman.name,
      matched: false,
      natural: true,
      reason: `no ${lang} human voice installed — using ${anyHuman.name}`,
    };
  }

  // 5. Nothing human exists — be honest about it.
  return {
    name: profiles[0].name,
    matched: false,
    natural: false,
    reason: `only synthetic personas installed (${profiles[0].name}) — consider adding a human voice profile`,
  };
}

