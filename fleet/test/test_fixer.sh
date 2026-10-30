#!/usr/bin/env bash
# End-to-end fixer runs with fake gh, claude and pnpm against a throwaway repo.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP="$(t_tmpdir)"
trap 'rm -rf "$TMP"' EXIT
export PATH="$FAKES_DIR:$PATH"

# run_fixer <case-name> [env assignments...] : runs the fixer in a fresh repo + gh state.
run_fixer() {
  local name="$1"
  shift
  local base="$TMP/$name"
  mkdir -p "$base"
  make_test_repo "$base/git"
  make_gh_state "$base/gh"
  export FAKE_GH_REMOTE="$ORIGIN"
  export FAKE_CLAUDE_LOG="$base/claude.log"
  export FAKE_PNPM_LOG="$base/pnpm.log"
  : >"$FAKE_CLAUDE_LOG"
  : >"$FAKE_PNPM_LOG"
  export RUN_DIR="$base/run"
  export FLEET_ROOT="$REPO"
  export FLEET_RUNS_DIR="$base/runs"
  export FLEET_LOCK_DIR="$base/lock"
  export FLEET_WORKTREE_BASE="$base/worktrees"
  export FLEET_GIT_NAME="fleet-test" FLEET_GIT_EMAIL="fleet-test@example.invalid"
  export FLEET_REPO="o/r"
  FIXER_CODE=0
  env "$@" bash "$REPO/fleet/bin/fixer.sh" >"$base/stdout.log" 2>"$base/stderr.log" || FIXER_CODE=$?
}

# ─── 1. pr mode, clean bug ───────────────────────────────────────────────────
claude_output bug "Set the answer to 42." >"$TMP/bug.json"
run_fixer pr FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/bug.json" \
  FAKE_CLAUDE_EDITS='printf "export const answer = 42\n" > src/foo.ts'
assert_status "$FIXER_CODE" 0 "pr run exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "pr_opened" "outcome"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.issue')" "7" "picked #7"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.session_id')" "11111111-2222-3333-4444-555555555555" "session id recorded"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.pr_or_commit')" "https://github.com/o/r/pull/100" "pr url"
assert_eq "$(json_get "$RUN_DIR/result.json" 'typeof d.duration_s')" "number" "duration_s"
assert_file_exists "$RUN_DIR/issue.json" "issue saved"
assert_file_exists "$RUN_DIR/claude-output.json" "claude output saved"
assert_file_contains "$RUN_DIR/claude-invocations.txt" "--max-turns" "invocation recorded"
assert_file_contains "$RUN_DIR/claude-invocations.txt" "--output-format json" "json output requested"
assert_file_contains "$FAKE_CLAUDE_LOG" "--permission-mode dontAsk" "headless permission mode"
assert_file_contains "$FAKE_CLAUDE_LOG" "Bash\(git\ push\*\)" "git push disallowed"
assert_file_contains "$FAKE_CLAUDE_LOG.prompt-1" "Issue #7: bug: answer is off by one" "prompt carries the issue"
assert_file_contains "$FAKE_CLAUDE_LOG.prompt-1" "# Fleet fixer" "prompt carries fixer.md"
assert_file_contains "$RUN_DIR/gate-1/summary.txt" "ok unit" "gate ran all four checks"
assert_eq "$(grep -c . "$FAKE_PNPM_LOG")" "4" "four pnpm calls"
# The label went in-progress then pr-open, with a comment, and PR body has Fixes #7.
labels="$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).labels.map(l=>l.name).join(",")')"
assert_eq "$labels" "bug,fleet:pr-open" "issue labelled pr-open, in-progress removed"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments.map(c=>c.body).join("\n")')" "[fleet:fixer] PR opened" "comment posted"
assert_contains "$(json_get "$FAKE_GH_STATE/prs.json" 'd[0].body')" "Fixes #7" "PR body closes the issue"
assert_contains "$(json_get "$FAKE_GH_STATE/prs.json" 'd[0].title')" "[fleet:fixer] Set the answer to 42. (signal #7)" "PR title"
# The branch on origin has the fix, the learning, and the commit convention.
branch="$(json_get "$RUN_DIR/result.json" 'd.branch')"
assert_contains "$branch" "fleet/fixer-7-" "branch name"
assert_eq "$(git -C "$ORIGIN" show "$branch:src/foo.ts")" "export const answer = 42" "fix pushed"
learning="$(git -C "$ORIGIN" ls-tree -r --name-only "$branch" | grep '^memos/fleet/learnings/' || true)"
assert_contains "$learning" "-7.md" "learning committed in the same change"
assert_contains "$(git -C "$ORIGIN" show "$branch:$learning")" "## What to check next time" "learning sections"
msg="$(git -C "$ORIGIN" log -1 --format=%B "$branch")"
assert_contains "$msg" "[fleet:fixer] Set the answer to 42. (signal #7)" "commit title"
assert_contains "$msg" "Co-Authored-By: Claude" "co-author line"
assert_file_missing "$(cat "$RUN_DIR/worktree-path")" "worktree removed"
assert_contains "$(cat "$RUN_DIR/worktree-path")" "$TMP/pr/worktrees/" "worktree created outside the checkout"
assert_eq "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" "main" "checkout untouched"

