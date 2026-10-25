#!/usr/bin/env python3
"""
Astra — Laya System-1 runtime server (isolated, loopback only)

Host: http://127.0.0.1:8791
Entry points mirrored from the TypeScript adapter contract
(src/astra/plugins/layaDecision.ts):

    POST /v1/decide      { task, state, questions }  -> { ok, answers, routing?, model? }
    GET  /v1/health      -> { reachable, modelLoaded?, device? }

This server wraps the already-installed `laya` Python package
(plugins/laya/.venv, version 0.3.6).

ISOLATION CONTRACT (mirrors the TS adapter):
  * Astra frontend never imports Laya; only this loopback server does.
  * An Astra API key is NEVER used as a TTS key and never leaves Astra's own
    routing path. Laya only receives typed decision questions.
  * All numbers are ROUTING CONFIDENCE from a general checkpoint, never clinical
    probability. The server tags each response with scoreMeaning so the TS side
    can assert that invariant at the boundary.
  * If the server is stopped, Astra degrades gracefully — only rapid typed
    decision acceleration is lost (failure rule).
"""

from __future__ import annotations

import os
import json
import time
import logging
import asyncio
import threading
import ctypes
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Optional, List
from fastapi import FastAPI, Request
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

try:
    import laya  # type: ignore[import-not-found]
except ImportError as exc:  # pragma: no cover - startup failure
    raise RuntimeError(
        "laya Python package not importable. "
        "Use the venv at plugins/laya/.venv: "
        "plugins/laya/.venv/Scripts/python.exe -m pip install -e .\n"
        f"Original error: {exc}"
    ) from exc

from laya.router import DEFAULT_MODELS, Router, normalise_name  # type: ignore[import-not-found]

logger = logging.getLogger("astra.laya")

# ---------------------------------------------------------------------------
# Config — can be overridden via env for CI / different loops
# ---------------------------------------------------------------------------

DEFAULT_HOST = os.getenv("ASTRA_LAYA_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.getenv("ASTRA_LAYA_PORT", "8791"))
CHECKPOINTS = os.getenv(
    "ASTRA_LAYA_CHECKPOINTS",
    "english,multilingual",
).split(",")
LAYA_ENABLED = os.getenv("ASTRA_LAYA_ENABLED", "1").strip() != "0"
MINIMUM_LOAD_MEMORY_BYTES = 3 * 1024 * 1024 * 1024

LAYA_BOUNDED_TASKS = [
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
]

# Tasks the server will REFUSE to run, even if someone sends them. This is the
# server-side complement to the TS-side bounded-task allow-list.
ASTRA_DECISION_TASK_POLICY: Dict[str, str] = {
    **{t: "allowed" for t in LAYA_BOUNDED_TASKS},
    "diagnose_patient": "REJECTED: Laya is not a clinical reasoning model",
    "estimate_disease_probability": "REJECTED: Laya is not a calibrated clinical model",
    "triage_by_outcome_risk": "REJECTED: clinical risk requires calibrated models",
}

# Canonical list of approved bounded tasks — mirrors LAYA_BOUNDED_TASKS in the TS side.

# scoreMeaning — MUST be this exact string so the TS adapter can assert it.
SCORE_MEANING = "routing_confidence_not_clinical_probability"

# Laya's clinical calibration gate — mirrors LAYA_CLINICAL_CALIBRATION_REQUIREMENTS.
LAYA_CLINICAL_VALIDATION_GATE = [
    "sensitivity",
    "specificity",
    "AUROC",
    "PPV",
    "NPV",
    "Brier score",
    "calibration curve",
    "ECE",
    "subgroup performance",
    "external validation",
]

BUNDLED_MODEL_REPO = "convaiinnovations/laya"

# Map canonical task names to Laya model subfolder specs.
# The TS side sends "task" in the request; this server maps it to a model.
_TASK_MODEL_SPEC: Dict[str, Dict[str, str]] = {
    # default models use the bundled repo
    "language_routing": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "intent_routing": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "department_routing": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "command_type": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "urgency_classification": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "workflow_priority": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "document_classification": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "missing_data_flag": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "possible_emergency_flag": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "action_risk_level": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "needs_human_confirmation": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "note_type": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
    "message_triage": {"repo": BUNDLED_MODEL_REPO, "subfolder": None},
}

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class DecideRequest(BaseModel):
    task: str
    state: Optional[str] = None
    state_dict: Optional[Dict[str, Any]] = None
    questions: Optional[Dict[str, Any]] = None
    checkpoint: Optional[str] = None


class BatchSchema(BaseModel):
    id: str
    version: int = 1
    kind: str
    question: str
    options: Optional[List[Dict[str, Any]]] = None
    levels: Optional[List[str]] = None


class DecideBatchRequest(BaseModel):
    state: Optional[str] = None
    state_dict: Optional[Dict[str, Any]] = None
    checkpoint: Optional[str] = None
    schemas: List[BatchSchema]


DecideBatchRequest.model_rebuild()
BatchSchema.model_rebuild()

class DecideResponse(BaseModel):
    ok: bool
    answers: Dict[str, Any]
    routing: Optional[Dict[str, Any]] = None
    model: Optional[str] = None
    scoreMeaning: str
    clinicalValidationGate: list
    latencyMs: int
    error: Optional[str] = None


class HealthResponse(BaseModel):
    reachable: bool
    modelLoaded: Optional[bool] = None
    device: Optional[str] = None
    checkpointsLoaded: Optional[list] = None
    version: str = "0.3.6"


# ---------------------------------------------------------------------------
# Router singleton (lazy-init on first request; preloaded in production)
# ---------------------------------------------------------------------------

_router: Optional[Router] = None
_router_initialized = False
_router_init_error: Optional[str] = None
_model_state = "loading"
_model_device: Optional[str] = None
_model_load_task: Optional[asyncio.Task] = None
_inference_lock = threading.Lock()
_model_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="astra-laya-model")
_schema_registry: Dict[str, Any] = {}


