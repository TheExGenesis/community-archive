#!/usr/bin/env bash
# Fleet fixer: one open `signal` or `bug` issue → reproduce, classify, fix,
# gate, ship, read back. Deterministic bash around one headless Claude Code
# call (`claude -p`). See fleet/README.md and docs/hyperobservability.md.
#
# Env:
#   FLEET_MODE=pr|main        pr: push a branch and open a PR (default); main: push to main
#   RUN_DIR                   where everything about this run is written
#   GH_TOKEN                  GitHub token for gh and git push (FLEET_GITHUB_TOKEN on the host)
#   FLEET_REPO                owner/name, default TheExGenesis/community-archive
#   FLEET_BASE_BRANCH         default main
#   FLEET_MAX_TURNS           claude -p turn cap, default 80
#   FLEET_CLAUDE_MODEL        optional --model for claude -p
#   FLEET_CLAUDE_BIN          default claude (tests point it at a fake)
#   FLEET_LOCK_DIR            default ${TMPDIR:-/tmp}/ca-fleet-fixer.lock
#   FLEET_WORKTREE_BASE       where the run's git worktree is created, default
#                             ${TMPDIR:-/tmp}/ca-fleet-worktrees (outside the checkout:
#                             `next lint` breaks on a nested worktree's parent .eslintrc)
#   FLEET_MAX_CHANGED_LINES   default 300
set -euo pipefail

FLEET_BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$FLEET_BIN_DIR/../lib/common.sh"

: "${FLEET_MODE:=pr}"
: "${FLEET_BASE_BRANCH:=main}"
: "${FLEET_MAX_TURNS:=80}"
: "${FLEET_CLAUDE_BIN:=claude}"
: "${FLEET_LOCK_DIR:=${TMPDIR:-/tmp}/ca-fleet-fixer.lock}"
: "${FLEET_WORKTREE_BASE:=${TMPDIR:-/tmp}/ca-fleet-worktrees}"
: "${FLEET_MAX_CHANGED_LINES:=300}"
: "${FLEET_CLAUDE_MODEL:=}"

case "$FLEET_MODE" in pr | main) ;; *) fleet_die "FLEET_MODE must be pr or main, got '$FLEET_MODE'" ;; esac
fleet_require_cmd gh git node "$FLEET_CLAUDE_BIN"

# ─── State shared with the exit handler ─────────────────────────────────────
ISSUE_NUMBER=""
ISSUE_LABELLED=0
SESSION_ID=""
REF=""
OUTCOME="error"
WORKTREE=""
BRANCH=""
EXTRA_FILE=""
LOCK_HELD=0

cleanup() {
  local code=$?
  trap - EXIT
  if [[ $code -ne 0 && "$OUTCOME" == "error" ]]; then
    fleet_error "fixer failed with exit code $code"
    # Leave the issue free for the next run; a crash is ours, not the issue's.
    if [[ -n "$ISSUE_NUMBER" && $ISSUE_LABELLED -eq 1 ]]; then
      fleet_issue_remove_label "$ISSUE_NUMBER" "$FLEET_LABEL_IN_PROGRESS"
    fi
  fi
  if [[ -n "$WORKTREE" && -d "$WORKTREE" ]]; then
    git -C "$WORKTREE" diff HEAD >"$RUN_DIR/final-diff.patch" 2>/dev/null || true
    git -C "$FLEET_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || rm -rf "$WORKTREE"
    git -C "$FLEET_ROOT" worktree prune >/dev/null 2>&1 || true
  fi
  if [[ -n "$BRANCH" && "$OUTCOME" != "pr_opened" ]]; then
    git -C "$FLEET_ROOT" branch -D "$BRANCH" >/dev/null 2>&1 || true
  fi
  if [[ -n "${RUN_DIR:-}" ]]; then
    fleet_write_result "$OUTCOME" "$ISSUE_NUMBER" "$REF" "$SESSION_ID" "$EXTRA_FILE"
  fi
  [[ $LOCK_HELD -eq 1 ]] && fleet_release_lock "$FLEET_LOCK_DIR"
  exit "$code"
}

