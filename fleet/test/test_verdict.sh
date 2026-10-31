#!/usr/bin/env bash
# Verdict parsing from `claude -p --output-format json` output.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
source "$FLEET_SRC_ROOT/fleet/lib/common.sh"

TMP="$(t_tmpdir)"
trap 'rm -rf "$TMP"' EXIT

claude_output bug "Set the answer to 42." >"$TMP/bug.json"
out="$(fleet_parse_verdict "$TMP/bug.json")"
assert_eq "$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);process.stdout.write([v.classification,v.summary,v.files.join(","),v.root_cause?"rc":"",v.check_next_time?"cnt":""].join("|"))})')" \
  "bug|Set the answer to 42.|src/foo.ts|rc|cnt" "bug verdict fields"

claude_output wontfix "Not a defect." >"$TMP/wontfix.json"
assert_eq "$(fleet_parse_verdict "$TMP/wontfix.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).classification))')" "wontfix" "wontfix verdict"

# The last fenced block wins; earlier json blocks (e.g. a quoted signal) are ignored.
node -e '
  const result = "Signal was:\n```json\n{\"classification\":\"bug\",\"summary\":\"not me\"}\n```\nDone.\n```json\n{\"classification\":\"needs-decision\",\"summary\":\"Tier 1 migration needed\",\"files\":[]}\n```";
  process.stdout.write(JSON.stringify({is_error:false, session_id:"s", result}));' >"$TMP/last.json"
assert_eq "$(fleet_parse_verdict "$TMP/last.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).classification))')" "needs-decision" "last block wins"

# Invalid classification → exit 3.
node -e 'process.stdout.write(JSON.stringify({is_error:false, result:"```json\n{\"classification\":\"maybe\"}\n```"}))' >"$TMP/invalid.json"
code=0; fleet_parse_verdict "$TMP/invalid.json" >/dev/null 2>&1 || code=$?
assert_status "$code" 3 "invalid classification"

# No block at all → exit 3.
node -e 'process.stdout.write(JSON.stringify({is_error:false, result:"I ran out of turns."}))' >"$TMP/none.json"
code=0; fleet_parse_verdict "$TMP/none.json" >/dev/null 2>&1 || code=$?
assert_status "$code" 3 "no verdict block"

# is_error (auth, api) → exit 2, so the harness frees the issue instead of labelling it.
node -e 'process.stdout.write(JSON.stringify({is_error:true, result:"Failed to authenticate", session_id:"x"}))' >"$TMP/err.json"
code=0; fleet_parse_verdict "$TMP/err.json" >/dev/null 2>&1 || code=$?
assert_status "$code" 2 "is_error"

# Not JSON at all (claude crashed before printing) → exit 2.
echo "Segmentation fault" >"$TMP/garbage.json"
code=0; fleet_parse_verdict "$TMP/garbage.json" >/dev/null 2>&1 || code=$?
assert_status "$code" 2 "garbage output"

t_done