# ─── 2. main mode ───────────────────────────────────────────────────────────
run_fixer main FLEET_MODE=main FAKE_CLAUDE_OUTPUT="$TMP/bug.json" \
  FAKE_CLAUDE_EDITS='printf "export const answer = 42\n" > src/foo.ts'
assert_status "$FIXER_CODE" 0 "main run exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "pushed_main" "outcome pushed_main"
sha="$(json_get "$RUN_DIR/result.json" 'd.pr_or_commit')"
assert_eq "$(git -C "$ORIGIN" rev-parse main)" "$sha" "origin/main is the fixer commit"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).state')" "CLOSED" "issue closed"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments.map(c=>c.body).join("\n")')" "$sha" "closing comment names the commit"
assert_eq "$(json_get "$FAKE_GH_STATE/prs.json" 'd.length')" "0" "no PR in main mode"

# ─── 3. wontfix ─────────────────────────────────────────────────────────────
claude_output wontfix "Works as designed." >"$TMP/wontfix.json"
run_fixer wontfix FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/wontfix.json"
assert_status "$FIXER_CODE" 0 "wontfix exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "wontfix" "outcome wontfix"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).labels.map(l=>l.name).join(",")')" "bug,fleet:wontfix" "wontfix label"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments[0].body')" "Works as designed." "reasoning commented"
assert_eq "$(grep -c . "$FAKE_PNPM_LOG")" "0" "no gate for wontfix"
assert_eq "$(git -C "$ORIGIN" for-each-ref --format='%(refname)' 'refs/heads/fleet/*' | wc -l | tr -d ' ')" "0" "nothing pushed"

# ─── 4. needs-decision ──────────────────────────────────────────────────────
claude_output needs-decision "Needs a migration (Tier 1)." >"$TMP/nd.json"
run_fixer nd FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/nd.json"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "needs_decision" "outcome needs_decision"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).labels.map(l=>l.name).join(",")')" "bug,fleet:needs-decision" "needs-decision label"

# ─── 5. bug that touches a Tier 1 path is not shipped ───────────────────────
run_fixer tier1 FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/bug.json" \
  FAKE_CLAUDE_EDITS='mkdir -p supabase/migrations && echo "alter table x" > supabase/migrations/1.sql'
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "needs_decision" "tier1 → needs_decision"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments[0].body')" "Tier 1 path changed: supabase/migrations/1.sql" "reason names the path"
assert_file_exists "$RUN_DIR/fix.patch" "patch kept in the run dir"
assert_eq "$(grep -c . "$FAKE_PNPM_LOG")" "0" "gate not run on a Tier 1 change"