# ─── Start ──────────────────────────────────────────────────────────────────
fleet_init_run fixer
trap cleanup EXIT
EXTRA_FILE="$RUN_DIR/result-extra.json"
printf '{"mode":"%s"}\n' "$FLEET_MODE" >"$EXTRA_FILE"

if ! fleet_acquire_lock "$FLEET_LOCK_DIR"; then
  fleet_info "another fixer holds $FLEET_LOCK_DIR; nothing to do"
  OUTCOME="locked"
  exit 0
fi
LOCK_HELD=1

fleet_ensure_labels

# ─── Pick an issue ──────────────────────────────────────────────────────────
fleet_list_candidate_issues >"$RUN_DIR/candidates.json"
fleet_pick_issue <"$RUN_DIR/candidates.json" >"$RUN_DIR/issue.json"
if [[ ! -s "$RUN_DIR/issue.json" ]]; then
  fleet_info "inbox empty: no open signal/bug issue without a fleet label"
  OUTCOME="idle"
  exit 0
fi
ISSUE_NUMBER="$(fleet_json_get "$RUN_DIR/issue.json" 'd.number')"
ISSUE_TITLE="$(fleet_json_get "$RUN_DIR/issue.json" 'd.title')"
fleet_info "picked issue #$ISSUE_NUMBER: $ISSUE_TITLE"

fleet_issue_add_label "$ISSUE_NUMBER" "$FLEET_LABEL_IN_PROGRESS"
ISSUE_LABELLED=1
fleet_readback_issue_label "$ISSUE_NUMBER" "$FLEET_LABEL_IN_PROGRESS" \
  || fleet_die "read-back failed: #$ISSUE_NUMBER does not show $FLEET_LABEL_IN_PROGRESS"

# ─── Worktree ───────────────────────────────────────────────────────────────
git -C "$FLEET_ROOT" fetch --quiet origin "$FLEET_BASE_BRANCH"
BRANCH="fleet/fixer-$ISSUE_NUMBER-$(date -u +%Y%m%d%H%M%S)"
WORKTREE="$FLEET_WORKTREE_BASE/$(basename "$RUN_DIR")"
mkdir -p "$FLEET_WORKTREE_BASE"
printf '%s\n' "$WORKTREE" >"$RUN_DIR/worktree-path"
git -C "$FLEET_ROOT" worktree add --quiet -b "$BRANCH" "$WORKTREE" "origin/$FLEET_BASE_BRANCH"
if [[ -d "$FLEET_ROOT/node_modules" && ! -e "$WORKTREE/node_modules" ]]; then
  ln -s "$FLEET_ROOT/node_modules" "$WORKTREE/node_modules"
fi
BASE_SHA="$(git -C "$WORKTREE" rev-parse HEAD)"
fleet_info "worktree $WORKTREE on $BRANCH from origin/$FLEET_BASE_BRANCH ($BASE_SHA)"

# ─── Prompt ─────────────────────────────────────────────────────────────────
{
  cat "$FLEET_ROOT/fleet/prompts/fixer.md"
  echo
  echo "Issue #$ISSUE_NUMBER: $ISSUE_TITLE"
  echo "Labels: $(fleet_json_get "$RUN_DIR/issue.json" '(d.labels||[]).map(l=>l.name||l).join(", ")')"
  echo "Created: $(fleet_json_get "$RUN_DIR/issue.json" 'd.createdAt')"
  echo
  echo '---'
  echo
  fleet_json_get "$RUN_DIR/issue.json" 'd.body || "(no body)"'
  echo
} >"$RUN_DIR/prompt.md"

# ─── Claude, headless ───────────────────────────────────────────────────────
CLAUDE_ARGS=(
  -p
  --output-format json
  --max-turns "$FLEET_MAX_TURNS"
  --permission-mode dontAsk
  --allowedTools
  Read Edit Write Grep Glob
  'Bash(pnpm lint*)' 'Bash(pnpm type-check*)' 'Bash(pnpm test*)'
  'Bash(npx jest*)' 'Bash(npx eslint*)' 'Bash(npx tsc*)' 'Bash(node --test*)'
  'Bash(git status*)' 'Bash(git diff*)' 'Bash(git log*)'
  --disallowedTools
  'Bash(git push*)' 'Bash(git commit*)' 'Bash(gh *)' 'Bash(curl*)' 'Bash(wget*)'
  WebFetch WebSearch Agent NotebookEdit
)
if [[ -n "$FLEET_CLAUDE_MODEL" ]]; then
  CLAUDE_ARGS+=(--model "$FLEET_CLAUDE_MODEL")
