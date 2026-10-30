# shellcheck shell=bash
# Shared helpers for the fleet harnesses (fleet/bin/*.sh).
#
# Everything here is deterministic bash around three tools: gh, git and node
# (node only to read and write JSON, so the host needs no jq). Source it after
# `set -euo pipefail`; it defines functions and exports a few FLEET_* defaults
# but runs nothing on its own.

FLEET_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The repository checkout the harness works in (worktrees, prompts, node_modules).
# Tests point it at a throwaway clone.
: "${FLEET_ROOT:=$(cd "$FLEET_LIB_DIR/../.." && pwd)}"
export FLEET_LIB_DIR FLEET_ROOT

: "${FLEET_REPO:=TheExGenesis/community-archive}"
: "${CA_URL:=https://www.community-archive.org}"
# Where runs live: $FLEET_HOME/runs on ca-fleet (the wrapper exports FLEET_HOME
# and RUN_DIR), the parent of RUN_DIR when only that is given, else ./.fleet-runs.
if [[ -z "${FLEET_RUNS_DIR:-}" ]]; then
  if [[ -n "${FLEET_HOME:-}" ]]; then
    FLEET_RUNS_DIR="$FLEET_HOME/runs"
  elif [[ -n "${RUN_DIR:-}" ]]; then
    FLEET_RUNS_DIR="$(dirname "$RUN_DIR")"
  else
    FLEET_RUNS_DIR="$FLEET_ROOT/.fleet-runs"
  fi
fi
# Prometheus textfile the node exporter on ca-fleet reads (docs/hyperobservability.md).
: "${FLEET_METRICS_FILE:=$FLEET_RUNS_DIR/metrics.prom}"
: "${FLEET_CURL_BIN:=curl}"
: "${FLEET_DASHBOARD_URL:=https://neatrowan1763.grafana.net/d/ca-fleet}"
export FLEET_REPO CA_URL FLEET_RUNS_DIR FLEET_METRICS_FILE FLEET_CURL_BIN FLEET_DASHBOARD_URL

FLEET_LABEL_IN_PROGRESS="fleet:in-progress"
FLEET_LABEL_PR_OPEN="fleet:pr-open"
FLEET_LABEL_WONTFIX="fleet:wontfix"
FLEET_LABEL_NEEDS_DECISION="fleet:needs-decision"
FLEET_LABEL_DIGEST="fleet:digest"
FLEET_SKIP_LABELS="$FLEET_LABEL_IN_PROGRESS $FLEET_LABEL_NEEDS_DECISION $FLEET_LABEL_WONTFIX"

# ─── Logging ────────────────────────────────────────────────────────────────

fleet_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# fleet_log <level> <message...> : stderr plus $RUN_DIR/log.txt when RUN_DIR is set.
fleet_log() {
  local level="$1"
  shift
  local line
  line="$(fleet_ts) [$level] $*"
  printf '%s\n' "$line" >&2
  if [[ -n "${RUN_DIR:-}" && -d "${RUN_DIR:-}" ]]; then
    printf '%s\n' "$line" >>"$RUN_DIR/log.txt"
  fi
}
fleet_info() { fleet_log info "$@"; }
fleet_warn() { fleet_log warn "$@"; }
# The last error message is what a failure signal carries (fleet_post_signal).
FLEET_LAST_ERROR=""
fleet_error() {
  FLEET_LAST_ERROR="$*"
  fleet_log error "$@"
}
fleet_die() {
  fleet_error "$@"
  exit 1
}

fleet_require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || fleet_die "missing required command: $cmd"
  done
}

# ─── Run directory ──────────────────────────────────────────────────────────

# fleet_init_run <name> : sets RUN_DIR (default $FLEET_RUNS_DIR/<utc ts>-<name>),
# creates it, records the start time. The caller's exit handler writes result.json.
fleet_init_run() {
  local name="$1"
  FLEET_RUN_NAME="$name"
  FLEET_RUN_STARTED_EPOCH="$(date +%s)"
  if [[ -z "${RUN_DIR:-}" ]]; then
    RUN_DIR="$FLEET_RUNS_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$name"
  fi
  mkdir -p "$RUN_DIR"
  RUN_DIR="$(cd "$RUN_DIR" && pwd)"
  export RUN_DIR FLEET_RUN_NAME FLEET_RUN_STARTED_EPOCH
  printf '%s\n' "$(fleet_ts)" >"$RUN_DIR/started_at"
  fleet_info "run $name started, RUN_DIR=$RUN_DIR"
}

