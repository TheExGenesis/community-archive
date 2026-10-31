#!/usr/bin/env bash
# Daily digest: rendered from run directories and fake gh state, dry run and posted.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP="$(t_tmpdir)"
trap 'rm -rf "$TMP"' EXIT
export PATH="$FAKES_DIR:$PATH"
export FLEET_REPO="o/r"
export FLEET_RUNS_DIR="$TMP/runs"
export FLEET_METRICS_FILE="$TMP/runs/metrics.prom"
export FAKE_CURL_DIR="$TMP/curl"
mkdir -p "$FAKE_CURL_DIR" "$FLEET_RUNS_DIR"
metric() { awk -v k="$2" '$1 == k { print $2 }' "$1"; }

# Fixed clock: the window is 2026-10-30T07:00Z → 2026-10-31T07:00Z.
SINCE="2026-10-30T07:00:00Z"
export FLEET_DIGEST_SINCE="$SINCE" FLEET_DIGEST_UNTIL="2026-10-31T07:00:00Z" FLEET_DIGEST_DATE="2026-10-31"

# ─── gh state: signals, a decision, PRs, a revert, an old digest ────────────
make_gh_state "$TMP/gh"
FAKE_GH_STATE="$TMP/gh" node -e '
  const fs = require("fs"); const s = process.env.FAKE_GH_STATE;
  const issues = JSON.parse(fs.readFileSync(s + "/issues.json", "utf8"));
  issues.push(
    {number: 20, title: "[signal:vercel] 502 on /api/search", state: "OPEN", createdAt: "2026-10-30T09:12:00Z",
     labels: [{name: "signal"}, {name: "fleet:pr-open"}], body: "", comments: []},
    {number: 21, title: "[signal:canary] home failed", state: "CLOSED", createdAt: "2026-10-30T22:40:00Z", closedAt: "2026-10-30T23:10:00Z",
     labels: [{name: "signal"}], body: "", comments: []},
    {number: 22, title: "[signal:posthog] TypeError in hex map", state: "OPEN", createdAt: "2026-10-29T12:00:00Z",
     labels: [{name: "signal"}], body: "", comments: []},
    {number: 30, title: "[fleet:digest] 2026-10-30", state: "OPEN", createdAt: "2026-10-30T07:00:30Z",
     labels: [{name: "fleet:digest"}], body: "old digest", comments: []});
  fs.writeFileSync(s + "/issues.json", JSON.stringify(issues));
  fs.writeFileSync(s + "/prs.json", JSON.stringify([
    {number: 101, url: "https://github.com/o/r/pull/101", title: "[fleet:fixer] Fix search 502 (signal #20)", head: "fleet/fixer-20-20261030091500", base: "main", state: "OPEN", createdAt: "2026-10-30T09:31:00Z"},
    {number: 102, url: "https://github.com/o/r/pull/102", title: "[fleet:fixer] Fix off by one (signal #7)", head: "fleet/fixer-7-20261030100000", base: "main", state: "MERGED", createdAt: "2026-10-30T10:05:00Z", mergedAt: "2026-10-30T15:00:00Z"},
    {number: 103, url: "https://github.com/o/r/pull/103", title: "[fleet:fixer] Loosen a test (signal #9)", head: "fleet/fixer-9-20261030110000", base: "main", state: "CLOSED", createdAt: "2026-10-30T11:05:00Z", closedAt: "2026-10-30T12:00:00Z"},
    {number: 104, url: "https://github.com/o/r/pull/104", title: "Human PR", head: "feature/x", base: "main", state: "OPEN", createdAt: "2026-10-30T11:05:00Z"},
    {number: 90, url: "https://github.com/o/r/pull/90", title: "[fleet:fixer] Old one (signal #5)", head: "fleet/fixer-5-20261020000000", base: "main", state: "MERGED", createdAt: "2026-10-20T00:00:00Z", mergedAt: "2026-10-20T01:00:00Z"}]));
  fs.writeFileSync(s + "/commits.json", JSON.stringify([
    {sha: "abcdef1234567890", html_url: "https://github.com/o/r/commit/abcdef1234567890", commit: {message: "Revert \"[fleet:fixer] Loosen a test (signal #9)\"\n\nThis reverts commit 1234.", committer: {date: "2026-10-30T12:30:00Z"}}},
    {sha: "feedfacefeedface", html_url: "https://github.com/o/r/commit/feedfacefeedface", commit: {message: "[fleet:fixer] Fix off by one (signal #7)", committer: {date: "2026-10-30T15:00:00Z"}}},
    {sha: "0000000000000000", html_url: "https://github.com/o/r/commit/0000000000000000", commit: {message: "Human commit", committer: {date: "2026-10-30T16:00:00Z"}}}]));