# ─── 6. gate fails once, resume fixes it ────────────────────────────────────
run_fixer retry FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/bug.json" \
  FAKE_CLAUDE_EDITS='printf "export const answer = 42\n" > src/foo.ts' \
  FAKE_CLAUDE_EDITS_2='printf "export const answer = 42 // lint ok\n" > src/foo.ts' \
  FAKE_PNPM_FAIL=lint FAKE_PNPM_FAIL_TIMES=1
assert_status "$FIXER_CODE" 0 "retry run exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "pr_opened" "shipped after one repair"
assert_eq "$(grep -c -- '--resume 11111111-2222-3333-4444-555555555555' "$FAKE_CLAUDE_LOG")" "1" "resumed the same session once"
assert_file_contains "$FAKE_CLAUDE_LOG.prompt-2" "fake pnpm: lint failed" "failure output handed back"
assert_file_contains "$RUN_DIR/gate-1/summary.txt" "FAIL lint" "first gate failed"
assert_file_contains "$RUN_DIR/gate-2/summary.txt" "ok unit" "second gate green"

# ─── 7. gate fails twice → needs-decision ───────────────────────────────────
run_fixer gatefail FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/bug.json" \
  FAKE_CLAUDE_EDITS='printf "export const answer = 42\n" > src/foo.ts' \
  FAKE_PNPM_FAIL=type-check FAKE_PNPM_FAIL_TIMES=5
assert_status "$FIXER_CODE" 0 "gate-failed run exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "gate_failed" "outcome gate_failed"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).labels.map(l=>l.name).join(",")')" "bug,fleet:needs-decision" "needs-decision after two failures"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments[0].body')" "FAIL type-check" "comment carries the gate summary"
assert_eq "$(git -C "$ORIGIN" for-each-ref --format='%(refname)' 'refs/heads/fleet/*' | wc -l | tr -d ' ')" "0" "nothing pushed"

# ─── 8. claude infrastructure error frees the issue ─────────────────────────
node -e 'process.stdout.write(JSON.stringify({is_error:true, result:"Failed to authenticate", session_id:"dead"}))' >"$TMP/err.json"
run_fixer autherr FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/err.json"
assert_status "$FIXER_CODE" 1 "error run exits 1"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "error" "outcome error"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).labels.map(l=>l.name).join(",")')" "bug" "in-progress label removed again"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments.length')" "0" "no comment on an infrastructure error"

# ─── 9. empty inbox ─────────────────────────────────────────────────────────
run_fixer idle FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/bug.json"
# make the inbox empty after the fact by labelling everything, then rerun in the same dirs
FAKE_GH_STATE="$TMP/idle/gh" node -e '
  const fs=require("fs"); const f=process.env.FAKE_GH_STATE+"/issues.json";
  const issues=JSON.parse(fs.readFileSync(f,"utf8")); for (const i of issues) if (!i.labels.some(l=>/^fleet:/.test(l.name))) i.labels.push({name:"fleet:wontfix"});
  fs.writeFileSync(f, JSON.stringify(issues));'
export RUN_DIR="$TMP/idle/run2"
code=0; FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/bug.json" bash "$REPO/fleet/bin/fixer.sh" >"$TMP/idle/stdout2.log" 2>"$TMP/idle/stderr2.log" || code=$?
assert_status "$code" 0 "idle exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "idle" "outcome idle"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.issue')" "" "no issue"

# ─── 10. lock held by a live process → exit 0, outcome locked ───────────────
mkdir -p "$TMP/idle/lock" && echo $$ >"$TMP/idle/lock/pid"
export RUN_DIR="$TMP/idle/run3"
code=0; FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/bug.json" bash "$REPO/fleet/bin/fixer.sh" >/dev/null 2>&1 || code=$?
assert_status "$code" 0 "locked exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "locked" "outcome locked"

# ─── 11. bad mode ───────────────────────────────────────────────────────────
code=0; FLEET_MODE=yolo bash "$REPO/fleet/bin/fixer.sh" >/dev/null 2>&1 || code=$?
assert_status "$code" 1 "unknown FLEET_MODE refused"

t_done
