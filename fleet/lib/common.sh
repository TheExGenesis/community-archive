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
: "${FLEET_RUNS_DIR:=$FLEET_ROOT/.fleet-runs}"
export FLEET_REPO CA_URL FLEET_RUNS_DIR

FLEET_LABEL_IN_PROGRESS="fleet:in-progress"
FLEET_LABEL_PR_OPEN="fleet:pr-open"
FLEET_LABEL_WONTFIX="fleet:wontfix"
FLEET_LABEL_NEEDS_DECISION="fleet:needs-decision"
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
fleet_error() { fleet_log error "$@"; }
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
