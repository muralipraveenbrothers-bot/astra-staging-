# Source Contract Checks

This folder contains lightweight commands for checking upstream source
behavior, running a small set of smoke probes, and replaying the paper-style
demo flows that still matter operationally.

Each source-facing contract probe has three checks:

- happy path: known-good request that should return useful data
- edge path: valid request expected to be empty or low-signal
- invalid path: intentionally bad request expected to fail clearly

These checks are intentionally lightweight and source-facing. They are not a
replacement for unit tests, repo docs, or verification notes.

## Files

- `source-contracts.md`: command inventory and expected outcomes
- `contract-smoke.sh`: optional runner for selected live probes
- `genegpt-demo.sh`: paper-style GeneGPT reproduction flow
- `geneagent-demo.sh`: paper-style GeneAgent reproduction flow

## Run

```bash
cd biomcp
./scripts/contract-smoke.sh --fast
```

Use `RUN.md` for the release-binary runbook and
`architecture/technical/staging-demo.md` for the promotion contract.
