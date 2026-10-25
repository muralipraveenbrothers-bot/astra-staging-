"""
Astra AI — FastAPI Central Broadcast Engine
=============================================
Port 8000 — Production-grade REST endpoint for:
  POST /api/v1/broadcast    → Send script to multilingual avatar
  POST /api/v1/emr-alert    → Push EMR diagnostic alert to avatar
  GET  /api/v1/status       → Service health
  GET  /api/v1/history      → Recent broadcast log

Usage:
    pip install fastapi uvicorn gTTS
    python server/avatar/app.py
"""

import os
import sys
import json
import time
import math
import asyncio
import hashlib
import threading
import urllib.request
from datetime import datetime
from typing import List, Optional, Literal
from http.server import HTTPServer, BaseHTTPRequestHandler

try:
    from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    import uvicorn
    USE_FASTAPI = True
except ImportError:
    USE_FASTAPI = False

try:
    from gtts import gTTS
    USE_GTTS = True
except ImportError:
    USE_GTTS = False

PORT = int(os.environ.get("BROADCAST_ENGINE_PORT", "8000"))
A2F_LOCAL_URL = os.environ.get("A2F_CONTROLLER_URL", "http://127.0.0.1:8283")
A2F_OMNIVERSE_JSONRPC = os.environ.get("A2F_OMNIVERSE_JSONRPC", "http://localhost:8011/jsonrpc")
PLAYER_NODE = os.environ.get("A2F_PLAYER_NODE", "/Audio2Face/Player")
BROADCASTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "broadcasts")
os.makedirs(BROADCASTS_DIR, exist_ok=True)

LANG_MAP = {
    "te": "te", "te-IN": "te",
    "hi": "hi", "hi-IN": "hi",
    "en": "en", "en-IN": "en", "en-US": "en"
}

broadcast_log: List[dict] = []


def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}][ASTRA-APP] {msg}", flush=True)


def synthesize_audio(text: str, lang: str, avatar_id: str) -> str | None:
    """TTS: text → MP3 file. Returns path or None."""
    norm = LANG_MAP.get(lang, "en")
    uid = hashlib.md5(f"{avatar_id}{norm}{time.time()}".encode()).hexdigest()[:8]
    path = os.path.join(BROADCASTS_DIR, f"{avatar_id}_{norm}_{uid}.mp3")

    if USE_GTTS:
        try:
            tts = gTTS(text=text, lang=norm, slow=False)
            tts.save(path)
            _log(f"🎙️ Synthesized [{norm}] → {path}")
            return path
        except Exception as e:
            _log(f"❌ gTTS error: {e}")

    # Fallback: generate silent WAV marker so pipeline continues
    _generate_silent_wav(path.replace(".mp3", ".wav"))
    return path.replace(".mp3", ".wav")


def _generate_silent_wav(path: str, duration: float = 2.0, rate: int = 22050):
    """Generate a silent WAV file as TTS fallback."""
    import struct
    num_samples = int(duration * rate)
    data_size = num_samples * 2
    with open(path, "wb") as f:
        # WAV header
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVE")
        f.write(b"fmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16))
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(b"\x00" * data_size)
    _log(f"🔇 Silent WAV fallback: {path}")


def push_to_a2f(audio_path: str, avatar_id: str) -> str:
    """Push audio to Audio2Face via best available channel. Returns channel name."""
    abs_path = os.path.abspath(audio_path)
    payload = {
        "jsonrpc": "2.0",
        "method": "audio2face.PushAudioTrack",
        "params": {
            "player_path": PLAYER_NODE,
            "file_path": abs_path,
            "auto_play": True
        },
        "id": 1
    }

    # Channel 1: Omniverse JSON-RPC (port 8011)
    try:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            A2F_OMNIVERSE_JSONRPC, data=data,
            headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=2):
            _log(f"📡 [Omniverse] Audio pushed → {abs_path}")
            return "omniverse_jsonrpc"
    except Exception:
        pass

    # Channel 2: Local Astra A2F microservice (port 8283)
    try:
        bc_data = json.dumps({
            "text": f"[audio_file] {os.path.basename(abs_path)}",
            "mode": "avatar",
            "lang": "en-IN",
            "audio_path": abs_path,
            "avatar_id": avatar_id
        }).encode()
        req = urllib.request.Request(
            f"{A2F_LOCAL_URL}/api/avatar/broadcast",
            data=bc_data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=3):
            _log(f"🎙️ [LocalA2F] Queued → {abs_path}")
            return "local_a2f_8283"
    except Exception:
        pass

    # Channel 3: Simulation (always succeeds — logs only)
    _log(f"🧱 [SIM] Simulating lip-sync for: {abs_path}")
    return "simulation"