def _ensure_router() -> Router:
    """Lazy-initialize the Laya Router. Called on first /v1/decide request."""
    global _router, _router_initialized, _router_init_error

    if _router is not None:
        return _router

    if _router_init_error is not None:
        raise RuntimeError(_router_init_error)

    try:
        selected: List[str] = []
        for requested in CHECKPOINTS:
            checkpoint = normalise_name(requested)
            if checkpoint not in selected:
                selected.append(checkpoint)
        if not selected:
            raise ValueError("ASTRA_LAYA_CHECKPOINTS must name at least one supported checkpoint")

        selected_models = {name: DEFAULT_MODELS[name] for name in selected}
        logger.info("Initializing Laya Router (selected checkpoints: %s, preload=False, max_loaded=1)", selected)
        t0 = time.monotonic()
        _router = Router(
            models=selected_models,
            preload=False,
            max_loaded=1,
            default=selected[0],
        )
        # Load one configured checkpoint only. Other configured checkpoints are
        # loaded on demand and the router's one-item LRU evicts the previous one.
        _router.load(selected[0])

        init_ms = (time.monotonic() - t0) * 1000
        resident_bytes = _resident_memory_bytes()
        logger.info("Laya checkpoint loaded=%s elapsed_ms=%.1f resident_memory_bytes=%s", selected[0], init_ms, resident_bytes)

        _router_initialized = True
        return _router

    except Exception as exc:
        msg = f"Laya Router initialization failed: {exc}"
        logger.error(msg, exc_info=True)
        _router_init_error = msg
        raise RuntimeError(msg) from exc


async def _load_model_in_background() -> None:
    """Load the synchronous Laya model away from the ASGI event loop."""
    global _model_state, _model_device
    if not LAYA_ENABLED:
        _model_state = "disabled"
        logger.info("Laya model load skipped (ASTRA_LAYA_ENABLED=0)")
        return
    available_bytes = _available_memory_bytes()
    if not _has_minimum_load_memory(available_bytes):
        _model_state = "insufficient_memory"
        logger.error(
            "Laya model load skipped: available_memory_bytes=%s required_bytes=%s",
            available_bytes,
            MINIMUM_LOAD_MEMORY_BYTES,
        )
        return
    loop = asyncio.get_running_loop()
    try:
        router = await loop.run_in_executor(_model_executor, _ensure_router)
        _model_device = await loop.run_in_executor(_model_executor, _detect_device, router)
        _model_state = "ready"
        logger.info("Laya model ready (device=%s)", _model_device)
    except Exception:
        _model_state = "failed"
        # _ensure_router already logs the initialization exception.
        logger.error("Laya background model load failed")


class ModelNotReady(Exception):
    def __init__(self, state: str):
        self.state = state


