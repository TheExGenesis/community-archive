#!/usr/bin/env bash
# Fleet digest: once a day, one GitHub issue titled "[fleet:digest] <date>"
# with the label fleet:digest, listing what the fleet did in the last 24 hours
# (signals received, fixer runs with PR/commit/learning links, canary status,
# cost, the fleet's own failures) and what waits on a human (needs-decision
# issues, open fleet PRs). The previous open digest is closed with a pointer to
# the new one. No LLM: the text is rendered by fleet/lib/digest-render.mjs from
# the run directories and a few gh queries. See fleet/README.md.
#
# Env:
#   FLEET_DRY_RUN=true        print the digest instead of posting it (outcome dry_run)
#   FLEET_DIGEST_SINCE        start of the window (ISO 8601), default now - 24h
#   FLEET_DIGEST_UNTIL        end of the window (ISO 8601), default now; tests pin it
#   FLEET_DIGEST_DATE         date in the title, default today (UTC)
#   FLEET_BASE_BRANCH         default main (where fleet commits and reverts are counted)
#   RUN_DIR, FLEET_RUNS_DIR   this run's directory and the directory holding every run
#   GH_TOKEN, FLEET_REPO      gh access; default repo TheExGenesis/community-archive
#   FLEET_DASHBOARD_URL       linked at the top of the digest
#   SIGNALS_WEBHOOK_SECRET    only to file the digest's own failure as a signal
set -euo pipefail

FLEET_BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$FLEET_BIN_DIR/../lib/common.sh"

: "${FLEET_DRY_RUN:=false}"
: "${FLEET_BASE_BRANCH:=main}"
: "${FLEET_DIGEST_SINCE:=}"
: "${FLEET_DIGEST_UNTIL:=}"
: "${FLEET_DIGEST_DATE:=}"

fleet_require_cmd gh node

OUTCOME="error"
REF=""
cleanup() {
  local code=$?
  trap - EXIT
  if [[ $code -ne 0 && "$OUTCOME" == "error" ]]; then
    local reason="${FLEET_LAST_ERROR:-digest failed with exit code $code}"
    fleet_error "digest failed with exit code $code"
    fleet_post_signal "$(fleet_failure_kind "$reason")" "$reason"
  fi
  if [[ -n "${RUN_DIR:-}" ]]; then
    fleet_write_result "$OUTCOME" "" "$REF" "" "$RUN_DIR/result-extra.json"
    if [[ -s "$RUN_DIR/gauges.json" ]]; then
      fleet_record_metrics --outcome "$OUTCOME" --gauges "$RUN_DIR/gauges.json"
    else
      fleet_record_metrics --outcome "$OUTCOME"
    fi
  fi
  exit "$code"
}

fleet_init_run digest
trap cleanup EXIT

NOW_ISO="${FLEET_DIGEST_UNTIL:-$(fleet_ts)}"
[[ -n "$(fleet_epoch "$NOW_ISO")" ]] || fleet_die "FLEET_DIGEST_UNTIL is not a date: $NOW_ISO"
if [[ -z "$FLEET_DIGEST_SINCE" ]]; then
  FLEET_DIGEST_SINCE="$(NOW="$NOW_ISO" node -e 'process.stdout.write(new Date(Date.parse(process.env.NOW) - 86400000).toISOString().replace(/\.\d{3}Z$/, "Z"))')"
fi
[[ -n "$(fleet_epoch "$FLEET_DIGEST_SINCE")" ]] || fleet_die "FLEET_DIGEST_SINCE is not a date: $FLEET_DIGEST_SINCE"
if [[ -z "$FLEET_DIGEST_DATE" ]]; then
  FLEET_DIGEST_DATE="$(date -u +%F)"
fi
TITLE="[fleet:digest] $FLEET_DIGEST_DATE"
printf '{"date":"%s","since":"%s","until":"%s","dry_run":%s}\n' \
  "$FLEET_DIGEST_DATE" "$FLEET_DIGEST_SINCE" "$NOW_ISO" "$([[ "$FLEET_DRY_RUN" == "true" ]] && echo true || echo false)" \
  >"$RUN_DIR/result-extra.json"
fleet_info "digest $TITLE, window $FLEET_DIGEST_SINCE → $NOW_ISO, dry_run=$FLEET_DRY_RUN"

# ─── Gather ─────────────────────────────────────────────────────────────────
# gather <file> <gh args...> : runs gh, keeps its output; a failure leaves the
# file absent so the renderer says "unknown" instead of "0".
gather() {
  local file="$1"
  shift
  if gh "$@" >"$RUN_DIR/$file" 2>"$RUN_DIR/$file.error"; then
    rm -f "$RUN_DIR/$file.error"
  else
    fleet_warn "gh ${*:0:3}... failed; $file skipped (see $file.error)"
    rm -f "$RUN_DIR/$file"
  fi
}
gather signals-created.json issue list --repo "$FLEET_REPO" --label signal --state all --limit 200 \
  --search "created:>=$FLEET_DIGEST_SINCE" --json number,title,state,labels,createdAt,closedAt,url
