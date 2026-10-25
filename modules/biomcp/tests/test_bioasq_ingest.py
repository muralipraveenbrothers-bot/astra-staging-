from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
INGEST_PATH = REPO_ROOT / "benchmarks/bioasq/ingest_public.py"

HF_BUNDLE = {
    "id": "hf-public-pre2026",
    "lane": "public_historical",
    "source": "hf_bioasq_mirror",
    "source_packaging": "public_mirror",
    "source_ref": "8eb56db5f3f43ce7c4102169b24158ad2dc53a74",
}

MIRAGE_BUNDLE = {
    "id": "mirage-yesno-2024",
    "lane": "public_historical",
    "source": "mirage_bioasq_yesno",
    "source_packaging": "public_derived_benchmark",
    "source_ref": (
        "https://raw.githubusercontent.com/"
        "gzxiong/MIRAGE/3490d7b5b5fcb96288860ec74d18c3e398a56703/benchmark.json"
    ),
}


def _load_ingest_module():
    spec = importlib.util.spec_from_file_location("bioasq_ingest_public", INGEST_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_parse_args_help_clarifies_examples_and_bundle_lanes(
    capsys: pytest.CaptureFixture[str],
) -> None:
    module = _load_ingest_module()
    manifest = module.load_manifest()

    with pytest.raises(SystemExit) as exc_info:
        module.parse_args(["--help"], manifest)

    assert exc_info.value.code == 0
    help_text = capsys.readouterr().out
    assert "usage: ingest_public.py [-h] --bundle BUNDLE [--force]" in help_text
    assert "Ingest a manifest-defined public BioASQ bundle." in help_text
    assert "--bundle BUNDLE" in help_text
    assert "{hf-public-pre2026,mirage-yesno-2024,official-task-b-participant-download}" not in help_text
    assert "Examples:" in help_text
    assert "uv run --script benchmarks/bioasq/ingest_public.py --bundle hf-public-pre2026" in help_text
    assert "Bundle lanes:" in help_text
    assert "Public historical lane" in help_text
    assert "hf-public-pre2026" in help_text
    assert "mirage-yesno-2024" in help_text
    assert "Official competition lane" in help_text
    assert "official-task-b-participant-download" in help_text
    assert "metadata-only" in help_text
    assert "registration-required" in help_text
    assert "Bundle id to ingest (see lane table below)." in help_text


def test_normalize_hf_factoid_parses_stringified_exact_answer_and_provenance() -> None:
    module = _load_ingest_module()
    record = {
        "id": "hf-factoid-1",
        "type": "factoid",
        "body": "Which gene is mutated?",
        "exact_answer": "['BRAF']",
        "ideal_answer": "BRAF is the mutated gene.",
        "documents": ["http://www.ncbi.nlm.nih.gov/pubmed/12345678"],
        "snippets": [{"text": "BRAF was mutated."}],
        "asq_challenge": 13,
        "folder_name": "BioASQ-training13b",
    }

    normalized = module.normalize_hf_record(
        record,
        hf_split="factoid",
        bundle=HF_BUNDLE,
        reviewed_on="2026-03-25",
    )

    assert normalized["id"] == "hf-factoid-1"
    assert normalized["type"] == "factoid"
    assert normalized["question"] == "Which gene is mutated?"
    assert normalized["exact_answer_raw"] == "['BRAF']"
    assert normalized["exact_answer_groups"] == [["BRAF"]]
    assert normalized["exact_answer_flat"] == ["BRAF"]
    assert normalized["ideal_answer_raw"] == "BRAF is the mutated gene."
    assert normalized["ideal_answer_texts"] == ["BRAF is the mutated gene."]
    assert normalized["document_pmids"] == ["12345678"]
    assert normalized["provenance"] == {
        "lane": "public_historical",
        "source": "hf_bioasq_mirror",
        "source_packaging": "public_mirror",
        "source_ref": "8eb56db5f3f43ce7c4102169b24158ad2dc53a74",
        "source_record_id": "hf-factoid-1",
        "hf_split": "factoid",
        "asq_challenge": 13,
        "folder_name": "BioASQ-training13b",
        "reviewed_on": "2026-03-25",
    }


def test_normalize_hf_list_preserves_nested_answer_groups() -> None:
    module = _load_ingest_module()
    record = {
        "id": "hf-list-1",
        "type": "list",
        "body": "Which genes belong to the panel?",
        "exact_answer": "[['BRAF'], ['EGFR', 'ERBB2']]",
        "ideal_answer": ["BRAF is one option.", "EGFR and ERBB2 are also included."],
        "documents": ["https://pubmed.ncbi.nlm.nih.gov/23456789/"],
        "snippets": [],
        "asq_challenge": 12,
        "folder_name": "BioASQ-training12b",
    }

    normalized = module.normalize_hf_record(
        record,
        hf_split="list",
        bundle=HF_BUNDLE,
        reviewed_on="2026-03-25",
    )

    assert normalized["exact_answer_groups"] == [["BRAF"], ["EGFR", "ERBB2"]]
    assert normalized["exact_answer_flat"] == ["BRAF", "EGFR", "ERBB2"]
    assert normalized["ideal_answer_texts"] == [
        "BRAF is one option.",
        "EGFR and ERBB2 are also included.",
    ]
    assert normalized["document_pmids"] == ["23456789"]


def test_normalize_hf_yesno_maps_bare_yesno_to_single_group() -> None:
    module = _load_ingest_module()
    record = {
        "id": "hf-yesno-1",
        "type": "yesno",
        "body": "Is BRAF actionable in melanoma?",
        "exact_answer": "yes",
        "ideal_answer": ["Yes, with context-dependent caveats."],
        "documents": [],
        "snippets": [],
        "asq_challenge": 11,
        "folder_name": "BioASQ-training11b",
    }

    normalized = module.normalize_hf_record(
        record,
        hf_split="yesno",
        bundle=HF_BUNDLE,
        reviewed_on="2026-03-25",
    )

    assert normalized["type"] == "yesno"
    assert normalized["exact_answer_groups"] == [["yes"]]
    assert normalized["exact_answer_flat"] == ["yes"]


def test_normalize_hf_summary_keeps_empty_exact_answer_contract() -> None:
    module = _load_ingest_module()
    record = {
        "id": "hf-summary-1",
        "type": "summary",
        "body": "Summarize current evidence.",
        "exact_answer": None,
        "ideal_answer": ["This is a longer ideal answer."],
        "documents": [],
        "snippets": [],
        "asq_challenge": 5,
        "folder_name": "BioASQ-training5b",
    }

    normalized = module.normalize_hf_record(
        record,
        hf_split="summary",
        bundle=HF_BUNDLE,
        reviewed_on="2026-03-25",
    )

    assert normalized["type"] == "summary"
    assert normalized["exact_answer_raw"] is None
    assert normalized["exact_answer_groups"] == []
    assert normalized["exact_answer_flat"] == []
    assert normalized["ideal_answer_texts"] == ["This is a longer ideal answer."]


def test_normalize_mirage_record_maps_answer_label_and_pmids() -> None:
    module = _load_ingest_module()
    record = {
        "question": "Is BRAF associated with melanoma?",
        "options": {"A": "yes", "B": "no"},
        "answer": "A",
        "PMID": [11111111, 22222222],
    }

    normalized = module.normalize_mirage_record(
        "mirage-1",
        record,
        bundle=MIRAGE_BUNDLE,
        reviewed_on="2026-03-25",
    )

    assert normalized["id"] == "mirage-1"
    assert normalized["type"] == "yesno"
    assert normalized["question"] == "Is BRAF associated with melanoma?"
    assert normalized["exact_answer_raw"] == "A"
    assert normalized["exact_answer_groups"] == [["yes"]]
    assert normalized["exact_answer_flat"] == ["yes"]
    assert normalized["document_pmids"] == ["11111111", "22222222"]
    assert normalized["provenance"] == {
        "lane": "public_historical",
        "source": "mirage_bioasq_yesno",
        "source_packaging": "public_derived_benchmark",
        "source_ref": (
            "https://raw.githubusercontent.com/"
            "gzxiong/MIRAGE/3490d7b5b5fcb96288860ec74d18c3e398a56703/benchmark.json"
        ),
        "source_record_id": "mirage-1",
        "hf_split": None,
        "asq_challenge": None,
        "folder_name": None,
        "reviewed_on": "2026-03-25",
    }


def test_normalize_mirage_record_rejects_unsupported_answer_labels() -> None:
    module = _load_ingest_module()
    record = {
        "question": "Is BRAF associated with melanoma?",
        "options": {"A": "yes", "B": "no"},
        "answer": "C",
        "PMID": [11111111],
    }

    with pytest.raises(ValueError, match="Unsupported MIRAGE answer label"):
        module.normalize_mirage_record(
            "mirage-unsupported",
            record,
            bundle=MIRAGE_BUNDLE,
            reviewed_on="2026-03-25",
        )


def test_normalize_hf_record_rejects_malformed_literal_answers() -> None:
    module = _load_ingest_module()
    record = {
        "id": "hf-bad-1",
        "type": "factoid",
        "body": "Which gene is mutated?",
        "exact_answer": "[['BRAF']",
        "ideal_answer": "BRAF is the mutated gene.",
        "documents": [],
        "snippets": [],
        "asq_challenge": 13,
        "folder_name": "BioASQ-training13b",
    }

    with pytest.raises(ValueError, match="exact_answer"):
        module.normalize_hf_record(
            record,
            hf_split="factoid",
            bundle=HF_BUNDLE,
            reviewed_on="2026-03-25",
        )


def test_main_rejects_official_bundle_with_participants_area_guidance() -> None:
    module = _load_ingest_module()

    with pytest.raises(
        SystemExit,
        match=(
            "metadata-only.*participants-area workflow documented in "
            "docs/reference/bioasq-benchmark.md"
        ),
    ):
        module.main(["--bundle", "official-task-b-participant-download"])
