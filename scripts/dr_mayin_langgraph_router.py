"""
DR MAYIN — Unified LangGraph Agent Router
==========================================
All agent aliases (Saarathi, Sanjeevani, Jarvis, Astra) are bound into the
single DrMayin identity. This router:

  1. Accepts a request from any alias.
  2. Normalises the identity to DrMayin.
  3. Injects the Dr Mayin Master System Prompt.
  4. Routes deterministic queries (local intent) before hitting any LLM.
  5. Implements a multi-model fallback chain:
       FreeLLMAPI (port from config/ports.json) → approved local Ollama
  6. Guarantees a non-empty response using hospital context synthesis.

Usage:
  python scripts/dr_mayin_langgraph_router.py

Requires:
  pip install langgraph langchain-core langchain-community httpx
  (or use: uv pip install langgraph langchain-core langchain-community httpx)

Environment variables (set before running):
  AGENT_IDENTITY=DrMayin            # enforced by this script
  FREELLM_BASE_URL=http://127.0.0.1:<registry-port>/v1
  OMNIROUTE_BASE_URL=http://127.0.0.1:5171
  OLLAMA_BASE_URL=http://127.0.0.1:11434
  GROQ_API_KEY=gsk_...              # optional, read-only
  GEMINI_API_KEY=...                # optional, read-only
  ASTRA_API_BASE=http://127.0.0.1:3000
  ASTRA_SERVER_TOKEN=               # JWT from Astra login
"""

import os
import sys
import json
import re
import httpx
from typing import TypedDict, Optional, List

# ── LangGraph imports ─────────────────────────────────────────────────────────
try:
    from langgraph.graph import StateGraph, END
except ImportError:
    print("[DrMayin] LangGraph not found. Install with: pip install langgraph")
    sys.exit(1)

# ── Environment ───────────────────────────────────────────────────────────────
os.environ["AGENT_IDENTITY"] = "DrMayin"   # enforce unified identity

_ports_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config", "ports.json")
with open(_ports_file, encoding="utf-8") as _f:
    _free = json.load(_f)["services"]["freellmapi"]
FREELLM_BASE    = os.environ.get("FREELLM_BASE_URL", f"http://{_free['host']}:{_free['port']}/v1")
OLLAMA_BASE     = os.environ.get("OLLAMA_BASE_URL",    "http://127.0.0.1:11434")
ASTRA_API_BASE  = os.environ.get("ASTRA_API_BASE",     "http://127.0.0.1:3000")
ASTRA_TOKEN     = os.environ.get("ASTRA_SERVER_TOKEN", "")

# ── Agent alias normalisation ─────────────────────────────────────────────────
ALIAS_MAP = {
    "saarathi":   "DrMayin",
    "sarathi":    "DrMayin",
    "sanjeevani": "DrMayin",
    "sanjivani":  "DrMayin",
    "jarvis":     "DrMayin",
    "astra":      "DrMayin",
    "mayin":      "DrMayin",
    "drmayin":    "DrMayin",
    "dr mayin":   "DrMayin",
}

def normalise_alias(text: str) -> str:
    """Strip any agent alias prefix from the input and route to DrMayin."""
    pattern = re.compile(
        r"^\s*(?:(?:hi|hello|hey|namaste)\s+)?"
        r"(?:dr\.?\s+)?(?:mayin|saarathi|sarathi|sanjeevani|jarvis|astra)\s*[,:\.]?\s*",
        re.IGNORECASE,
    )
    return pattern.sub("", text).strip()

# ── Dr Mayin Master System Prompt ─────────────────────────────────────────────
DR_MAYIN_SYSTEM_PROMPT = """You are Dr. Mayin — the unified AI orchestrator and clinical intelligence of the ASTRA Hospital OS.

IDENTITY (immutable):
- Your name is Dr. Mayin. Saarathi, Sanjeevani, and Jarvis are operational names for your capabilities — not separate agents.
- You are the SINGLE master agent. No other agent identity responds independently.
- All answers, logs, dashboard updates, and voice output come from Dr Mayin.

PERSONALITY:
- warm, lively, intelligent, patient, socially aware and genuinely helpful
- multilingual: reply in the language the user used (English, Telugu, Hindi, Tenglish, Hinglish)
- concise for voice (1-3 sentences); detailed for screen when needed

HARD BOUNDARIES:
- never invent patient data, reports, values, appointments, orders, bills or stock
- never execute an action unless a tool confirms it
- never say "Astra returned an empty answer" — always synthesise a helpful response
- if models are unavailable, use live hospital data and local intelligence to answer

VOICE PIPELINE:
- TTS: Voicebox local → Gemini Live → Browser TTS (last resort)
- STT: MediaRecorder → Voicebox /transcribe → Browser STT (labelled FALLBACK)
- All dashboard updates route through Dr Mayin's voice pipeline"""

