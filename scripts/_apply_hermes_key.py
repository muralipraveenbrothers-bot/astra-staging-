# ASTRA AI - inject the centralized FreeLLMAPI gateway key into Hermes' local
# config model block (model.api_key) so the `custom` provider authenticates.
# Reads the key from config/ai-gateway.env; never prints it.
import re, os

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

cfg = open(cfg_path, encoding="utf-8").read()

def set_model_ak(value):
    # Rewrite model.api_key without matching across another block's api_key.
    # model block starts at '^model:' and ends before top-level 'agent:'/next top key.
    m = re.search(r"^model:\n", cfg, re.M)
    if not m:
        raise SystemExit("no model: block")
    # Find next top-level key after model:
    rest = cfg[m.start():]
    nxt = re.search(r"\n(?:[a-zA-Z_][a-zA-Z0-9_]*|  -):", rest[1:])
    end = m.start() + 1 + (nxt.start() if nxt else len(rest) - 1)
    body = cfg[m.start():end]
    # Add/update api_key line inside model block
    if re.search(r"^  api_key:", body, re.M):
        new_body = re.sub(r"^  api_key:.*$", "  api_key: " + value, body, flags=re.M)
    else:
        # insert after base_url line if present, else end of block
        new_body = re.sub(r"(^  base_url:.*)$", r"\1\n  api_key: " + value, body, flags=re.M)
        if new_body == body:
            new_body = body.rstrip("\n") + "\n  api_key: " + value + "\n"
    return cfg[:m.start()] + new_body + cfg[end:]

new_cfg = set_model_ak(key)
open(cfg_path, "w", encoding="utf-8").write(new_cfg)
print("OK: injected api_key into hermes config model block (value not printed)")
# Show model block lines except the key value
for ln in new_cfg.splitlines():
    if re.match(r"^model:|^\s+default:|^\s+provider:|^\s+base_url:", ln):
        print(ln)