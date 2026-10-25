"""Run MedCalc with Astra's maintained Python when the original venv base moved."""
from pathlib import Path
import runpy
import site

ROOT = Path(__file__).resolve().parent
site.addsitedir(str(ROOT / "venv" / "Lib" / "site-packages"))
runpy.run_path(str(ROOT / "api_server.py"), run_name="__main__")
