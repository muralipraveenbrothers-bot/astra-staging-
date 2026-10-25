"""Pre-download + preload Laya checkpoints so the live loopback test is not
saddled with a multi-GB cold HuggingFace download inside its timeout window.

Mirrors server/plugins/astra_laya_server.py::_ensure_router exactly:
    Router(preload=True, max_loaded=3, default="english")

Prints PREWARM_OK on success; non-zero exit on failure.
"""
import sys
import time

t0 = time.monotonic()

try:
    from laya.router import Router
except Exception as exc:  # pragma: no cover - environment dependent
    print("PREWARM_FAIL import: %r" % (exc,), flush=True)
    sys.exit(2)

try:
    Router(preload=True, max_loaded=3, default="english")
except Exception as exc:  # pragma: no cover - environment dependent
    print("PREWARM_FAIL load: %r" % (exc,), flush=True)
    sys.exit(3)

print("PREWARM_OK in %.1fs" % (time.monotonic() - t0), flush=True)
sys.exit(0)
