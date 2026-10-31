# shellcheck shell=bash
# Tiny assertion helpers for fleet/test/test_*.sh (plain bash, no bats).

TEST_FAILURES=0
TEST_COUNT=0

FLEET_TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FLEET_SRC_ROOT="$(cd "$FLEET_TEST_DIR/../.." && pwd)"
FAKES_DIR="$FLEET_TEST_DIR/fakes"
export FLEET_TEST_DIR FLEET_SRC_ROOT FAKES_DIR

t_fail() {
  TEST_FAILURES=$((TEST_FAILURES + 1))
  printf '  FAIL: %s\n' "$*" >&2
}

t_ok() {
  TEST_COUNT=$((TEST_COUNT + 1))
}

assert_eq() { # <actual> <expected> <label>
  t_ok
  if [[ "$1" != "$2" ]]; then t_fail "$3: expected '$2', got '$1'"; fi
}

assert_contains() { # <haystack> <needle> <label>
  t_ok
  if [[ "$1" != *"$2"* ]]; then t_fail "$3: '$2' not found in: ${1:0:400}"; fi
}

assert_not_contains() { # <haystack> <needle> <label>
  t_ok
  if [[ "$1" == *"$2"* ]]; then t_fail "$3: '$2' unexpectedly found"; fi
}

assert_file_contains() { # <file> <needle> <label>
  t_ok
  if ! grep -qF -- "$2" "$1" 2>/dev/null; then t_fail "$3: '$2' not in $1"; fi
}

assert_file_exists() { # <file> <label>
  t_ok
  if [[ ! -e "$1" ]]; then t_fail "$2: $1 does not exist"; fi
}

assert_file_missing() { # <file> <label>
  t_ok
  if [[ -e "$1" ]]; then t_fail "$2: $1 exists"; fi
}

assert_status() { # <actual-code> <expected-code> <label>
  assert_eq "$1" "$2" "$3 (exit code)"
}

# json_get <file> <expr> : same as the harness helper, for assertions.
json_get() {
  FILE="$1" EXPR="$2" node -e '
    const d = JSON.parse(require("fs").readFileSync(process.env.FILE, "utf8"));
    const v = Function("d", "return (" + process.env.EXPR + ")")(d);
    if (v === undefined || v === null) process.exit(0);
    process.stdout.write(typeof v === "string" ? v : JSON.stringify(v));
  '
}

t_tmpdir() {
  mktemp -d "${TMPDIR:-/tmp}/fleet-test.XXXXXX"
}

t_done() {
  if [[ $TEST_FAILURES -gt 0 ]]; then
    printf '%s: %d of %d assertions failed\n' "$(basename "$0")" "$TEST_FAILURES" "$TEST_COUNT" >&2
    exit 1
  fi
  printf '%s: %d assertions ok\n' "$(basename "$0")" "$TEST_COUNT"
}

# ─── Fixture: a throwaway repo with a bare origin and a copy of fleet/ ──────
# Sets REPO (clone), ORIGIN (bare), both under $1.
make_test_repo() {
  local base="$1"
  ORIGIN="$base/origin.git"
  REPO="$base/repo"
  git init --quiet --bare "$ORIGIN"
  git init --quiet "$REPO"
  git -C "$REPO" config user.name "fleet-test"
  git -C "$REPO" config user.email "fleet-test@example.invalid"
  git -C "$REPO" checkout --quiet -b main
  mkdir -p "$REPO/src"
  cp -R "$FLEET_SRC_ROOT/fleet" "$REPO/fleet"
  rm -rf "$REPO/fleet/test"
  printf '{"name":"fixture","scripts":{}}\n' >"$REPO/package.json"
  printf 'export const answer = 41\n' >"$REPO/src/foo.ts"
  printf 'node_modules\n.fleet-runs/\n' >"$REPO/.gitignore"
  git -C "$REPO" add -A
  git -C "$REPO" commit --quiet -m "fixture"
  git -C "$REPO" remote add origin "$ORIGIN"
  git -C "$REPO" push --quiet origin main
  export ORIGIN REPO
}

# ─── Fixture: fake gh state ────────────────────────────────────────────────
# make_gh_state <dir> : issues.json with two bugs and one signal; one is in progress.
make_gh_state() {
  FAKE_GH_STATE="$1"
  mkdir -p "$FAKE_GH_STATE"
  cat >"$FAKE_GH_STATE/issues.json" <<'EOF'
[
  {"number": 10, "title": "[signal:vercel] 502 on /api/tweet-search", "state": "OPEN",
   "createdAt": "2026-10-20T10:00:00Z", "labels": [{"name": "signal"}],
   "body": "Summary.\n\n```json signal\n{\"source\":\"vercel\",\"route\":\"/api/tweet-search\"}\n```\n<!-- fp:abc123 -->", "comments": []},
  {"number": 7, "title": "bug: answer is off by one", "state": "OPEN",
   "createdAt": "2026-10-01T09:00:00Z", "labels": [{"name": "bug"}],
   "body": "src/foo.ts exports 41, should be 42.", "comments": []},
  {"number": 3, "title": "bug: being worked on", "state": "OPEN",
   "createdAt": "2026-09-01T09:00:00Z", "labels": [{"name": "bug"}, {"name": "fleet:in-progress"}],
   "body": "taken", "comments": []},
  {"number": 2, "title": "bug: already decided", "state": "OPEN",
   "createdAt": "2026-08-01T09:00:00Z", "labels": [{"name": "bug"}, {"name": "fleet:needs-decision"}],
   "body": "waiting", "comments": []}
]
EOF
  printf 'bug\nsignal\n' >"$FAKE_GH_STATE/labels.txt"
  echo '[]' >"$FAKE_GH_STATE/prs.json"
  : >"$FAKE_GH_STATE/calls.log"
  export FAKE_GH_STATE
}

# claude_output <classification> [summary] : canned `claude -p --output-format json` result.
claude_output() {
  local classification="$1" summary="${2:-Fixed the thing.}" files='["src/foo.ts"]'
  [[ "$classification" != "bug" ]] && files='[]'
  CLASS="$classification" SUMMARY="$summary" FILES="$files" node -e '
    const e = process.env;
    const verdict = { classification: e.CLASS, summary: e.SUMMARY, root_cause: "Off by one in src/foo.ts.",
      fix: "Set the answer to 42.", check_next_time: "Grep for the constant first.", files: JSON.parse(e.FILES) };
    const result = "I looked at it.\n\n```json\n" + JSON.stringify(verdict, null, 2) + "\n```";
    process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 7,
      duration_ms: 1234, session_id: "11111111-2222-3333-4444-555555555555", result, total_cost_usd: 0.42,
      usage: { input_tokens: 1200, output_tokens: 340, cache_creation_input_tokens: 5000, cache_read_input_tokens: 80000 } }));
  '
}
