// ======================================================
// ASTRA AI - Central Keys (ONE PLACE ONLY)
// Put all keys here. No need to open any external UI.
// ======================================================

export const AI_KEYS = {
  // Browser-side placeholders only. Real keys live in backend env
  // (FREELLMAPI_API_KEY / OMNIROUTE_API_KEY). Chat goes to POST /api/ai/chat.
  FREELLM_PREMIUM: "",

  // Optional - if you have OmniRoute key
  OMNIROUTE: "",                                        // leave empty if not needed

  // Optional free provider keys (if you have them)
  // These are only used if you want direct fallback
  GEMINI_FREE: "",
  GROQ: "",
  OPENROUTER: "",
};

// Server addresses
//
// NOTE (browser calls): the Astra frontend already has Vite dev-server
// proxies for these backends (see vite.config.ts):
//   /proxy/freellmapi  → canonical FreeLLMAPI API + dashboard port
//   /proxy/omni        → http://127.0.0.1:20128  (OmniRoute desktop app — dashboard at 127.0.0.1:20128/home)
// Direct localhost URLs can hit CORS blocks when called from the browser;
// if that happens, switch these to "/proxy/omni" and "/proxy/freellmapi"
// (the proxy rewrite keeps the /v1 path intact). The /proxy/* routes are
// API-ONLY — dashboard buttons open the verified external URLs directly.
export const AI_SERVERS = {
  // SAME-ORIGIN Vite dev-proxies — do NOT call 127.0.0.1 directly from the
  // browser (CORS/mixed-origin blocks). Proxies configured in vite.config.ts:
  //   /proxy/freellmapi → canonical FreeLLMAPI port (/proxy/freellmapi/v1/**) API ONLY
  //   /proxy/omni       → http://127.0.0.1:20128  (/proxy/omni/v1/**)       API ONLY
  OMNIROUTE: "/proxy/omni/v1",
  FREELLM:   "/proxy/freellmapi/v1",

  // Embedded console roots (iframe-safe, same origin)
  FREELLM_UI: "/proxy/freellmapi",
  OMNI_UI:    "/proxy/omni",
};

// -----------------------------------------------------------
// Key persistence — saved in-app (Settings / Co-Pilot ⚙ Keys).
// Overrides keep runtime in sync without a reload.
// -----------------------------------------------------------
const FREELLM_KEY_LS = "astra_freellm_key";
const OMNI_KEY_LS = "astra_omni_key";

try {
  localStorage.removeItem(FREELLM_KEY_LS);
  localStorage.removeItem(OMNI_KEY_LS);
} catch {
  /* privacy mode */
}

/** Keys must not live in the browser. Chat uses POST /api/ai/chat. */
export function saveAstraKeys(_keys?: { freellm?: unknown; omni?: unknown }) {
  AI_KEYS.FREELLM_PREMIUM = "";
  AI_KEYS.OMNIROUTE = "";
}
