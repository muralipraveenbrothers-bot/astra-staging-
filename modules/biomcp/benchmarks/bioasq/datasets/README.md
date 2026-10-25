# BioASQ Dataset Layout

`manifest.json` is the committed registry for this module's bundle metadata.
It records the lane, source packaging, pinned source refs, expected counts, and
output paths used by `ingest_public.py`.

## Directory contract

- `raw/` holds operator-generated exports in source shape.
- `normalized/` holds operator-generated canonical JSONL bundles.
- `manifest.json` stays in git and makes the provenance boundary explicit.

The public bundle outputs are derived normalized bundles. Their source
packaging remains visible in the manifest so operators can tell whether a
record came from the HF public mirror, the MIRAGE derived slice, or an official
participant download lane that is documented but not auto-downloaded here.

The manifest also keeps the public `5399` versus official `5389` question-count
mismatch visible instead of burying it in prose.