fleet_duration_s() {
  echo $(($(date +%s) - FLEET_RUN_STARTED_EPOCH))
}

# fleet_write_result <outcome> <issue|null> <pr_or_commit|null> <session_id|null> [extra-json-file]
# Writes $RUN_DIR/result.json: {outcome, issue, pr_or_commit, session_id, duration_s, ...extra}.
fleet_write_result() {
  local outcome="$1" issue="${2:-}" ref="${3:-}" session="${4:-}" extra="${5:-}"
  local duration
  duration="$(fleet_duration_s)"
  OUTCOME="$outcome" ISSUE="$issue" REF="$ref" SESSION="$session" DURATION="$duration" \
    EXTRA_FILE="$extra" RUN_NAME="${FLEET_RUN_NAME:-}" OUT="$RUN_DIR/result.json" \
    node -e '
      const fs = require("fs");
      const e = process.env;
      const numOrNull = (v) => (v && /^\d+$/.test(v) ? Number(v) : null);
      const strOrNull = (v) => (v ? v : null);
      let extra = {};
      if (e.EXTRA_FILE && fs.existsSync(e.EXTRA_FILE)) {
        extra = JSON.parse(fs.readFileSync(e.EXTRA_FILE, "utf8"));
      }
      // claude -p usage, written by fleet_claude_usage when the routine called Claude.
      const usageFile = require("path").join(e.OUT, "..", "usage.json");
      if (fs.existsSync(usageFile)) {
        extra.usage = JSON.parse(fs.readFileSync(usageFile, "utf8"));
      }
      const result = {
        outcome: e.OUTCOME,
        issue: numOrNull(e.ISSUE),
        pr_or_commit: strOrNull(e.REF),
        session_id: strOrNull(e.SESSION),
        duration_s: Number(e.DURATION),
        run: e.RUN_NAME || null,
        finished_at: new Date().toISOString(),
        ...extra,
      };
      fs.writeFileSync(e.OUT, JSON.stringify(result, null, 2) + "\n");
    '
  fleet_info "result: outcome=$outcome issue=${issue:-none} ref=${ref:-none} duration_s=$duration"
}

