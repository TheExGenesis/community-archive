#!/usr/bin/env bash
# fleet_record_metrics (Prometheus textfile), fleet_claude_usage, fleet_post_signal,
# and the runs-directory default.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP="$(t_tmpdir)"
trap 'rm -rf "$TMP"' EXIT
export PATH="$FAKES_DIR:$PATH"

# metric <file> <sample-key> : value of one sample line, e.g. 'fleet_run_total{outcome="ok",routine="x"}'
metric() {
  awk -v k="$2" '$1 == k { print $2 }' "$1"
}

# ─── 1. runs directory default follows FLEET_HOME, then RUN_DIR ─────────────
out="$(FLEET_HOME=/srv/fleet bash -c 'source "$1"; echo "$FLEET_RUNS_DIR $FLEET_METRICS_FILE"' _ "$FLEET_SRC_ROOT/fleet/lib/common.sh")"
assert_eq "$out" "/srv/fleet/runs /srv/fleet/runs/metrics.prom" "FLEET_HOME → runs/ and metrics.prom beside the runs"
out="$(RUN_DIR=/x/runs/20261030T000000Z-fixer bash -c 'source "$1"; echo "$FLEET_RUNS_DIR"' _ "$FLEET_SRC_ROOT/fleet/lib/common.sh")"
assert_eq "$out" "/x/runs" "RUN_DIR alone → its parent"
out="$(env -u FLEET_HOME -u RUN_DIR -u FLEET_RUNS_DIR bash -c 'source "$1"; echo "$FLEET_RUNS_DIR"' _ "$FLEET_SRC_ROOT/fleet/lib/common.sh")"
assert_eq "$out" "$FLEET_SRC_ROOT/.fleet-runs" "neither → ./.fleet-runs"

# ─── 2. usage from claude -p json ───────────────────────────────────────────
source "$FLEET_SRC_ROOT/fleet/lib/common.sh"
claude_output bug >"$TMP/c1.json"
claude_output bug >"$TMP/c2.json"
echo 'not json' >"$TMP/c3.json"
usage="$(fleet_claude_usage "$TMP/c1.json" "$TMP/c2.json" "$TMP/c3.json" "$TMP/missing.json")"
assert_eq "$(printf '%s' "$usage" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const u=JSON.parse(s);process.stdout.write([u.calls,u.cost_usd,u.tokens.input,u.tokens.output,u.tokens.cache_read,u.tokens.cache_creation].join(","))})')" \
  "2,0.84,2400,680,160000,10000" "two valid results summed, junk ignored"

# ─── 3. record_metrics: first run creates the file ──────────────────────────
export FLEET_METRICS_FILE="$TMP/metrics/metrics.prom"
export RUN_DIR="$TMP/run1"
fleet_init_run fixer >/dev/null 2>&1
printf '{"fleet_needs_decision_issues": 3, "fleet_open_fixer_prs": 1, "fleet_canary_check_ok{check=\\"home\\"}": 1, "fleet_things_total": 2}\n' >"$TMP/g1.json"
fleet_record_metrics --outcome pr_opened --usage-file "$TMP/c1.json" --signal-to-fix 3600 --gauges "$TMP/g1.json" 2>/dev/null
M="$FLEET_METRICS_FILE"
assert_file_exists "$M" "metrics file created"
assert_eq "$(metric "$M" 'fleet_run_total{outcome="pr_opened",routine="fixer"}')" "1" "run counted"
assert_eq "$(metric "$M" 'fleet_tokens_total{kind="input",routine="fixer"}')" "1200" "input tokens"
assert_eq "$(metric "$M" 'fleet_tokens_total{kind="cache_read",routine="fixer"}')" "80000" "cache read tokens"
assert_eq "$(metric "$M" 'fleet_cost_usd_total{routine="fixer"}')" "0.42" "cost"
assert_eq "$(metric "$M" 'fleet_signal_to_fix_seconds{routine="fixer"}')" "3600" "signal to fix"
assert_eq "$(metric "$M" 'fleet_signal_to_fix_seconds_count{routine="fixer"}')" "1" "signal to fix count"
assert_eq "$(metric "$M" 'fleet_consecutive_failures{routine="fixer"}')" "0" "no consecutive failures"
assert_eq "$(metric "$M" 'fleet_needs_decision_issues')" "3" "gauge from file"
assert_eq "$(metric "$M" 'fleet_canary_check_ok{check="home"}')" "1" "labelled gauge from file"
assert_eq "$(metric "$M" 'fleet_things_total')" "2" "_total gauge treated as counter"
assert_eq "$(metric "$M" 'fleet_run_duration_seconds{routine="fixer"}')" "0" "duration recorded"
now="$(date +%s)"
success="$(metric "$M" 'fleet_last_success_timestamp{routine="fixer"}')"
assert_eq "$(node -e 'process.stdout.write(String(Math.abs(Number(process.argv[1]) - Number(process.argv[2])) < 5))' "$success" "$now")" "true" "last success is now"
assert_file_contains "$M" "# TYPE fleet_run_total counter" "counter type header"
assert_file_contains "$M" "# TYPE fleet_last_success_timestamp gauge" "gauge type header"
assert_file_contains "$M" "# HELP fleet_cost_usd_total" "help header"
assert_eq "$(ls "$TMP/metrics")" "metrics.prom" "no temp file or lock left behind"