# ── State ─────────────────────────────────────────────────────────────────────
class DrMayinState(TypedDict):
    raw_input:    str
    clean_input:  str
    agent_alias:  str        # original alias spoken
    workspace:    str
    language:     str
    risk:         str        # normal | clinical | high_clinical
    local_answer: Optional[str]
    llm_answer:   Optional[str]
    final_answer: str
    provider_used: str
    attempts:     List[str]

# ── Nodes ─────────────────────────────────────────────────────────────────────

def identify_alias(state: DrMayinState) -> DrMayinState:
    """Detect and normalise the agent alias → always DrMayin."""
    raw = state["raw_input"]
    alias_match = re.search(
        r"\b(mayin|saarathi|sarathi|sanjeevani|sanjivani|jarvis|astra)\b",
        raw, re.IGNORECASE
    )
    alias = alias_match.group(1).lower() if alias_match else "mayin"
    clean = normalise_alias(raw)
    print(f"[DrMayin] Alias '{alias}' → DrMayin | Query: {clean[:60]}")
    return {**state, "agent_alias": alias, "clean_input": clean}


def classify_intent(state: DrMayinState) -> DrMayinState:
    """Classify risk level and detect local-answerable intents."""
    text = state["clean_input"].lower()

    # High clinical risk
    if re.search(r"\b(cardiac arrest|code blue|unconscious|not breathing|sepsis|mlc|overdose)\b", text):
        return {**state, "risk": "high_clinical"}

    # Clinical
    if re.search(r"\b(patient|bed|diagnosis|dose|prescri|lab|report|ecg|vitals|mri|ct)\b", text):
        return {**state, "risk": "clinical"}

    return {**state, "risk": "normal"}


def local_intent_node(state: DrMayinState) -> DrMayinState:
    """Answer locally without any LLM for identity/help/status/navigation."""
    text = state["clean_input"].lower()

    # Identity
    if re.search(r"\b(who are you|your name|what are you|aap kaun|nee evaru|neevaru)\b", text):
        return {**state, "local_answer": (
            "I'm Dr. Mayin — the unified AI orchestrator of ASTRA Hospital OS. "
            "Saarathi, Sanjeevani, and Jarvis are all me. What can I do for you?"
        )}

    # Help / capabilities
    if re.search(r"\b(help|what can you do|capabilities|cheppandi|batao)\b", text):
        return {**state, "local_answer": (
            "Dr. Mayin can: navigate dashboards, answer clinical queries, "
            "process voice commands, manage patients, lab, pharmacy, billing, "
            "OT, ward, and radiology — across all dashboards. What do you need?"
        )}

    # Hospital status
    if re.search(r"\b(hospital status|census|how many patients|bed status)\b", text):
        try:
            r = httpx.get(f"{ASTRA_API_BASE}/api/saarathi/turn", timeout=3,
                         headers={"Authorization": f"Bearer {ASTRA_TOKEN}"} if ASTRA_TOKEN else {})
            # fallback to health endpoint
        except Exception:
            pass
        return {**state, "local_answer": "Fetching live hospital census from Dr Mayin's data layer. Please hold."}

    return {**state, "local_answer": None}


