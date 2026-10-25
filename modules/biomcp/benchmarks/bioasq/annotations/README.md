# BioASQ Validity Overlay

`validity.jsonl` is an overlay file for future temporal review. It does not
modify the raw or normalized BioASQ corpora.

## Join contract

- `question_id` joins against the normalized BioASQ record `id`
- `bundle_id` makes the overlay explicit when the same question id appears in
  more than one public bundle

Use `validity.schema.json` as the machine-readable field contract for any
future review automation or operator-authored annotations.
