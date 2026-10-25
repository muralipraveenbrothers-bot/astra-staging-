// Tiny i18n layer for the Astra chat — English / తెలుగు / हिन्दी toggle.
// A flat string dictionary with English fallback, plus a useLang() hook
// persisted to localStorage and broadcast in-tab via a custom event.

import { useCallback, useEffect, useState } from "react";

export type Lang = "en" | "te" | "hi";

const STORAGE_KEY = "Astra.chat.lang";
const EVENT = "Astra:lang-changed";

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "te" ? "te" : v === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

export function setLang(l: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* private mode — keep in-memory only */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Auto language detection — "te" for Telugu script (U+0C00–U+0C7F),
 * "hi" for Devanagari (U+0900–U+097F), otherwise null (caller keeps the UI language).
 */
export function detectLang(text: string): Lang | null {
  const te = (text.match(/[\u0C00-\u0C7F]/g) || []).length;
  const hi = (text.match(/[\u0900-\u097F]/g) || []).length;
  if (te === 0 && hi === 0) {
    const lower = text.toLowerCase();
    const teTok = (lower.match(/\b(namaskaram|ela|unnaru|cheppandi|kavali|meeru|nenu)\b/g) || []).length;
    const hiTok = (lower.match(/\b(namaste|kaise|kya|hai|batao|chahiye)\b/g) || []).length;
    if (teTok > 0 && teTok >= hiTok) return "te";
    if (hiTok > 0) return "hi";
    return null;
  }
  return te >= hi ? "te" : "hi";
}

/** Voice profile key for a detected/selected language (en → hi fallbackable). */
export function voiceLangFor(lang: Lang): "en" | "te" | "hi" {
  return lang;
}

/** React hook — current UI language + setter, persisted to localStorage. */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(getLang);

  useEffect(() => {
    const sync = () => setLangState(getLang());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((l: Lang) => {
    setLang(l);
    setLangState(l);
  }, []);

  return [lang, set];
}

/* ---------------- dictionary ---------------- */

export type StringKey =
  | "title"
  | "commands"
  | "commandsTip"
  | "fusion"
  | "fusionPanel"
  | "fusionOnToast"
  | "fusionOffToast"
  | "fusionOnDesc"
  | "fusionOffDesc"
  | "placeholder"
  | "micTip"
  | "listeningToast"
  | "listeningDesc"
  | "transcriptToast"
  | "transcriptDesc"
  | "greeting"
  | "readyServedBy"
  | "simServedBy"
  | "simOffer"
  | "noApiKey"
  | "errorHint"
  | "errorOllama"
  | "errorFreellm"
  | "statusHealthy"
  | "statusDisabled"
  | "model_auto"
  | "model_llama"
  | "model_qwen"
  | "model_fusion"
  | "reply_wait"
  | "reply_billing"
  | "reply_staff"
  | "reply_census"
  | "reply_default";

const DICT: Record<StringKey, { en: string; te: string; hi?: string }> = {
  title: {
    en: "Astra Assistant",
    te: "శాస్త్ర సహాయకుడు",
    hi: "शास्त्र सहायक",
  },
  commands: {
    en: "Commands",
    te: "కమాండ్లు",
    hi: "कमांड्स",
  },
  commandsTip: {
    en: "Type operational commands — register patients, fire reports, read collections",
    te: "ఆపరేషనల్ కమాండ్లు టైప్ చేయండి — రోగులను నమోదు చేయండి, రిపోర్ట్‌లు పంపండి, వసూళ్లు చూడండి (కమాండ్లు ఇంగ్లీష్‌లోనే ఉంటాయి)",
  },
  fusion: {
    en: "Fusion",
    te: "ఫ్యూజన్",
  },
  fusionPanel: {
    en: "requesting panel consensus…",
    te: "ప్యానెల్ ఏకాభిప్రాయం కోసం అడుగుతోంది…",
  },
  fusionOnToast: {
    en: "Fusion mode on",
    te: "ఫ్యూజన్ మోడ్ ఆన్ చేశారు",
  },
  fusionOffToast: {
    en: "Fusion mode off",
    te: "ఫ్యూజన్ మోడ్ ఆఫ్ చేశారు",
  },
  fusionOnDesc: {
    en: "Replies requested from FreeLLMAPI model `fusion` — errors surface inline.",
    te: "FreeLLMAPI `fusion` మోడల్ నుండి సమాధానాలు అడుగుతాం — లోపాలు ఇక్కడే చూపిస్తాం.",
  },
  fusionOffDesc: {
    en: "Single-model routing restored.",
    te: "సింగల్-మోడల్ రూటింగ్ తిరిగి ప్రారంభమైంది.",
  },
  placeholder: {
    en: "Ask about census, billing, staffing… (Enter to send)",
    te: "సెన్సస్, బిల్లింగ్, సిబ్బంది గురించి అడగండి… (పంపడానికి Enter నొక్కండి)",
    hi: "सेंसस, बिलिंग, स्टाफ़ के बारे में पूछें… (भेजने के लिए Enter दबाएं)",
  },
  micTip: {
    en: "Tap to talk — Voicebox STT, falls back to browser",
    te: "మాట్లాడటానికి నొక్కండి — Voicebox STT, లేకపోతే బ్రౌజర్",
    hi: "बोलने के लिए टैप करें — Voicebox STT",
  },
  listeningToast: {
    en: "Listening…",
    te: "వింటున్నాను…",
    hi: "सुन रहा हूँ…",
  },
  listeningDesc: {
    en: "Live capture via Voicebox Whisper (local).",
    te: "Voicebox Whisper (లోకల్) ద్వారా లైవ్ క్యాప్చర్.",
    hi: "Voicebox Whisper (लोकल) द्वारा लाइव कैप्चर।",
  },
  transcriptToast: {
    en: "Transcript captured",
    te: "ట్రాన్స్‌క్రిప్ట్ పట్టుకున్నాను",
    hi: "ट्रांसक्रिप्ट कैप्चर हुआ",
  },
  transcriptDesc: {
    en: "Whisper local transcription via Voicebox.",
    te: "Voicebox ద్వారా Whisper లోకల్ ట్రాన్స్‌క్రిప్షన్.",
    hi: "Voicebox द्वारा Whisper लोकल ट्रांसक्रिप्शन।",
  },
  greeting: {
    en: "Namaste, Doctor 🙏 I'm Astra — your hospital ops co-pilot. I stream live answers through FreeLLMAPI or your local Ollama runtime; if a backend is down I'll tell you plainly and offer simulation mode. Ask me about today's census, billing, staffing or alerts.",
    te: "నమస్తే డాక్టర్ గారూ 🙏 నేను ఆస్త్రాని — మీ హాస్పిటల్ ఆపరేషన్స్ సహాయకుడిని. FreeLLMAPI లేదా మీ లోకల్ Ollama ద్వారా ప్రత్యక్ష సమాధానాలు ఇస్తాను; బ్యాకెండ్ పని చేయకపోతే స్పష్టంగా చెప్పి సిమ్యులేషన్ మోడ్‌ను సూచిస్తాను. నేటి సెన్సస్, బిల్లింగ్, సిబ్బంది లేదా అలర్ట్స్ గురించి అడగండి.",
    hi: "नमस्ते डॉक्टर 🙏 मैं आस्त्रा हूँ — आपका हॉस्पिटल ऑपरेशंस को-पायलट। मैं FreeLLMAPI या आपके स्थानीय Ollama से लाइव जवाब देता हूँ; बैकएंड डाउन होने पर साफ़ बताऊँगा और सिमुलेशन मोड दूँगा। आज के सेंसस, बिलिंग, स्टाफ़ या अलर्ट्स के बारे में पूछें।",
  },
  readyServedBy: {
    en: "ready · awaiting backend",
    te: "సిద్ధం · బ్యాకెండ్ కోసం వేచి ఉంది",
    hi: "तैयार · बैकएंड की प्रतीक्षा",
  },
  simServedBy: {
    en: "simulation mode · offline canned reply",
    te: "సిమ్యులేషన్ మోడ్ · ఆఫ్‌లైన్ నమూనా సమాధానం",
    hi: "सिमुलेशन मोड · ऑफ़लाइन विशिष्ट उत्तर",
  },
  simOffer: {
    en: "Reply in simulation mode instead",
    te: "సిమ్యులేషన్ మోడ్‌లో సమాధానం పొందండి",
    hi: "इसके बजाय सिमुलेशन मोड में उत्तर दें",
  },
  noApiKey: {
    en: "No FreeLLMAPI Unified API Key is saved. Add it in Settings → Connections → Unified API Key, then press Test.",
    te: "FreeLLMAPI యూనిఫైడ్ API కీ సేవ్ చేయబడలేదు. సెట్టింగ్స్ → Connections → Unified API Keyలో జోడించి, ఆ తర్వాత Test నొక్కండి.",
  },
  errorHint: {
    en: "Hint: open Settings → Connections and press Test on the matching service.",
    te: "సూచన: సెట్టింగ్స్ → Connections తెరిచి, సంబంధిత సర్వీసుపై Test నొక్కండి.",
  },
  errorOllama: {
    en: "Is Ollama running at 127.0.0.1:11434?",
    te: "Ollama 127.0.0.1:11434 వద్ద నడుస్తోందా?",
  },
  errorFreellm: {
    en: "Is FreeLLMAPI running?",
    te: "FreeLLMAPI నడుస్తోందా?",
  },
  statusHealthy: {
    en: "healthy",
    te: "ఆరోగ్యంగా ఉంది",
    hi: "स्वस्थ",
  },
  statusDisabled: {
    en: "disabled",
    te: "నిలిపివేయబడింది",
    hi: "निष्क्रिय",
  },
  model_auto: {
    en: "Auto — FreeLLMAPI fallback chain",
    te: "ఆటో — FreeLLMAPI ఫాల్‌బ్యాక్ చైన్",
  },
  model_llama: {
    en: "llama3.2:3b (Ollama local)",
    te: "llama3.2:3b (Ollama లోకల్)",
  },
  model_qwen: {
    en: "qwen3:14b (Ollama local)",
    te: "qwen3:14b (Ollama లోకల్)",
  },
  model_fusion: {
    en: "Astra Fusion (FreeLLMAPI)",
    te: "ఆస్త్రా ఫ్యూజన్ (FreeLLMAPI)",
  },
  reply_wait: {
    en: "Current OP wait time is 14 minutes, down 36% this week. Reception queue depth is 3 at desk A. I recommend opening a second triage counter between 11:00–13:00 — historically that trims peak wait by ~5 minutes.",
    te: "ప్రస్తుతం OP వేచి ఉండే సమయం 14 నిమిషాలు — ఈ వారం 36% తగ్గింది. రిసెప్షన్ డెస్క్ A వద్ద క్యూలో 3 మంది ఉన్నారు. ఉదయం 11:00–13:00 మధ్య రెండో ట్రయాజ్ కౌంటర్ తెరవడం మంచిది — గత అనుభవం ప్రకారం రద్దీ సమయంలో వేచి ఉండే సమయం ~5 నిమిషాలు తగ్గుతుంది.",
  },
  reply_billing: {
    en: "Collections today stand at ₹93,600 across 42 receipts (UPI 58%, Card 27%, Cash 15%). One flag: RCPT-1044 shows a possible duplicate UPI charge — the Billing Fraud Auditor has opened an issue and it awaits your review.",
    te: "ఈరోజు వసూళ్లు ₹93,600 — మొత్తం 42 రసీదులు (UPI 58%, కార్డ్ 27%, నగదు 15%). ఒక గమనిక: RCPT-1044లో UPI డబుల్ చార్జీ అనుమానం ఉంది — బిల్లింగ్ ఫ్రాడ్ ఆడిటర్ ఒక సమస్యను నమోదు చేసింది, అది మీ సమీక్ష కోసం వేచి ఉంది.",
  },
  reply_staff: {
    en: "36 of 42 scheduled staff are on duty. Two anomalies need attention: Vikram Shah clocked in outside the geofence, and Anjali Verma's face-match confidence was 0.61 (human review required). Ward B night coverage is one nurse below ratio.",
    te: "షెడ్యూల్ చేసిన 42 మంది సిబ్బందిలో 36 మంది డ్యూటీలో ఉన్నారు. రెండు అసాధారణాలకు శ్రద్ధ అవసరం: విక్రమ్ షా జియోఫెన్స్ బయట గడియారం కొట్టారు, అంజలి వర్మ ఫేస్-మ్యాచ్ విశ్వాస స్థాయి 0.61 (మానవ సమీక్ష అవసరం). వార్డ్ B నైట్ షిఫ్ట్‌లో ఒక నర్సు తక్కువగా ఉంది.",
  },
  reply_census: {
    en: "IP census is 38 patients (86% occupancy). Ward A has 4 beds free, Ward B has 2, ICU is full. Average length of stay is trending at 3.4 days. Two discharges are planned before 14:00 which should relieve ICU step-down pressure.",
    te: "IP సెన్సస్ 38 మంది రోగులు (86% ఆక్యుపెన్సీ). వార్డ్ Aలో 4 పడకలు ఖాళీగా ఉన్నాయి, వార్డ్ Bలో 2, ICU నిండి ఉంది. సగటు చికిత్స కాలం 3.4 రోజులుగా ఉంది. 14:00 లోపు రెండు డిశ్చార్జీలు ప్రణాళికలో ఉన్నాయి — అవి ICU స్టెప్-డౌన్ ఒత్తిడిని తగ్గిస్తాయి.",
  },
  reply_default: {
    en: "Here's what I see across the hospital right now: OP flow is healthy (134 visits, 14-min average wait), IP census at 86%, collections tracking +18% versus the daily average, and 3 active alerts — one cash-drawer variance of ₹420 that I'd prioritise. Ask me about billing, staffing, wards or wait times for specifics.",
    te: "ప్రస్తుతం హాస్పిటల్ పరిస్థితి ఇలా ఉంది: OP ప్రవాహం బాగుంది (134 విజిట్లు, సగటు వేచి ఉండే సమయం 14 నిమిషాలు), IP సెన్సస్ 86%, వసూళ్లు రోజువారీ సగటు కంటే +18% ఎక్కువగా ఉన్నాయి, 3 యాక్టివ్ అలర్ట్స్ ఉన్నాయి — వాటిలో ₹420 క్యాష్-డ్రాయర్ తేడాను ముందుగా చూడాలని సూచిస్తున్నాను. వివరాల కోసం బిల్లింగ్, సిబ్బంది, వార్డులు లేదా వేచి ఉండే సమయాల గురించి అడగండి.",
  },
};

/** Translate a key; falls back to English for anything not translated. */
export function t(lang: Lang, key: StringKey): string {
  const entry = DICT[key];
  return entry[lang] ?? entry.en;
}