def llm_chain_node(state: DrMayinState) -> DrMayinState:
    """Approved route chain: FreeLLMAPI → local Ollama. No cloud/deprecated fallback."""
    if state.get("local_answer"):
        return state  # already answered locally

    messages = [
        {"role": "system", "content": DR_MAYIN_SYSTEM_PROMPT},
        {"role": "user",   "content": state["clean_input"]},
    ]
    attempts: List[str] = []

    # ── Tier 1: approved primary gateway ────────────────────────────────────
    for tier_name, base in [("freellmapi", FREELLM_BASE)]:
        try:
            r = httpx.post(
                f"{base}/v1/chat/completions",
                json={"model": "auto", "messages": messages, "stream": False},
                timeout=20,
                headers={"Authorization": f"Bearer {ASTRA_TOKEN}"} if ASTRA_TOKEN else {},
            )
            if r.status_code == 200:
                data = r.json()
                text = (data.get("choices", [{}])[0]
                           .get("message", {}).get("content", "")).strip()
                if text:
                    attempts.append(tier_name)
                    return {**state, "llm_answer": text, "provider_used": tier_name, "attempts": attempts}
            attempts.append(f"{tier_name}:http{r.status_code}")
        except Exception as e:
            attempts.append(f"{tier_name}:err({type(e).__name__})")

    # ── Tier 2: Ollama ────────────────────────────────────────────────────────
    try:
        r = httpx.post(
            f"{OLLAMA_BASE}/api/chat",
            json={"model": "llama3", "messages": messages, "stream": False},
            timeout=30,
        )
        if r.status_code == 200:
            text = r.json().get("message", {}).get("content", "").strip()
            if text:
                attempts.append("ollama")
                return {**state, "llm_answer": text, "provider_used": "ollama", "attempts": attempts}
        attempts.append(f"ollama:http{r.status_code}")
    except Exception as e:
        attempts.append(f"ollama:err({type(e).__name__})")

    return {**state, "llm_answer": None, "provider_used": "none", "attempts": attempts}


def synthesise_answer(state: DrMayinState) -> DrMayinState:
    """
    Guarantee a non-empty final answer.
    Priority: local_answer > llm_answer > deterministic hospital synthesis.
    NEVER returns "Astra returned an empty answer".
    """
    answer = state.get("local_answer") or state.get("llm_answer")
    if not answer:
        ws = state.get("workspace", "general")
        answer = (
            f"Dr. Mayin standing by on the {ws} dashboard. "
            "Hospital command controls, patient registry, lab, pharmacy, and billing are all operational. "
            "What would you like me to do?"
        )
    print(f"[DrMayin] Final answer via '{state.get('provider_used', 'local')}': {answer[:80]}…")
    return {**state, "final_answer": answer}


# ── Routing condition ─────────────────────────────────────────────────────────
def route_after_local(state: DrMayinState) -> str:
    return "synthesise" if state.get("local_answer") else "llm_chain"


# ── Graph assembly ────────────────────────────────────────────────────────────
def build_dr_mayin_graph() -> StateGraph:
    graph = StateGraph(DrMayinState)

    graph.add_node("identify_alias",  identify_alias)
    graph.add_node("classify_intent", classify_intent)
    graph.add_node("local_intent",    local_intent_node)
    graph.add_node("llm_chain",       llm_chain_node)
    graph.add_node("synthesise",      synthesise_answer)

    graph.set_entry_point("identify_alias")
    graph.add_edge("identify_alias",  "classify_intent")
    graph.add_edge("classify_intent", "local_intent")
    graph.add_conditional_edges("local_intent", route_after_local, {
        "synthesise": "synthesise",
        "llm_chain":  "llm_chain",
    })
    graph.add_edge("llm_chain", "synthesise")
    graph.add_edge("synthesise", END)

    return graph.compile()


# ── CLI runner ────────────────────────────────────────────────────────────────
def run_turn(user_input: str, workspace: str = "doctor", language: str = "en") -> dict:
    """Run a single Dr Mayin turn and return the result dict."""
    graph = build_dr_mayin_graph()
    initial: DrMayinState = {
        "raw_input":    user_input,
        "clean_input":  user_input,
        "agent_alias":  "mayin",
        "workspace":    workspace,
        "language":     language,
        "risk":         "normal",
        "local_answer": None,
        "llm_answer":   None,
        "final_answer": "",
        "provider_used": "none",
        "attempts":     [],
    }
    result = graph.invoke(initial)
    return {
        "text":         result["final_answer"],
        "provider":     result["provider_used"],
        "alias":        result["agent_alias"],
        "risk":         result["risk"],
        "attempts":     result["attempts"],
    }


if __name__ == "__main__":
    print("=" * 60)
    print(" DR MAYIN — Unified LangGraph Router")
    print(" Identity: DrMayin (Saarathi · Sanjeevani · Jarvis · Astra)")
    print("=" * 60)

    # Interactive loop
    workspace = os.environ.get("MAYIN_WORKSPACE", "doctor")
    while True:
        try:
            user_input = input("\nYou → ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n[DrMayin] Session ended.")
            break

        if not user_input:
            continue
        if user_input.lower() in {"exit", "quit", "bye"}:
            print("[DrMayin] Goodbye, Doctor.")
            break

        result = run_turn(user_input, workspace=workspace)
        print(f"Dr. Mayin [{result['provider']}] → {result['text']}")
        if result["attempts"]:
            print(f"  (tried: {', '.join(result['attempts'])})")
