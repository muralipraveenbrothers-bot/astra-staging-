# Astra–Hermes secure integration contract

Hermes is a supervisory planner only. Astra API (3000), RBAC, PHI policy, Laya/7D verification, and clinician approval remain authoritative.

Routing order: authenticated FreeLLMAPI → OmniRoute (20128) → Ollama (11434). Unredacted PHI must use Ollama only. Keys are server-side and must never be passed in CLI arguments or returned to the UI.

Only skills that pass provenance, health, input/output schema, and authorization checks may be selected. Catalog entries are not proof of installation.
