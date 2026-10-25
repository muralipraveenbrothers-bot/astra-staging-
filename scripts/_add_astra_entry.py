# ASTRA AI - append an `astra` entry to Hermes' existing custom_providers list.
import re
import json
from pathlib import Path

env_path = r"d:\astra PM\config\ai-gateway.env"
cfg_path = r"C:\Users\mural\AppData\Local\hermes\config.yaml"
PORTS = json.loads((Path(__file__).resolve().parent.parent / "config" / "ports.json").read_text(encoding="utf-8"))
FREE = PORTS["services"]["freellmapi"]
BASE = f"http://{FREE['host']}:{FREE['port']}/v1"

key = None
for line in open(env_path, encoding="utf-8", errors="ignore"):
    line = line.strip()
    if line.startswith("FREELLMAPI_API_KEY="):
        key = line.split("=", 1)[1].strip()
        break
if not key:
    raise SystemExit("FREELLMAPI_API_KEY not found")

cfg = open(cfg_path, encoding="utf-8").read()

if re.search(r"^  - name: astra\s*$", cfg, re.M):
    # entry exists: refresh its api_key/base_url
    def upd(m):
        block = m.group(0)
        block = re.sub(r"(    base_url:).*", r"\1 " + BASE, block)
        block = re.sub(r"(    api_key:).*", r"\1 " + key, block)
        if "    api_key:" not in block:
            block = block.rstrip("\n") + "\n    api_key: " + key + "\n"
        return block
    cfg = re.sub(r"  - name: astra\n(?:    .+\n?)+", upd, cfg, count=1)
    print("updated existing astra entry")
else:
    entry = ("  - name: astra\n"
             "    base_url: " + BASE + "\n"
             "    api_key: " + key + "\n")
    # insert immediately after the custom_providers: line
    cfg = re.sub(r"(^custom_providers:\n)", r"\1" + entry, cfg, count=1, flags=re.M)
    print("appended astra entry to custom_providers")

open(cfg_path, "w", encoding="utf-8").write(cfg)

# verify without printing the key
ok = bool(re.search(r"  - name: astra\n    base_url: " + re.escape(BASE) + r"\n    api_key: \S+", cfg))
print("astra custom_providers entry present:", ok)