# ─── 4. second run adds to counters, replaces gauges; errors count consecutively ─
export RUN_DIR="$TMP/run2"
fleet_init_run fixer >/dev/null 2>&1
printf '{"fleet_needs_decision_issues": 2, "fleet_things_total": 3}\n' >"$TMP/g2.json"
fleet_record_metrics --outcome error --gauges "$TMP/g2.json" 2>/dev/null
assert_eq "$(metric "$M" 'fleet_run_total{outcome="pr_opened",routine="fixer"}')" "1" "earlier outcome kept"
assert_eq "$(metric "$M" 'fleet_run_total{outcome="error",routine="fixer"}')" "1" "error counted"
assert_eq "$(metric "$M" 'fleet_consecutive_failures{routine="fixer"}')" "1" "one failure in a row"
assert_eq "$(metric "$M" 'fleet_last_success_timestamp{routine="fixer"}')" "$success" "last success unchanged on error"
assert_eq "$(metric "$M" 'fleet_needs_decision_issues')" "2" "gauge replaced"
assert_eq "$(metric "$M" 'fleet_things_total')" "5" "counter added"
assert_eq "$(metric "$M" 'fleet_tokens_total{kind="input",routine="fixer"}')" "1200" "tokens unchanged without usage"
fleet_record_metrics --outcome error 2>/dev/null
fleet_record_metrics --outcome error 2>/dev/null
assert_eq "$(metric "$M" 'fleet_consecutive_failures{routine="fixer"}')" "3" "three failures in a row"
fleet_record_metrics --outcome idle 2>/dev/null
assert_eq "$(metric "$M" 'fleet_consecutive_failures{routine="fixer"}')" "0" "reset on a handled outcome"
assert_eq "$(metric "$M" 'fleet_run_total{outcome="error",routine="fixer"}')" "3" "errors total"

# ─── 5. another routine shares the file ─────────────────────────────────────
export RUN_DIR="$TMP/run3"
fleet_init_run canary >/dev/null 2>&1
fleet_record_metrics --outcome ok 2>/dev/null
assert_eq "$(metric "$M" 'fleet_run_total{outcome="ok",routine="canary"}')" "1" "canary counted"
assert_eq "$(metric "$M" 'fleet_run_total{outcome="error",routine="fixer"}')" "3" "fixer series untouched"
assert_eq "$(grep -c '^fleet_run_total{' "$M")" "4" "four run_total series"

# ─── 6. concurrent writers do not lose updates ──────────────────────────────
for i in 1 2 3 4 5 6 7 8; do
  RUN_DIR="$TMP/par$i" bash -c 'source "$1"; fleet_init_run canary; fleet_record_metrics --outcome ok' _ "$FLEET_SRC_ROOT/fleet/lib/common.sh" >/dev/null 2>&1 &
done
wait
assert_eq "$(metric "$M" 'fleet_run_total{outcome="ok",routine="canary"}')" "9" "eight parallel runs all counted"
assert_eq "$(ls "$TMP/metrics")" "metrics.prom" "lock released"

