import json, time, urllib.request

BASE = "http://127.0.0.1:3000"

def req(method, path, body=None, token=None):
    r = urllib.request.Request(BASE + path, method=method)
    r.add_header("Content-Type", "application/json")
    if token: r.add_header("Authorization", "Bearer " + token)
    if body is not None: r.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(r, timeout=180) as res:
            return json.loads(res.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return {"_http_error": e.code, "_body": (e.read().decode() or "")[:300]}

token = req("POST", "/api/auth/login", {"role": "admin"}).get("session", {}).get("sessionToken")
print("login token:", (token[:18] + "…") if token else "NONE")
if not token:
    raise SystemExit("no token")

h = req("GET", "/api/agents/hermes/health", token=token)
cfg = h.get("config", {})
print("health.status      :", h.get("status"))
print("health.detail      :", (h.get("detail") or "")[:180])
print("config.model       :", cfg.get("model"))
print("config.base_url    :", cfg.get("baseUrl"))
print("config.provider    :", cfg.get("provider"))
print("config.contextLength:", cfg.get("contextLength"), "required:", cfg.get("requiredContext"))
print()
print(">>> triggering real Hermes execution test ...")
t = req("POST", "/api/agents/hermes/test", {}, token=token)
task = t.get("task", {})
tid = task.get("taskId")
print("test taskId        :", tid, "initialStatus:", task.get("status"))
if not tid:
    print("no taskId:", t)
    raise SystemExit(1)

full = ""
for i in range(40):
    time.sleep(5)
    res = req("GET", "/api/agents/hermes/task/" + tid, token=token)
    tsk = res.get("task", res)
    st = tsk.get("status")
    full = tsk.get("stdout", "")
    print(f"  poll {i+1}: status={st} exit={tsk.get('exitCode')} outlen={len(full)}")
    if st and st != "RUNNING":
        print("\n=== stdout (tail, ascii-safe) ===")
        print(full.encode("ascii", "replace").decode("ascii")[-1200:])
        break
else:
    print("timed out polling")