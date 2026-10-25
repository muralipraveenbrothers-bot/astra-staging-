"""
ASTRA — ISOLATED LAYA SYSTEM-1 RUNTIME (loopback HTTP)
============================================================================
The ONLY process that imports Laya. Astra core talks to it through
LayaDecisionAdapter over 127.0.0.1 and degrades gracefully when it is down.

    Astra  →  LayaDecisionAdapter  →  this runtime  →  Laya checkpoints

Run (from the isolated venv — never globally):

    cd "D:\\astra PM\\plugins\\laya"
    .\\.venv\\Scripts\\Activate.ps1
    python astra_laya_server.py --port 8791 --preload

Endpoints
---------
    GET  /v1/health   → { ok, reachable, modelLoaded, device, router }
    POST /v1/decide   → { ok, answers, routing, model }

Contract notes
--------------
• Laya typed outputs are choice / score / noul + routing confidence. This
  runtime NEVER interprets them as clinical probability, and it refuses any
  question outside the approved bounded-task whitelist supplied in the request.
• The server is stdlib-only apart from Laya itself: no extra web framework is
  installed into the isolated environment.
"""

from __future__ import annotations

import argparse
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict

ROUTER = None
ROUTER_LOCK = threading.Lock()
ROUTER_ERROR: str | None = None
DEVICE: str | None = None
MODEL_NAME = "convaiinnovations/laya"

# Bounded tasks Astra may ask about. Kept here as a server-side duplicate of the
# client whitelist so a compromised/incorrect client cannot widen Laya's scope.
ALLOWED_TASKS = {
    "language_routing",
    "intent_routing",
    "department_routing",
    "command_type",
    "urgency_classification",
    "workflow_priority",
    "document_classification",
    "missing_data_flag",
    "possible_emergency_flag",
    "action_risk_level",
    "needs_human_confirmation",
    "note_type",
    "message_triage",
}


def get_router(device: str | None):
    """Build the Laya Router once (thread-safe). Raises on import failure."""
    global ROUTER, ROUTER_ERROR, DEVICE
    if ROUTER is not None:
        return ROUTER
    with ROUTER_LOCK:
        if ROUTER is not None:
            return ROUTER
        try:
            from laya import Router  # imported lazily: keeps /v1/health alive

            router = Router(preload=True, device=device) if device else Router(preload=True)
            ROUTER = router
            DEVICE = device or getattr(router, "device", "auto")
            ROUTER_ERROR = None
            return ROUTER
        except Exception as exc:  # pragma: no cover - environment dependent
            ROUTER_ERROR = "%s: %s" % (type(exc).__name__, exc)
            raise


class Handler(BaseHTTPRequestHandler):
    server_version = "AstraLayaRuntime/1.0"

    # ---------------------------------------------------------------- helpers
    def _send(self, code: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:  # quieter console
        print("[laya] " + fmt % args, flush=True)

    # ------------------------------------------------------------------ routes
    def do_GET(self) -> None:  # noqa: N802 - stdlib naming
        if self.path.rstrip("/") != "/v1/health":
            self._send(404, {"ok": False, "error": "unknown path"})
            return
        self._send(
            200,
            {
                "ok": True,
                "reachable": True,
                "modelLoaded": ROUTER is not None,
                "device": DEVICE,
                "router": "laya",
                "error": ROUTER_ERROR,
            },
        )

    def do_POST(self) -> None:  # noqa: N802 - stdlib naming
        if self.path.rstrip("/") != "/v1/decide":
            self._send(404, {"ok": False, "error": "unknown path"})
            return

        try:
            length = int(self.headers.get("content-length") or 0)
            request = json.loads(self.rfile.read(length) or b"{}")
        except Exception as exc:
            self._send(400, {"ok": False, "error": "bad request: %s" % exc})
            return

        task = request.get("task")
        questions = request.get("questions")
        state = request.get("state")

        if task not in ALLOWED_TASKS:
            # Explicit refusal: Laya is never asked to diagnose.
            self._send(
                403,
                {
                    "ok": False,
                    "error": "task %r is not an approved bounded Laya task" % (task,),
                },
            )
            return
        if not isinstance(questions, dict) or not questions:
            self._send(400, {"ok": False, "error": "questions must be a non-empty object"})
            return
        if state is None:
            self._send(400, {"ok": False, "error": "state is required"})
            return

        started = time.perf_counter()
        try:
            router = get_router(None)
            # Laya's Router selects english / multilingual / typed-decisions from
            # the script and language of the state, and reports why.
            result = router.predict(state, questions)
        except Exception as exc:
            self._send(
                503,
                {
                    "ok": False,
                    "error": "laya unavailable: %s: %s" % (type(exc).__name__, exc),
                },
            )
            return

        latency_ms = int((time.perf_counter() - started) * 1000)
        self._send(
            200,
            {
                "ok": True,
                "task": task,
                "answers": result.get("answers", {}),
                "routing": result.get("routing"),
                "model": result.get("model", MODEL_NAME),
                "latencyMs": latency_ms,
            },
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Astra isolated Laya System-1 runtime")
    parser.add_argument("--host", default="127.0.0.1", help="loopback only by default")
    parser.add_argument("--port", type=int, default=8791)
    parser.add_argument("--device", default=None, help="cuda | cpu | mps (default: Laya decides)")
    parser.add_argument("--preload", action="store_true", help="load checkpoints before serving")
    args = parser.parse_args()

    if args.preload:
        try:
            get_router(args.device)
            print("[laya] checkpoints preloaded on %s" % (DEVICE or "auto"), flush=True)
        except Exception as exc:
            print("[laya] preload failed, serving degraded: %s" % exc, flush=True)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print("[laya] Astra Laya runtime on http://%s:%d" % (args.host, args.port), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