fi

# run_claude <output-file> <prompt-file> [extra args...]
run_claude() {
  local out="$1" prompt="$2"
  shift 2
  local cmd=("$FLEET_CLAUDE_BIN" "${CLAUDE_ARGS[@]}" "$@")
  {
    printf 'cd %q && ' "$WORKTREE"
    printf '%q ' "${cmd[@]}"
    printf '< %q > %q\n' "$prompt" "$out"
  } >>"$RUN_DIR/claude-invocations.txt"
  local code=0
  (cd "$WORKTREE" && "${cmd[@]}" <"$prompt" >"$out" 2>>"$RUN_DIR/claude-stderr.txt") || code=$?
  if [[ $code -ne 0 ]]; then
    fleet_warn "claude exited with $code (see claude-stderr.txt)"
  fi
  if [[ -s "$out" ]]; then
    SESSION_ID="$(fleet_json_get "$out" 'd.session_id' 2>/dev/null || true)"
  fi
  return 0
}

fleet_info "running claude -p (max turns $FLEET_MAX_TURNS)"
run_claude "$RUN_DIR/claude-output.json" "$RUN_DIR/prompt.md"

# ─── Verdict ────────────────────────────────────────────────────────────────
VERDICT_FILE="$RUN_DIR/verdict.json"
set +e
fleet_parse_verdict "$RUN_DIR/claude-output.json" >"$VERDICT_FILE" 2>"$RUN_DIR/verdict-error.txt"
VERDICT_CODE=$?
set -e

# comment_and_label <label> <heading> <body-file>
comment_and_label() {
  local label="$1" heading="$2" body="$3" comment="$RUN_DIR/comment.md"
  {
    echo "**[fleet:fixer] $heading**"
    echo
    cat "$body"
    echo
    echo "_Run: \`$(basename "$RUN_DIR")\`, session \`${SESSION_ID:-none}\`._"
  } >"$comment"
  fleet_issue_comment "$ISSUE_NUMBER" "$comment"
  fleet_issue_swap_label "$ISSUE_NUMBER" "$FLEET_LABEL_IN_PROGRESS" "$label"
  fleet_readback_issue_label "$ISSUE_NUMBER" "$label" \
    || fleet_die "read-back failed: #$ISSUE_NUMBER does not show $label"
  fleet_readback_issue_comment "$ISSUE_NUMBER" "[fleet:fixer] $heading" \
    || fleet_die "read-back failed: comment '$heading' missing on #$ISSUE_NUMBER"
}

if [[ $VERDICT_CODE -eq 2 ]]; then
  fleet_error "claude run failed: $(cat "$RUN_DIR/verdict-error.txt")"
  OUTCOME="error"
  exit 1
fi
if [[ $VERDICT_CODE -ne 0 ]]; then
  {
    echo "The fixer finished without a readable verdict, so a human has to look."
    echo
    echo '```'
    fleet_json_get "$RUN_DIR/claude-output.json" 'String(d.result||"").slice(-1500)' 2>/dev/null || echo "(no result text)"
    echo '```'
  } >"$RUN_DIR/reason.md"
  comment_and_label "$FLEET_LABEL_NEEDS_DECISION" "needs a decision: no verdict" "$RUN_DIR/reason.md"
  OUTCOME="needs_decision"
  exit 0
fi

CLASSIFICATION="$(fleet_json_get "$VERDICT_FILE" 'd.classification')"
SUMMARY="$(fleet_json_get "$VERDICT_FILE" 'd.summary')"
fleet_info "verdict: $CLASSIFICATION — $SUMMARY"
printf '{"mode":"%s","classification":"%s"}\n' "$FLEET_MODE" "$CLASSIFICATION" >"$EXTRA_FILE"

