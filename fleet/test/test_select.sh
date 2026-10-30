#!/usr/bin/env bash
# Issue selection: oldest open signal/bug without a fleet:* label.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
source "$FLEET_SRC_ROOT/fleet/lib/common.sh"

TMP="$(t_tmpdir)"
trap 'rm -rf "$TMP"' EXIT
make_gh_state "$TMP/gh"
export PATH="$FAKES_DIR:$PATH"

# Listing merges signal and bug without duplicates.
fleet_list_candidate_issues >"$TMP/candidates.json"
assert_eq "$(json_get "$TMP/candidates.json" 'd.length')" "4" "four open candidates listed"
assert_eq "$(json_get "$TMP/candidates.json" 'd.map(i=>i.number).sort((a,b)=>a-b).join(",")')" "2,3,7,10" "numbers"

# Oldest without fleet labels is #7 (2 and 3 are skipped, 10 is newer).
picked="$(fleet_pick_issue <"$TMP/candidates.json")"
assert_eq "$(printf '%s' "$picked" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).number)))')" "7" "picks the oldest unlabelled issue"

# Labels given as strings work too; ties break on the lower number.
picked="$(printf '%s' '[{"number":9,"createdAt":"2026-01-01T00:00:00Z","labels":["bug"]},{"number":8,"createdAt":"2026-01-01T00:00:00Z","labels":["signal"]}]' | fleet_pick_issue)"
assert_contains "$picked" '"number":8' "tie breaks on the lower number"

# Everything labelled → nothing picked.
picked="$(printf '%s' '[{"number":1,"createdAt":"2026-01-01T00:00:00Z","labels":[{"name":"fleet:wontfix"}]}]' | fleet_pick_issue)"
assert_eq "$picked" "" "nothing left to pick"
picked="$(printf '%s' '[]' | fleet_pick_issue)"
assert_eq "$picked" "" "empty inbox"

# Label creation is idempotent and only creates what is missing.
fleet_ensure_labels
created="$(grep -c '^label create' "$TMP/gh/calls.log" || true)"
assert_eq "$created" "4" "creates the four fleet labels, bug already exists"
fleet_ensure_labels
created="$(grep -c '^label create' "$TMP/gh/calls.log" || true)"
assert_eq "$created" "4" "second call creates nothing"

t_done
