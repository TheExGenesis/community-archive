#!/usr/bin/env bash
# Read-back checks and the Tier 1 guard.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
source "$FLEET_SRC_ROOT/fleet/lib/common.sh"

TMP="$(t_tmpdir)"
trap 'rm -rf "$TMP"' EXIT
make_gh_state "$TMP/gh"
export PATH="$FAKES_DIR:$PATH"

# Labels
code=0; fleet_readback_issue_label 7 bug || code=$?
assert_status "$code" 0 "label present"
code=0; fleet_readback_issue_label 7 fleet:pr-open || code=$?
assert_status "$code" 1 "label absent"
fleet_issue_swap_label 7 bug fleet:pr-open
code=0; fleet_readback_issue_label 7 fleet:pr-open || code=$?
assert_status "$code" 0 "label present after swap"
code=0; fleet_readback_issue_label 7 bug || code=$?
assert_status "$code" 1 "old label gone after swap"

# Comments
code=0; fleet_readback_issue_comment 7 "[fleet:fixer] PR opened" || code=$?
assert_status "$code" 1 "comment absent"
echo "**[fleet:fixer] PR opened** https://x" >"$TMP/c.md"
fleet_issue_comment 7 "$TMP/c.md"
code=0; fleet_readback_issue_comment 7 "[fleet:fixer] PR opened" || code=$?
assert_status "$code" 0 "comment present"

# Issue state
code=0; fleet_readback_issue_state 7 OPEN || code=$?
assert_status "$code" 0 "open"
code=0; fleet_readback_issue_state 7 CLOSED || code=$?
assert_status "$code" 1 "not closed"
code=0; fleet_readback_issue_state 999 OPEN || code=$?
assert_status "$code" 1 "missing issue is not open"

# PRs
code=0; fleet_readback_pr 100 || code=$?
assert_status "$code" 1 "pr missing"
echo "body" >"$TMP/b.md"
gh pr create --repo o/r --base main --head fleet/x --title t --body-file "$TMP/b.md" >/dev/null
code=0; fleet_readback_pr 100 || code=$?
assert_status "$code" 0 "pr open"

# Commit on branch (uses a real bare repo)
make_test_repo "$TMP/git"
export FAKE_GH_REMOTE="$ORIGIN"
sha="$(git -C "$REPO" rev-parse HEAD)"
code=0; fleet_readback_commit_on_branch "$sha" main || code=$?
assert_status "$code" 0 "commit on main"
echo x >"$REPO/src/new.ts"
git -C "$REPO" add -A && git -C "$REPO" commit --quiet -m local
local_sha="$(git -C "$REPO" rev-parse HEAD)"
code=0; fleet_readback_commit_on_branch "$local_sha" main || code=$?
assert_status "$code" 1 "unpushed commit is not on main"

# Tier 1 guard on a staged diff
git -C "$REPO" reset --quiet --hard origin/main
mkdir -p "$REPO/supabase/migrations"
echo "alter table x" >"$REPO/supabase/migrations/1.sql"
echo "export const answer = 42" >"$REPO/src/foo.ts"
git -C "$REPO" add -A
v="$(fleet_tier1_violations "$REPO")"
assert_contains "$v" "Tier 1 path changed: supabase/migrations/1.sql" "supabase path flagged"
assert_eq "$(fleet_changed_lines "$REPO")" "3" "changed lines counted (1 added + 1 removed + 1 added)"

git -C "$REPO" reset --quiet --hard origin/main
printf 'const admin = createServerServiceRoleClient()\n' >>"$REPO/src/foo.ts"
git -C "$REPO" add -A
v="$(fleet_tier1_violations "$REPO")"
assert_contains "$v" "Tier 1 content in added lines: /createServerServiceRoleClient/" "service role flagged"

git -C "$REPO" reset --quiet --hard origin/main
git -C "$REPO" mv src/foo.ts src/bar.ts
v="$(fleet_tier1_violations "$REPO")"
assert_contains "$v" "File moves are not allowed" "rename flagged"

git -C "$REPO" reset --quiet --hard origin/main
echo "export const answer = 42" >"$REPO/src/foo.ts"
mkdir -p "$REPO/memos/fleet/learnings"
printf 'opt_out mention is fine in a learning\n' >"$REPO/memos/fleet/learnings/2026-01-01-7.md"
git -C "$REPO" add -A
v="$(fleet_tier1_violations "$REPO")"
assert_eq "$v" "" "clean Tier 0 change (learning excluded from content scan)"
assert_eq "$(fleet_changed_lines "$REPO")" "2" "learning excluded from the line count"

t_done
