# ASTRA AI - configure Hermes to authenticate to the FreeLLMAPI gateway via the
# documented `custom_providers` list (pool key custom:astra).
# Reads key from config/ai-gateway.env; never prints it.
import re
import json
from pathlib import Path

env_path = r"d:\astra PM\config\ai-gateway.env"
cfg_path = r"C:\Users\mural\AppData\Local\hermes\config.yaml"

key = None
for line in open(env_path, encoding="utf-8", errors="ignore"):
    line = line.strip()
    if line.startswith("FREELLMAPI_API_KEY="):
        key = line.split("=", 1)[1].strip()
        break
if not key:
    raise SystemExit("FREELLMAPI_API_KEY not found in ai-gateway.env")

PORTS = json.loads((Path(__file__).resolve().parent.parent / "config" / "ports.json").read_text(encoding="utf-8"))
FREE = PORTS["services"]["freellmapi"]
BASE = f"http://{FREE['host']}:{FREE['port']}/v1"
cfg = open(cfg_path, encoding="utf-8").read()

# 1) model.provider -> custom:astra ; ensure model.api_key present
if re.search(r"^  provider:.*$", cfg, re.M):
    cfg = re.sub(r"^  provider:.*$", "  provider: custom:astra", cfg, flags=re.M)
if not re.search(r"^  api_key:", cfg, re.M):
    cfg = re.sub(r"(^  base_url:.*)$", r"\1\n  api_key: " + key, cfg, flags=re.M)

# 2) ensure a top-level custom_providers list with the astra entry
if not re.search(r"^custom_providers:", cfg, re.M):
    entry = ("custom_providers:\n"
             "  - name: astra\n"
             "    base_url: " + BASE + "\n"
             "    api_key: " + key + "\n")
    cfg = cfg.rstrip("\n") + "\n\n" + entry

open(cfg_path, "w", encoding="utf-8").write(cfg)
print("OK: configured custom_providers astra -> FreeLLMAPI (key value not printed)")
for ln in cfg.splitlines():
    if re.match(r"^model:|^\s+provider:|^\s+base_url:|^custom_providers:|^\s+- name:", ln):
        print(ln)
