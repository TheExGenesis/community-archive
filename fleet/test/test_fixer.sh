#!/usr/bin/env bash
# End-to-end fixer runs with fake gh, claude and pnpm against a throwaway repo.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP="$(t_tmpdir)"
trap 'rm -rf "$TMP"' EXIT
export PATH="$FAKES_DIR:$PATH"
# A secret the harness holds; the fake claude leaks it into a tool result.
export GH_TOKEN="ghp_TestTokenValue0123456789abcdefghijkl"

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
  export FLEET_METRICS_FILE="$base/metrics.prom"
  export FAKE_CURL_DIR="$base/curl"
  mkdir -p "$FAKE_CURL_DIR"
  FIXER_CODE=0
  env "$@" bash "$REPO/fleet/bin/fixer.sh" >"$base/stdout.log" 2>"$base/stderr.log" || FIXER_CODE=$?
}

# ─── 1. pr mode, clean bug ───────────────────────────────────────────────────
claude_output bug "Set the answer to 42." >"$TMP/bug.json"
run_fixer pr FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/bug.json" \
  FAKE_CLAUDE_EDITS='printf "export const answer = 42\n" > src/foo.ts' \
  FAKE_CLAUDE_LEAK="Authorization: Bearer $GH_TOKEN" \
  FLEET_RUNS_EXPLORE_URL='https://g.example/explore?run={run_id}'
