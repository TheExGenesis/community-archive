#!/usr/bin/env bash
# Canary runs with a fake curl and npx.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP="$(t_tmpdir)"
trap 'rm -rf "$TMP"' EXIT
export PATH="$FAKES_DIR:$PATH"
export FLEET_RUNS_DIR="$TMP/runs"
export FAKE_CURL_DIR="$TMP/curl"
export FAKE_NPX_LOG="$TMP/npx.log"
export FLEET_METRICS_FILE="$TMP/metrics.prom"
mkdir -p "$FAKE_CURL_DIR"
metric() { awk -v k="$2" '$1 == k { print $2 }' "$1"; }
: >"$FAKE_NPX_LOG"

green() {
  cat >"$FAKE_CURL_DIR/responses.json" <<'EOF'
{"/": {"status": 200, "time": 0.6}, "/search": {"status": 200, "time": 0.3},
 "/user/exgenesis": {"status": 200, "time": 1.1}, "/api/user-directory": {"status": 401, "time": 0.1},
 "/login": {"status": 200, "time": 0.2}, "/profile": {"status": 307, "time": 0.1}}
EOF
}
deployments() { # <current-created-ms>
  CREATED="$1" node -e 'process.stdout.write(JSON.stringify({deployments:[
    {uid:"dpl_new", url:"ca-new.vercel.app", created:Number(process.env.CREATED), meta:{githubCommitSha:"aaaaaaaa"}},
    {uid:"dpl_old", url:"ca-old.vercel.app", created:Number(process.env.CREATED)-100000, meta:{githubCommitSha:"bbbbbbbb"}}]}))' \
    >"$FAKE_CURL_DIR/deployments.json"
}

run_canary() {
  CANARY_CODE=0
  env "$@" bash "$FLEET_SRC_ROOT/fleet/bin/canary.sh" >/dev/null 2>"$TMP/stderr.log" || CANARY_CODE=$?
}

# ─── 1. all green, no token, no secret ──────────────────────────────────────
green
export RUN_DIR="$TMP/runs/20261030T000001Z-canary"
run_canary VERCEL_TOKEN= SIGNALS_WEBHOOK_SECRET=
assert_status "$CANARY_CODE" 0 "green run exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "ok" "outcome ok"
assert_eq "$(json_get "$RUN_DIR/result.json" 'Object.keys(d.checks).sort().join(",")')" "home,search,sign_in,upload,user,user_directory_api" "six checks"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.checks.user_directory_api.status')" "401" "401 accepted for the directory API"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.checks.upload.verdict')" "ok" "307 accepted for the upload page"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.new_failures.length')" "0" "no new failures"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.deployment')" "" "no deployment without a token"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.issue === null && d.pr_or_commit === null && d.session_id === null')" "true" "fixed result keys present and null"
assert_eq "$(ls "$FAKE_CURL_DIR"/post-*.json 2>/dev/null | wc -l | tr -d ' ')" "0" "nothing posted"
assert_file_contains "$FAKE_CURL_DIR/calls.log" "Cookie:\ __cc=" "challenge cookie sent"
assert_file_contains "$FAKE_CURL_DIR/calls.log" "Accept-Language:\ en" "browser-like headers"
assert_file_missing "$RUN_DIR/home.body" "bodies not kept"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_run_total{outcome="ok",routine="canary"}')" "1" "metrics: ok run counted"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_canary_check_ok{check="home"}')" "1" "metrics: home ok"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_canary_failed_checks')" "0" "metrics: no failing checks"
assert_eq "$(grep -c '^fleet_canary_check_ok{' "$FLEET_METRICS_FILE")" "6" "metrics: six per-check gauges"

# ─── 2. one check slow + one 5xx → new failures, signal posted, rollback off ─
deployments 2000000000000
cat >"$FAKE_CURL_DIR/responses.json" <<'EOF'
{"/": {"status": 200, "time": 0.6}, "/search": {"status": 503, "time": 0.3},
 "/user/exgenesis": {"status": 200, "time": 1.1}, "/api/user-directory": {"status": 401, "time": 3.4},
 "/login": {"status": 200, "time": 0.2}, "/profile": {"status": 307, "time": 0.1}}