'

# ─── run directories: fixer and canary results inside and outside the window ─
mkrun() { # <dir-name> <json>
  mkdir -p "$FLEET_RUNS_DIR/$1"
  printf '%s\n' "$2" >"$FLEET_RUNS_DIR/$1/result.json"
}
mkrun 20261030T091500Z-fixer '{"outcome":"pr_opened","issue":20,"pr_or_commit":"https://github.com/o/r/pull/101","session_id":"s1","duration_s":912,"run":"fixer","finished_at":"2026-10-30T09:31:00Z","mode":"pr","classification":"bug","branch":"fleet/fixer-20-20261030091500","learning":"memos/fleet/learnings/2026-10-30-20.md","signal_to_fix_s":1140,"usage":{"cost_usd":1.25,"tokens":{"input":5000,"output":900,"cache_read":200000,"cache_creation":12000},"calls":1}}'
mkrun 20261030T100000Z-fixer '{"outcome":"pushed_main","issue":7,"pr_or_commit":"feedfacefeedface","session_id":"s2","duration_s":600,"run":"fixer","finished_at":"2026-10-30T10:10:00Z","mode":"main","classification":"bug","learning":"memos/fleet/learnings/2026-10-30-7.md","run_id":"20261030T100000Z-fixer","transcript_url":"https://g.example/explore?run=20261030T100000Z-fixer","usage":{"cost_usd":0.75,"tokens":{"input":1000,"output":100,"cache_read":1000,"cache_creation":0},"calls":2}}'
mkrun 20261030T120000Z-fixer '{"outcome":"needs_decision","issue":22,"pr_or_commit":null,"session_id":"s3","duration_s":300,"run":"fixer","finished_at":"2026-10-30T12:05:00Z","classification":"needs-decision","usage":{"cost_usd":0.2,"tokens":{"input":10,"output":10,"cache_read":0,"cache_creation":0},"calls":1}}'
mkrun 20261030T130000Z-fixer '{"outcome":"idle","issue":null,"pr_or_commit":null,"session_id":null,"duration_s":4,"run":"fixer","finished_at":"2026-10-30T13:00:04Z"}'
mkrun 20261030T140000Z-fixer '{"outcome":"error","issue":22,"pr_or_commit":null,"session_id":null,"duration_s":30,"run":"fixer","finished_at":"2026-10-30T14:00:30Z"}'
printf '[{"key":"fleet:fixer:claude","summary":"x","details":{"kind":"claude","message":"claude run failed: Failed to authenticate"}}]\n' >"$FLEET_RUNS_DIR/20261030T140000Z-fixer/signal-failure.json"
mkrun 20261029T090000Z-fixer '{"outcome":"pr_opened","issue":5,"pr_or_commit":"https://github.com/o/r/pull/90","duration_s":1,"run":"fixer","finished_at":"2026-10-29T09:00:01Z","usage":{"cost_usd":99,"tokens":{"input":1,"output":1,"cache_read":0,"cache_creation":0},"calls":1}}'
mkrun 20261030T224500Z-canary '{"outcome":"failed","run":"canary","finished_at":"2026-10-30T22:45:10Z","duration_s":9,"checks":{"home":{"verdict":"failed"},"search":{"verdict":"ok"}},"new_failures":["home"],"still_failing":[],"recovered":[],"rollback":{"attempted":true,"ok":true,"from":{"url":"ca-new.vercel.app"},"to":{"url":"ca-old.vercel.app"}}}'
mkrun 20261030T230000Z-canary '{"outcome":"ok","run":"canary","finished_at":"2026-10-30T23:00:10Z","duration_s":8,"checks":{"home":{"verdict":"ok"},"search":{"verdict":"ok"}},"new_failures":[],"still_failing":[],"recovered":["home"],"rollback":{"attempted":false},"deployment":{"sha":"deadbeefcafebabe"}}'
mkrun 20261031T064500Z-canary '{"outcome":"ok","run":"canary","finished_at":"2026-10-31T06:45:10Z","duration_s":7,"checks":{"home":{"verdict":"ok"},"search":{"verdict":"ok"}},"new_failures":[],"still_failing":[],"recovered":[],"rollback":{"attempted":false}}'
mkrun 20261030T080000Z-pipeline '{"outcome":"ok","run":"pipeline","finished_at":"2026-10-30T08:00:00Z","duration_s":20}'
mkdir -p "$FLEET_RUNS_DIR/20261031T070000Z-digest" # an empty run dir without result.json is ignored
ln -s "$FLEET_RUNS_DIR/20261031T064500Z-canary" "$FLEET_RUNS_DIR/latest-canary"