# ─── 7. a corrupt line is dropped, the rest survives ────────────────────────
echo 'garbage here' >>"$M"
fleet_record_metrics --outcome ok 2>/dev/null
assert_eq "$(grep -c garbage "$M")" "0" "garbage dropped on rewrite"
assert_eq "$(metric "$M" 'fleet_run_total{outcome="ok",routine="canary"}')" "10" "counters intact"

# ─── 8. failure kind ────────────────────────────────────────────────────────
assert_eq "$(fleet_failure_kind "read-back failed: PR #3 is not open")" "readback" "readback kind"
assert_eq "$(fleet_failure_kind "claude run failed: Failed to authenticate")" "claude" "claude kind"
assert_eq "$(fleet_failure_kind "missing required command: gh")" "toolchain" "toolchain kind"
assert_eq "$(fleet_failure_kind "git refused")" "harness" "default kind"
assert_eq "$(FLEET_FAILURE_KIND=custom fleet_failure_kind "whatever")" "custom" "override"

# ─── 9. fleet_post_signal: body shape, bearer, generic source, metrics counter ─
export FAKE_CURL_DIR="$TMP/curl"
mkdir -p "$FAKE_CURL_DIR"
export RUN_DIR="$TMP/run4"
fleet_init_run fixer >/dev/null 2>&1
echo "2026-10-30T00:00:00Z [error] something broke" >"$RUN_DIR/log.txt"
SIGNALS_WEBHOOK_SECRET=sec CA_URL=https://ca.example fleet_post_signal claude "claude run failed: Failed to authenticate (while on issue #7)" 2>/dev/null
post="$FAKE_CURL_DIR/post-1.json"
assert_file_exists "$post" "signal posted"
assert_eq "$(json_get "$post" 'd.length')" "1" "one signal"
assert_eq "$(json_get "$post" 'd[0].key')" "fleet:fixer:claude" "stable key per routine and kind"
assert_eq "$(json_get "$post" 'd[0].title')" "Fleet fixer failed: claude" "title"
assert_eq "$(json_get "$post" 'd[0].severity + "|" + d[0].state')" "warning|firing" "severity and state"
assert_contains "$(json_get "$post" 'd[0].summary')" "Failed to authenticate (while on issue #7)" "summary carries the message"
assert_contains "$(json_get "$post" 'd[0].summary')" "run run4" "summary names the run"
assert_eq "$(json_get "$post" 'd[0].details.kind + "|" + d[0].details.routine')" "claude|fixer" "details"
assert_contains "$(json_get "$post" 'd[0].details.log_tail.join("\n")')" "something broke" "log tail included"
assert_contains "$(grep -- '-X POST' "$FAKE_CURL_DIR/calls.log")" "https://ca.example/api/signals/generic" "posted to the generic source"
assert_contains "$(grep -- '-X POST' "$FAKE_CURL_DIR/calls.log")" "Authorization:\ Bearer\ sec" "bearer"
assert_file_exists "$RUN_DIR/signal-failure.json" "body kept in the run dir"
assert_file_exists "$RUN_DIR/signal-failure.response" "response kept"
fleet_record_metrics --outcome error 2>/dev/null
assert_eq "$(metric "$M" 'fleet_failure_signals_total{kind="claude",routine="fixer"}')" "1" "failure signal counted"

# without a secret: written, not sent
export RUN_DIR="$TMP/run5"
fleet_init_run canary >/dev/null 2>&1
posts_before="$(ls "$FAKE_CURL_DIR"/post-*.json | wc -l | tr -d ' ')"
SIGNALS_WEBHOOK_SECRET='' fleet_post_signal harness "git refused" 2>/dev/null
assert_eq "$(ls "$FAKE_CURL_DIR"/post-*.json | wc -l | tr -d ' ')" "$posts_before" "nothing sent without a secret"
assert_file_contains "$RUN_DIR/signal-failure.response" "not sent" "recorded as not sent"
assert_eq "$(json_get "$RUN_DIR/signal-failure.json" 'd[0].key')" "fleet:canary:harness" "canary key"

t_done
