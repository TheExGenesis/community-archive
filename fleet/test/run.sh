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

# The Slack agent (fleet/slack, TypeScript): type-check and compile, then its
# node:test suite (fakes for Slack, claude, gh and pnpm; one end-to-end run
# through fleet/bin/task.sh against a throwaway git repository).
ROOT="$(cd "$FLEET/.." && pwd)"
echo "tsc fleet/slack"
if ! (cd "$ROOT" && npx tsc -p fleet/slack/tsconfig.json); then
  echo "fleet:test: fleet/slack does not type-check" >&2
  exit 1
fi
echo "▶ fleet/slack tests"
status=0
if ! (cd "$ROOT" && node --test 'fleet/slack/dist/test/*.test.js' 2>&1 | grep -E '^(not ok|# (tests|pass|fail))'; test "${PIPESTATUS[0]}" -eq 0); then
  status=1
fi

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