# ─── 1. dry run: prints, posts nothing ──────────────────────────────────────
export RUN_DIR="$TMP/runs/20261031T070001Z-digest"
code=0
FLEET_DRY_RUN=true bash "$FLEET_SRC_ROOT/fleet/bin/digest.sh" >"$TMP/dry.out" 2>"$TMP/dry.err" || code=$?
assert_status "$code" 0 "dry run exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "dry_run" "outcome dry_run"
assert_file_contains "$TMP/dry.out" "# [fleet:digest] 2026-10-31" "title printed"
D="$RUN_DIR/digest.md"
assert_file_exists "$D" "digest.md written"
# Signals: #20 and #21 are in the window, #22 (created 10-29) is not.
assert_file_contains "$D" "## Signals received · 2" "two signals received"
assert_file_contains "$D" "[#20 [signal:vercel] 502 on /api/search](https://github.com/o/r/issues/20) | 09:12Z | open · fleet:pr-open" "signal row with state and fleet label"
assert_file_contains "$D" "| 22:40Z | closed |" "closed signal row"
assert_eq "$(grep -c '#22 \[signal:posthog\]' "$D")" "0" "older signal not listed as received"
assert_file_contains "$D" "Open signals in total: **3**" "open signals total (10, 20, 22)"
# Fixer runs: 5 in window, the 10-29 one excluded, idle not in the table.
assert_file_contains "$D" "## Fixer · 5 runs (" "five fixer runs"
assert_file_contains "$D" "| 09:31Z | [#20](https://github.com/o/r/issues/20) | pr_opened | [PR #101](https://github.com/o/r/pull/101) | [2026-10-30-20](https://github.com/o/r/blob/fleet/fixer-20-20261030091500/memos/fleet/learnings/2026-10-30-20.md) | 15m | \$1.25 | \`20261030T091500Z-fixer\` |" "pr row links PR and learning on the branch, names the run without a transcript url"
assert_file_contains "$D" "| pushed_main | [feedface](https://github.com/o/r/commit/feedfacefeedface) | [2026-10-30-7](https://github.com/o/r/blob/main/memos/fleet/learnings/2026-10-30-7.md) |" "main row links commit and learning on main"
assert_file_contains "$D" "| \$0.75 | [transcript](https://g.example/explore?run=20261030T100000Z-fixer) |" "main row links the transcript from result.json"
assert_file_contains "$D" "| Finished | Issue | Outcome | Shipped | Learning | Took | Cost | Run |" "run column in the fixer table"
assert_file_contains "$D" "| needs_decision (needs-decision) | — | — |" "needs-decision row"
assert_eq "$(grep -c '| idle |' "$D")" "0" "idle runs stay out of the table"
assert_file_contains "$D" "opened **3** · merged **1** · closed without merge **1**" "fleet PR counts in the window (101, 102, 103 opened; 90 is older)"
assert_file_contains "$D" "Fleet commits on \`main\`: **1**, reverts of fleet commits: **1**" "commits and reverts"
assert_file_contains "$D" "- merged [#102 [fleet:fixer] Fix off by one (signal #7)](https://github.com/o/r/pull/102) at 15:00Z" "merged PR listed"
assert_file_contains "$D" "- revert [abcdef12](https://github.com/o/r/commit/abcdef1234567890): Revert \"[fleet:fixer] Loosen a test (signal #9)\"" "revert listed"
# Canary
assert_file_contains "$D" "Latest: **ok** at 06:45Z (14 min ago), 2/2 checks ok." "latest canary"
assert_file_contains "$D" "Runs in window: **3** (ok 2 · failed 1)" "canary run counts"
assert_file_contains "$D" "- new failures: home at 22:45Z" "new failure"
assert_file_contains "$D" "- recovered: home at 23:00Z" "recovery"
assert_file_contains "$D" "- rollback at 22:45Z: rolled back ca-new.vercel.app → ca-old.vercel.app" "rollback"
# Cost: 1.25 + 0.75 + 0.2 = 2.20 over 4 calls, the 10-29 run excluded.
assert_file_contains "$D" "**\$2.20** across 4 Claude calls in 3 runs: 6,010 input · 1,010 output · 201,000 cache read · 12,000 cache write tokens" "cost line"
# Failures
assert_file_contains "$D" "## Fleet failures · 1" "one failure"
assert_file_contains "$D" "14:00Z **fixer** on #22 · claude: claude run failed: Failed to authenticate (run \`20261030T140000Z-fixer\`)" "failure line"
# Other routines
assert_file_contains "$D" "- **pipeline**: 1 run (1 ok)" "other routine"
# Needs a human
assert_file_contains "$D" "**Decisions · 1**" "one decision"
assert_file_contains "$D" "[#2 bug: already decided](https://github.com/o/r/issues/2)" "decision listed"
assert_file_contains "$D" "**Fleet PRs awaiting merge · 1**" "one open fleet PR"
assert_file_contains "$D" "[#101 [fleet:fixer] Fix search 502 (signal #20)](https://github.com/o/r/pull/101)" "open PR listed"
assert_eq "$(grep -c 'Human PR' "$D")" "0" "human PRs ignored"
assert_file_contains "$D" "Closes the previous digest [#30](https://github.com/o/r/issues/30)" "footer names the previous digest"
assert_file_contains "$D" "[Dashboard](https://neatrowan1763.grafana.net/d/ca-fleet)" "dashboard link"
# Nothing written to GitHub, metrics recorded with gauges.
assert_eq "$(grep -c 'issue create\|issue close' "$FAKE_GH_STATE/calls.log")" "0" "dry run writes nothing"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===30).state')" "OPEN" "previous digest untouched"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_run_total{outcome="dry_run",routine="digest"}')" "1" "metrics: digest run"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_needs_decision_issues')" "1" "metrics: needs-decision gauge"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_open_fixer_prs')" "1" "metrics: open fixer PRs"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_prs_merged_24h')" "1" "metrics: merged"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_reverts_24h')" "1" "metrics: reverts"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_signals_open')" "3" "metrics: open signals"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_signals_received_24h')" "2" "metrics: received"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_cost_usd_24h')" "2.2" "metrics: cost 24h"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_failures_24h')" "1" "metrics: failures 24h"

