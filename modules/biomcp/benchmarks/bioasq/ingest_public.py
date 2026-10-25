#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["datasets>=2.20.0"]
# ///
"""Ingest a manifest-defined public BioASQ bundle into the normalized dataset layout.

Usage:
    uv run --script benchmarks/bioasq/ingest_public.py --bundle hf-public-pre2026
    uv run --script benchmarks/bioasq/ingest_public.py --bundle mirage-yesno-2024
    uv run --script benchmarks/bioasq/ingest_public.py --bundle hf-public-pre2026 --force

Add --force to overwrite existing raw or normalized outputs owned by this module.
See docs/reference/bioasq-benchmark.md for the two-lane model and provenance notes.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
MANIFEST_PATH = SCRIPT_DIR / "datasets/manifest.json"
PUBMED_PATTERNS = (
    re.compile(r"/pubmed/(\d+)"),
    re.compile(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)/?"),
)
JSONL_UNSAFE_LINE_SEPARATORS = {
    "\u0085": "\\u0085",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
}


def load_manifest() -> dict[str, Any]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    required_keys = {"schema_version", "reviewed_on", "recommended_public_bundle_id", "bundles"}
    missing = sorted(required_keys - set(manifest))
    if missing:
        raise SystemExit(f"Manifest missing required keys: {', '.join(missing)}")
    return manifest


def resolve_bundle(manifest: dict[str, Any], bundle_id: str) -> dict[str, Any]:
    for bundle in manifest["bundles"]:
        if bundle["id"] == bundle_id:
            return bundle
    raise SystemExit(f"Unknown bundle id: {bundle_id}")


def resolve_repo_path(path_str: str) -> Path:
    return REPO_ROOT / path_str


def parse_args(argv: list[str], manifest: dict[str, Any]) -> argparse.Namespace:
    epilog_lines = [
        "Examples:",
        "  uv run --script benchmarks/bioasq/ingest_public.py --bundle hf-public-pre2026",
        "  uv run --script benchmarks/bioasq/ingest_public.py --bundle mirage-yesno-2024",
        "  uv run --script benchmarks/bioasq/ingest_public.py --bundle hf-public-pre2026 --force",
        "",
        "Bundle lanes:",
        "  Public historical lane (runnable, no registration required):",
    ]

    for bundle in manifest["bundles"]:
        if bundle["lane"] != "public_historical":
            continue
        epilog_lines.append(f"    {bundle['id']:<35} {bundle['label']}")

    epilog_lines.extend(
        [
            "",
            "  Official competition lane (metadata-only, registration-required):",
        ]
    )

    for bundle in manifest["bundles"]:
        if bundle["lane"] != "official_competition":
            continue
        epilog_lines.append(f"    {bundle['id']:<35} {bundle['label']}")
        epilog_lines.append(
            "                                       Participants-area workflow only; "
            "see docs/reference/bioasq-benchmark.md"
        )

    parser = argparse.ArgumentParser(
        prog="ingest_public.py",
        description="Ingest a manifest-defined public BioASQ bundle.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="\n".join(epilog_lines),
    )
    parser.add_argument(
        "--bundle",
        required=True,
        metavar="BUNDLE",
        choices=[bundle["id"] for bundle in manifest["bundles"]],
        help="Bundle id to ingest (see lane table below).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing raw or normalized outputs owned by this module.",
    )
    return parser.parse_args(argv)


def ensure_writable(paths: list[Path], *, force: bool) -> None:
    existing = [path for path in paths if path.exists()]
    if existing and not force:
        rendered = ", ".join(str(path.relative_to(REPO_ROOT)) for path in existing)
        raise SystemExit(
            f"Refusing to overwrite existing BioASQ outputs without --force: {rendered}"
        )


def render_json(payload: Any, *, indent: int | None = None) -> str:
    rendered = json.dumps(payload, ensure_ascii=False, indent=indent, sort_keys=True)
    for raw, escaped in JSONL_UNSAFE_LINE_SEPARATORS.items():
        rendered = rendered.replace(raw, escaped)
    return rendered


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(render_json(record))
            handle.write("\n")


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{render_json(payload, indent=2)}\n", encoding="utf-8")


def normalize_text_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def stringify_scalar(value: Any) -> str:
    return value if isinstance(value, str) else str(value)


def normalize_exact_answer_groups(question_type: str, raw_value: Any) -> list[list[str]]:
    if question_type == "summary":
        return []
    if raw_value is None:
        return []
    if isinstance(raw_value, str):
        stripped = raw_value.strip()
        if not stripped:
            return []
        if question_type == "yesno" and stripped.lower() in {"yes", "no"}:
            return [[stripped.lower()]]
        if stripped.startswith(("[", "(", "{", "'")):
            try:
                raw_value = ast.literal_eval(stripped)
            except (ValueError, SyntaxError) as exc:
                raise ValueError(f"Could not normalize exact_answer literal: {raw_value!r}") from exc
        else:
            raw_value = stripped

    if isinstance(raw_value, str):
        if question_type == "yesno":
            lowered = raw_value.lower()
            if lowered not in {"yes", "no"}:
                raise ValueError(f"Unsupported yes/no answer: {raw_value!r}")
            return [[lowered]]
        return [[raw_value]]

    if isinstance(raw_value, list):
        if not raw_value:
            return []
        if all(not isinstance(item, list) for item in raw_value):
            values = [stringify_scalar(item) for item in raw_value]
            if question_type == "list":
                return [[value] for value in values]
            if question_type == "yesno":
                if len(values) != 1 or values[0].lower() not in {"yes", "no"}:
                    raise ValueError(f"Unsupported yes/no answer list: {raw_value!r}")
                return [[values[0].lower()]]
            return [values]

        groups: list[list[str]] = []
        for item in raw_value:
            if isinstance(item, list):
                groups.append([stringify_scalar(part) for part in item])
            else:
                groups.append([stringify_scalar(item)])
        if question_type == "yesno":
            if len(groups) != 1 or len(groups[0]) != 1 or groups[0][0].lower() not in {"yes", "no"}:
                raise ValueError(f"Unsupported yes/no answer groups: {raw_value!r}")
            return [[groups[0][0].lower()]]
        return groups

    if question_type == "yesno":
        lowered = stringify_scalar(raw_value).lower()
        if lowered not in {"yes", "no"}:
            raise ValueError(f"Unsupported yes/no answer: {raw_value!r}")
        return [[lowered]]
    return [[stringify_scalar(raw_value)]]


def flatten_exact_answer_groups(groups: list[list[str]]) -> list[str]:
    flattened: list[str] = []
    for group in groups:
        flattened.extend(group)
    return flattened


def normalize_documents(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [stringify_scalar(item) for item in value]
    return [stringify_scalar(value)]


def extract_document_pmids(documents: list[str]) -> list[str]:
    pmids: list[str] = []
    seen: set[str] = set()
    for document in documents:
        for pattern in PUBMED_PATTERNS:
            match = pattern.search(document)
            if match is None:
                continue
            pmid = match.group(1)
            if pmid not in seen:
                seen.add(pmid)
                pmids.append(pmid)
            break
    return pmids


def normalize_hf_record(
    record: dict[str, Any],
    *,
    hf_split: str,
    bundle: dict[str, Any],
    reviewed_on: str,
) -> dict[str, Any]:
    question_type = stringify_scalar(record["type"]).lower()
    documents = normalize_documents(record.get("documents"))
    exact_answer_groups = normalize_exact_answer_groups(question_type, record.get("exact_answer"))

    return {
        "id": stringify_scalar(record["id"]),
        "type": question_type,
        "question": stringify_scalar(record.get("body") or record.get("question") or ""),
        "exact_answer_raw": record.get("exact_answer"),
        "exact_answer_groups": exact_answer_groups,
        "exact_answer_flat": flatten_exact_answer_groups(exact_answer_groups),
        "ideal_answer_raw": record.get("ideal_answer"),
        "ideal_answer_texts": normalize_text_list(record.get("ideal_answer")),
        "documents": documents,
        "document_pmids": extract_document_pmids(documents),
        "snippets": record.get("snippets") or [],
        "provenance": {
            "lane": bundle["lane"],
            "source": bundle["source"],
            "source_packaging": bundle["source_packaging"],
            "source_ref": bundle["source_ref"],
            "source_record_id": stringify_scalar(record["id"]),
            "hf_split": hf_split,
            "asq_challenge": record.get("asq_challenge"),
            "folder_name": record.get("folder_name"),
            "reviewed_on": reviewed_on,
        },
    }


def normalize_mirage_pmids(raw_value: Any) -> list[str]:
    if raw_value is None:
        return []
    if isinstance(raw_value, list):
        return [stringify_scalar(value) for value in raw_value]
    return [stringify_scalar(raw_value)]


def normalize_mirage_record(
    record_id: str,
    record: dict[str, Any],
    *,
    bundle: dict[str, Any],
    reviewed_on: str,
) -> dict[str, Any]:
    options = record.get("options") or {}
    answer_label = stringify_scalar(record.get("answer", "")).strip()
    if answer_label not in options:
        raise ValueError(f"Unsupported MIRAGE answer label: {answer_label!r}")

    answer_text = stringify_scalar(options[answer_label]).strip().lower()
    if answer_text not in {"yes", "no"}:
        raise ValueError(f"Unsupported MIRAGE answer text: {answer_text!r}")

    document_pmids = normalize_mirage_pmids(record.get("PMID"))
    documents = [f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" for pmid in document_pmids]
    exact_answer_groups = [[answer_text]]

    return {
        "id": record_id,
        "type": "yesno",
        "question": stringify_scalar(record.get("question") or ""),
        "exact_answer_raw": answer_label,
        "exact_answer_groups": exact_answer_groups,
        "exact_answer_flat": [answer_text],
        "ideal_answer_raw": None,
        "ideal_answer_texts": [],
        "documents": documents,
        "document_pmids": document_pmids,
        "snippets": [],
        "provenance": {
            "lane": bundle["lane"],
            "source": bundle["source"],
            "source_packaging": bundle["source_packaging"],
            "source_ref": bundle["source_ref"],
            "source_record_id": record_id,
            "hf_split": None,
            "asq_challenge": None,
            "folder_name": None,
            "reviewed_on": reviewed_on,
        },
    }


def validate_expected_count(bundle: dict[str, Any], observed_count: int) -> None:
    expected_count = bundle["expected_question_count"]
    if observed_count != expected_count:
        raise SystemExit(
            f"Count drift for {bundle['id']}: expected {expected_count}, observed {observed_count}"
        )


def ingest_hf_bundle(bundle: dict[str, Any], *, reviewed_on: str, force: bool) -> None:
    try:
        from datasets import load_dataset
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "The BioASQ public ingester requires the 'datasets' package. "
            "Run it with `uv run --script benchmarks/bioasq/ingest_public.py ...`."
        ) from exc

    raw_dir = resolve_repo_path(bundle["raw_dir"])
    raw_paths = [raw_dir / f"{split}.jsonl" for split in bundle["splits"]]
    output_path = resolve_repo_path(bundle["output_path"])
    ensure_writable(raw_paths + [output_path], force=force)

    dataset_dict = load_dataset(bundle["source_dataset"], revision=bundle["source_ref"])
    normalized_records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    duplicate_ids: list[str] = []

    for split in bundle["splits"]:
        if split not in dataset_dict:
            raise SystemExit(f"HF dataset revision missing expected split: {split}")

        raw_records = [dict(record) for record in dataset_dict[split]]
        write_jsonl(raw_dir / f"{split}.jsonl", raw_records)

        for record in raw_records:
            normalized = normalize_hf_record(
                record,
                hf_split=split,
                bundle=bundle,
                reviewed_on=reviewed_on,
            )
            if normalized["id"] in seen_ids:
                duplicate_ids.append(normalized["id"])
                continue
            seen_ids.add(normalized["id"])
            normalized_records.append(normalized)

    validate_expected_count(bundle, len(normalized_records))
    write_jsonl(output_path, normalized_records)

    if duplicate_ids:
        print(
            f"Skipped {len(duplicate_ids)} duplicate HF question ids while deduping.",
            file=sys.stderr,
        )
    print(f"Wrote {len(normalized_records)} records to {output_path.relative_to(REPO_ROOT)}")


def fetch_json(url: str) -> Any:
    with urllib.request.urlopen(url, timeout=60) as response:  # noqa: S310 - pinned public URL
        return json.load(response)


def ingest_mirage_bundle(bundle: dict[str, Any], *, reviewed_on: str, force: bool) -> None:
    raw_path = resolve_repo_path(bundle["raw_path"])
    output_path = resolve_repo_path(bundle["output_path"])
    ensure_writable([raw_path, output_path], force=force)

    payload = fetch_json(bundle["source_url"])
    if not isinstance(payload, dict) or not isinstance(payload.get("bioasq"), dict):
        raise SystemExit("MIRAGE payload missing expected top-level 'bioasq' mapping")

    write_json(raw_path, payload)

    normalized_records = [
        normalize_mirage_record(
            stringify_scalar(record_id),
            record,
            bundle=bundle,
            reviewed_on=reviewed_on,
        )
        for record_id, record in payload["bioasq"].items()
    ]
    validate_expected_count(bundle, len(normalized_records))
    write_jsonl(output_path, normalized_records)
    print(f"Wrote {len(normalized_records)} records to {output_path.relative_to(REPO_ROOT)}")


def main(argv: list[str]) -> int:
    manifest = load_manifest()
    args = parse_args(argv, manifest)
    bundle = resolve_bundle(manifest, args.bundle)

    if bundle["id"] == "official-task-b-participant-download":
        raise SystemExit(
            "The official Task B participant download is metadata-only in this module. "
            "Use the participants-area workflow documented in docs/reference/bioasq-benchmark.md."
        )

    if bundle["id"] == "hf-public-pre2026":
        ingest_hf_bundle(bundle, reviewed_on=manifest["reviewed_on"], force=args.force)
        return 0

    if bundle["id"] == "mirage-yesno-2024":
        ingest_mirage_bundle(bundle, reviewed_on=manifest["reviewed_on"], force=args.force)
        return 0

    raise SystemExit(f"Unsupported public bundle definition: {bundle['id']}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
