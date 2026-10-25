# Streamable HTTP Demo

## What the demo proves

This demo proves that a remote Streamable HTTP BioMCP server can execute a
coherent BioMCP workflow through the MCP `biomcp` tool, not just complete a
transport handshake.

## How to start the server

For normal local use, an installed `biomcp` binary is fine:

```bash
biomcp serve-http --host 127.0.0.1 --port 8080
```

For repo verification, prefer the release binary from this checkout so the
server version matches the worktree under test:

```bash
./target/release/biomcp serve-http --host 127.0.0.1 --port 8080
```

## How to run the client

Run the default workflow:

```bash
uv run --quiet --script examples/streamable-http/streamable_http_client.py
```

Pass an explicit base URL when needed:

```bash
uv run --quiet --script examples/streamable-http/streamable_http_client.py http://127.0.0.1:8080
```

## What output to expect

The output should include these structural markers:

- `Connecting to http://127.0.0.1:8080/mcp`
- `Command: biomcp search all --gene BRAF --disease melanoma --counts-only`
- `Command: biomcp get variant "BRAF V600E" clinvar`
- `Command: biomcp search trial -c melanoma --mutation "BRAF V600E" --limit 5`

The final step should stay melanoma-scoped. Expect real BioMCP markdown output,
including the trial search query echo with `condition=melanoma` and
`mutation=BRAF V600E`, rather than a custom summary.