verdict_as_markdown() {
  fleet_json_get "$VERDICT_FILE" '
    [
      d.summary,
      d.root_cause ? "\n**Root cause.** " + d.root_cause : "",
      d.fix ? "\n**Proposed fix.** " + d.fix : "",
      d.check_next_time ? "\n**Next time.** " + d.check_next_time : "",
    ].join("\n")'
}

if [[ "$CLASSIFICATION" == "wontfix" ]]; then
  verdict_as_markdown >"$RUN_DIR/reason.md"
  comment_and_label "$FLEET_LABEL_WONTFIX" "wontfix" "$RUN_DIR/reason.md"
  OUTCOME="wontfix"
  exit 0
fi
if [[ "$CLASSIFICATION" == "needs-decision" ]]; then
  verdict_as_markdown >"$RUN_DIR/reason.md"
  comment_and_label "$FLEET_LABEL_NEEDS_DECISION" "needs a decision" "$RUN_DIR/reason.md"
  OUTCOME="needs_decision"
  exit 0
fi

# ─── bug: inspect the diff ──────────────────────────────────────────────────
git -C "$WORKTREE" add -A
git -C "$WORKTREE" diff --cached >"$RUN_DIR/fix.patch"
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "Classified as a bug but changed no files. A human has to look." >"$RUN_DIR/reason.md"
  verdict_as_markdown >>"$RUN_DIR/reason.md"
  comment_and_label "$FLEET_LABEL_NEEDS_DECISION" "needs a decision: bug without a change" "$RUN_DIR/reason.md"
  OUTCOME="needs_decision"
  exit 0
fi

VIOLATIONS="$(fleet_tier1_violations "$WORKTREE")"
CHANGED="$(fleet_changed_lines "$WORKTREE")"
if [[ "$CHANGED" -gt "$FLEET_MAX_CHANGED_LINES" ]]; then
  VIOLATIONS="${VIOLATIONS:+$VIOLATIONS
}Change is $CHANGED lines; the cap is $FLEET_MAX_CHANGED_LINES"
fi
if [[ -n "$VIOLATIONS" ]]; then
  {
    echo "The fixer has a candidate fix but it falls outside Tier 0, so it was not shipped:"
    echo
    while IFS= read -r line; do echo "- $line"; done <<<"$VIOLATIONS"
    echo
    verdict_as_markdown
    echo
    echo "The patch is in the run directory (\`fix.patch\`)."
  } >"$RUN_DIR/reason.md"
  comment_and_label "$FLEET_LABEL_NEEDS_DECISION" "needs a decision: outside Tier 0" "$RUN_DIR/reason.md"
  OUTCOME="needs_decision"
  exit 0
fi

# ─── Gate ───────────────────────────────────────────────────────────────────
# run_gate <dir> : the four CI checks as plain commands; logs under <dir>; returns 1 on first failure.
run_gate() {
  local dir="$1" name cmd
  mkdir -p "$dir"
  while IFS='|' read -r name cmd; do
    [[ -z "$name" ]] && continue
    fleet_info "gate: $name ($cmd)"
    if (cd "$WORKTREE" && bash -c "$cmd") >"$dir/$name.log" 2>&1; then
      echo "ok $name" >>"$dir/summary.txt"
    else
      echo "FAIL $name" >>"$dir/summary.txt"
      fleet_warn "gate: $name failed"
      return 1
    fi
  done <<EOF
lint|pnpm lint
type-check|pnpm type-check
security|pnpm test:security
unit|pnpm test:ci
EOF
}

gate_failure_prompt() {
  local dir="$1" out="$2"
  {
    echo "The CI gate failed on your change. Fix the cause (not the check), keep the Tier 0 rules, and end again with the fenced JSON verdict."
    echo
    echo "Gate summary:"
    cat "$dir/summary.txt"
    echo
    local failed
    failed="$(awk '/^FAIL/ {print $2}' "$dir/summary.txt" | head -1)"
    echo "Last 200 lines of the failing check ($failed):"
    echo '```'
    tail -n 200 "$dir/$failed.log"
    echo '```'
  } >"$out"
}