class ModelBusy(Exception):
    pass


async def _run_model_call(operation):
    """Run one synchronous model operation; reject concurrent requests, do not queue."""
    global _model_state
    if _model_state != "ready":
        raise ModelNotReady(_model_state)
    if not _inference_lock.acquire(blocking=False):
        raise ModelBusy()

    _model_state = "busy"
    try:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(_model_executor, operation)
    finally:
        _model_state = "ready" if _router_init_error is None else "failed"
        _inference_lock.release()


def _model_unavailable_response(exc: Exception) -> JSONResponse:
    state = "busy" if isinstance(exc, ModelBusy) else exc.state
    return JSONResponse(
        status_code=503,
        content={
            "ok": False,
            "error": "Laya is busy" if state == "busy" else "Laya model is not ready",
            "state": state,
            "scoreMeaning": SCORE_MEANING,
            "clinicalValidationGate": LAYA_CLINICAL_VALIDATION_GATE,
        },
    )


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Astra Laya Runtime",
    description="Loopback-only System-1 decision server for Astra Hospital OS.",
    version="0.3.6",
    docs_url=None,
    redoc_url=None,
)

# The Astra UI runs on the Vite origin (5173/4173) while the adapter calls
# this loopback URL directly — preflighted JSON POSTs need an explicit
# allow-list. Origins are pinned to local dev/preview/server origins; the
# server itself only ever binds 127.0.0.1 (see DEFAULT_HOST).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["content-type"],
    max_age=600,
)


@app.middleware("http")
async def log_requests(request, call_next):
    """Log all requests with timing — useful for the diagnostics surface."""
    start = time.monotonic()
    try:
        response = await call_next(request)
        return response
    finally:
        elapsed = (time.monotonic() - start) * 1000
        logger.info(
            "%s %s %s %.1fms",
            request.method,
            request.url.path,
            response.status_code if "response" in dir() else "?",
            elapsed,
        )


def _status_to_bool(status: Any) -> bool:
    """Coerce an HTTP status code to a boolean reachability indicator."""
    if isinstance(status, int):
        return 200 <= status < 300
    if hasattr(status, "status_code"):
        return 200 <= status.status_code < 300
    return True



def _is_refused_task(task: str) -> bool:
    policy = ASTRA_DECISION_TASK_POLICY.get(task)
    if policy and policy != "allowed":
        return True
    lowered = (task or "").lower()
    return ("diagnos" in lowered) or ("prognos" in lowered) or ("disease_probability" in lowered)

def _state_text(state: Any) -> str:
    if isinstance(state, str):
        return state
    try:
        return json.dumps(state, ensure_ascii=False, sort_keys=True)
    except Exception:
        return str(state)


def _detect_checkpoint(state: Any, requested: Optional[str] = None) -> str:
    text = _state_text(state)
    has_telugu = any(0x0C00 <= ord(ch) <= 0x0C7F for ch in text)
    has_devanagari = any(0x0900 <= ord(ch) <= 0x097F for ch in text)
    roman = text.lower()
    roman_indic = any(token in roman.split() for token in [
        "naku", "jwaram", "noppi", "undi", "undhi", "cheppandi",
        "mujhe", "bukhar", "dard", "hai", "hain",
    ])
    if has_telugu or has_devanagari or roman_indic:
        return "multilingual"
    if requested in ("english", "multilingual"):
        return requested
    return "english"


def _questions_from_schema(schema: BatchSchema) -> Dict[str, Any]:
    if schema.kind == "choice":
        criteria = {option["key"]: option.get("description") or option.get("label") or option["key"] for option in (schema.options or [])}
        return {schema.id: {"type": "choice", "instructions": schema.question, "criteria": criteria}}
    if schema.kind == "score":
        return {schema.id: {"type": "score", "instructions": schema.question, "criteria": schema.levels or []}}
    return {schema.id: {"type": "noul", "instructions": schema.question}}


