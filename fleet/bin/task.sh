#!/usr/bin/env bash
# fleet/bin/task.sh: the fleet's bash helpers (fleet/lib/common.sh) as
# subcommands, so a long-running service (fleet/slack) ships under the same
# gate, read-back, result.json, metrics and failure-signal conventions as the
# fixer without a second implementation. Every subcommand runs with RUN_DIR
# exported by the caller (the run directory of the task it belongs to).
#
#   task.sh init-run <name>                      create RUN_DIR, record started_at
#   task.sh worktree-add <branch> <path> [base]  fresh worktree of origin/<base>; prints the base sha
#   task.sh worktree-remove <path> [branch]      remove it (and the local branch)
#   task.sh stage <worktree>                     git add -A; prints the staged patch
#   task.sh tier1 <worktree>                     Tier 1 violations of the staged diff, one per line
#   task.sh tier1-paths                          Tier 1 violations for file paths on stdin, one per line
#   task.sh changed-lines <worktree>             added+removed staged lines (learnings excluded)
#   task.sh gate <worktree> <log-dir>            the four CI checks; exit 1 on the first failure
#   task.sh gate-failure-prompt <log-dir> <out>  the --resume prompt after a red gate
#   task.sh commit <worktree> <message-file>     commit the staged change (--no-verify); prints the sha
#   task.sh push-branch <worktree> <branch>      push HEAD to origin/<branch>
#   task.sh pr-create <branch> <title> <body-file> [base]   open the PR, read it back; prints the URL
#   task.sh pr-view <number>                     PR facts as JSON (state, mergeable, checks, files, body)
#   task.sh pr-merge <number>                    squash-merge, delete the branch, read back MERGED
#   task.sh issue-close <number> <comment-file>  close an issue with a comment, read back CLOSED
#   task.sh issues-list                          open signal + bug issues as a JSON array
#   task.sh labels-ensure                        create the fleet:* labels when missing
#   task.sh transcript-render <jsonl> <md> <title>
#   task.sh run-line <outcome>                   the "_Run `id` · outcome …_" markdown line
#   task.sh post-signal <kind> <summary>         file the fleet's own failure in the inbox
#   task.sh finish <outcome> [issue] [ref] [session]   usage.json, result.json (+ loki.jsonl), metrics
set -euo pipefail

FLEET_BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "$FLEET_BIN_DIR/../lib/common.sh"

: "${FLEET_BASE_BRANCH:=main}"
FLEET_RUN_NAME="${FLEET_RUN_NAME:-${FLEET_ROUTINE:-slack}}"
export FLEET_RUN_NAME
# A later subcommand of the same run reads the start time the first one wrote.
if [[ -z "${FLEET_RUN_STARTED_EPOCH:-}" ]]; then
  if [[ -n "${RUN_DIR:-}" && -s "$RUN_DIR/started_at" ]]; then
    FLEET_RUN_STARTED_EPOCH="$(fleet_epoch "$(cat "$RUN_DIR/started_at")")"
  fi
  : "${FLEET_RUN_STARTED_EPOCH:=$(date +%s)}"
  export FLEET_RUN_STARTED_EPOCH
fi

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

git_identity() {
  GIT_ID=()
  if [[ -n "${FLEET_GIT_NAME:-}" ]]; then GIT_ID+=(-c "user.name=$FLEET_GIT_NAME"); fi
  if [[ -n "${FLEET_GIT_EMAIL:-}" ]]; then GIT_ID+=(-c "user.email=$FLEET_GIT_EMAIL"); fi
}