GATE_OK=0
if run_gate "$RUN_DIR/gate-1"; then
  GATE_OK=1
elif [[ -n "$SESSION_ID" ]]; then
  gate_failure_prompt "$RUN_DIR/gate-1" "$RUN_DIR/prompt-retry.md"
  fleet_info "gate failed; resuming session $SESSION_ID once"
  run_claude "$RUN_DIR/claude-output-2.json" "$RUN_DIR/prompt-retry.md" --resume "$SESSION_ID"
  git -C "$WORKTREE" add -A
  git -C "$WORKTREE" diff --cached >"$RUN_DIR/fix.patch"
  VIOLATIONS="$(fleet_tier1_violations "$WORKTREE")"
  if [[ -z "$VIOLATIONS" ]] && run_gate "$RUN_DIR/gate-2"; then
    GATE_OK=1
  fi
fi

if [[ $GATE_OK -ne 1 ]]; then
  {
    echo "The fix did not pass the CI gate after one repair attempt, so it was not shipped."
    echo
    for d in gate-1 gate-2; do
      [[ -f "$RUN_DIR/$d/summary.txt" ]] || continue
      echo "$d:"
      echo '```'
      cat "$RUN_DIR/$d/summary.txt"
      echo '```'
    done
    if [[ -n "$VIOLATIONS" ]]; then
      echo
      echo "The repair also left Tier 1 violations: $VIOLATIONS"
    fi
    echo
    verdict_as_markdown
    echo
    echo "The patch is in the run directory (\`fix.patch\`)."
  } >"$RUN_DIR/reason.md"
  comment_and_label "$FLEET_LABEL_NEEDS_DECISION" "needs a decision: gate failed" "$RUN_DIR/reason.md"
  OUTCOME="gate_failed"
  exit 0
fi

# ─── Learning + commit ──────────────────────────────────────────────────────
LEARNING="memos/fleet/learnings/$(date -u +%Y-%m-%d)-$ISSUE_NUMBER.md"
mkdir -p "$WORKTREE/$(dirname "$LEARNING")"
{
  echo "# Fixer learning: #$ISSUE_NUMBER $ISSUE_TITLE"
  echo
  echo "- Date: $(fleet_ts)"
  echo "- Issue: https://github.com/$FLEET_REPO/issues/$ISSUE_NUMBER"
  echo "- Run: \`$(basename "$RUN_DIR")\`, session \`${SESSION_ID:-none}\`"
  echo
  echo "## Signal"
  echo
  echo "$ISSUE_TITLE"
  echo
  echo "## Root cause"
  echo
  fleet_json_get "$VERDICT_FILE" 'd.root_cause || d.summary'
  echo
  echo
  echo "## Fix"
  echo
  fleet_json_get "$VERDICT_FILE" 'd.fix || d.summary'
  echo
  echo
  echo "Files:"
  echo
  fleet_json_get "$VERDICT_FILE" '(d.files||[]).map(f=>"- `"+f+"`").join("\n")'
  echo
  echo
  echo "## What to check next time"
  echo
  fleet_json_get "$VERDICT_FILE" 'd.check_next_time || "(none recorded)"'
  echo
} >"$WORKTREE/$LEARNING"
git -C "$WORKTREE" add -A

SHORT_SUMMARY="$(printf '%s' "$SUMMARY" | tr '\n' ' ' | cut -c1-72)"
COMMIT_TITLE="[fleet:fixer] $SHORT_SUMMARY (signal #$ISSUE_NUMBER)"
{
  echo "$COMMIT_TITLE"
  echo
  echo "$SUMMARY"
  echo
  echo "Fixes #$ISSUE_NUMBER"
  echo "Learning: $LEARNING"
  echo
  echo "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
} >"$RUN_DIR/commit-message.txt"
GIT_ID=()
if [[ -n "${FLEET_GIT_NAME:-}" ]]; then GIT_ID+=(-c "user.name=$FLEET_GIT_NAME"); fi
if [[ -n "${FLEET_GIT_EMAIL:-}" ]]; then GIT_ID+=(-c "user.email=$FLEET_GIT_EMAIL"); fi
git -C "$WORKTREE" ${GIT_ID[@]+"${GIT_ID[@]}"} commit --quiet --no-verify -F "$RUN_DIR/commit-message.txt"
COMMIT_SHA="$(git -C "$WORKTREE" rev-parse HEAD)"
fleet_info "committed $COMMIT_SHA: $COMMIT_TITLE"