def _normalize_answer(schema_id: str, answer: Dict[str, Any]) -> Dict[str, Any]:
    probabilities = answer.get("probabilities") or {}
    if probabilities:
        ranked = sorted(probabilities.items(), key=lambda item: item[1], reverse=True)
        top_key, top_value = ranked[0]
        choice = answer.get("choice") or top_key
        return {"schemaId": schema_id, "answer": choice, "confidence": top_value, "scores": probabilities}
    if "noul" in answer:
        value = float(answer.get("noul") or 0)
        return {"schemaId": schema_id, "answer": "yes" if value >= 0.5 else "no", "confidence": value, "scores": {"yes": value, "no": 1 - value}}
    if "score" in answer:
        value = float(answer.get("score") or 0)
        return {"schemaId": schema_id, "answer": str(answer.get("choice") or "score"), "confidence": value, "scores": {}}
    return {"schemaId": schema_id, "answer": str(answer.get("choice") or "unknown"), "confidence": 0, "scores": {}}


# ---------------------------------------------------------------------------
# POST /v1/decide
# ---------------------------------------------------------------------------

@app.post("/v1/decide")
async def decide(request: DecideRequest) -> JSONResponse:
    """
    Execute ONE bounded typed decision using the Laya System-1 runtime.

    Mirrors the TS `LayaDecisionAdapter.decide()` contract exactly:
      - `task`       : one of LAYA_BOUNDED_TASKS
      - `state`      : text (string) or structured state (dict in `state_dict`)
      - `questions`  : question_id -> question_definition (optional; if absent
                        the server uses its own canonical templates)

    Returns:
      { ok: true, answers: {...}, routing: {...}, model: "...",
        scoreMeaning: "routing_confidence_not_clinical_probability",
        clinicalValidationGate: [...], latencyMs: N }

    On failure:
      { ok: false, error: "...", scoreMeaning: "...", latencyMs: N }
    """
    t0 = time.monotonic()

    # --- 1. Validate task against ASTRA_DECISION_TASK_POLICY ---
    task = request.task
    if task not in ASTRA_DECISION_TASK_POLICY:
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error": f"Unknown task '{task}'. Allowed tasks: {LAYA_BOUNDED_TASKS}",
                "scoreMeaning": SCORE_MEANING,
                "clinicalValidationGate": LAYA_CLINICAL_VALIDATION_GATE,
                "latencyMs": elapsed_ms,
            },
        )

    policy_result = ASTRA_DECISION_TASK_POLICY[task]
    if policy_result != "allowed":
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        return JSONResponse(
            status_code=403,
            content={
                "ok": False,
                "error": policy_result,
                "scoreMeaning": SCORE_MEANING,
                "clinicalValidationGate": LAYA_CLINICAL_VALIDATION_GATE,
                "latencyMs": elapsed_ms,
            },
        )

    # --- 2. Determine state (string or dict) ---
    if request.state is not None:
        state: Any = request.state
    elif request.state_dict is not None:
        state = request.state_dict
    else:
        state = ""

    # --- 3. Resolve questions (use TS-provided, or fall back to server-side defaults) ---
    if request.questions is not None and len(request.questions) > 0:
        questions = request.questions
    else:
        # Fallback: generate canonical question for this task.
        # This mirrors LAYA_TASK_QUESTIONS from the TS side.
        questions = _canonical_questions_for(task)

    # --- 4. Select model and run prediction ---
    model_name = _detect_checkpoint(state, request.checkpoint)

    try:
        result = await _run_model_call(
            lambda: _router.predict(
                state=state,
                questions=questions,
                model=model_name,
            )
        )
    except (ModelNotReady, ModelBusy) as exc:
        return _model_unavailable_response(exc)
    except Exception as exc:
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Laya predict failed for task '%s': %s", task, exc, exc_info=True)
        return JSONResponse(
            status_code=502,
            content={
                "ok": False,
                "error": f"Laya inference error: {exc}",
                "scoreMeaning": SCORE_MEANING,
                "clinicalValidationGate": LAYA_CLINICAL_VALIDATION_GATE,
                "latencyMs": elapsed_ms,
            },
        )

    # --- 5. Extract answers + routing metadata ---
    answers = result.get("answers", {})
    routing = result.get("routing", None)
    model_used = result.get("model", model_name)

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    if not answers or len(answers) == 0:
        return JSONResponse(
            status_code=502,
            content={
                "ok": False,
                "error": "Laya returned no usable answers",
                "scoreMeaning": SCORE_MEANING,
                "clinicalValidationGate": LAYA_CLINICAL_VALIDATION_GATE,
                "latencyMs": elapsed_ms,
            },
        )

    logger.info(
        "Laya decision: task=%s model=%s latencyMs=%d answers_keys=%s",
        task,
        model_used,
        elapsed_ms,
        list(answers.keys()),
    )

    # --- 6. Return canonical response ---
    response_data: Dict[str, Any] = {
        "ok": True,
        "answers": answers,
        "routing": routing,
        "model": model_used,
        "scoreMeaning": SCORE_MEANING,
        "clinicalValidationGate": LAYA_CLINICAL_VALIDATION_GATE,
        "latencyMs": elapsed_ms,
    }

    return JSONResponse(content=response_data, status_code=200)