cmd="${1:-}"
[[ -n "$cmd" ]] || usage
shift
case "$cmd" in
  init-run)
    fleet_init_run "${1:?name}"
    printf '%s\n' "$RUN_DIR"
    ;;
  worktree-add)
    fleet_worktree_add "${1:?branch}" "${2:?path}" "${3:-$FLEET_BASE_BRANCH}"
    ;;
  worktree-remove)
    fleet_worktree_remove "${1:?path}" "${2:-}"
    ;;
  stage)
    git -C "${1:?worktree}" add -A
    git -C "$1" diff --cached
    ;;
  tier1)
    fleet_tier1_violations "${1:?worktree}"
    ;;
  tier1-paths)
    fleet_tier1_path_violations
    ;;
  changed-lines)
    fleet_changed_lines "${1:?worktree}"
    ;;
  gate)
    fleet_run_gate "${1:?worktree}" "${2:?log-dir}"
    ;;
  gate-failure-prompt)
    fleet_gate_failure_prompt "${1:?log-dir}" "${2:?out}"
    ;;
  commit)
    git_identity
    git -C "${1:?worktree}" ${GIT_ID[@]+"${GIT_ID[@]}"} commit --quiet --no-verify -F "${2:?message-file}"
    git -C "$1" rev-parse HEAD
    ;;
  push-branch)
    git -C "${1:?worktree}" push --quiet origin "HEAD:refs/heads/${2:?branch}"
    ;;
  pr-create)
    branch="${1:?branch}" title="${2:?title}" body="${3:?body-file}" base="${4:-$FLEET_BASE_BRANCH}"
    url="$(gh pr create --repo "$FLEET_REPO" --base "$base" --head "$branch" --title "$title" --body-file "$body")"
    number="${url##*/}"
    fleet_readback_pr "$number" || fleet_die "read-back failed: PR #$number is not open on GitHub"
    printf '%s\n' "$url"
    ;;
  pr-view)
    gh pr view "${1:?number}" --repo "$FLEET_REPO" \
      --json number,url,title,state,isDraft,mergeable,mergeStateStatus,headRefName,baseRefName,statusCheckRollup,files,body,additions,deletions
    ;;
  pr-merge)
    number="${1:?number}"
    gh pr merge "$number" --repo "$FLEET_REPO" --squash --delete-branch >/dev/null
    state="$(gh pr view "$number" --repo "$FLEET_REPO" --json state --jq .state 2>/dev/null || true)"
    [[ "$state" == "MERGED" ]] || fleet_die "read-back failed: PR #$number is not merged (state '$state')"
    echo MERGED
    ;;
  issue-close)
    number="${1:?number}" comment="${2:?comment-file}"
    gh issue close "$number" --repo "$FLEET_REPO" --comment "$(cat "$comment")" >/dev/null
    fleet_readback_issue_state "$number" CLOSED || fleet_die "read-back failed: #$number is not closed"
    ;;
  issues-list)
    fleet_list_candidate_issues
    ;;
  labels-ensure)
    fleet_ensure_labels
    ;;
  transcript-render)
    fleet_transcript_render "${1:?jsonl}" "${2:?md}" "${3:-Fleet transcript}"
    ;;
  run-line)
    fleet_run_line "${1:?outcome}"
    ;;
  post-signal)
    fleet_post_signal "${1:?kind}" "${2:?summary}"
    ;;
  finish)
    outcome="${1:?outcome}" issue="${2:-}" ref="${3:-}" session="${4:-}"
    [[ -n "${RUN_DIR:-}" && -d "$RUN_DIR" ]] || fleet_die "finish: RUN_DIR must be an existing directory"
    usage_files=()
    for f in "$RUN_DIR"/claude-output*.json; do
      [[ -s "$f" ]] && usage_files+=("$f")
    done
    if [[ ${#usage_files[@]} -gt 0 ]]; then
      fleet_claude_usage "${usage_files[@]}" >"$RUN_DIR/usage.json"
    fi
    extra=""
    [[ -s "$RUN_DIR/result-extra.json" ]] && extra="$RUN_DIR/result-extra.json"
    fleet_write_result "$outcome" "$issue" "$ref" "$session" "$extra"
    metrics_args=(--outcome "$outcome")
    for f in ${usage_files[@]+"${usage_files[@]}"}; do metrics_args+=(--usage-file "$f"); done
    [[ -s "$RUN_DIR/gauges.json" ]] && metrics_args+=(--gauges "$RUN_DIR/gauges.json")
    fleet_record_metrics "${metrics_args[@]}"
    ;;
  *)
    usage
    ;;
esac
