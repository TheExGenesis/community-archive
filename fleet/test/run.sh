#!/usr/bin/env bash
# `pnpm fleet:test`: shellcheck over fleet/, then every fleet/test/test_*.sh.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLEET="$(cd "$HERE/.." && pwd)"

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "fleet:test: shellcheck is required (brew install shellcheck / apt install shellcheck)" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "fleet:test: node is required" >&2
  exit 1
fi

echo "shellcheck fleet/"
shellcheck -x -s bash "$FLEET"/bin/*.sh "$FLEET"/lib/*.sh "$FLEET"/test/*.sh "$FLEET"/test/fakes/*

status=0
for t in "$HERE"/test_*.sh; do
  echo "▶ $(basename "$t")"
  if ! bash "$t"; then
    status=1
  fi
done
if [[ $status -ne 0 ]]; then
  echo "fleet:test: FAILED" >&2
  exit 1
fi
echo "fleet:test: all green"
