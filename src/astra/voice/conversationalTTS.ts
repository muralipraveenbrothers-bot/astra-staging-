/**
 * ASTRA AI — CONVERSATIONAL TTS TRANSFORMER
 * ============================================================================
 * Transforms robotic/clinical text into natural, human-like spoken language.
 * 1. Abbreviation & acronym expansion for natural pronunciation
 * 2. Number normalization ("12.5" → "twelve point five")
 * 3. Prosody pause markers before lab values / after critical terms
 * 4. Conversational phrasing softening
 */

// ─── Abbreviation Expansion Map ─────────────────────────────────────────────
const ABBREVIATION_MAP: Record<string, string> = {
    // Labs
    'CBC': 'complete blood count',
    'CRP': 'C reactive protein',
    'ESR': 'erythrocyte sedimentation rate',
    'WBC': 'white blood cell count',
    'RBC': 'red blood cell count',
    'HbA1c': 'hemoglobin A one C',
    'BUN': 'B U N',
    'GFR': 'G F R',
    'TSH': 'T S H',
    'LDH': 'L D H',
    'AST': 'A S T',
    'ALT': 'A L T',
    'ALP': 'A L P',
    'GGT': 'G G T',
    'ABG': 'arterial blood gas',
    'D-dimer': 'D dimer',
    'SpO2': 'S P O two',
    // Vitals
    'BP': 'blood pressure',
    'HR': 'heart rate',
    'RR': 'respiratory rate',
    'ECG': 'electrocardiogram',
    'EKG': 'electrocardiogram',
    'MRI': 'M R I scan',
    'CT': 'C T scan',
    'USG': 'ultrasound',
    'PET': 'P E T scan',
    // Units of care
    'ICU': 'intensive care unit',
    'NICU': 'neonatal intensive care unit',
    'PICU': 'pediatric intensive care unit',
    'CCU': 'critical care unit',
    'ER': 'emergency room',
    'OT': 'operation theatre',
    'OPD': 'out patient department',
    'IPD': 'in patient department',
    // Drug frequency
    'STAT': 'immediately',
    'PRN': 'as needed',
    'QID': 'four times a day',
    'TID': 'three times a day',
    'BID': 'twice a day',
    'QD': 'once a day',
    'QOD': 'every other day',
    'NPO': 'nothing by mouth',
    // Routes
    'IV': 'intravenous',
    'IM': 'intramuscular',
    'SC': 'subcutaneous',
    // Clinical shorthand
    'DNR': 'do not resuscitate',
    'DVT': 'deep vein thrombosis',
    'PE': 'pulmonary embolism',
    'AMI': 'acute myocardial infarction',
    'CVA': 'cerebrovascular accident',
    'TIA': 'transient ischemic attack',
    'ARDS': 'acute respiratory distress syndrome',
    'CNS': 'central nervous system',
    'GI': 'gastrointestinal',
    'GU': 'genitourinary',
    'ENT': 'ear nose and throat',
    'CURB-65': 'C U R B sixty five score',
    'H/O': 'history of',
    'R/O': 'rule out',
    'Dx': 'diagnosis',
    'Rx': 'prescription',
    'Tx': 'treatment',
    'Hx': 'history',
    'Pt': 'patient',
};

