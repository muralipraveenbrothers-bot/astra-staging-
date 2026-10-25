# LiteLLM proxy launcher. `litellm.exe` in this venv is the client CLI (no --port).
# Invoke the proxy CLI module. UTF-8 avoids a cp1252 banner crash on Windows.
import os
import subprocess
import sys

os.environ.setdefault("PYTHONUTF8", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

raise SystemExit(
    subprocess.call(
        [
            sys.executable,
            "-m",
            "litellm.proxy.proxy_cli",
            "--config",
            "config.yaml",
            "--host",
            "127.0.0.1",
            "--port",
            "4000",
        ]
    )
)
