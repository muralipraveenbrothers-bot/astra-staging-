import json, time, urllib.request, sys, re
from pathlib import Path

def load_key():
    for line in open(r"d:/astra PM/config/ai-gateway.env", encoding="utf-8", errors="ignore"):
        line = line.strip()
        if line.startswith("FREELLMAPI_API_KEY="):
            return line.split("=", 1)[1].strip()
    return None

KEY = load_key()
PORTS = json.loads((Path(__file__).resolve().parent.parent / "config" / "ports.json").read_text(encoding="utf-8"))
FREE = PORTS["services"]["freellmapi"]
BASE = f"http://{FREE['host']}:{FREE['port']}/v1"
MODELS = ["deepseek-v4-flash", "deepseek-v3.2", "gemini-3.6-flash", "kimi-k2.6", "minimax-m3", "auto"]
BODY = {"messages":[{"role":"user","content":"Reply with exactly: OK"}],"max_tokens":16,"temperature":0}

def call(model):
    url = BASE + "/chat/completions"
    payload = dict(BODY); payload["model"] = model
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer " + KEY)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = json.loads(r.read().decode())
            dt = time.time() - t0
            content = body.get("choices",[{}])[0].get("message",{}).get("content","")
            emodel = body.get("model","?")
            print(f"{model:22s} -> HTTP {r.status} :: {dt:6.1f}s :: model={emodel} :: reply={(content or '').strip()[:40]!r}")
    except Exception as e:
        print(f"{model:22s} -> ERROR :: {time.time()-t0:6.1f}s :: {str(e)[:120]}")

for m in MODELS:
    call(m)
print("key present:", bool(KEY))
