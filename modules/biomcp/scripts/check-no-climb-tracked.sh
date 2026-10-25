#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

tracked="$(
    git ls-files -- \
        '.climb/**' \
        '.climb-test-vault' \
        '.climb-test-vault/**'
)"

if [[ -n "$tracked" ]]; then
    echo "Error: tracked Climb scratch files detected:" >&2
    echo "$tracked" >&2
    echo "Fix: git rm --cached <path>" >&2
    exit 1
fi

echo "No tracked Climb scratch files found"