# ─── 2. posted: issue created with the label, previous digest closed ────────
export RUN_DIR="$TMP/runs/20261031T070002Z-digest"
code=0
bash "$FLEET_SRC_ROOT/fleet/bin/digest.sh" >"$TMP/post.out" 2>"$TMP/post.err" || code=$?
assert_status "$code" 0 "posted run exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "posted" "outcome posted"
new="$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.title==="[fleet:digest] 2026-10-31")')"
assert_contains "$new" '"name":"fleet:digest"' "new digest carries the label"
assert_contains "$new" "## Fixer · 5 runs" "body is the digest"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.pr_or_commit')" "https://github.com/o/r/issues/1008" "issue url recorded"
assert_eq "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===30).state')" "CLOSED" "previous digest closed"
assert_contains "$(json_get "$FAKE_GH_STATE/issues.json" 'd.find(i=>i.number===30).comments[0].body')" "Superseded by https://github.com/o/r/issues/1008" "closing comment points forward"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.closed_previous.join(",")')" "30" "closed list in result"
assert_file_contains "$FAKE_GH_STATE/labels.txt" "fleet:digest" "label ensured"
assert_eq "$(ls "$FAKE_CURL_DIR"/post-*.json 2>/dev/null | wc -l | tr -d ' ')" "0" "no failure signal"

# ─── 3. gh failures degrade to 'unknown' and a harness crash files a signal ─
export RUN_DIR="$TMP/runs/20261031T070003Z-digest"
code=0
FAKE_GH_STATE="$TMP/nonexistent" FLEET_DRY_RUN=true SIGNALS_WEBHOOK_SECRET=sec bash "$FLEET_SRC_ROOT/fleet/bin/digest.sh" >"$TMP/bad.out" 2>"$TMP/bad.err" || code=$?
assert_status "$code" 0 "gh failures do not fail the digest"
assert_file_contains "$RUN_DIR/digest.md" "## Signals received · unknown" "unknown, not zero"
assert_file_contains "$RUN_DIR/digest.md" "_Could not list fleet:needs-decision issues (gh failed)._" "decisions unknown"
assert_file_contains "$RUN_DIR/digest.md" "## Fixer · 5 runs" "runs still rendered from disk"
export RUN_DIR="$TMP/runs/20261031T070004Z-digest"
code=0
FLEET_DIGEST_SINCE=yesterday SIGNALS_WEBHOOK_SECRET=sec CA_URL=https://ca.example bash "$FLEET_SRC_ROOT/fleet/bin/digest.sh" >/dev/null 2>&1 || code=$?
assert_status "$code" 1 "bad window fails the run"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "error" "outcome error"
assert_eq "$(json_get "$FAKE_CURL_DIR/post-1.json" 'd[0].key')" "fleet:digest:harness" "failure signal from the digest"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_run_total{outcome="error",routine="digest"}')" "1" "metrics: digest error"

t_done
