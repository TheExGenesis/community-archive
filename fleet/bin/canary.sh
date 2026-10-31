#!/usr/bin/env bash
# Fleet canary: six plain HTTP checks against production, compared with the
# previous run. New failures become a signal on /api/signals/canary; with
# FLEET_ROLLBACK=true and a production deployment newer than the last green
# run, the previous production deployment is restored with `vercel rollback`.
# No LLM anywhere in this script. See fleet/README.md.
#
# Env:
#   CA_URL                     default https://www.community-archive.org
#   RUN_DIR                    where everything about this run is written
#   SIGNALS_WEBHOOK_SECRET     bearer for /api/signals/canary (unset: signals are written, not sent)
#   FLEET_ROLLBACK=true|false  default false
#   VERCEL_TOKEN               needed to read deployments and to roll back
#   VERCEL_PROJECT_ID, VERCEL_TEAM_ID, VERCEL_SCOPE   Vercel project coordinates (defaults below)
#   VERCEL_PROTECTION_BYPASS   optional x-vercel-protection-bypass secret; without it Vercel's
#                              bot challenge can answer instead of the app (recorded as inconclusive)
#   FLEET_CANARY_USER          username for the user page check, default exgenesis
#   FLEET_CURL_BIN, FLEET_NPX_BIN   default curl / npx (tests point them at fakes)
set -euo pipefail

FLEET_BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$FLEET_BIN_DIR/../lib/common.sh"

: "${FLEET_ROLLBACK:=false}"
: "${VERCEL_PROJECT_ID:=prj_jzBNyQl3EM8e65m6FNIomlJJdLb4}"
: "${VERCEL_TEAM_ID:=team_isqY0pcI9gepidfCW6ZLHFN4}"
: "${VERCEL_SCOPE:=theexgenesis-projects}"
: "${FLEET_CANARY_USER:=exgenesis}"
: "${FLEET_CURL_BIN:=curl}"
: "${FLEET_NPX_BIN:=npx}"
: "${VERCEL_TOKEN:=}"
: "${SIGNALS_WEBHOOK_SECRET:=}"
: "${VERCEL_PROTECTION_BYPASS:=}"

fleet_require_cmd node "$FLEET_CURL_BIN"