@app.post("/v1/decide_batch")
async def decide_batch(payload: DecideBatchRequest) -> JSONResponse:
    t0 = time.monotonic()
    state: Any = payload.state if payload.state is not None else payload.state_dict if payload.state_dict is not None else ""
    refused = [schema.id for schema in payload.schemas if _is_refused_task(schema.id)]
    if refused:
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        return JSONResponse(
            status_code=403,
            content={"ok": False, "error": f"Refused task(s): {', '.join(refused)}", "scoreMeaning": SCORE_MEANING, "latencyMs": elapsed_ms},
        )

    model_name = _detect_checkpoint(state, payload.checkpoint)

    def run_batch():
        results = []
        for schema in payload.schemas:
            laya_result = _router.predict(state=state, questions=_questions_from_schema(schema), model=model_name)
            answers = laya_result.get("answers", {})
            answer = answers.get(schema.id) or next(iter(answers.values()), {})
            normalized = _normalize_answer(schema.id, answer)
            normalized.update({"version": schema.version, "checkpoint": model_name, "scoreMeaning": SCORE_MEANING})
            results.append(normalized)
        return results

    try:
        results = await _run_model_call(run_batch)
    except (ModelNotReady, ModelBusy) as exc:
        return _model_unavailable_response(exc)
    except Exception as exc:
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        logger.error("Laya batch failed: %s", exc, exc_info=True)
        return JSONResponse(status_code=502, content={"ok": False, "error": f"Laya inference error: {exc}", "scoreMeaning": SCORE_MEANING, "latencyMs": elapsed_ms})

    elapsed_ms = int((time.monotonic() - t0) * 1000)
    return JSONResponse(content={"ok": True, "results": results, "latencyMs": elapsed_ms, "version": "0.3.6", "checkpoint": model_name, "scoreMeaning": SCORE_MEANING}, status_code=200)


@app.post("/v1/registry/reload")
async def registry_reload(request: Request) -> JSONResponse:
    if request.client and request.client.host not in ("127.0.0.1", "::1", "localhost"):
        return JSONResponse(status_code=403, content={"ok": False, "error": "loopback only"})
    global _schema_registry
    candidates = [
        os.getenv("ASTRA_REFLEX_SCHEMA_FILE"),
        os.path.join(os.getenv("ASTRA_DATA_DIR", os.path.join(os.getcwd(), "data")), "reflex", "schemas.json"),
    ]
    for candidate in [c for c in candidates if c]:
        try:
            with open(candidate, "r", encoding="utf-8") as fh:
                _schema_registry = json.load(fh)
            return JSONResponse(content={"ok": True, "schemas": len(_schema_registry.get("schemas", [])), "path": candidate}, status_code=200)
        except FileNotFoundError:
            continue
    return JSONResponse(status_code=404, content={"ok": False, "error": "schema file not found"})


# ---------------------------------------------------------------------------
# GET /v1/health
# ---------------------------------------------------------------------------

@app.get("/v1/health")
async def health() -> JSONResponse:
    """
    Return cached process/model state only; never initialize or call the model.
    """
    if _router_init_error is not None:
        return JSONResponse(status_code=503, content={
            "reachable": False,
            "state": "failed",
            "modelLoaded": False,
            "error": "Laya model initialization failed",
            "checkpointsLoaded": [],
            "device": None,
            "version": "0.3.6",
        })

    state = _model_state
    # The service is reachable even when its model is intentionally withheld
    # by the memory guard; callers must inspect `state`/`modelLoaded`.
    reachable = state in ("loading", "ready", "busy", "insufficient_memory")
    return JSONResponse(status_code=200 if reachable else 503, content={
        "reachable": reachable,
        "state": state,
        "error": "Laya disabled" if state == "disabled" else "Insufficient available memory to load Laya" if state == "insufficient_memory" else None,
        "modelLoaded": _router_initialized,
        "device": _model_device,
        "checkpointsLoaded": CHECKPOINTS if _router_initialized else [],
        "version": "0.3.6",
    })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _detect_device(router: Router) -> Optional[str]:
    """Best-effort device detection — returns 'cpu' or 'cuda' if detectable."""
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"
    except Exception:
        return "unknown"


