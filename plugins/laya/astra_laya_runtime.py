"""Astra ↔ Laya isolated loopback runtime.

Runs the cloned Laya checkpoints behind a tiny HTTP surface so Astra never
imports Python or torch:

    POST /v1/decide   {"task": "...", "state": "...", "questions": {...}}
    GET  /v1/health

Design rules (see the Astra Laya rules):
  * loopback only (127.0.0.1) — never exposed to the network;
  * the Router keeps every checkpoint resident, so language flips cost
    detection only (README: lazy Router reloads a model per switch, 7-10 s);
  * bounded tasks only — the endpoint refuses anything that looks like a
    "diagnose this patient" question;
  * no Astra dependency: if this process is not running, Astra degrades gently.

Run (from the laya clone, inside its venv):

    .\\.venv\\Scripts\\python.exe astra_laya_runtime.py --port 8791
"""
from __future__ import annotations

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Approved bounded tasks — mirrors src/astra/plugins/layaDecision.ts
BOUNDED_TASKS = {
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

# Words that indicate a request to *diagnose*, which Laya must never answer.
DIAGNOSTIC_MARKERS = (
    "what disease",
    "diagnose",
    "diagnosis",
    "probability the patient",
    "does this patient have",
)

_router = None


def get_router():
    """Build one Router, preloaded, so no request rebuilds a checkpoint."""
    global _router
    if _router is None:
        from laya import Router  # imported lazily: keep startup errors explicit

        _router = Router(preload=True)
    return _router


def run_decision(task: str, state, questions: dict, model: str | None) -> dict:
    if task not in BOUNDED_TASKS:
        return {"ok": False, "error": "task not in approved bounded task list"}
    if not isinstance(questions, dict) or not questions:
        return {"ok": False, "error": "questions must be a non-empty object"}

    text = state if isinstance(state, str) else json.dumps(state, ensure_ascii=False)
    lowered = text.lower()
    for marker in DIAGNOSTIC_MARKERS:
        if marker in lowered:
            return {
                "ok": False,
                "error": "diagnostic questions are outside Laya's approved scope",
            }

    router = get_router()
    result = router.predict(state, questions, model=model) if model else router.predict(state, questions)

    routing = result.get("routing")
    if hasattr(routing, "__dict__"):
        routing = {k: v for k, v in vars(routing).items() if not k.startswith("_")}
    return {
        "ok": True,
        "model": result.get("model"),
        "routing": routing,
        "answers": result.get("answers", {}),
        "usage": result.get("usage"),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "AstraLayaRuntime/1.0"

    def _send(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # keep the console quiet
        return

    def do_GET(self):  # noqa: N802
        if self.path.rstrip("/") != "/v1/health":
            self._send({"ok": False, "error": "not found"}, 404)
            return
        self._send(
            {
                "ok": True,
                "modelLoaded": _router is not None,
                "device": getattr(getattr(_router, "device", None), "type", None),
                "boundedTasks": sorted(BOUNDED_TASKS),
            }
        )

    def do_POST(self):  # noqa: N802
        if self.path.rstrip("/") != "/v1/decide":
            self._send({"ok": False, "error": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            request = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, TypeError) as exc:
            self._send({"ok": False, "error": "invalid JSON: %s" % exc}, 400)
            return

        started = time.time()
        try:
            payload = run_decision(
                task=request.get("task", ""),
                state=request.get("state", ""),
                questions=request.get("questions", {}),
                model=request.get("model"),
            )
        except Exception as exc:  # noqa: BLE001 — report, never crash the server
            payload = {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}
        payload["latencyMs"] = int((time.time() - started) * 1000)
        self._send(payload, 200 if payload.get("ok") else 503)


def main() -> None:
    parser = argparse.ArgumentParser(description="Astra isolation shim for the Laya router")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8791)
    parser.add_argument(
        "--preload",
        default="english,multilingual",
        help="comma-separated checkpoints to keep resident (avoids 7-10 s reloads)",
    )
    args = parser.parse_args()

    from laya import Router

    global _router
    _router = Router(preload=True)
    _router.preload([c.strip() for c in args.preload.split(",") if c.strip()])
    print("Astra Laya runtime on http://%s:%d (tasks: %d)" % (args.host, args.port, len(BOUNDED_TASKS)))
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