# ─── Ship ───────────────────────────────────────────────────────────────────
if [[ "$FLEET_MODE" == "pr" ]]; then
  git -C "$WORKTREE" push --quiet origin "HEAD:refs/heads/$BRANCH"
  {
    echo "$SUMMARY"
    echo
    echo "Fixes #$ISSUE_NUMBER"
    echo
    echo "## Root cause"
    echo
    fleet_json_get "$VERDICT_FILE" 'd.root_cause || "(see summary)"'
    echo
    echo
    echo "## Fix"
    echo
    fleet_json_get "$VERDICT_FILE" 'd.fix || "(see summary)"'
    echo
    echo
    echo "Gate: lint, type-check, security tests and unit tests passed locally (\`$(basename "$RUN_DIR")\`)."
    echo "Learning: \`$LEARNING\`."
    echo
    echo "🤖 Generated with [Claude Code](https://claude.com/claude-code) by the fleet fixer"
  } >"$RUN_DIR/pr-body.md"
  PR_URL="$(gh pr create --repo "$FLEET_REPO" --base "$FLEET_BASE_BRANCH" --head "$BRANCH" \
    --title "$COMMIT_TITLE" --body-file "$RUN_DIR/pr-body.md")"
  PR_NUMBER="${PR_URL##*/}"
  REF="$PR_URL"
  fleet_info "opened PR $PR_URL"
  printf 'The fixer opened %s for this issue.\n' "$PR_URL" >"$RUN_DIR/reason.md"
  comment_and_label "$FLEET_LABEL_PR_OPEN" "PR opened" "$RUN_DIR/reason.md"
  fleet_readback_pr "$PR_NUMBER" || fleet_die "read-back failed: PR #$PR_NUMBER is not open on GitHub"
  OUTCOME="pr_opened"
else
  git -C "$WORKTREE" push --quiet origin "HEAD:$FLEET_BASE_BRANCH"
  REF="$COMMIT_SHA"
  {
    echo "**[fleet:fixer] fixed on $FLEET_BASE_BRANCH**"
    echo
    echo "Commit https://github.com/$FLEET_REPO/commit/$COMMIT_SHA"
    echo
    echo "$SUMMARY"
    echo
    echo "_Run: \`$(basename "$RUN_DIR")\`, session \`${SESSION_ID:-none}\`._"
  } >"$RUN_DIR/comment.md"
  gh issue close "$ISSUE_NUMBER" --repo "$FLEET_REPO" --comment "$(cat "$RUN_DIR/comment.md")" >/dev/null
  fleet_issue_remove_label "$ISSUE_NUMBER" "$FLEET_LABEL_IN_PROGRESS"
  fleet_readback_commit_on_branch "$COMMIT_SHA" "$FLEET_BASE_BRANCH" \
    || fleet_die "read-back failed: $COMMIT_SHA is not on $FLEET_BASE_BRANCH"
  fleet_readback_issue_state "$ISSUE_NUMBER" CLOSED \
    || fleet_die "read-back failed: #$ISSUE_NUMBER is not closed"
  fleet_readback_issue_comment "$ISSUE_NUMBER" "$COMMIT_SHA" \
    || fleet_die "read-back failed: closing comment with $COMMIT_SHA missing on #$ISSUE_NUMBER"
  OUTCOME="pushed_main"
fi

printf '{"mode":"%s","classification":"%s","branch":"%s","commit":"%s","changed_lines":%s,"learning":"%s"}\n' \
  "$FLEET_MODE" "$CLASSIFICATION" "$BRANCH" "$COMMIT_SHA" "$CHANGED" "$LEARNING" >"$EXTRA_FILE"
fleet_info "done: $OUTCOME $REF"
exit 0