PAGE_BUDGET_S=5
API_BUDGET_S=3
CURL_MAX_TIME=15
# Looks like a browser to src/middleware.ts (length, Accept headers) and names itself.
USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) ca-fleet-canary/1.0 (+https://github.com/$FLEET_REPO)"

OUTCOME="error"
EXTRA_FILE=""
cleanup() {
  local code=$?
  trap - EXIT
  if [[ $code -ne 0 && "$OUTCOME" == "error" ]]; then
    fleet_error "canary failed with exit code $code"
  fi
  if [[ -n "${RUN_DIR:-}" ]]; then
    fleet_write_result "$OUTCOME" "" "" "" "$EXTRA_FILE"
  fi
  exit "$code"
}

fleet_init_run canary
trap cleanup EXIT
EXTRA_FILE="$RUN_DIR/result-extra.json"
echo '{}' >"$EXTRA_FILE"

# ─── Checks ─────────────────────────────────────────────────────────────────
# name|path|kind|accepted statuses (regex). /api/user-directory answers 401 to
# guests and /profile (the upload page) redirects guests to /login; both prove
# middleware and route are alive, which is what the canary watches.
CHECKS="home|/|page|^2..$
search|/search|page|^2..$
user|/user/$FLEET_CANARY_USER|page|^2..$
user_directory_api|/api/user-directory|api|^(2..|401)$
sign_in|/login|page|^2..$
upload|/profile|page|^(2..|307)$"

# The middleware's JS challenge cookie is the hour in base36; a canary can
# compute it, which keeps the check on the app instead of on the challenge page.
CHALLENGE_COOKIE="$(node -e 'process.stdout.write(Math.floor(Date.now()/3600000).toString(36))')"

# fetch <name> <path> <kind> : writes <name>.headers and <name>.meta, prints "status time_s mitigated"
fetch() {
  local name="$1" path="$2" kind="$3"
  local url="$CA_URL$path" accept="text/html,application/xhtml+xml"
  [[ "$kind" == "api" ]] && accept="application/json"
  local args=(
    -sS -o "$RUN_DIR/$name.body" -D "$RUN_DIR/$name.headers"
    --max-time "$CURL_MAX_TIME"
    -A "$USER_AGENT"
    -H "Accept: $accept" -H "Accept-Language: en" -H "Accept-Encoding: gzip"
    -H "Cookie: __cc=$CHALLENGE_COOKIE"
    -w '%{http_code} %{time_total}'
  )
  if [[ -n "$VERCEL_PROTECTION_BYPASS" ]]; then
    args+=(-H "x-vercel-protection-bypass: $VERCEL_PROTECTION_BYPASS")
  fi
  local out status time mitigated
  if out="$("$FLEET_CURL_BIN" "${args[@]}" "$url" 2>"$RUN_DIR/$name.curl-error")"; then :; else
    out="000 $CURL_MAX_TIME"
  fi
  status="${out%% *}"
  time="${out##* }"
  mitigated="$(grep -i '^x-vercel-mitigated:' "$RUN_DIR/$name.headers" 2>/dev/null | tr -d '\r' | awk '{print $2}' || true)"
  rm -f "$RUN_DIR/$name.body"
  printf '%s %s %s\n' "$status" "$time" "${mitigated:-none}"
}

CHECKS_JSON="$RUN_DIR/checks.json"
echo '{}' >"$CHECKS_JSON"
# Space-separated names (not arrays: empty arrays trip `set -u` on bash 3.2).
FAILED=""
INCONCLUSIVE=""
while IFS='|' read -r name path kind accepted; do
  [[ -z "$name" ]] && continue
  budget=$PAGE_BUDGET_S
  [[ "$kind" == "api" ]] && budget=$API_BUDGET_S
  read -r status time mitigated <<<"$(fetch "$name" "$path" "$kind")"
  verdict="ok"
  reason=""
  if [[ "$mitigated" != "none" ]]; then
    verdict="inconclusive"
    reason="Vercel answered with a bot-protection $mitigated instead of the app"
    INCONCLUSIVE="$INCONCLUSIVE $name"
  elif ! [[ "$status" =~ $accepted ]]; then
    verdict="failed"
    reason="status $status (accepted /$accepted/)"
    FAILED="$FAILED $name"
  elif node -e 'process.exit(Number(process.argv[1]) > Number(process.argv[2]) ? 0 : 1)' "$time" "$budget"; then
    verdict="failed"
    reason="took ${time}s (budget ${budget}s)"
    FAILED="$FAILED $name"
  fi
  fleet_info "check $name GET $path → $status in ${time}s: $verdict${reason:+ ($reason)}"
  CHECKS_FILE="$CHECKS_JSON" NAME="$name" PATH_="$path" STATUS="$status" TIME="$time" BUDGET="$budget" \
    VERDICT="$verdict" REASON="$reason" MITIGATED="$mitigated" node -e '
      const fs = require("fs"); const e = process.env;
      const all = JSON.parse(fs.readFileSync(e.CHECKS_FILE, "utf8"));
      all[e.NAME] = { path: e.PATH_, status: Number(e.STATUS), time_s: Number(e.TIME), budget_s: Number(e.BUDGET),
        verdict: e.VERDICT, reason: e.REASON || null, mitigated: e.MITIGATED === "none" ? null : e.MITIGATED };
      fs.writeFileSync(e.CHECKS_FILE, JSON.stringify(all, null, 2) + "\n");
    '
done <<<"$CHECKS"
FAILED="${FAILED# }"
INCONCLUSIVE="${INCONCLUSIVE# }"

# ─── Current production deployment ──────────────────────────────────────────
DEPLOYMENTS_JSON="$RUN_DIR/deployments.json"
echo '[]' >"$DEPLOYMENTS_JSON"
if [[ -n "$VERCEL_TOKEN" ]]; then
  if "$FLEET_CURL_BIN" -sS --max-time 20 -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID&target=production&state=READY&limit=5" \
    >"$RUN_DIR/deployments-raw.json" 2>"$RUN_DIR/deployments.curl-error"; then
    FILE="$RUN_DIR/deployments-raw.json" node -e '
      const fs = require("fs");
      const raw = JSON.parse(fs.readFileSync(process.env.FILE, "utf8"));
      const list = (raw.deployments || []).map((d) => ({
        uid: d.uid, url: d.url, created: d.created, created_at: new Date(d.created).toISOString(),
        sha: (d.meta && d.meta.githubCommitSha) || null,
      }));
      process.stdout.write(JSON.stringify(list, null, 2) + "\n");
    ' >"$DEPLOYMENTS_JSON" || echo '[]' >"$DEPLOYMENTS_JSON"
  else
    fleet_warn "could not list Vercel deployments (see deployments.curl-error)"
  fi
fi
CURRENT_DEPLOYMENT="$(fleet_json_get "$DEPLOYMENTS_JSON" 'd[0] || null')"
[[ -z "$CURRENT_DEPLOYMENT" ]] && CURRENT_DEPLOYMENT="null"

# ─── Compare with the previous run ──────────────────────────────────────────
PREVIOUS="$(fleet_previous_result canary || true)"
PREVIOUS_CHECKS='{}'
if [[ -n "$PREVIOUS" ]]; then
  PREVIOUS_CHECKS="$(fleet_json_get "$PREVIOUS" 'd.checks || {}')"
  fleet_info "previous run: $PREVIOUS"
fi
# Last green run: the newest previous canary result with outcome ok, for the rollback target.
LAST_GREEN_DEPLOYMENT="null"
if [[ -d "$FLEET_RUNS_DIR" ]]; then
  for dir in $(ls -1d "$FLEET_RUNS_DIR"/*-canary 2>/dev/null | sort -r); do
    [[ "$dir" == "$RUN_DIR" || ! -f "$dir/result.json" ]] && continue
    if [[ "$(fleet_json_get "$dir/result.json" 'd.outcome')" == "ok" ]]; then
      LAST_GREEN_DEPLOYMENT="$(fleet_json_get "$dir/result.json" 'd.deployment || null')"
      [[ -z "$LAST_GREEN_DEPLOYMENT" ]] && LAST_GREEN_DEPLOYMENT="null"
      break
    fi
  done
fi

TRANSITIONS="$(CHECKS_FILE="$CHECKS_JSON" PREV="$PREVIOUS_CHECKS" node -e '
  const fs = require("fs");
  const now = JSON.parse(fs.readFileSync(process.env.CHECKS_FILE, "utf8"));
  const prev = JSON.parse(process.env.PREV || "{}");
  const newFailures = [], stillFailing = [], recovered = [];
  for (const [name, c] of Object.entries(now)) {
    const was = prev[name] && prev[name].verdict;
    if (c.verdict === "failed") (was === "failed" ? stillFailing : newFailures).push(name);
    else if (c.verdict === "ok" && was === "failed") recovered.push(name);
  }
  process.stdout.write(JSON.stringify({ new_failures: newFailures, still_failing: stillFailing, recovered }));
')"
NEW_FAILURES="$(printf '%s' "$TRANSITIONS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).new_failures.join(" ")))')"
RECOVERED="$(printf '%s' "$TRANSITIONS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).recovered.join(" ")))')"

if [[ -n "$FAILED" ]]; then
  OUTCOME="failed"
elif [[ -n "$INCONCLUSIVE" ]]; then
  OUTCOME="inconclusive"
else
  OUTCOME="ok"
fi

# ─── Signals ────────────────────────────────────────────────────────────────
# build_signals : one firing signal per new failure, one resolved per recovery.
build_signals() {
  CHECKS_FILE="$CHECKS_JSON" NEW="$NEW_FAILURES" REC="$RECOVERED" CA="$CA_URL" RUN="$(basename "$RUN_DIR")" \
    DEPLOYMENT="$CURRENT_DEPLOYMENT" node -e '
    const fs = require("fs"); const e = process.env;
    const checks = JSON.parse(fs.readFileSync(e.CHECKS_FILE, "utf8"));
    const deployment = JSON.parse(e.DEPLOYMENT || "null");
    const split = (s) => s.split(/\s+/).filter(Boolean);
    const out = [];
    for (const name of split(e.NEW)) {
      const c = checks[name];
      out.push({
        source: "canary", title: `Canary: ${name} failed on production`, key: `canary:${name}`,
        severity: "critical", state: "firing", route: c.path, link: e.CA + c.path,
        summary: `GET ${c.path} → ${c.status} in ${c.time_s}s (${c.reason}; budget 2xx within ${c.budget_s}s). Run ${e.RUN}.`,
        details: { check: name, status: c.status, time_s: c.time_s, budget_s: c.budget_s, run: e.RUN,
          deployment: deployment && { uid: deployment.uid, url: deployment.url, sha: deployment.sha } },
      });
    }
    for (const name of split(e.REC)) {
      const c = checks[name];
      out.push({
        source: "canary", title: `Canary: ${name} failed on production`, key: `canary:${name}`,
        severity: "info", state: "resolved", route: c.path, link: e.CA + c.path,
        summary: `GET ${c.path} → ${c.status} in ${c.time_s}s again. Run ${e.RUN}.`,
        details: { check: name, status: c.status, time_s: c.time_s, run: e.RUN },
      });
    }
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  '
}

# post_signal <file> <log-name> : POST a signal array; records request and response in RUN_DIR.
post_signal() {
  local file="$1" name="$2"
  if [[ -z "$SIGNALS_WEBHOOK_SECRET" ]]; then
    fleet_warn "SIGNALS_WEBHOOK_SECRET unset; $name written to $file but not sent"
    echo "not sent: SIGNALS_WEBHOOK_SECRET unset" >"$RUN_DIR/$name.response"
    return 0
  fi
  local status
  status="$("$FLEET_CURL_BIN" -sS --max-time 20 -o "$RUN_DIR/$name.response" -w '%{http_code}' \
    -X POST "$CA_URL/api/signals/canary" \
    -H "Authorization: Bearer $SIGNALS_WEBHOOK_SECRET" -H 'content-type: application/json' \
    -A "$USER_AGENT" --data-binary "@$file" 2>"$RUN_DIR/$name.curl-error" || echo 000)"
  fleet_info "$name posted to /api/signals/canary → $status"
  if [[ ! "$status" =~ ^2 ]]; then
    fleet_warn "signal POST failed with $status (see $name.response)"
    return 1
  fi
}

SIGNAL_POSTED=false
build_signals >"$RUN_DIR/signal.json"
if [[ -n "$NEW_FAILURES" || -n "$RECOVERED" ]]; then
  if post_signal "$RUN_DIR/signal.json" signal; then SIGNAL_POSTED=true; fi
fi

# ─── Rollback ───────────────────────────────────────────────────────────────
ROLLBACK_JSON='{"attempted":false,"reason":null,"from":null,"to":null,"ok":null}'
if [[ -n "$NEW_FAILURES" ]]; then
  if [[ "$FLEET_ROLLBACK" != "true" ]]; then
    ROLLBACK_JSON='{"attempted":false,"reason":"FLEET_ROLLBACK is off","from":null,"to":null,"ok":null}'
  elif [[ -z "$VERCEL_TOKEN" || "$CURRENT_DEPLOYMENT" == "null" ]]; then
    ROLLBACK_JSON='{"attempted":false,"reason":"no VERCEL_TOKEN or no deployment listing","from":null,"to":null,"ok":null}'
  else
    TARGET="$(CUR="$CURRENT_DEPLOYMENT" GREEN="$LAST_GREEN_DEPLOYMENT" FILE="$DEPLOYMENTS_JSON" node -e '
      const fs = require("fs");
      const cur = JSON.parse(process.env.CUR), green = JSON.parse(process.env.GREEN || "null");
      const list = JSON.parse(fs.readFileSync(process.env.FILE, "utf8"));
      if (!green) { process.stdout.write(JSON.stringify({ skip: "no previous green run to compare with" })); process.exit(0); }
      if (!(cur.created > green.created)) { process.stdout.write(JSON.stringify({ skip: "production deployment is not newer than the last green run" })); process.exit(0); }
      const target = list.find((d) => d.uid === green.uid && d.uid !== cur.uid) || list.find((d) => d.uid !== cur.uid);
      if (!target) { process.stdout.write(JSON.stringify({ skip: "no previous production deployment in the listing" })); process.exit(0); }
      process.stdout.write(JSON.stringify({ target }));
    ')"
    SKIP="$(printf '%s' "$TARGET" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).skip||""))')"
    if [[ -n "$SKIP" ]]; then
      fleet_info "rollback skipped: $SKIP"
      ROLLBACK_JSON="$(SKIP="$SKIP" node -e 'process.stdout.write(JSON.stringify({attempted:false,reason:process.env.SKIP,from:null,to:null,ok:null}))')"
    else
      TARGET_UID="$(printf '%s' "$TARGET" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).target.uid))')"
      TARGET_URL="$(printf '%s' "$TARGET" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).target.url))')"
      CURRENT_URL="$(printf '%s' "$CURRENT_DEPLOYMENT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).url))')"
      fleet_warn "rolling back production from $CURRENT_URL to $TARGET_URL"
      ROLLBACK_OK=false
      printf '%s -y vercel@65 rollback %s --scope %s --token <VERCEL_TOKEN> --yes\n' \
        "$FLEET_NPX_BIN" "$TARGET_UID" "$VERCEL_SCOPE" >"$RUN_DIR/rollback-command.txt"
      if "$FLEET_NPX_BIN" -y vercel@65 rollback "$TARGET_UID" --scope "$VERCEL_SCOPE" --token "$VERCEL_TOKEN" --yes \
        >"$RUN_DIR/rollback.log" 2>&1; then
        ROLLBACK_OK=true
        fleet_info "rollback finished"
      else
        fleet_error "rollback failed (see rollback.log)"
      fi
      ROLLBACK_JSON="$(FROM="$CURRENT_DEPLOYMENT" TO="$TARGET" OK="$ROLLBACK_OK" node -e '
        const from = JSON.parse(process.env.FROM), to = JSON.parse(process.env.TO).target;
        process.stdout.write(JSON.stringify({ attempted: true, reason: "new canary failure on a deployment newer than the last green run",
          from: { uid: from.uid, url: from.url, sha: from.sha }, to: { uid: to.uid, url: to.url, sha: to.sha }, ok: process.env.OK === "true" }));
      ')"
      ROLLBACK="$ROLLBACK_JSON" NEW="$NEW_FAILURES" RUN="$(basename "$RUN_DIR")" node -e '
        const r = JSON.parse(process.env.ROLLBACK);
        const verb = r.ok ? "Rolled back" : "Failed to roll back";
        process.stdout.write(JSON.stringify([{
          source: "canary", title: `Canary: ${verb.toLowerCase()} production after ${process.env.NEW.split(/\s+/).join(", ")} failed`,
          key: `canary:rollback:${r.from.uid}`, severity: r.ok ? "warning" : "critical", state: "firing",
          summary: `${verb} production from ${r.from.url} (${r.from.sha || "?"}) to ${r.to.url} (${r.to.sha || "?"}) because ${process.env.NEW} failed in run ${process.env.RUN}. The fixer should treat the failing checks as a bug in ${r.from.sha || r.from.url}.`,
          details: { rollback: r, run: process.env.RUN },
        }], null, 2) + "\n");
      ' >"$RUN_DIR/signal-rollback.json"
      post_signal "$RUN_DIR/signal-rollback.json" signal-rollback || true
    fi
  fi
fi

# ─── Result ─────────────────────────────────────────────────────────────────
CHECKS_FILE="$CHECKS_JSON" TRANSITIONS="$TRANSITIONS" DEPLOYMENT="$CURRENT_DEPLOYMENT" \
  ROLLBACK="$ROLLBACK_JSON" POSTED="$SIGNAL_POSTED" PREVIOUS="${PREVIOUS:-}" \
  BYPASS="$([[ -n "$VERCEL_PROTECTION_BYPASS" ]] && echo true || echo false)" CA="$CA_URL" OUT="$EXTRA_FILE" node -e '
  const fs = require("fs"); const e = process.env;
  const extra = {
    url: e.CA,
    checks: JSON.parse(fs.readFileSync(e.CHECKS_FILE, "utf8")),
    ...JSON.parse(e.TRANSITIONS),
    signal_posted: e.POSTED === "true",
    rollback: JSON.parse(e.ROLLBACK),
    deployment: JSON.parse(e.DEPLOYMENT || "null"),
    previous_result: e.PREVIOUS || null,
    protection_bypass: e.BYPASS === "true",
  };
  fs.writeFileSync(e.OUT, JSON.stringify(extra, null, 2) + "\n");
'

fleet_info "canary $OUTCOME: failed=[$FAILED] inconclusive=[$INCONCLUSIVE] new=[$NEW_FAILURES] recovered=[$RECOVERED]"
exit 0