assert_status "$FIXER_CODE" 0 "pr run exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "pr_opened" "outcome"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.issue')" "7" "picked #7"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.session_id')" "11111111-2222-3333-4444-555555555555" "session id recorded"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.pr_or_commit')" "https://github.com/o/r/pull/100" "pr url"
assert_eq "$(json_get "$RUN_DIR/result.json" 'typeof d.duration_s')" "number" "duration_s"
assert_file_exists "$RUN_DIR/issue.json" "issue saved"
assert_file_exists "$RUN_DIR/claude-output.json" "claude output saved"
assert_file_contains "$RUN_DIR/claude-invocations.txt" "--max-turns" "invocation recorded"
assert_file_contains "$RUN_DIR/claude-invocations.txt" "--output-format stream-json --verbose" "stream-json output requested"
# The transcript: raw scrubbed stream, rendered markdown, and the result event for the verdict.
assert_file_exists "$RUN_DIR/transcript.jsonl" "transcript.jsonl saved"
assert_eq "$(grep -c '"type":"result"' "$RUN_DIR/transcript.jsonl")" "1" "one result event for one call"
assert_file_contains "$RUN_DIR/transcript.md" "# Fleet fixer · $(basename "$RUN_DIR") · issue #7" "transcript.md rendered with the issue"
assert_file_contains "$RUN_DIR/transcript.md" "🔧 **Read \`src/foo.ts\`**" "transcript.md shows the tool call"
assert_file_contains "$RUN_DIR/transcript.md" '"classification": "bug"' "transcript.md ends with the verdict"
assert_not_contains "$(cat "$RUN_DIR/transcript.jsonl" "$RUN_DIR/transcript.md" "$RUN_DIR/claude-output.json" "$RUN_DIR/loki.jsonl")" "$GH_TOKEN" "GH_TOKEN scrubbed from every transcript file"
assert_file_contains "$RUN_DIR/transcript.md" "Authorization: [REDACTED]" "leak redacted, not dropped"
assert_eq "$(json_get "$RUN_DIR/claude-output.json" 'd.type')" "result" "claude-output.json is the result event"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.issue_url')" "https://github.com/o/r/issues/7" "issue_url"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.pr_url')" "https://github.com/o/r/pull/100" "pr_url"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.cost_usd')" "0.42" "cost_usd from the result event"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.calls')" "1" "one call"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.transcript_path')" "$(cd "$RUN_DIR" && pwd)/transcript.jsonl" "transcript_path"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.transcript_url')" "https://g.example/explore?run=$(basename "$RUN_DIR")" "transcript_url"
assert_contains "$(json_get "$RUN_DIR/result.json" 'd.learning_path')" "memos/fleet/learnings/" "learning_path"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.signal_fingerprint')" "" "no fingerprint on a plain bug"
assert_file_exists "$RUN_DIR/loki.jsonl" "loki export written"
assert_contains "$(head -n 1 "$RUN_DIR/loki.jsonl")" '"outcome":"pr_opened"' "export labelled with the final outcome"
assert_file_contains "$FAKE_CLAUDE_LOG" "--permission-mode dontAsk" "headless permission mode"
assert_file_contains "$FAKE_CLAUDE_LOG" "Bash\(git\ push\*\)" "git push disallowed"
assert_file_contains "$FAKE_CLAUDE_LOG.prompt-1" "Issue #7: bug: answer is off by one" "prompt carries the issue"
assert_file_contains "$FAKE_CLAUDE_LOG.prompt-1" "# Fleet fixer" "prompt carries fixer.md"
assert_file_contains "$RUN_DIR/gate-1/summary.txt" "ok unit" "gate ran all four checks"
assert_eq "$(grep -c . "$FAKE_PNPM_LOG")" "4" "four pnpm calls"
# The label went in-progress then pr-open, with a comment, and PR body has Fixes #7.
labels="$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).labels.map(l=>l.name).join(",")')"
assert_eq "$labels" "bug,fleet:pr-open" "issue labelled pr-open, in-progress removed"
comments="$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments.map(c=>c.body).join("\n")')"
assert_contains "$comments" "[fleet:fixer] PR opened" "comment posted"
assert_contains "$comments" "_Run \`$(basename "$RUN_DIR")\` · outcome \`pr_opened\` · " "comment carries the Run line"
assert_contains "$comments" "· \$0.42 · [transcript](https://g.example/explore?run=$(basename "$RUN_DIR"))_" "Run line links the transcript"
assert_contains "$(json_get "$FAKE_GH_STATE/prs.json" 'd[0].body')" "Fixes #7" "PR body closes the issue"
assert_contains "$(json_get "$FAKE_GH_STATE/prs.json" 'd[0].body')" "[transcript](https://g.example/explore?run=$(basename "$RUN_DIR"))" "PR body links the transcript"
assert_contains "$(json_get "$FAKE_GH_STATE/prs.json" 'd[0].title')" "[fleet:fixer] Set the answer to 42. (signal #7)" "PR title"
# The branch on origin has the fix, the learning, and the commit convention.
branch="$(json_get "$RUN_DIR/result.json" 'd.branch')"
assert_contains "$branch" "fleet/fixer-7-" "branch name"
assert_eq "$(git -C "$ORIGIN" show "$branch:src/foo.ts")" "export const answer = 42" "fix pushed"
learning="$(git -C "$ORIGIN" ls-tree -r --name-only "$branch" | grep '^memos/fleet/learnings/' || true)"
assert_contains "$learning" "-7.md" "learning committed in the same change"
assert_contains "$(git -C "$ORIGIN" show "$branch:$learning")" "## What to check next time" "learning sections"
assert_contains "$(git -C "$ORIGIN" show "$branch:$learning")" "[transcript](https://g.example/explore?run=" "learning links the transcript"
msg="$(git -C "$ORIGIN" log -1 --format=%B "$branch")"
assert_contains "$msg" "[fleet:fixer] Set the answer to 42. (signal #7)" "commit title"
assert_contains "$msg" "Co-Authored-By: Claude" "co-author line"
assert_file_missing "$(cat "$RUN_DIR/worktree-path")" "worktree removed"
# Usage, signal-to-fix and metrics land in result.json and the textfile.
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.usage.cost_usd + "|" + d.usage.tokens.input + "|" + d.usage.calls')" "0.42|1200|1" "usage in result.json"
assert_eq "$(json_get "$RUN_DIR/result.json" 'typeof d.signal_to_fix_s')" "number" "signal_to_fix_s in result.json"
assert_eq "$(awk '$1 == "fleet_run_total{outcome=\"pr_opened\",routine=\"fixer\"}" {print $2}' "$FLEET_METRICS_FILE")" "1" "metrics: run counted"
assert_eq "$(awk '$1 == "fleet_cost_usd_total{routine=\"fixer\"}" {print $2}' "$FLEET_METRICS_FILE")" "0.42" "metrics: cost"
assert_eq "$(awk '$1 == "fleet_tokens_total{kind=\"output\",routine=\"fixer\"}" {print $2}' "$FLEET_METRICS_FILE")" "340" "metrics: tokens"
assert_eq "$(awk '$1 == "fleet_signal_to_fix_seconds_count{routine=\"fixer\"}" {print $2}' "$FLEET_METRICS_FILE")" "1" "metrics: signal-to-fix recorded"
# #7 was created 2026-10-01, so the latency is at least 29 days.
assert_eq "$(node -e 'process.exit(Number(process.argv[1]) > 29*86400 ? 0 : 1)' "$(awk '$1 == "fleet_signal_to_fix_seconds{routine=\"fixer\"}" {print $2}' "$FLEET_METRICS_FILE")" && echo big)" "big" "metrics: latency from issue createdAt"
assert_eq "$(awk '$1 == "fleet_needs_decision_issues" {print $2}' "$FLEET_METRICS_FILE")" "1" "metrics: needs-decision gauge (#2)"
assert_eq "$(awk '$1 == "fleet_inbox_open" {print $2}' "$FLEET_METRICS_FILE")" "2" "metrics: inbox depth before the pick (#7, #10)"
assert_eq "$(awk '$1 == "fleet_open_fixer_prs" {print $2}' "$FLEET_METRICS_FILE")" "0" "metrics: open fixer PRs counted before this one"
assert_eq "$(ls "$FAKE_CURL_DIR"/post-*.json 2>/dev/null | wc -l | tr -d ' ')" "0" "no failure signal on success"
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
closing="$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments.map(c=>c.body).join("\n")')"
assert_contains "$closing" "$sha" "closing comment names the commit"
assert_contains "$closing" "· outcome \`pushed_main\` · " "closing comment carries the Run line"
assert_contains "$closing" "· transcript in the run directory_" "no link without FLEET_RUNS_EXPLORE_URL"
assert_not_contains "$closing" "](http" "no URL without the template"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.commit_url')" "https://github.com/o/r/commit/$sha" "commit_url"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.transcript_url')" "" "no transcript_url without the template"
assert_eq "$(json_get "$FAKE_GH_STATE/prs.json" 'd.length')" "0" "no PR in main mode"

# ─── 3. wontfix ─────────────────────────────────────────────────────────────
claude_output wontfix "Works as designed." >"$TMP/wontfix.json"
run_fixer wontfix FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/wontfix.json"
assert_status "$FIXER_CODE" 0 "wontfix exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "wontfix" "outcome wontfix"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).labels.map(l=>l.name).join(",")')" "bug,fleet:wontfix" "wontfix label"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments[0].body')" "Works as designed." "reasoning commented"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments[0].body')" "· outcome \`wontfix\` ·" "Run line names the outcome"
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
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.usage.calls + "|" + d.usage.cost_usd')" "2|0.84" "usage sums both claude calls"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "pr_opened" "shipped after one repair"
assert_eq "$(grep -c -- '--resume 11111111-2222-3333-4444-555555555555' "$FAKE_CLAUDE_LOG")" "1" "resumed the same session once"
assert_file_contains "$FAKE_CLAUDE_LOG.prompt-2" "fake pnpm: lint failed" "failure output handed back"
assert_file_contains "$RUN_DIR/gate-1/summary.txt" "FAIL lint" "first gate failed"
assert_file_contains "$RUN_DIR/gate-2/summary.txt" "ok unit" "second gate green"
assert_eq "$(grep -c '"type":"result"' "$RUN_DIR/transcript.jsonl")" "2" "resume appended to the same transcript"
assert_eq "$(grep -c '"subtype":"init"' "$RUN_DIR/transcript.jsonl")" "2" "both calls start with init"
assert_file_contains "$RUN_DIR/transcript.md" "## Call 2 (resumed)" "transcript.md shows the resumed call"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.calls')" "2" "two calls counted"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.cost_usd')" "0.84" "cost summed over both calls"
assert_eq "$(json_get "$RUN_DIR/claude-output-2.json" 'd.type')" "result" "second call's result event extracted"

# ─── 7. gate fails twice → needs-decision ───────────────────────────────────
run_fixer gatefail FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/bug.json" \
  FAKE_CLAUDE_EDITS='printf "export const answer = 42\n" > src/foo.ts' \
  FAKE_PNPM_FAIL=type-check FAKE_PNPM_FAIL_TIMES=5
assert_status "$FIXER_CODE" 0 "gate-failed run exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "gate_failed" "outcome gate_failed"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).labels.map(l=>l.name).join(",")')" "bug,fleet:needs-decision" "needs-decision after two failures"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments[0].body')" "FAIL type-check" "comment carries the gate summary"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments[0].body')" "· outcome \`gate_failed\` ·" "Run line says gate_failed"
assert_eq "$(git -C "$ORIGIN" for-each-ref --format='%(refname)' 'refs/heads/fleet/*' | wc -l | tr -d ' ')" "0" "nothing pushed"

# ─── 8. claude infrastructure error frees the issue and files a fleet signal ─
node -e 'process.stdout.write(JSON.stringify({is_error:true, result:"Failed to authenticate", session_id:"dead"}))' >"$TMP/err.json"
run_fixer autherr FLEET_MODE=pr FAKE_CLAUDE_OUTPUT="$TMP/err.json" SIGNALS_WEBHOOK_SECRET=sec CA_URL=https://ca.example
assert_status "$FIXER_CODE" 1 "error run exits 1"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "error" "outcome error"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).labels.map(l=>l.name).join(",")')" "bug" "in-progress label removed again"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===7).comments.length')" "0" "no comment on an infrastructure error"
assert_file_contains "$RUN_DIR/transcript.md" "**API error:** authentication_failed" "transcript.md shows the API error"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "error" "result outcome error"
assert_contains "$(head -n 1 "$RUN_DIR/loki.jsonl")" '"outcome":"error"' "export labelled error"
post="$FAKE_CURL_DIR/post-1.json"
assert_file_exists "$post" "failure signal posted"
assert_eq "$(json_get "$post" 'd[0].key')" "fleet:fixer:claude" "failure kind is claude"
assert_contains "$(json_get "$post" 'd[0].summary')" "Failed to authenticate" "summary carries claude's error"
assert_contains "$(json_get "$post" 'd[0].summary')" "while on issue #7" "summary names the issue"
assert_contains "$(grep -- '-X POST' "$FAKE_CURL_DIR/calls.log")" "https://ca.example/api/signals/generic" "posted to the generic inbox source"
assert_eq "$(awk '$1 == "fleet_run_total{outcome=\"error\",routine=\"fixer\"}" {print $2}' "$FLEET_METRICS_FILE")" "1" "metrics: error counted"
assert_eq "$(awk '$1 == "fleet_consecutive_failures{routine=\"fixer\"}" {print $2}' "$FLEET_METRICS_FILE")" "1" "metrics: consecutive failures"
assert_eq "$(awk '$1 == "fleet_failure_signals_total{kind=\"claude\",routine=\"fixer\"}" {print $2}' "$FLEET_METRICS_FILE")" "1" "metrics: failure signal counted"
assert_eq "$(grep -c 'fleet_last_success_timestamp' "$FLEET_METRICS_FILE" || true)" "0" "metrics: no last_success after an error"

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
assert_eq "$(ls "$FAKE_CURL_DIR"/post-*.json 2>/dev/null | wc -l | tr -d ' ')" "0" "idle is not a failure: no signal"
assert_eq "$(awk '$1 == "fleet_run_total{outcome=\"idle\",routine=\"fixer\"}" {print $2}' "$FLEET_METRICS_FILE")" "1" "metrics: idle counted"
assert_eq "$(awk '$1 == "fleet_inbox_open" {print $2}' "$FLEET_METRICS_FILE")" "0" "metrics: empty inbox gauge"

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
