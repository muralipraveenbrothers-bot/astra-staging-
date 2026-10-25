"""Synthetic concurrency checks for the Laya ASGI handlers; no model weights loaded."""
import importlib.util
import json
import sys
import threading
import time
import types
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "server" / "plugins" / "astra_laya_server.py"
# Keep this test independent of Transformers/model downloads and exercise the
# real ASGI handler with a deterministic synthetic router.
fake_laya = types.ModuleType("laya")
fake_router_module = types.ModuleType("laya.router")
fake_router_module.Router = type("UnusedRouter", (), {})
sys.modules["laya"] = fake_laya
sys.modules["laya.router"] = fake_router_module
spec = importlib.util.spec_from_file_location("astra_laya_async_test", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class SlowRouter:
    def predict(self, **_kwargs):
        time.sleep(1.25)
        return {
            "answers": {"intent_routing": {"choice": "workflow_task", "score": 0.9}},
            "routing": {"intent": "workflow_task"},
            "model": "synthetic-test-router",
        }


def run_immediate(coro):
    try:
        coro.send(None)
    except StopIteration as finished:
        return finished.value
    raise AssertionError("expected this ASGI handler path to complete synchronously")


class PendingExecutorResult:
    def __await__(self):
        result = yield "synthetic-inference-pending"
        return result


class DeferredLoop:
    def __init__(self):
        self.operation = None
        self.executor = None

    def run_in_executor(self, executor, operation, *args):
        self.executor = executor
        self.operation = lambda: operation(*args)
        return PendingExecutorResult()


def read_health():
    started = time.perf_counter()
    response = run_immediate(module.health())
    elapsed = time.perf_counter() - started
    return response, elapsed, json.loads(response.body)


def main():
    # Loading state is cached and liveness remains HTTP 200 without touching Router.
    module._router = None
    module._router_initialized = False
    module._router_init_error = None
    module._model_device = None
    module._model_state = "loading"
    response, elapsed, body = read_health()
    assert response.status_code == 200 and body["state"] == "loading" and elapsed < 1
    print(f"PASS loading health: status={response.status_code}, state={body['state']}, elapsed_ms={elapsed * 1000:.1f}")
    loading_request = run_immediate(module.decide(module.DecideRequest(task="intent_routing", state="synthetic loading check")))
    loading_body = json.loads(loading_request.body)
    assert loading_request.status_code == 503 and loading_body["state"] == "loading"
    print(f"PASS inference gated during load: status={loading_request.status_code}, state={loading_body['state']}")

    # Exercise the loader's executor handoff and verify health remains cached
    # while its synthetic load operation is deliberately held in a worker.
    deferred_loop = DeferredLoop()
    module.asyncio.get_running_loop = lambda: deferred_loop
    def synthetic_load():
        time.sleep(1.25)
        module._router_initialized = True
        module._router = SlowRouter()
        return module._router

    module._ensure_router = synthetic_load
    module._detect_device = lambda _router: "cpu"
    loader_task = module._load_model_in_background()
    assert loader_task.send(None) == "synthetic-inference-pending"
    load_result = {}
    load_started = threading.Event()

    def run_slow_load():
        load_started.set()
        load_result["value"] = deferred_loop.operation()

    load_worker = threading.Thread(target=run_slow_load, daemon=True)
    load_worker.start()
    assert load_started.wait(1)
    response, elapsed, body = read_health()
    assert response.status_code == 200 and body["state"] == "loading" and elapsed < 1
    load_worker.join(timeout=3)
    assert not load_worker.is_alive()
    try:
        loader_task.send(load_result["value"])
    except StopIteration:
        pass
    else:
        # Device detection is the second executor operation in the loader.
        try:
            loader_task.send(deferred_loop.operation())
        except StopIteration:
            pass
        else:
            raise AssertionError("background loader did not finish")
    assert module._model_state == "ready"
    print(f"PASS background load: health stayed loading, then state={module._model_state}")

    module._router = SlowRouter()
    module._router_initialized = True
    module._model_state = "ready"
    deferred_loop = DeferredLoop()
    module.asyncio.get_running_loop = lambda: deferred_loop
    payload = module.DecideBatchRequest(
        state="synthetic routing test",
        schemas=[module.BatchSchema(id="intent_routing", kind="choice", question="synthetic routing intent")],
    )
    batch_task = module.decide_batch(payload)
    pending = batch_task.send(None)
    assert pending == "synthetic-inference-pending"
    assert module._model_state == "busy"
    assert deferred_loop.executor is module._model_executor
    assert module._model_executor._max_workers == 1

    # Run the deferred model operation on a real worker thread to emulate an
    # in-flight synchronous model call while health is queried concurrently.
    started = threading.Event()
    result = {}

    def run_slow_operation():
        started.set()
        result["value"] = deferred_loop.operation()

    worker = threading.Thread(target=run_slow_operation, daemon=True)
    worker.start()
    assert started.wait(1)

    response, elapsed, body = read_health()
    assert response.status_code == 200 and body["state"] == "busy" and elapsed < 1
    print(f"PASS long batch concurrent health: status={response.status_code}, state={body['state']}, elapsed_ms={elapsed * 1000:.1f}")

    extra = run_immediate(module.decide(module.DecideRequest(task="intent_routing", state="synthetic extra request")))
    extra_body = json.loads(extra.body)
    assert extra.status_code == 503 and extra_body["state"] == "busy"
    print(f"PASS concurrent inference rejected: status={extra.status_code}, state={extra_body['state']}")

    worker.join(timeout=3)
    assert not worker.is_alive()
    try:
        batch_task.send(result["value"])
    except StopIteration as finished:
        batch_response = finished.value
    else:
        raise AssertionError("batch handler did not complete after inference result")
    assert batch_response.status_code == 200
    module._model_state = "ready"
    print(f"PASS batch completed: status={batch_response.status_code}, state={module._model_state}")
    module._model_executor.shutdown(wait=True)


main()