EOF
export RUN_DIR="$TMP/runs/20261030T000002Z-canary"
run_canary VERCEL_TOKEN=tok SIGNALS_WEBHOOK_SECRET=sec FLEET_ROLLBACK=false
assert_status "$CANARY_CODE" 0 "failed run still exits 0"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "failed" "outcome failed"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.new_failures.sort().join(",")')" "search,user_directory_api" "both new failures"
assert_contains "$(json_get "$RUN_DIR/result.json" 'd.checks.user_directory_api.reason')" "took 3.4s (budget 3s)" "api budget 3s"
assert_contains "$(json_get "$RUN_DIR/result.json" 'd.checks.search.reason')" "status 503" "status failure"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.signal_posted')" "true" "signal posted"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.deployment.uid')" "dpl_new" "current deployment recorded"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.rollback.attempted')" "false" "no rollback"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.rollback.reason')" "FLEET_ROLLBACK is off" "rollback off reason"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.previous_result')" "$TMP/runs/20261030T000001Z-canary/result.json" "compared with the previous run"
post="$FAKE_CURL_DIR/post-1.json"
assert_file_exists "$post" "one POST"
assert_eq "$(json_get "$post" 'd.length')" "2" "two signals in the body"
assert_eq "$(json_get "$post" 'd.map(s=>s.key).sort().join(",")')" "canary:search,canary:user_directory_api" "stable keys"
assert_eq "$(json_get "$post" 'd[0].source + "|" + d[0].severity + "|" + d[0].state')" "canary|critical|firing" "signal shape"
assert_contains "$(json_get "$post" 'd.find(s=>s.key==="canary:search").summary')" "GET /search → 503" "summary"
assert_eq "$(json_get "$post" 'd.find(s=>s.key==="canary:search").route')" "/search" "route"
assert_contains "$(grep -- '-X POST' "$FAKE_CURL_DIR/calls.log")" "/api/signals/canary" "posted to the canary source"
assert_contains "$(grep -- '-X POST' "$FAKE_CURL_DIR/calls.log")" "Authorization:\ Bearer\ sec" "bearer secret"
assert_eq "$(grep -c . "$FAKE_NPX_LOG")" "0" "vercel not called"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_run_total{outcome="failed",routine="canary"}')" "1" "metrics: failed run counted"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_canary_check_ok{check="search"}')" "0" "metrics: search failing"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_canary_failed_checks')" "2" "metrics: two failing checks"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_canary_new_failures_total')" "2" "metrics: new failures counted"
success="$(metric "$FLEET_METRICS_FILE" 'fleet_last_success_timestamp{routine="canary"}')"
assert_eq "$(node -e 'process.exit(Math.abs(Number(process.argv[1]) - Date.now()/1000) < 10 ? 0 : 1)' "$success" && echo fresh)" "fresh" "metrics: a failed canary still counts as the canary succeeding"

# ─── 3. still failing → no new signal; recovery → resolved signal ───────────
export RUN_DIR="$TMP/runs/20261030T000003Z-canary"
run_canary VERCEL_TOKEN=tok SIGNALS_WEBHOOK_SECRET=sec
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.still_failing.sort().join(",")')" "search,user_directory_api" "still failing"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.new_failures.length')" "0" "not new"
assert_eq "$(ls "$FAKE_CURL_DIR"/post-*.json | wc -l | tr -d ' ')" "1" "no second POST"
green
export RUN_DIR="$TMP/runs/20261030T000004Z-canary"
run_canary VERCEL_TOKEN=tok SIGNALS_WEBHOOK_SECRET=sec
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "ok" "recovered"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.recovered.sort().join(",")')" "search,user_directory_api" "recovered list"
assert_eq "$(json_get "$FAKE_CURL_DIR/post-2.json" 'd.map(s=>s.state).join(",")')" "resolved,resolved" "resolved signals sent"

# ─── 4. rollback on: newer deployment than the last green run → rollback + 2nd signal ─
deployments 2000000100000
cat >"$FAKE_CURL_DIR/responses.json" <<'EOF'
{"/": {"status": 500, "time": 0.6}, "/search": {"status": 200, "time": 0.3},
 "/user/exgenesis": {"status": 200, "time": 1.1}, "/api/user-directory": {"status": 401, "time": 0.4},
 "/login": {"status": 200, "time": 0.2}, "/profile": {"status": 307, "time": 0.1}}