def _available_memory_bytes() -> Optional[int]:
    """Return available physical RAM without requiring psutil."""
    try:
        try:
            import psutil  # type: ignore[import-not-found]
            return int(psutil.virtual_memory().available)
        except ImportError:
            pass
        if os.name == "nt":
            class _MemoryStatus(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]
            status = _MemoryStatus()
            status.dwLength = ctypes.sizeof(status)
            if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                return None
            return int(status.ullAvailPhys)
        page_size = int(os.sysconf("SC_PAGE_SIZE"))
        return page_size * int(os.sysconf("SC_AVPHYS_PAGES"))
    except (AttributeError, OSError, ValueError):
        return None


def _has_minimum_load_memory(available_bytes: Optional[int]) -> bool:
    return available_bytes is not None and available_bytes >= MINIMUM_LOAD_MEMORY_BYTES


def _resident_memory_bytes() -> Optional[int]:
    """Best-effort current process resident set size for load telemetry."""
    try:
        try:
            import psutil  # type: ignore[import-not-found]
            return int(psutil.Process().memory_info().rss)
        except ImportError:
            pass
        if os.name == "nt":
            class _ProcessMemoryCounters(ctypes.Structure):
                _fields_ = [
                    ("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong),
                    ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ]
            counters = _ProcessMemoryCounters()
            counters.cb = ctypes.sizeof(counters)
            get_current_process = ctypes.windll.kernel32.GetCurrentProcess
            get_current_process.restype = ctypes.c_void_p
            get_process_memory = ctypes.windll.psapi.GetProcessMemoryInfo
            get_process_memory.argtypes = [ctypes.c_void_p, ctypes.POINTER(_ProcessMemoryCounters), ctypes.c_ulong]
            get_process_memory.restype = ctypes.c_int
            process = get_current_process()
            if not get_process_memory(process, ctypes.byref(counters), counters.cb):
                return None
            return int(counters.WorkingSetSize)
        import resource
        peak = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        return peak if sys.platform == "darwin" else peak * 1024
    except (AttributeError, OSError, ValueError):
        return None


def _canonical_questions_for(task: str) -> Dict[str, Any]:
    """
    Generate the canonical question for a given task.
    Mirrors LAYA_TASK_QUESTIONS from the TS side so the server is self-contained.
    """
    canonical: Dict[str, Dict[str, Any]] = {
        "language_routing": {
            "language": {
                "type": "choice",
                "instructions": "Which language is this message written or spoken in?",
                "criteria": {
                    "en": "English",
                    "te": "Telugu",
                    "hi": "Hindi",
                    "te-en": "Telugu mixed with English",
                    "hi-en": "Hindi mixed with English",
                    "mixed_other": "mixed with another language",
                },
            }
        },
        "intent_routing": {
            "intent": {
                "type": "choice",
                "instructions": "What does the doctor want Astra to do?",
                "criteria": {
                    "patient_lookup": "find or select a patient",
                    "lab_query": "retrieve laboratory results or trends",
                    "report_query": "retrieve a radiology or other report",
                    "medication_query": "medication list, dose or interaction question",
                    "order_action": "place, send or change an order",
                    "workflow_task": "ask another department to do something",
                    "explanation_request": "explain a concept, mechanism or value",
                    "unknown": "none of the listed intents",
                },
            }
        },
        "department_routing": {
            "department": {
                "type": "choice",
                "instructions": "Which Astra department surface should handle this?",
                "criteria": {
                    "reception": "registration, appointments, patient movement",
                    "lab": "laboratory",
                    "radiology": "radiology or ultrasound",
                    "pharmacy": "pharmacy",
                    "ward": "ward or nursing",
                    "ot": "operation theatre",
                    "billing": "billing or insurance desk",
                    "cmrf": "medical records",
                    "command_centre": "whole-hospital overview",
                },
            }
        },
        "command_type": {
            "command_type": {
                "type": "choice",
                "instructions": "Is this a command, question, note or conversation?",
                "criteria": {
                    "command": "imperative instruction",
                    "question": "information request",
                    "dictation": "clinical dictation or note content",
                    "conversation": "greeting or small talk",
                },
            }
        },
        "urgency_classification": {
            "urgency": {
                "type": "score",
                "instructions": "How urgent is this request for the hospital?",
                "criteria": ["routine", "soon", "urgent", "immediately life-threatening"],
            }
        },
        "workflow_priority": {
            "priority": {
                "type": "score",
                "instructions": "What priority should this workflow item receive?",
                "criteria": ["background", "low", "normal", "high", "critical"],
            }
        },
        "document_classification": {
            "document_type": {
                "type": "choice",
                "instructions": "What kind of hospital document is this?",
                "criteria": {
                    "discharge_summary": "discharge summary",
                    "progress_note": "progress note",
                    "lab_report": "laboratory report",
                    "radiology_report": "radiology report",
                    "prescription": "prescription or medication chart",
                    "consent": "consent form",
                    "referral": "referral letter",
                    "other": "none of these",
                },
            }
        },
        "missing_data_flag": {
            "missing_data": {
                "type": "noul",
                "instructions": "Does this clinical request lack information Astra needs before acting?",
            }
        },
        "possible_emergency_flag": {
            "emergency_signal": {
                "type": "noul",
                "instructions": "Does this text contain language suggesting an immediate emergency?",
            }
        },
        "action_risk_level": {
            "risk": {
                "type": "score",
                "instructions": "How risky is this action if executed without clinician review?",
                "criteria": [
                    "read-only",
                    "draft only",
                    "reversible change",
                    "difficult to reverse",
                    "irreversible",
                ],
            }
        },
        "needs_human_confirmation": {
            "confirmation_needed": {
                "type": "noul",
                "instructions": "Does this action need authenticated clinician confirmation first?",
            }
        },
        "note_type": {
            "note_type": {
                "type": "choice",
                "instructions": "Which note type is being dictated?",
                "criteria": {
                    "admission": "admission note",
                    "progress": "progress note",
                    "procedure": "procedure note",
                    "consultation": "consultation note",
                    "discharge": "discharge summary",
                    "other": "other",
                },
            }
        },
        "message_triage": {
            "triage": {
                "type": "choice",
                "instructions": "How should this internal hospital message be triaged?",
                "criteria": {
                    "answer_now": "needs a reply immediately",
                    "queue": "queue for routine handling",
                    "route_elsewhere": "belongs to another department",
                    "ignore_noise": "no action required",
                },
            }
        },
    }
    return canonical.get(task, {"default": {"type": "choice", "instructions": "Classify this.", "criteria": {"a": "option A", "b": "option B"}}})


@app.get("/v1/tasks")
async def list_tasks() -> JSONResponse:
    """Return the canonical list of approved bounded Laya tasks."""
    return JSONResponse(
        content={
            "tasks": LAYA_BOUNDED_TASKS,
            "scoreMeaning": SCORE_MEANING,
            "clinicalValidationGate": LAYA_CLINICAL_VALIDATION_GATE,
            "policy": ASTRA_DECISION_TASK_POLICY,
        },
        status_code=200,
    )


def handle_loop_exception(loop, context):
    """Discard disconnected clients; preserve normal handling for other failures."""
    error = context.get("exception")
    if isinstance(error, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)) or (
        isinstance(error, OSError) and getattr(error, "winerror", None) in (64, 10053, 10054)
    ):
        logger.warning("Client connection closed: %s errno=%s winerror=%s", type(error).__name__, getattr(error, "errno", None), getattr(error, "winerror", None))
        return
    loop.default_exception_handler(context)


@app.on_event("startup")
async def install_loop_exception_handler():
    global _model_load_task
    asyncio.get_running_loop().set_exception_handler(handle_loop_exception)
    if _model_load_task is None or _model_load_task.done():
        _model_state_set_loading()
        _model_load_task = asyncio.create_task(_load_model_in_background(), name="laya-model-load")


def _model_state_set_loading() -> None:
    global _model_state
    if _router_init_error is None and not _router_initialized:
        _model_state = "loading"


if __name__ == "__main__":
    import asyncio
    import sys
    import uvicorn

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    logger.info(
        "Starting Astra Laya Runtime on %s:%d (checkpoints: %s)",
        DEFAULT_HOST,
        DEFAULT_PORT,
        CHECKPOINTS,
    )

    uvicorn.run(
        app,
        host=DEFAULT_HOST,
        port=DEFAULT_PORT,
        log_level="info",
        loop="asyncio",
    )
