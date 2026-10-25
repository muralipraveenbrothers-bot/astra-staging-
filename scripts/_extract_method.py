import glob, re, os
base = r"C:\Users\mural\AppData\Local\hermes\hermes-agent"
hits = {}
for p in glob.glob(base + "/**/*.py", recursive=True):
    try:
        s = open(p, encoding="utf-8", errors="ignore").read()
        m = re.search(r"def _ensure_runtime_credentials.*?(?=\n    def |\ndef |\nclass )", s, re.S)
        if m:
            hits[p] = m.group(0)
    except Exception:
        pass
parts = []
for p, body in hits.items():
    parts.append("# " + p)
    parts.append(body[:5000])
open(r"d:\astra PM\scripts\_env_res.txt", "w", encoding="utf-8").write("\n\n".join(parts) if hits else "NONE FOUND")
print("files:", list(hits.keys()))