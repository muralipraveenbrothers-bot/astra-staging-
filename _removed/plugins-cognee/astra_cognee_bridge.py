"""
ASTRA ↔ COGNEE LONG-TERM MEMORY BRIDGE (isolated, loopback)
============================================================================
Cognee is Astra's LONG-TERM memory engine behind AstraMemoryGateway. It is NOT
the EMR and NOT a dumping ground: patient clinical facts never enter it.

    Astra agent → AstraMemoryGateway → CogneeHttpAdapter → this bridge → Cognee

Endpoints (must stay in sync with src/features/mayin/memory/AstraMemoryGateway.ts)

    GET  /v1/health            → { ok, reachable, databaseReachable, ... }
    POST /v1/memory/remember   → MemoryRecord  → { ok: true }
    POST /v1/memory/recall     → RecallQuery   → MemoryRecord[]
    POST /v1/memory/improve    → MemoryRecord  → { ok: true }
    POST /v1/memory/forget     → { id }        → { ok: true }

Hard rules enforced here (server side, so a misbehaving client cannot bypass them)
  • Loopback only. Never bound to a routable interface without explicit opt-in.
  • Patient-scoped records are REFUSED: patient facts belong to the EMR. Only
    non-patient institutional scopes (astra:system / hospital / doctor / …).
  • Namespace → dataset mapping keeps scopes physically separated in Cognee.
  • recall returns only records that round-trip as their original JSON; anything
    unparseable is dropped, never guessed or reconstructed (§48 no fabrication).
  • If Cognee (or its LLM provider) is unavailable, /v1/health reports it and
    every other endpoint returns 503. Astra keeps working without long-term
    memory retrievability; nothing is faked.

Run (from the cognee clone, inside its own isolated venv — never globally):

    cd "D:\\astra PM\\plugins\\cognee"
    .\\.venv\\Scripts\\python.exe astra_cognee_bridge.py --port 8792

Cognee needs an LLM provider for cognify/embeddings. Configure it through the
environment or the clone's own .env — never hardcode secrets in Astra source.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional

BRIDGE_VERSION = "1.0"

# Prefix that lets us recognise our own records when Cognee returns chunks,
# so arbitrary graph text can never be mistaken for an Astra memory record.
RECORD_MARKER = "ASTRA_MEMORY_RECORD::"

# Namespace → dataset. Cognee datasets are the physical isolation unit.
NAMESPACE_PREFIX = "astra__"

ALLOWED_NAMESPACE_ROOTS = (
    "astra:system",
    "astra:hospital",
    "astra:doctor:",
    "astra:department:",
    "astra:agent:",
    "astra:workflow",
)

# Vocabulary copied from AstraMemoryGateway so the bridge can reject unknown
# record types even if a client is wrong or compromised.
ALLOWED_MEMORY_TYPES = {
    "doctor_preference",
    "hospital_rule",
    "workflow_rule",
    "approved_clinical_rule",
    "agent_lesson",
    "system_decision",
    "department_process",
    "user_preference",
    "session_summary",
}

_cognee = None
_cognee_error: Optional[str] = None
_lock = threading.Lock()
_last_remember: Optional[str] = None
_last_recall: Optional[str] = None
_queued = 0
# Astra record id -> (cognee data UUID, dataset). Process-local by design:
# cognee.forget() requires (data_id: UUID, dataset) while Astra ids are
# "MEM-*" strings; after a bridge restart the map is gone and forget fails
# loudly (operator prunes the namespace dataset) — never a silent fake delete.
_id_map: Dict[str, Any] = {}


def dataset_for_namespace(namespace: str) -> str:
    """Physically separate each Astra namespace into its own Cognee dataset."""
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", namespace.strip())
    return NAMESPACE_PREFIX + safe


def namespace_allowed(namespace: str) -> bool:
    if not namespace or namespace.startswith("astra:patient:"):
        return False
    return any(namespace.startswith(root) for root in ALLOWED_NAMESPACE_ROOTS)


def get_cognee():
    """Import Cognee once. Raises when it is not installed in this venv."""
    global _cognee, _cognee_error
    if _cognee is not None:
        return _cognee
    with _lock:
        if _cognee is not None:
            return _cognee
        try:
            import cognee  # local import: /v1/health stays alive without it

            _cognee = cognee
            _cognee_error = None
            return _cognee
        except Exception as exc:  # pragma: no cover - environment dependent
            _cognee_error = "%s: %s" % (type(exc).__name__, exc)
            raise


def llm_configured() -> bool:
    """Cognee needs an LLM/embedding provider; report it instead of guessing."""
    keys = (
        "LLM_API_KEY",
        "OPENAI_API_KEY",
        "GEMINI_API_KEY",
        "ANTHROPIC_API_KEY",
        "MISTRAL_API_KEY",
        "ASTRA_COGNEE_LLM_API_KEY",
    )
    return any(os.environ.get(k) for k in keys)


def validate_record(record: Dict[str, Any], *, for_write: bool) -> Optional[str]:
    """Return an error string when the record must not be accepted."""
    if not isinstance(record, dict):
        return "record must be an object"
    scope = record.get("scope") or {}
    if not isinstance(scope, dict):
        return "scope must be an object"

    # EMR separation: patient-scoped memory is never written to Cognee.
    if scope.get("patientId"):
        return "patient_scoped_memory_is_refused_terminal_record_belongs_to_emr"

    namespace = str(scope.get("namespace") or "")
    if not namespace_allowed(namespace):
        return "namespace %r is not an approved Astra memory namespace" % (namespace,)

    if for_write:
        if record.get("type") not in ALLOWED_MEMORY_TYPES:
            return "type %r is not an approved Astra memory type" % (record.get("type"),)
        provenance = record.get("provenance") or {}
        if provenance.get("approval") != "approved":
            return "only approved memories may be persisted (approval=%r)" % (
                provenance.get("approval"),
            )
        if not record.get("id"):
            return "id is required"
    return None


async def _remember_async(record: Dict[str, Any]) -> None:
    global _last_remember
    cognee = get_cognee()
    from cognee.tasks.ingestion.data_item import DataItem  # cognee-optional import

    dataset = dataset_for_namespace(str(record["scope"]["namespace"]))
    payload = RECORD_MARKER + json.dumps(record, ensure_ascii=False)
    # one record per call keeps chunks aligned with records; the explicit
    # data_id lets a later forget() target exactly this record's dataset row.
    data_id = uuid.uuid4()
    item = DataItem(data=payload, data_id=data_id)
    await cognee.remember(item, dataset_name=dataset)
    with _lock:
        _id_map[str(record["id"])] = (data_id, dataset)
    _last_remember = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


async def _recall_async(query: Dict[str, Any]) -> List[Dict[str, Any]]:
    global _last_recall
    # Scope refusal BEFORE touching cognee: a patient-scoped or unknown-namespace
    # query is answered 400 even when the Cognee backend is unavailable.
    scope = query.get("scope") or {}
    namespace = str(scope.get("namespace") or "")
    err = validate_record({"type": "session_summary", "scope": scope}, for_write=False)
    if err:
        raise ValueError(err)
    if scope.get("patientId"):
        # Defensive: a patient-scoped read is refused outright.
        raise ValueError("patient_scoped_recall_is_refused")

    cognee = get_cognee()
    from cognee.modules.search.types import SearchType  # cognee-optional import

    text = str(query.get("text") or "*")
    limit = int(query.get("limit") or 5)
    dataset = dataset_for_namespace(namespace)

    chunks = None
    try:
        chunks = await cognee.recall(
            text,
            # cognee dereferences .value internally — a plain str raises
            # AttributeError; SearchType(str, Enum) members carry it.
            query_type=SearchType.CHUNKS,
            datasets=[dataset],
            top_k=limit,
            only_context=True,
        )
    except Exception as exc:
        # A namespace nobody has written to yet has no dataset — that is an
        # honest empty recall (zero records), not a server fault. Everything
        # else still propagates as 503; nothing is fabricated either way.
        if "DatasetNotFound" in type(exc).__name__ or "DatasetNotFound" in str(exc):
            return []
        raise
    _last_recall = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    records: List[Dict[str, Any]] = []
    seen_ids: set = set()

    def _strings(obj: Any) -> List[str]:
        # RecallResponse is a pydantic discriminated union; embedded record
        # JSON must be read from RAW field values (model_dump) — serialising
        # the model first would escape the marker payload and break parsing.
        if isinstance(obj, str):
            return [obj]
        if isinstance(obj, dict):
            return [s for v in obj.values() for s in _strings(v)]
        if isinstance(obj, (list, tuple)):
            return [s for v in obj for s in _strings(v)]
        dump = getattr(obj, "model_dump", None)
        if callable(dump):
            try:
                return _strings(dump())
            except Exception:
                return [str(obj)]
        return [str(obj)]

    items = chunks if isinstance(chunks, list) else [chunks]
    for item in items:
        for text_item in _strings(item):
            for candidate in text_item.split(RECORD_MARKER)[1:]:
                raw = candidate.strip()
                if not raw:
                    continue
                try:
                    parsed = json.loads(raw)
                except Exception:
                    # Never reconstruct: an unparseable chunk is dropped.
                    continue
                if isinstance(parsed, dict) and parsed.get("id"):
                    # Re-assert isolation on the way out.
                    parsed_ns = str((parsed.get("scope") or {}).get("namespace") or "")
                    if parsed_ns == namespace and not (
                        parsed.get("scope") or {}
                    ).get("patientId"):
                        # One record can appear in several retrieved chunks —
                        # dedupe by id so callers see records, not chunks.
                        if parsed["id"] not in seen_ids:
                            seen_ids.add(parsed["id"])
                            records.append(parsed)
    return records[:limit]


async def _forget_async(record_id: str) -> None:
    cognee = get_cognee()
    with _lock:
        entry = _id_map.get(record_id)
    if entry is None:
        # Process-local map lost (restart) — cognee.forget needs a UUID and
        # dataset; guessing would risk deleting the wrong data. Never fake it.
        raise KeyError("id_not_mapped_in_this_process")
    data_id, dataset = entry
    await cognee.forget(data_id=data_id, dataset=dataset)
    with _lock:
        _id_map.pop(record_id, None)


# ---------------------------------------------------------------------------
# HTTP surface — routes mirror CogneeHttpAdapter (AstraMemoryGateway.ts):
#   GET  /v1/health            -> { ok, reachable, databaseReachable, ... }
#   POST /v1/memory/remember   -> MemoryRecord  -> { ok: true }
#   POST /v1/memory/recall     -> RecallQuery   -> MemoryRecord[]  (bare array)
#   POST /v1/memory/improve    -> MemoryRecord  -> { ok: true }
#   POST /v1/memory/forget     -> { id }        -> { ok: true }
# ---------------------------------------------------------------------------

_LOOP: Optional[asyncio.AbstractEventLoop] = None
_LOOP_THREAD: Optional[threading.Thread] = None

# Origins allowed to call this loopback bridge from a browser (the Astra UI).
# The service itself only ever binds 127.0.0.1; this list gates CORS only.
CORS_ALLOWED_ORIGINS = frozenset(
    {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
)


def _start_loop() -> asyncio.AbstractEventLoop:
    """One dedicated event loop for ALL bridge requests.

    Cognee module state (locks, pools) binds to the first loop it sees;
    ThreadingHTTPServer runs each request on its own thread, so every
    coroutine is submitted to this single loop via run_coroutine_threadsafe.
    """
    global _LOOP, _LOOP_THREAD
    if _LOOP is None:
        _LOOP = asyncio.new_event_loop()
        _LOOP_THREAD = threading.Thread(
            target=_LOOP.run_forever, name="cognee-bridge-loop", daemon=True
        )
        _LOOP_THREAD.start()
    return _LOOP


def _run(coro: Any, timeout: float = 180.0) -> Any:
    loop = _start_loop()
    return asyncio.run_coroutine_threadsafe(coro, loop).result(timeout=timeout)


class _BridgeHandler(BaseHTTPRequestHandler):
    server_version = "AstraCogneeBridge/" + BRIDGE_VERSION

    def _send(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin in CORS_ALLOWED_ORIGINS:
            # The Astra UI (Vite :5173/:4173, server :3000) calls this
            # loopback bridge directly — preflighted JSON POSTs need ACAO.
            self.send_header("Access-Control-Allow-Origin", origin)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        # CORS preflight for the Astra UI origins only (loopback service).
        origin = self.headers.get("Origin")
        self.send_response(204)
        if origin in CORS_ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "content-type")
            self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _loopback_ok(self) -> bool:
        # Defence in depth: even if rebound, only this machine may talk to
        # the bridge (docstring hard rule #1 — loopback only).
        return self.client_address[0] in ("127.0.0.1", "::1", "localhost")

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write(
            "[%s] %s\n"
            % (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), fmt % args)
        )

    def _execute(self, coro: Any, timeout: float = 180.0) -> Any:
        global _queued
        with _lock:
            _queued += 1
        try:
            return _run(coro, timeout=timeout)
        finally:
            with _lock:
                _queued -= 1

    def do_GET(self) -> None:
        if not self._loopback_ok():
            self._send(403, {"ok": False, "error": "loopback_only"})
            return
        if self.path.split("?")[0] in ("/v1/health", "/health"):
            self._health()
        else:
            self._send(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:
        if not self._loopback_ok():
            self._send(403, {"ok": False, "error": "loopback_only"})
            return
        route = self.path.split("?")[0]
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length > 0 else b"{}"
            body = json.loads(raw.decode("utf-8") or "{}")
            if not isinstance(body, dict):
                raise ValueError("body must be a JSON object")
        except (ValueError, UnicodeDecodeError) as exc:
            self._send(400, {"ok": False, "error": "invalid_json: %s" % exc})
            return

        if route in ("/v1/memory/remember", "/v1/memory/improve"):
            # improve = validated re-remember (AstraMemoryGateway §33).
            self._remember(body)
        elif route == "/v1/memory/recall":
            self._recall(body)
        elif route == "/v1/memory/forget":
            self._forget(body)
        else:
            self._send(404, {"ok": False, "error": "not_found"})

    # -- routes -----------------------------------------------------------

    def _health(self) -> None:
        # databaseReachable: cognee package + its DB config import cleanly.
        # Deep connectivity is exercised lazily by the first remember — this
        # probe stays honest rather than faking a query it did not run.
        cognee_ok = False
        err = None
        try:
            get_cognee()
            cognee_ok = True
        except Exception as exc:
            err = "%s: %s" % (type(exc).__name__, exc)
        payload: Dict[str, Any] = {
            "ok": cognee_ok,
            "reachable": cognee_ok,
            "databaseReachable": cognee_ok,
            "llmConfigured": llm_configured(),
            "queued": _queued,
            "lastRemember": _last_remember,
            "lastRecall": _last_recall,
            "version": BRIDGE_VERSION,
        }
        if err:
            payload["error"] = err
        self._send(200 if cognee_ok else 503, payload)

    def _remember(self, body: Dict[str, Any]) -> None:
        err = validate_record(body, for_write=True)
        if err:
            # Patient scope is a POLICY refusal (403); schema/type problems
            # are a malformed request (400).
            status = 403 if "refused" in err else 400
            self._send(status, {"ok": False, "error": err})
            return
        try:
            self._execute(_remember_async(body))
        except ValueError as exc:
            self._send(400, {"ok": False, "error": str(exc)})
            return
        except Exception as exc:
            # Cognee (or its LLM provider) unavailable -> 503; Astra keeps
            # working without long-term memory writes (nothing is faked).
            self._send(
                503, {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}
            )
            return
        self._send(200, {"ok": True})

    def _recall(self, body: Dict[str, Any]) -> None:
        try:
            records = self._execute(_recall_async(body), timeout=60.0)
        except ValueError as exc:
            msg = str(exc)
            status = 403 if "refused" in msg else 400
            self._send(status, {"ok": False, "error": msg})
            return
        except Exception as exc:
            self._send(
                503, {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}
            )
            return
        # CogneeHttpAdapter expects a BARE MemoryRecord[] as the response body.
        self._send(200, records)

    def _forget(self, body: Dict[str, Any]) -> None:
        record_id = str(body.get("id") or "")
        if not record_id:
            self._send(400, {"ok": False, "error": "id is required"})
            return
        try:
            self._execute(_forget_async(record_id), timeout=60.0)
        except KeyError as exc:
            # Id not in this process's map — honest 409, never a fake delete.
            self._send(
                409, {"ok": False, "error": str(exc.args[0] if exc.args else exc)}
            )
            return
        except Exception as exc:
            self._send(
                503, {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}
            )
            return
        self._send(200, {"ok": True})


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ASTRA <-> Cognee long-term memory bridge (loopback only)"
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="bind address; loopback only (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port", type=int, default=8792, help="listen port (default: 8792)"
    )
    args = parser.parse_args()

    if args.host not in ("127.0.0.1", "::1", "localhost"):
        raise SystemExit(
            "refusing non-loopback bind %r — the bridge is loopback-only "
            "(docstring hard rule #1)" % (args.host,)
        )

    _start_loop()
    server = ThreadingHTTPServer((args.host, args.port), _BridgeHandler)
    print(
        "astra cognee bridge listening on http://%s:%d (loopback only)"
        % (args.host, args.port),
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if _LOOP is not None:
            _LOOP.call_soon_threadsafe(_LOOP.stop)


if __name__ == "__main__":
    main()