EOF
export RUN_DIR="$TMP/runs/20261030T000005Z-canary"
run_canary VERCEL_TOKEN=tok SIGNALS_WEBHOOK_SECRET=sec FLEET_ROLLBACK=true
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "failed" "home failed"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.rollback.attempted')" "true" "rollback attempted"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.rollback.ok')" "true" "rollback ok"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.rollback.from.uid + ">" + d.rollback.to.uid')" "dpl_new>dpl_old" "rolled back to the previous deployment"
assert_contains "$(cat "$FAKE_NPX_LOG")" "vercel@65 rollback dpl_old --scope theexgenesis-projects --token tok --yes" "vercel rollback command"
assert_file_contains "$RUN_DIR/rollback-command.txt" "<VERCEL_TOKEN>" "token redacted in the recorded command"
assert_eq "$(json_get "$FAKE_CURL_DIR/post-4.json" 'd[0].key')" "canary:rollback:dpl_new" "second signal about the rollback"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_canary_rollbacks_total')" "1" "metrics: rollback counted"
assert_contains "$(json_get "$FAKE_CURL_DIR/post-4.json" 'd[0].summary')" "Rolled back production from ca-new.vercel.app (aaaaaaaa) to ca-old.vercel.app (bbbbbbbb)" "rollback summary"

# ─── 5. rollback on but deployment not newer than the last green run → skipped ─
export RUN_DIR="$TMP/runs/20261030T000006Z-canary"
green
run_canary VERCEL_TOKEN=tok SIGNALS_WEBHOOK_SECRET=sec FLEET_ROLLBACK=true # green again, same deployment
cat >"$FAKE_CURL_DIR/responses.json" <<'EOF'
{"/": {"status": 200, "time": 0.6}, "/search": {"status": 200, "time": 0.3},
 "/user/exgenesis": {"status": 0, "time": 15}, "/api/user-directory": {"status": 401, "time": 0.4},
 "/login": {"status": 200, "time": 0.2}, "/profile": {"status": 307, "time": 0.1}}
EOF
export RUN_DIR="$TMP/runs/20261030T000007Z-canary"
run_canary VERCEL_TOKEN=tok SIGNALS_WEBHOOK_SECRET=sec FLEET_ROLLBACK=true
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.checks.user.status')" "0" "timeout recorded as 000"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.rollback.attempted')" "false" "no rollback"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.rollback.reason')" "production deployment is not newer than the last green run" "same deployment → no rollback"
assert_eq "$(grep -c rollback "$FAKE_NPX_LOG")" "1" "vercel not called again"

# ─── 6. bot challenge → inconclusive, no signal ─────────────────────────────
cat >"$FAKE_CURL_DIR/responses.json" <<'EOF'
{"/": {"status": 200, "time": 0.6}, "/search": {"status": 429, "time": 0.05, "mitigated": "challenge"},
 "/user/exgenesis": {"status": 200, "time": 1.1}, "/api/user-directory": {"status": 401, "time": 0.4},
 "/login": {"status": 200, "time": 0.2}, "/profile": {"status": 307, "time": 0.1}}
EOF
export RUN_DIR="$TMP/runs/20261030T000008Z-canary"
posts_before="$(ls "$FAKE_CURL_DIR"/post-*.json | wc -l | tr -d ' ')"
run_canary VERCEL_TOKEN=tok SIGNALS_WEBHOOK_SECRET=sec
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.checks.search.verdict')" "inconclusive" "challenge → inconclusive"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.outcome')" "inconclusive" "outcome inconclusive"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_canary_check_ok{check="search"}')" "1" "metrics: inconclusive leaves the last known value (ok from run 7)"
assert_eq "$(metric "$FLEET_METRICS_FILE" 'fleet_canary_inconclusive_checks')" "1" "metrics: inconclusive count"
# user recovered from the timeout in run 7, so one resolved POST is expected and nothing firing
assert_eq "$(json_get "$FAKE_CURL_DIR/post-$((posts_before + 1)).json" 'd.map(s=>s.state).join(",")')" "resolved" "only the recovery was posted"

# ─── 7. bypass header is sent when configured ───────────────────────────────
green
export RUN_DIR="$TMP/runs/20261030T000009Z-canary"
run_canary VERCEL_PROTECTION_BYPASS=bypass-secret
assert_contains "$(grep -c 'x-vercel-protection-bypass:\\ bypass-secret' "$FAKE_CURL_DIR/calls.log")" "6" "bypass header on all six checks"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.protection_bypass')" "true" "recorded"

t_done