// Words that must NOT be expanded even if they contain an abbreviation substring
const PROTECTED_WORDS = new Set([
    'ct', 'us', 'pe', 'k', 'na', 'ca', 'mg', 'cl', 'o2', 'co2', 'hr', 'rr', 'bp',
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Expands medical/technical abbreviations into naturally pronounceable words.
 * Only expands when the abbreviation appears as a standalone token.
 */
export function expandAbbreviations(text: string): string {
    let out = text;
    for (const [abbr, expansion] of Object.entries(ABBREVIATION_MAP)) {
        const re = new RegExp(`\\b${escapeRegex(abbr)}\\b`, 'gi');
        out = out.replace(re, (match) => {
            // Preserve case style for readability
            return match[0] === match[0].toUpperCase()
                ? expansion.charAt(0).toUpperCase() + expansion.slice(1)
                : expansion;
        });
    }
    return out;
}

/**
 * Normalizes numbers for natural speech:
 * - "12.5" → "twelve point five"
 * - "65%" → "sixty five percent"
 * - "9.2 g/dL" stays readable
 */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberToWords(n: number): string {
    const abs = Math.abs(n);
    const intPart = Math.floor(abs);
    let decStr = '';
    const str = String(abs);
    const dotIdx = str.indexOf('.');
    if (dotIdx >= 0) decStr = str.slice(dotIdx + 1);

    const intWords = intPart <= 99
        ? smallIntToWords(intPart)
        : String(intPart).split('').map((d) => ONES[Number(d)]).join(' ');

    if (!decStr) return `${n < 0 ? 'minus ' : ''}${intWords}`;
    const decWords = decStr.split('').map((d) => ONES[Number(d)]).join(' ');
    return `${n < 0 ? 'minus ' : ''}${intWords} point ${decWords}`;
}

function smallIntToWords(n: number): string {
    if (n < 10) return ONES[n];
    if (n < 20) return TEENS[n - 10];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? TENS[t] : `${TENS[t]} ${ONES[o]}`;
}

export function normalizeNumbers(text: string): string {
    // Percentages first: "65%" or "65 %"
    let out = text.replace(/\b(\d{1,3}(?:\.\d+)?)\s?(?:%|percent)\b/gi, (_m, num) => `${numberToWords(parseFloat(num))} percent`);
    // Decimal numbers with units: "12.5 mg"
    out = out.replace(/\b(\d+\.\d+)\s*(mg|ml|mmol|mEq|IU|units|g\/dL|gm\/dL|mmHg|bpm|kg|mcg|µg|nmol\/L)?\b/gi,
        (_m, num, unit) => unit ? `${numberToWords(parseFloat(num))} ${unit}` : numberToWords(parseFloat(num)));
    // Large standalone integers (skip years 1900-2100)
    out = out.replace(/\b(\d{1,6})\b/g, (m, numStr) => {
        const n = parseInt(numStr, 10);
        if (n >= 1900 && n <= 2100) return m; // likely a year
        if (n > 9999) return m; // IDs etc.
        return numberToWords(n);
    });
    return out;
}

/**
 * Adds prosody pause markers (represented as " … " which engines read as pauses,
 * and which our sentence splitter converts to real delays):
 * - brief pause before lab values / dosages
 * - longer pause after critical terms
 */
export function injectProsodyPauses(text: string): string {
    let out = text;
    // Pause after critical urgency words
    out = out.replace(/\b(critical|urgent|emergency|immediately|severe|warning)\b\s*:?/gi,
        (m) => `${m} …`);
    // Brief pause before dosage/value patterns like "500 mg", "9.2 grams"
    out = out.replace(/(\s)(\d[\d.,]*\s+(?:mg|ml|mmol|grams?|units|percent|beats|breaths))/gi,
        (_m, sp, val) => ` … ${val}`);
    return out;
}

/**
 * Softens robotic phrasing into conversational tone.
 * Converts terse clinical statements into warmer spoken equivalents.
 */
const PHRASE_SOFTENING: Array<[RegExp, string]> = [
    [/\bThe patient presents with\b/gi, 'The patient has come in with'],
    [/\bpresents with\b/gi, 'has come in with'],
    [/\bPatient is advised\b/gi, 'I would advise'],
    [/\bis advised\b/gi, 'is advised to'],
    [/\bAdminister\b/gi, 'Give'],
    [/\bCommence\b/gi, 'Start'],
    [/\bInitiate\b/gi, 'Begin'],
    [/\bDiscontinue\b/gi, 'Stop'],
    [/\bMonitor\b/gi, 'Keep an eye on'],
    [/\bAssess\b/gi, 'Check'],
    [/\bElevated\b/gi, 'higher than normal'],
    [/\bWithin normal limits\b/gi, 'in the normal range'],
    [/\bWNL\b/gi, 'in the normal range'],
    [/\bUnremarkable\b/gi, 'showing nothing unusual'],
    [/\bNegative for\b/gi, 'shows no signs of'],
    [/\bPositive for\b/gi, 'confirms'],
    [/\bFollow up\b/gi, 'follow-up'],
];

export function softenPhrasing(text: string): string {
    let out = text;
    for (const [re, replacement] of PHRASE_SOFTENING) {
        out = out.replace(re, replacement);
    }
    return out;
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

/**
 * Full conversational transformation pipeline.
 * Order matters: abbreviations → numbers → phrasing → prosody.
 */
export function humanizeForSpeech(rawText: string, langCode = 'en-IN'): string {
    if (!rawText || typeof rawText !== 'string') return '';
    // Only apply English transformations for Latin-script languages;
    // Indic scripts pass through untouched (their TTS voices handle native text well).
    const isLatinScript = !/[ఀ-౿ऀ-ॿঀ-৿஀-௿ഀ-ൿಀ-೿]/.test(rawText);
    if (!isLatinScript) return rawText.trim();

    let out = rawText;
    out = expandAbbreviations(out);
    out = normalizeNumbers(out);
    out = softenPhrasing(out);
    out = injectProsodyPauses(out);
    // Collapse whitespace artifacts from transformations
    out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
    return out;
}

/**
 * Splits text into sentences, converting " … " prosody markers into
 * structured segments with pause hints for the speaking engine.
 */
export interface SpeechSegment {
    text: string;
    pauseAfterMs: number; // pause to insert AFTER this segment
}

export function segmentWithPauses(text: string): SpeechSegment[] {
    const cleaned = text.replace(/…/g, '|PAUSE|');
    const NL = String.fromCharCode(10); // newline (formatter-safe)
    const roughSentences = cleaned
        .split(new RegExp(`([.?!])\\s+`))
        .join('$1' + NL)
        .split(NL)
        .map((s) => s.trim())
        .filter(Boolean);

    const segments: SpeechSegment[] = [];
    for (let i = 0; i < roughSentences.length; i++) {
        const sentence = roughSentences[i];
        // Split each sentence on pause markers
        const parts = sentence.split('|PAUSE|').map((p) => p.trim()).filter(Boolean);
        parts.forEach((part, idx) => {
            const isLastPartOfSentence = idx === parts.length - 1;
            const endsSentence = isLastPartOfSentence && /[.?!]$/.test(sentence);
            let pauseAfterMs = 0;
            if (!isLastPartOfSentence) {
                pauseAfterMs = 220; // mid-sentence prosody pause
            } else if (endsSentence) {
                // Longer pause after questions and critical statements
                pauseAfterMs = /\?$/.test(sentence) ? 420 : 260;
            }
            segments.push({ text: part, pauseAfterMs });
        });
    }
    return segments;
}