# fleet_previous_result <name> : path of the newest other run's result.json for <name>, or nothing.
fleet_previous_result() {
  local name="$1" dir
  [[ -d "$FLEET_RUNS_DIR" ]] || return 0
  for dir in $(ls -1d "$FLEET_RUNS_DIR"/*-"$name" 2>/dev/null | sort -r); do
    [[ "$dir" == "${RUN_DIR:-}" ]] && continue
    if [[ -f "$dir/result.json" ]]; then
      printf '%s\n' "$dir/result.json"
      return 0
    fi
  done
}

# ─── JSON helpers (node, no jq) ─────────────────────────────────────────────

# fleet_json_get <file> <js-expression over `d`> : prints the value (strings raw, others JSON).
fleet_json_get() {
  local file="$1" expr="$2"
  FILE="$file" EXPR="$expr" node -e '
    const fs = require("fs");
    const d = JSON.parse(fs.readFileSync(process.env.FILE, "utf8"));
    const v = Function("d", "return (" + process.env.EXPR + ")")(d);
    if (v === undefined || v === null) process.exit(0);
    process.stdout.write(typeof v === "string" ? v : JSON.stringify(v));
  '
}

# ─── Issue selection ────────────────────────────────────────────────────────

# fleet_list_candidate_issues : open `signal` and `bug` issues as one JSON array on stdout.
fleet_list_candidate_issues() {
  local signal bug
  signal="$(gh issue list --repo "$FLEET_REPO" --state open --label signal --limit 200 \
    --json number,title,body,labels,createdAt)"
  bug="$(gh issue list --repo "$FLEET_REPO" --state open --label bug --limit 200 \
    --json number,title,body,labels,createdAt)"
  SIGNAL="$signal" BUG="$bug" node -e '
    const seen = new Set();
    const out = [];
    for (const list of [process.env.SIGNAL, process.env.BUG]) {
      for (const issue of JSON.parse(list || "[]")) {
        if (seen.has(issue.number)) continue;
        seen.add(issue.number);
        out.push(issue);
      }
    }
    process.stdout.write(JSON.stringify(out));
  '
}

# fleet_pick_issue : reads a JSON array of issues on stdin, prints the oldest one
# (by createdAt, then lowest number) that carries none of $FLEET_SKIP_LABELS.
# Prints nothing when there is no candidate.
fleet_pick_issue() {
  SKIP="$FLEET_SKIP_LABELS" node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
      const skip = new Set(process.env.SKIP.split(/\s+/).filter(Boolean));
      const issues = JSON.parse(raw || "[]").filter((issue) => {
        const names = (issue.labels || []).map((l) => (typeof l === "string" ? l : l.name));
        return !names.some((n) => skip.has(n));
      });
      issues.sort((a, b) => {
        const ta = Date.parse(a.createdAt), tb = Date.parse(b.createdAt);
        if (ta !== tb) return ta - tb;
        return a.number - b.number;
      });
      if (issues.length) process.stdout.write(JSON.stringify(issues[0]));
    });
  '
}

# ─── gh helpers ─────────────────────────────────────────────────────────────

# fleet_ensure_labels : creates the fleet:* labels and `bug` when missing. Idempotent.
fleet_ensure_labels() {
  local existing name color desc
  existing="$(gh label list --repo "$FLEET_REPO" --limit 300 --json name --jq '.[].name')"
  while IFS='|' read -r name color desc; do
    [[ -z "$name" ]] && continue
    if grep -qx -- "$name" <<<"$existing"; then
      continue
    fi
    fleet_info "creating label $name"
    gh label create "$name" --repo "$FLEET_REPO" --color "$color" --description "$desc" --force >/dev/null
  done <<EOF
$FLEET_LABEL_IN_PROGRESS|1D76DB|The fleet fixer is working on this issue
$FLEET_LABEL_PR_OPEN|0E8A16|The fleet fixer opened a PR for this issue
$FLEET_LABEL_WONTFIX|FFFFFF|The fleet fixer decided not to fix this
$FLEET_LABEL_NEEDS_DECISION|D93F0B|The fleet fixer needs a human decision
$FLEET_LABEL_DIGEST|5319E7|Daily digest of what the fleet did
bug|d73a4a|Something isn't working
EOF
}

fleet_issue_add_label() {
  gh issue edit "$1" --repo "$FLEET_REPO" --add-label "$2" >/dev/null
}

fleet_issue_remove_label() {
  gh issue edit "$1" --repo "$FLEET_REPO" --remove-label "$2" >/dev/null 2>&1 || true
}

# fleet_issue_swap_label <number> <from> <to>
fleet_issue_swap_label() {
  fleet_issue_add_label "$1" "$3"
  fleet_issue_remove_label "$1" "$2"
}

# fleet_issue_comment <number> <body-file>
fleet_issue_comment() {
  gh issue comment "$1" --repo "$FLEET_REPO" --body-file "$2" >/dev/null
}

# ─── Read-back checks ───────────────────────────────────────────────────────
# Every write to GitHub is followed by one of these. They return non-zero when
# GitHub does not show what we just did, and the run fails on that.

# fleet_readback_pr <number> : PR exists and is open.
fleet_readback_pr() {
  local state
  state="$(gh pr view "$1" --repo "$FLEET_REPO" --json state --jq .state 2>/dev/null || true)"
  [[ "$state" == "OPEN" ]]
}

# fleet_readback_commit_on_branch <sha> <branch> : the branch tip contains <sha>.
fleet_readback_commit_on_branch() {
  local status
  status="$(gh api "repos/$FLEET_REPO/compare/$1...$2" --jq .status 2>/dev/null || true)"
  [[ "$status" == "identical" || "$status" == "ahead" ]]
}

# fleet_readback_issue_label <number> <label>
fleet_readback_issue_label() {
  gh issue view "$1" --repo "$FLEET_REPO" --json labels --jq '.labels[].name' 2>/dev/null \
    | grep -qx -- "$2"
}

# fleet_readback_issue_comment <number> <needle> : some comment contains <needle>.
fleet_readback_issue_comment() {
  gh issue view "$1" --repo "$FLEET_REPO" --json comments --jq '.comments[].body' 2>/dev/null \
    | grep -qF -- "$2"
}

# fleet_readback_issue_state <number> <OPEN|CLOSED>
fleet_readback_issue_state() {
  local state
  state="$(gh issue view "$1" --repo "$FLEET_REPO" --json state --jq .state 2>/dev/null || true)"
  [[ "$state" == "$2" ]]
}

# ─── Verdict parsing ────────────────────────────────────────────────────────

# fleet_parse_verdict <claude-output.json> : prints the verdict object as JSON
# {classification, summary, files, root_cause, fix, check_next_time} taken from
# the last fenced ```json block of the agent's final message. Exit codes:
#   0 verdict found and valid
#   2 claude reported is_error (infrastructure or auth failure; not the issue's fault)
#   3 no parseable verdict / invalid classification
fleet_parse_verdict() {
  FILE="$1" node -e '
    const fs = require("fs");
    let out;
    try {
      out = JSON.parse(fs.readFileSync(process.env.FILE, "utf8"));
    } catch (err) {
      process.stderr.write("claude output is not JSON: " + err.message + "\n");
      process.exit(2);
    }
    if (out.is_error) {
      process.stderr.write("claude run failed: " + String(out.result || out.subtype || "unknown").slice(0, 400) + "\n");
      process.exit(2);
    }
    const text = typeof out.result === "string" ? out.result : "";
    const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)].map((m) => m[1]);
    const valid = new Set(["bug", "wontfix", "needs-decision"]);
    for (const block of blocks.reverse()) {
      try {
        const v = JSON.parse(block);
        if (v && typeof v === "object" && valid.has(v.classification)) {
          const verdict = {
            classification: v.classification,
            summary: String(v.summary || "").trim(),
            files: Array.isArray(v.files) ? v.files.map(String) : [],
            root_cause: String(v.root_cause || "").trim(),
            fix: String(v.fix || "").trim(),
            check_next_time: String(v.check_next_time || "").trim(),
          };
          process.stdout.write(JSON.stringify(verdict));
          process.exit(0);
        }
      } catch {
        // not this block
      }
    }
    process.stderr.write("no fenced json verdict with a valid classification in the final message\n");
    process.exit(3);
  '
}

# ─── Tier 1 guard ───────────────────────────────────────────────────────────
# Paths the fixer may never change on its own (the memo's Tier 1 list). A diff
# touching any of these turns the run into a needs-decision comment.
FLEET_TIER1_PATH_PATTERNS=(
  '^supabase/'
  '^src/app/opt-in/'
  '^src/app/api/opt-in/'
  '^src/lib/email\.ts$'
  '^src/app/api/email/'
  '^src/app/api/digest/email/'
  '^src/app/api/cron/digest-email/'
  '^src/lib/digest/email'
  '^src/app/remove-dms/'
  '^services/admin-delete-worker/'
  '^package\.json$'
  '^pnpm-lock\.yaml$'
  '^\.github/workflows/'
)
# Patterns in added lines that mean service-role use, key handling or data deletion.
FLEET_TIER1_DIFF_PATTERNS=(
  'createServerServiceRoleClient'
  'SUPABASE_SERVICE_ROLE'
  'service_role'
  'opt_out|optOut|opted_out|optedOut|optout|OptOut'
  'saveConsent|resolveConsent|consentPage|ConsentRow'
  'deleteArchive|delete_archive|\.delete\(\)'
  'rotateKey|rotate_key|API_KEY='
  'sendEmail|resend\.'
)

# fleet_tier1_violations <worktree> : prints one reason per line; empty when clean.
fleet_tier1_violations() {
  local wt="$1" files file pattern added
  files="$(git -C "$wt" diff --cached --name-only --diff-filter=ACMRD)"
  for file in $files; do
    for pattern in "${FLEET_TIER1_PATH_PATTERNS[@]}"; do
      if [[ "$file" =~ $pattern ]]; then
        echo "Tier 1 path changed: $file"
        break
      fi
    done
  done
  added="$(git -C "$wt" diff --cached --diff-filter=ACMR -- . ':(exclude)memos/fleet/learnings/*' | grep '^+' | grep -v '^+++' || true)"
  for pattern in "${FLEET_TIER1_DIFF_PATTERNS[@]}"; do
    if grep -qE -- "$pattern" <<<"$added"; then
      echo "Tier 1 content in added lines: /$pattern/"
    fi
  done
  if git -C "$wt" diff --cached --name-status --diff-filter=R | grep -q .; then
    echo "File moves are not allowed"
  fi
}

# fleet_changed_lines <worktree> : added+removed lines in the staged diff, learnings excluded.
fleet_changed_lines() {
  git -C "$1" diff --cached --numstat -- . ':(exclude)memos/fleet/learnings/*' \
    | awk '{ if ($1 != "-") a += $1; if ($2 != "-") d += $2 } END { print (a + d) + 0 }'
}

# ─── Lock ───────────────────────────────────────────────────────────────────

# fleet_acquire_lock <path> : mkdir lock with the pid inside; returns 1 when another
# live process holds it. Stale locks (dead pid) are taken over.
fleet_acquire_lock() {
  local lock="$1" pid
  if mkdir "$lock" 2>/dev/null; then
    echo $$ >"$lock/pid"
    return 0
  fi
  pid="$(cat "$lock/pid" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    return 1
  fi
  rm -rf "$lock"
  mkdir "$lock" && echo $$ >"$lock/pid"
}

fleet_release_lock() {
  rm -rf "$1"
}

# ─── Claude usage ───────────────────────────────────────────────────────────

# fleet_claude_usage <claude-output.json>... : sums the usage of one or more
# `claude -p --output-format json` results into {cost_usd, tokens:{input, output,
# cache_read, cache_creation}, calls}. Files that are missing or not JSON count
# as zero. Prints the JSON object.
fleet_claude_usage() {
  FILES="$(printf '%s\n' "$@")" node -e '
    const fs = require("fs");
    const usage = { cost_usd: 0, tokens: { input: 0, output: 0, cache_read: 0, cache_creation: 0 }, calls: 0 };
    for (const file of process.env.FILES.split("\n").filter(Boolean)) {
      let out;
      try { out = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
      if (!out || typeof out !== "object") continue;
      usage.calls += 1;
      if (typeof out.total_cost_usd === "number") usage.cost_usd += out.total_cost_usd;
      const u = out.usage || {};
      usage.tokens.input += Number(u.input_tokens) || 0;
      usage.tokens.output += Number(u.output_tokens) || 0;
      usage.tokens.cache_read += Number(u.cache_read_input_tokens) || 0;
      usage.tokens.cache_creation += Number(u.cache_creation_input_tokens) || 0;
    }
    usage.cost_usd = Math.round(usage.cost_usd * 1e6) / 1e6;
    process.stdout.write(JSON.stringify(usage));
  '
}

# ─── Signals ────────────────────────────────────────────────────────────────

# fleet_post_signals <source> <body-file> <log-name> : POST a signal array to
# $CA_URL/api/signals/<source> with the bearer. Request and response land in
# $RUN_DIR/<log-name>.{response,curl-error}. Without SIGNALS_WEBHOOK_SECRET the
# body stays in the run directory and nothing is sent (returns 0). Returns 1 on
# a non-2xx answer.
fleet_post_signals() {
  local source="$1" file="$2" name="$3"
  local out="${RUN_DIR:-/dev/null}"
  [[ "$out" != "/dev/null" ]] && out="$RUN_DIR/$name"
  if [[ -z "${SIGNALS_WEBHOOK_SECRET:-}" ]]; then
    fleet_warn "SIGNALS_WEBHOOK_SECRET unset; $name written to $file but not sent"
    [[ "$out" != "/dev/null" ]] && echo "not sent: SIGNALS_WEBHOOK_SECRET unset" >"$out.response"
    return 0
  fi
  local status
  status="$("$FLEET_CURL_BIN" -sS --max-time 20 -o "$out.response" -w '%{http_code}' \
    -X POST "$CA_URL/api/signals/$source" \
    -H "Authorization: Bearer $SIGNALS_WEBHOOK_SECRET" -H 'content-type: application/json' \
    -A "ca-fleet/${FLEET_RUN_NAME:-harness} (+https://github.com/$FLEET_REPO)" \
    --data-binary "@$file" 2>"$out.curl-error" || echo 000)"
  fleet_info "$name posted to /api/signals/$source → $status"
  if [[ ! "$status" =~ ^2 ]]; then
    fleet_warn "signal POST failed with $status (see $name.response)"
    return 1
  fi
}

# fleet_failure_kind [message] : a stable word for why a run broke, from the
# last error message (default $FLEET_LAST_ERROR). FLEET_FAILURE_KIND overrides.
fleet_failure_kind() {
  local msg="${1:-$FLEET_LAST_ERROR}"
  if [[ -n "${FLEET_FAILURE_KIND:-}" ]]; then
    printf '%s' "$FLEET_FAILURE_KIND"
  elif [[ "$msg" == read-back* ]]; then
    printf 'readback'
  elif [[ "$msg" == claude* ]]; then
    printf 'claude'
  elif [[ "$msg" == "missing required command"* ]]; then
    printf 'toolchain'
  else
    printf 'harness'
  fi
}

# fleet_post_signal <kind> <summary> : file the fleet's own failure in the
# signal inbox (POST /api/signals/generic) so it sits next to production
# signals. key = fleet:<routine>:<kind>, stable per routine and failure kind,
# so repeats comment on the open issue instead of opening another. Records the
# kind for fleet_record_metrics (fleet_failure_signals_total). Never fails the
# caller: a signal that cannot be sent is logged and left in the run directory.
FLEET_POSTED_FAILURE_KIND=""
fleet_post_signal() {
  local kind="$1" summary="$2"
  local routine="${FLEET_RUN_NAME:-${FLEET_ROUTINE:-fleet}}"
  local file="${RUN_DIR:-${TMPDIR:-/tmp}}/signal-failure.json"
  local log_tail=""
  if [[ -n "${RUN_DIR:-}" && -f "$RUN_DIR/log.txt" ]]; then
    log_tail="$(tail -n 20 "$RUN_DIR/log.txt" 2>/dev/null || true)"
  fi
  KIND="$kind" SUMMARY="$summary" ROUTINE="$routine" RUN="$(basename "${RUN_DIR:-none}")" \
    HOST="$(hostname 2>/dev/null || echo unknown)" LOG_TAIL="$log_tail" REPO="$FLEET_REPO" \
    DASH="$FLEET_DASHBOARD_URL" node -e '
    const e = process.env;
    const summary = (e.SUMMARY || "the harness exited with an error").slice(0, 600);
    process.stdout.write(JSON.stringify([{
      title: `Fleet ${e.ROUTINE} failed: ${e.KIND}`,
      key: `fleet:${e.ROUTINE}:${e.KIND}`,
      severity: "warning",
      state: "firing",
      summary: `${summary} (run ${e.RUN} on ${e.HOST}). The fleet routine itself broke; production may be fine.`,
      link: e.DASH,
      details: { routine: e.ROUTINE, kind: e.KIND, run: e.RUN, host: e.HOST, message: e.SUMMARY,
        log_tail: e.LOG_TAIL ? e.LOG_TAIL.split("\n") : [], runbook: "docs/ca-fleet-operations.md (control-panel), section Watching the fleet" },
    }], null, 2) + "\n");
  ' >"$file"
  FLEET_POSTED_FAILURE_KIND="$kind"
  if ! command -v "$FLEET_CURL_BIN" >/dev/null 2>&1; then
    fleet_warn "cannot post failure signal: $FLEET_CURL_BIN not found"
    return 0
  fi
  fleet_post_signals generic "$file" signal-failure || true
}

# ─── Metrics (Prometheus textfile) ──────────────────────────────────────────
# One file, $FLEET_METRICS_FILE (runs/metrics.prom on ca-fleet), read by the
# node exporter's textfile collector in Alloy. Every routine calls
# fleet_record_metrics once, from its exit handler. The file is rewritten
# whole, under a lock, to a temp file then renamed, so a scrape never sees a
# half-written file and two routines finishing together cannot lose updates.
#
# fleet_record_metrics --outcome <outcome> [--usage-file <claude-output.json>]...
#                      [--signal-to-fix <seconds>] [--gauges <json-file>]
#   fleet_run_total{routine,outcome}             +1
#   fleet_run_duration_seconds{routine}          duration of this run
#   fleet_last_run_timestamp_seconds{routine}    now
#   fleet_last_success_timestamp{routine}        now, unless outcome is error
#   fleet_last_outcome_timestamp{routine,outcome} now
#   fleet_consecutive_failures{routine}          +1 on error, reset otherwise
#   fleet_tokens_total{routine,kind}             from --usage-file (input, output, cache_read, cache_creation)
#   fleet_cost_usd_total{routine}                from --usage-file total_cost_usd
#   fleet_signal_to_fix_seconds{routine}         --signal-to-fix (last), plus _sum/_count
#   fleet_failure_signals_total{routine,kind}    +1 when fleet_post_signal ran in this process
#   <anything in --gauges>                       {"name{labels}": value}; names ending in
#                                                _total are counters and add, others are set
fleet_record_metrics() {
  local outcome="" signal_to_fix="" gauges="" usage_files=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --outcome) outcome="$2"; shift 2 ;;
      --usage-file) usage_files="$usage_files$2"$'\n'; shift 2 ;;
      --signal-to-fix) signal_to_fix="$2"; shift 2 ;;
      --gauges) gauges="$2"; shift 2 ;;
      *) fleet_warn "fleet_record_metrics: unknown argument $1"; shift ;;
    esac
  done
  [[ -n "$outcome" ]] || { fleet_warn "fleet_record_metrics: --outcome is required"; return 0; }
  local routine="${FLEET_RUN_NAME:-${FLEET_ROUTINE:-fleet}}"
  local duration=0
  [[ -n "${FLEET_RUN_STARTED_EPOCH:-}" ]] && duration="$(fleet_duration_s)"
  local usage="{}"
  if [[ -n "$usage_files" ]]; then
    # shellcheck disable=SC2086
    usage="$(fleet_claude_usage $usage_files)"
  fi
  mkdir -p "$(dirname "$FLEET_METRICS_FILE")"
  local lock="$FLEET_METRICS_FILE.lock" tries=0
  until mkdir "$lock" 2>/dev/null; do
    tries=$((tries + 1))
    if [[ $tries -ge 100 ]]; then
      # 10 s: whoever held it is gone or wedged; take it over.
      rm -rf "$lock"
      continue
    fi
    sleep 0.1
  done
  local code=0
  METRICS_FILE="$FLEET_METRICS_FILE" ROUTINE="$routine" OUTCOME="$outcome" DURATION="$duration" \
    USAGE="$usage" SIGNAL_TO_FIX="$signal_to_fix" GAUGES_FILE="$gauges" \
    FAILURE_KIND="$FLEET_POSTED_FAILURE_KIND" node -e '
    const fs = require("fs"); const path = require("path"); const e = process.env;
    const now = Math.floor(Date.now() / 1000);
    // name{labels} → value. Labels are kept as a canonical string.
    const samples = new Map();
    const key = (name, labels) => {
      const parts = Object.keys(labels).sort().map((k) => `${k}=${JSON.stringify(String(labels[k]))}`);
      return parts.length ? `${name}{${parts.join(",")}}` : name;
    };
    const parseLabels = (raw) => {
      const labels = {};
      const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
      let m;
      while ((m = re.exec(raw || ""))) labels[m[1]] = JSON.parse(`"${m[2]}"`);
      return labels;
    };
    if (fs.existsSync(e.METRICS_FILE)) {
      for (const line of fs.readFileSync(e.METRICS_FILE, "utf8").split("\n")) {
        const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(-?[0-9.eE+-]+|NaN)\s*$/);
        if (!m) continue;
        samples.set(key(m[1], parseLabels(m[2])), Number(m[3]));
      }
    }
    const get = (name, labels) => samples.get(key(name, labels)) || 0;
    const set = (name, labels, value) => samples.set(key(name, labels), value);
    const add = (name, labels, value) => set(name, labels, get(name, labels) + value);
    const r = { routine: e.ROUTINE };
    add("fleet_run_total", { ...r, outcome: e.OUTCOME }, 1);
    set("fleet_run_duration_seconds", r, Number(e.DURATION) || 0);
    set("fleet_last_run_timestamp_seconds", r, now);
    set("fleet_last_outcome_timestamp", { ...r, outcome: e.OUTCOME }, now);
    if (e.OUTCOME === "error") {
      add("fleet_consecutive_failures", r, 1);
    } else {
      set("fleet_last_success_timestamp", r, now);
      set("fleet_consecutive_failures", r, 0);
    }
    const usage = JSON.parse(e.USAGE || "{}");
    if (usage.tokens) {
      for (const [kind, n] of Object.entries(usage.tokens)) if (n) add("fleet_tokens_total", { ...r, kind }, n);
      if (usage.cost_usd) add("fleet_cost_usd_total", r, usage.cost_usd);
    }
    if (e.SIGNAL_TO_FIX !== "" && Number.isFinite(Number(e.SIGNAL_TO_FIX))) {
      set("fleet_signal_to_fix_seconds", r, Number(e.SIGNAL_TO_FIX));
      add("fleet_signal_to_fix_seconds_sum", r, Number(e.SIGNAL_TO_FIX));
      add("fleet_signal_to_fix_seconds_count", r, 1);
    }
    if (e.FAILURE_KIND) add("fleet_failure_signals_total", { ...r, kind: e.FAILURE_KIND }, 1);
    if (e.GAUGES_FILE && fs.existsSync(e.GAUGES_FILE)) {
      const gauges = JSON.parse(fs.readFileSync(e.GAUGES_FILE, "utf8"));
      for (const [spec, value] of Object.entries(gauges)) {
        const m = spec.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?$/);
        if (!m || !Number.isFinite(Number(value))) continue;
        const labels = parseLabels(m[2]);
        if (m[1].endsWith("_total")) add(m[1], labels, Number(value)); else set(m[1], labels, Number(value));
      }
    }
    set("fleet_metrics_written_timestamp_seconds", {}, now);
    // Render grouped by metric name with HELP/TYPE headers.
    const help = {
      fleet_run_total: "Runs finished, by routine and outcome.",
      fleet_run_duration_seconds: "Duration of the last run of each routine.",
      fleet_last_run_timestamp_seconds: "When each routine last finished a run.",
      fleet_last_success_timestamp: "When each routine last finished without a harness error.",
      fleet_last_outcome_timestamp: "When each routine last finished with this outcome.",
      fleet_consecutive_failures: "Runs in a row that ended in a harness error.",
      fleet_tokens_total: "Claude tokens used, by routine and kind.",
      fleet_cost_usd_total: "Claude spend in USD as reported by claude -p.",
      fleet_signal_to_fix_seconds: "Issue created to PR opened or commit pushed, last fix.",
      fleet_signal_to_fix_seconds_sum: "Sum of signal-to-fix latencies.",
      fleet_signal_to_fix_seconds_count: "Number of fixes with a signal-to-fix latency.",
      fleet_failure_signals_total: "Failure signals the fleet posted about itself.",
      fleet_metrics_written_timestamp_seconds: "When this file was last written.",
    };
    const byName = new Map();
    for (const [k, v] of samples) {
      const name = k.replace(/\{.*$/, "");
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push([k, v]);
    }
    let text = "";
    for (const name of [...byName.keys()].sort()) {
      const type = /_total$|_sum$|_count$/.test(name) ? "counter" : "gauge";
      text += `# HELP ${name} ${help[name] || "Fleet gauge recorded by a routine."}\n# TYPE ${name} ${type}\n`;
      for (const [k, v] of byName.get(name).sort((a, b) => (a[0] < b[0] ? -1 : 1))) text += `${k} ${v}\n`;
    }
    const tmp = path.join(path.dirname(e.METRICS_FILE), `.metrics.prom.${process.pid}.tmp`);
    fs.writeFileSync(tmp, text);
    fs.chmodSync(tmp, 0o644);
    fs.renameSync(tmp, e.METRICS_FILE);
  ' || code=$?
  rm -rf "$lock"
  if [[ $code -ne 0 ]]; then
    fleet_warn "fleet_record_metrics failed with $code; $FLEET_METRICS_FILE not updated"
  else
    fleet_info "metrics recorded: routine=$routine outcome=$outcome → $FLEET_METRICS_FILE"
  fi
  return 0
}

# fleet_github_gauges <out-file> : repo-wide gauges a routine can hand to
# fleet_record_metrics --gauges: open needs-decision issues, open fixer PRs,
# open signals, inbox depth (signal/bug issues without a fleet label). Each
# gh call that fails is skipped; the file always exists.
fleet_github_gauges() {
  local out="$1" nd prs signals candidates
  nd="$(gh issue list --repo "$FLEET_REPO" --state open --label "$FLEET_LABEL_NEEDS_DECISION" --limit 200 --json number 2>/dev/null || echo null)"
  prs="$(gh pr list --repo "$FLEET_REPO" --state open --limit 100 --json headRefName 2>/dev/null || echo null)"
  signals="$(gh issue list --repo "$FLEET_REPO" --state open --label signal --limit 200 --json number 2>/dev/null || echo null)"
  candidates="$(fleet_list_candidate_issues 2>/dev/null || echo null)"
  ND="$nd" PRS="$prs" SIGNALS="$signals" CANDIDATES="$candidates" SKIP="$FLEET_SKIP_LABELS" node -e '
    const e = process.env;
    const parse = (s) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : null; } catch { return null; } };
    const out = {};
    const nd = parse(e.ND), prs = parse(e.PRS), signals = parse(e.SIGNALS), candidates = parse(e.CANDIDATES);
    if (nd) out.fleet_needs_decision_issues = nd.length;
    if (prs) out.fleet_open_fixer_prs = prs.filter((p) => String(p.headRefName || "").startsWith("fleet/fixer-")).length;
    if (signals) out.fleet_signals_open = signals.length;
    if (candidates) {
      const skip = new Set(e.SKIP.split(/\s+/).filter(Boolean));
      out.fleet_inbox_open = candidates.filter((i) => !(i.labels || []).some((l) => skip.has(typeof l === "string" ? l : l.name))).length;
    }
    process.stdout.write(JSON.stringify(out) + "\n");
  ' >"$out"
}

# fleet_epoch <iso-8601> : seconds since the epoch, or nothing when unparseable.
fleet_epoch() {
  node -e 'const t = Date.parse(process.argv[1]); if (Number.isFinite(t)) process.stdout.write(String(Math.floor(t / 1000)));' "$1"
}