def process_broadcast_pipeline(script_text: str, language: str, avatar_id: str):
    """Full end-to-end pipeline executed in a background thread."""
    lang_norm = LANG_MAP.get(language, "en")
    start_ts = time.time()

    audio_path = synthesize_audio(script_text, language, avatar_id)
    channel = push_to_a2f(audio_path, avatar_id) if audio_path else "none"

    record = {
        "avatar_id": avatar_id,
        "language": lang_norm,
        "channel": channel,
        "text_preview": script_text[:80] + ("…" if len(script_text) > 80 else ""),
        "audio_path": audio_path,
        "latency_ms": round((time.time() - start_ts) * 1000),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    broadcast_log.append(record)
    if len(broadcast_log) > 100:
        broadcast_log.pop(0)
    _log(f"✨ Broadcast complete: {record['avatar_id']} [{record['channel']}] {record['latency_ms']}ms")


# ─── FastAPI App ─────────────────────────────────────────────────────────────

if USE_FASTAPI:
    app = FastAPI(
        title="Astra AI Doctor Broadcast Engine",
        description=(
            "Production multilingual avatar broadcast hub for NVIDIA Audio2Face + "
            "Astra Clinical AI. Connects EMR → gTTS/Azure → Audio2Face → UE5 MetaHuman."
        ),
        version="2.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Request Models ──────────────────────────────────────────────────────

    class BroadcastRequest(BaseModel):
        script_text: str = Field(..., description="Medical text to synthesize and broadcast")
        language: Literal["te", "te-IN", "hi", "hi-IN", "en", "en-IN", "en-US"] = Field(
            "en", description="Target language code"
        )
        avatar_id: str = Field("reception_avatar_1", description="Target avatar node ID")

    class EMRAlertRequest(BaseModel):
        patient_name: str
        uhid: str
        diagnosis: str
        priority: Literal["CRITICAL", "URGENT", "ROUTINE"] = "ROUTINE"
        language: Literal["te", "hi", "en"] = "en"
        avatar_id: str = "reception_avatar_1"

    # ── Endpoints ───────────────────────────────────────────────────────────

    @app.get("/api/v1/status", tags=["Health"])
    async def status():
        return {
            "service": "Astra Broadcast Engine",
            "version": "2.0",
            "status": "READY",
            "port": PORT,
            "gtts_available": USE_GTTS,
            "a2f_local": A2F_LOCAL_URL,
            "a2f_omniverse": A2F_OMNIVERSE_JSONRPC,
            "broadcasts_total": len(broadcast_log),
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    @app.get("/health", tags=["Health"])
    async def health():
        return {"status": "ok", "port": PORT}

    @app.post("/api/v1/broadcast", tags=["Broadcast"])
    async def trigger_broadcast(payload: BroadcastRequest, background_tasks: BackgroundTasks):
        """
        Send a multilingual medical script to the AI Doctor avatar for immediate lip-sync broadcast.

        Example Telugu payload:
        ```json
        {
          "script_text": "నమస్కారం, దయచేసి ప్రతిరోజూ ఉదయం మీ రక్తపోటు మందులను వేసుకోవడం మర్చిపోకండి.",
          "language": "te",
          "avatar_id": "reception_avatar_1"
        }
        ```
        """
        background_tasks.add_task(
            process_broadcast_pipeline,
            payload.script_text,
            payload.language,
            payload.avatar_id
        )
        return {
            "status": "queued",
            "message": f"Broadcast for '{payload.avatar_id}' is processing in the background.",
            "language": payload.language,
            "preview": payload.script_text[:60] + ("…" if len(payload.script_text) > 60 else ""),
        }

    @app.post("/api/v1/emr-alert", tags=["EMR Integration"])
    async def emr_alert_broadcast(payload: EMRAlertRequest, background_tasks: BackgroundTasks):
        """
        Automatically generate and broadcast a clinical EMR alert in the target language.
        Triggered by Astra Co-Pilot when a patient's diagnostic report is ready.
        """
        TEMPLATES = {
            "en": (
                f"Attention. Patient {payload.patient_name}, UHID {payload.uhid}. "
                f"Diagnostic update: {payload.diagnosis}. Priority: {payload.priority}. "
                "Please proceed to the doctor's consultation room."
            ),
            "hi": (
                f"सूचना। रोगी {payload.patient_name}, यूएचआईडी {payload.uhid}। "
                f"निदान अपडेट: {payload.diagnosis}। प्राथमिकता: {payload.priority}। "
                "कृपया चिकित्सक परामर्श कक्ष में जाएं।"
            ),
            "te": (
                f"దృష్టికి తెండి. రోగి {payload.patient_name}, UHID {payload.uhid}. "
                f"నిర్ధారణ నవీకరణ: {payload.diagnosis}. ప్రాధాన్యత: {payload.priority}. "
                "దయచేసి వైద్యుని సంప్రదింపు గదికి వెళ్ళండి."
            ),
        }
        lang = LANG_MAP.get(payload.language, "en")
        script = TEMPLATES.get(lang, TEMPLATES["en"])

        background_tasks.add_task(
            process_broadcast_pipeline,
            script,
            payload.language,
            payload.avatar_id
        )
        return {
            "status": "queued",
            "script": script,
            "patient": payload.patient_name,
            "priority": payload.priority,
            "language": lang,
        }

    @app.get("/api/v1/history", tags=["Broadcast"])
    async def broadcast_history(limit: int = 20):
        """Return recent broadcast history (latest first)."""
        return {
            "total": len(broadcast_log),
            "limit": limit,
            "broadcasts": list(reversed(broadcast_log))[:limit],
        }


# ─── Fallback plain HTTP server (if FastAPI not installed) ──────────────────

class FallbackHandler(BaseHTTPRequestHandler):
    def _json(self, data, code=200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._json({"ok": True})

    def do_GET(self):
        if self.path in ("/health", "/api/v1/status"):
            self._json({"status": "READY", "port": PORT, "mode": "fallback_http"})
        elif self.path == "/api/v1/history":
            self._json({"total": len(broadcast_log), "broadcasts": list(reversed(broadcast_log))[:20]})
        else:
            self._json({"error": "Not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
        except Exception:
            self._json({"error": "Invalid JSON"}, 400)
            return

        path = self.path.split("?")[0]
        if path in ("/api/v1/broadcast",):
            text = body.get("script_text", body.get("text", ""))
            lang = body.get("language", "en")
            avatar_id = body.get("avatar_id", "reception_avatar_1")
            t = threading.Thread(
                target=process_broadcast_pipeline,
                args=(text, lang, avatar_id), daemon=True
            )
            t.start()
            self._json({"status": "queued", "language": lang, "avatar_id": avatar_id})
        else:
            self._json({"error": "Not found"}, 404)

    def log_message(self, fmt, *args):
        _log(f"HTTP {args[0]} {args[1]} {args[2]}")


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _log("=" * 60)
    _log("  ASTRA AI DOCTOR BROADCAST ENGINE v2.0")
    _log(f"  Port: {PORT}")
    _log(f"  gTTS: {'✅' if USE_GTTS else '⚠️  Not installed (pip install gTTS)'}")
    _log(f"  FastAPI: {'✅' if USE_FASTAPI else '⚠️  Not installed — using fallback HTTP'}")
    _log(f"  Audio2Face local: {A2F_LOCAL_URL}")
    _log(f"  Broadcasts dir: {os.path.abspath(BROADCASTS_DIR)}")
    _log("=" * 60)

    if USE_FASTAPI:
        uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
    else:
        _log("⚠️  FastAPI unavailable. Starting minimal fallback HTTP server.")
        _log("💡 Run: pip install fastapi uvicorn for full features + Swagger UI")
        server = HTTPServer(("0.0.0.0", PORT), FallbackHandler)
        _log(f"🌐 Broadcast Engine (fallback) live at http://127.0.0.1:{PORT}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            _log("🛑 Shutdown.")