gather signals-open.json issue list --repo "$FLEET_REPO" --label signal --state open --limit 200 \
  --json number,title,labels,createdAt,url
gather needs-decision.json issue list --repo "$FLEET_REPO" --label "$FLEET_LABEL_NEEDS_DECISION" --state open --limit 100 \
  --json number,title,labels,createdAt,updatedAt,url
gather prs.json pr list --repo "$FLEET_REPO" --state all --limit 100 \
  --json number,title,state,url,headRefName,createdAt,mergedAt,closedAt
gather commits.json api "repos/$FLEET_REPO/commits?sha=$FLEET_BASE_BRANCH&since=$FLEET_DIGEST_SINCE&per_page=100"
gather digests-open.json issue list --repo "$FLEET_REPO" --label "$FLEET_LABEL_DIGEST" --state open --limit 20 \
  --json number,title,url

# Every run directory with a result.json, except this run.
RUNS_DIR="$FLEET_RUNS_DIR" SELF="$RUN_DIR" node -e '
  const fs = require("fs"); const path = require("path");
  const root = process.env.RUNS_DIR; const out = [];
  if (fs.existsSync(root)) {
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      if (dir === process.env.SELF) continue;
      let stat; try { stat = fs.lstatSync(dir); } catch { continue; }
      if (!stat.isDirectory()) continue;
      const file = path.join(dir, "result.json");
      if (!fs.existsSync(file)) continue;
      try { out.push({ dir, ...JSON.parse(fs.readFileSync(file, "utf8")) }); } catch { /* half-written */ }
    }
  }
  process.stdout.write(JSON.stringify(out) + "\n");
' >"$RUN_DIR/runs.json"
fleet_info "gathered $(fleet_json_get "$RUN_DIR/runs.json" 'd.length') run results from $FLEET_RUNS_DIR"

# ─── Render ─────────────────────────────────────────────────────────────────
DIGEST_SINCE="$FLEET_DIGEST_SINCE" DIGEST_NOW="$NOW_ISO" DIGEST_DATE="$FLEET_DIGEST_DATE" \
  FLEET_RUN_NAME_DIR="$(basename "$RUN_DIR")" FLEET_BASE_BRANCH="$FLEET_BASE_BRANCH" \
  node "$FLEET_BIN_DIR/../lib/digest-render.mjs" "$RUN_DIR"
[[ -s "$RUN_DIR/digest.md" ]] || fleet_die "digest-render.mjs produced no digest.md"

if [[ "$FLEET_DRY_RUN" == "true" ]]; then
  fleet_info "dry run: printing $RUN_DIR/digest.md instead of posting"
  echo "# $TITLE"
  echo
  cat "$RUN_DIR/digest.md"
  OUTCOME="dry_run"
  exit 0
fi

# ─── Post ───────────────────────────────────────────────────────────────────
fleet_ensure_labels
ISSUE_URL="$(gh issue create --repo "$FLEET_REPO" --title "$TITLE" --body-file "$RUN_DIR/digest.md" --label "$FLEET_LABEL_DIGEST")"
ISSUE_NUMBER="${ISSUE_URL##*/}"
[[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]] || fleet_die "gh issue create returned no issue URL: $ISSUE_URL"
REF="$ISSUE_URL"
fleet_info "posted $ISSUE_URL"
fleet_readback_issue_state "$ISSUE_NUMBER" OPEN || fleet_die "read-back failed: #$ISSUE_NUMBER is not open"
fleet_readback_issue_label "$ISSUE_NUMBER" "$FLEET_LABEL_DIGEST" || fleet_die "read-back failed: #$ISSUE_NUMBER lacks $FLEET_LABEL_DIGEST"

# Close the previous digest(s): one open digest at a time.
CLOSED=""
if [[ -s "$RUN_DIR/digests-open.json" ]]; then
  for n in $(fleet_json_get "$RUN_DIR/digests-open.json" 'd.map(i=>i.number).join(" ")'); do
    [[ "$n" == "$ISSUE_NUMBER" ]] && continue
    gh issue close "$n" --repo "$FLEET_REPO" --comment "Superseded by $ISSUE_URL." >/dev/null
    fleet_readback_issue_state "$n" CLOSED || fleet_die "read-back failed: previous digest #$n is not closed"
    CLOSED="$CLOSED $n"
    fleet_info "closed previous digest #$n"
  done
fi
printf '{"date":"%s","since":"%s","until":"%s","dry_run":false,"issue":%s,"closed_previous":[%s]}\n' \
  "$FLEET_DIGEST_DATE" "$FLEET_DIGEST_SINCE" "$NOW_ISO" "$ISSUE_NUMBER" "$(echo "$CLOSED" | tr -s ' ' '\n' | grep . | paste -sd, -)" \
  >"$RUN_DIR/result-extra.json"
OUTCOME="posted"
exit 0
