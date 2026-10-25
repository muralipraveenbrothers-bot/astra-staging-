import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient


class FakeRouter:
    calls = []

    def __init__(self, *args, **kwargs):
        pass

    def predict(self, state, questions, model):
        self.calls.append({"state": state, "questions": questions, "model": model})
        key = next(iter(questions.keys()))
        return {"answers": {key: {"choice": "unknown", "probabilities": {"unknown": 0.8, "human_review": 0.2}}}, "model": model}


def load_module(monkeypatch):
    fake_laya = SimpleNamespace()
    fake_router_module = SimpleNamespace(Router=FakeRouter)
    monkeypatch.setitem(sys.modules, "laya", fake_laya)
    monkeypatch.setitem(sys.modules, "laya.router", fake_router_module)
    path = Path(__file__).resolve().parents[2] / "server" / "plugins" / "astra_laya_server.py"
    spec = importlib.util.spec_from_file_location("astra_laya_server_test", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    module._router = FakeRouter()
    module._router_initialized = True
    FakeRouter.calls = []
    return module


def schema(id="department_routing"):
    return {
        "id": id,
        "version": 1,
        "kind": "choice",
        "question": "Which Astra department surface should handle this?",
        "options": [
            {"key": "lab", "label": "Lab", "description": "laboratory tests results"},
            {"key": "unknown", "label": "Unknown"},
            {"key": "human_review", "label": "Human review"},
        ],
    }


def test_decide_batch_returns_one_result_per_schema(monkeypatch):
    module = load_module(monkeypatch)
    client = TestClient(module.app)
    response = client.post("/v1/decide_batch", json={"state": "SYNTHETIC hello", "schemas": [schema(), schema("intent_routing")]})
    assert response.status_code == 200
    assert len(response.json()["results"]) == 2


def test_telugu_script_without_checkpoint_uses_multilingual(monkeypatch):
    module = load_module(monkeypatch)
    client = TestClient(module.app)
    response = client.post("/v1/decide_batch", json={"state": "నాకు జ్వరం ఉంది", "schemas": [schema()]})
    assert response.status_code == 200
    assert FakeRouter.calls[-1]["model"] == "multilingual"


def test_explicit_english_on_telugu_is_overridden(monkeypatch):
    module = load_module(monkeypatch)
    client = TestClient(module.app)
    response = client.post("/v1/decide_batch", json={"state": "నాకు జ్వరం ఉంది", "checkpoint": "english", "schemas": [schema()]})
    assert response.status_code == 200
    assert response.json()["checkpoint"] == "multilingual"


def test_diagnose_patient_is_still_refused(monkeypatch):
    module = load_module(monkeypatch)
    client = TestClient(module.app)
    response = client.post("/v1/decide_batch", json={"state": "SYNTHETIC", "schemas": [schema("diagnose_patient")]})
    assert response.status_code == 403
