#!/usr/bin/env bash
# Transcript tooling: scrub, render, summary and result extraction over a
# canned stream-json fixture; the result.json fields and loki.jsonl export
# fleet_write_result derives from it; the runs.sh CLI over a runs directory.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TMP="$(t_tmpdir)"
trap 'rm -rf "$TMP"' EXIT
FIXTURE="$FLEET_TEST_DIR/fixtures/stream.jsonl"
TRANSCRIPT_TOOL="$FLEET_SRC_ROOT/fleet/lib/transcript.mjs"

# ─── 1. scrub: literals from the environment, assignment and header shapes, token shapes ──
export GH_TOKEN="ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"
export SIGNALS_WEBHOOK_SECRET="hunter2hunter2hunter2"
export VERCEL_TOKEN="literal-secret-value-xyz"
node "$TRANSCRIPT_TOOL" scrub <"$FIXTURE" >"$TMP/scrubbed.jsonl"
scrubbed="$(cat "$TMP/scrubbed.jsonl")"
assert_not_contains "$scrubbed" "ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" "GH_TOKEN literal gone"
assert_not_contains "$scrubbed" "hunter2hunter2hunter2" "SIGNALS_WEBHOOK_SECRET literal gone"
assert_not_contains "$scrubbed" "literal-secret-value-xyz" "VERCEL_TOKEN literal gone"
assert_not_contains "$scrubbed" "sk-ant-api03-SECRETSECRET" "Anthropic key shape gone"
assert_not_contains "$scrubbed" "Bearer sk-" "bearer value gone"
assert_contains "$scrubbed" "GH_TOKEN=[REDACTED]" "assignment keeps its name"
assert_contains "$scrubbed" "Authorization: [REDACTED]" "header keeps its name"
assert_contains "$scrubbed" "expected 400, got 200" "non-secret text kept"
assert_eq "$(wc -l <"$TMP/scrubbed.jsonl" | tr -d ' ')" "$(wc -l <"$FIXTURE" | tr -d ' ')" "one line out per line in"
assert_eq "$(node -e 'const fs=require("fs");let ok=0;for(const l of fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean)){JSON.parse(l);ok++}console.log(ok)' "$TMP/scrubbed.jsonl")" "14" "every scrubbed line is still JSON"
# Shapes without the literal in the environment, and secret-named keys in tool input.
unset GH_TOKEN SIGNALS_WEBHOOK_SECRET VERCEL_TOKEN
printf '%s\n' \
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t","content":"token github_pat_11ABCDEFG0123456789abcdefghijklmnopqrstuvwxyz ok; jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c; aws AKIAIOSFODNN7EXAMPLE; -----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----"}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"u","name":"Bash","input":{"command":"curl -H \"Authorization: Bearer abc.def.ghi-jkl_mno\" https://x","headers":{"Authorization":"Bearer zzz","X-Api-Key":"k"},"api_key":"plain","note":"API_KEY: string"}}]}}' \
  'not json but has ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 inside' \
  | node "$TRANSCRIPT_TOOL" scrub >"$TMP/shapes.jsonl"
shapes="$(cat "$TMP/shapes.jsonl")"
assert_not_contains "$shapes" "github_pat_11ABCDEFG" "fine-grained PAT shape gone"
assert_not_contains "$shapes" "eyJhbGciOiJIUzI1NiJ9" "JWT gone"
assert_not_contains "$shapes" "AKIAIOSFODNN7EXAMPLE" "AWS key id gone"
assert_not_contains "$shapes" "MIIE" "private key block gone"
assert_contains "$shapes" "[REDACTED PRIVATE KEY]" "private key marker"
assert_not_contains "$shapes" "abc.def.ghi-jkl_mno" "bearer inside a command gone"
assert_not_contains "$shapes" '"Authorization":"Bearer zzz"' "secret-named object key redacted"
assert_contains "$shapes" '"Authorization":"[REDACTED]"' "secret-named key keeps its name"
assert_contains "$shapes" '"X-Api-Key":"[REDACTED]"' "api-key header redacted"
assert_contains "$shapes" '"api_key":"[REDACTED]"' "api_key field redacted"
assert_contains "$shapes" 'API_KEY: string' "short type annotation left alone"
assert_contains "$shapes" 'not json but has [REDACTED] inside' "non-JSON line scrubbed as text"

# ─── 2. render ──────────────────────────────────────────────────────────────
FLEET_TRANSCRIPT_TITLE="Fleet fixer · test" node "$TRANSCRIPT_TOOL" render "$TMP/scrubbed.jsonl" "$TMP/transcript.md"
md="$(cat "$TMP/transcript.md")"
assert_contains "$md" "# Fleet fixer · test" "title from env"
assert_contains "$md" "- Calls: 2 · turns: 6" "calls and turns summed over the resume"
assert_contains "$md" "cost: \$0.41" "cost summed"
assert_contains "$md" "## Call 1" "first call heading"
assert_contains "$md" "## Call 2 (resumed)" "resumed call heading"
assert_contains "$md" "🔧 **Read \`src/app/api/tweet-search/route.ts\`**" "Read summarised by path"
assert_contains "$md" "🔧 **Edit \`src/app/api/tweet-search/route.ts\`**" "Edit summarised by path"
assert_contains "$md" "+++ new" "Edit shows old and new"
assert_contains "$md" "🔧 **Bash \`pnpm test -- tweet-search\`**" "Bash summarised by command"
assert_contains "$md" "🔧 **Write \`src/app/api/tweet-search/route.test.ts\` (" "Write summarised by path and size"
assert_contains "$md" "✗ Bash failed (" "failed tool result marked"
assert_contains "$md" "↳ Read result (1113 chars)" "result size shown"
assert_contains "$md" "… (+513 chars)" "long result truncated"
assert_contains "$md" "_thinking (113 chars):" "thinking summarised"
assert_contains "$md" "## Result · success · 4 turns · 1m 5s · \$0.31" "result line per call"
assert_contains "$md" "### Final message" "final message section"
assert_contains "$md" '"classification":"bug"' "verdict in the final message"
assert_not_contains "$md" "ghp_AbCd" "rendered from the scrubbed stream"
assert_contains "$md" "· 12:00:01Z" "event timestamps shown"
# An empty or missing transcript renders without failing.
: >"$TMP/empty.jsonl"
assert_contains "$(node "$TRANSCRIPT_TOOL" render "$TMP/empty.jsonl")" "No result event" "empty transcript rendered"
assert_contains "$(node "$TRANSCRIPT_TOOL" render "$TMP/does-not-exist.jsonl")" "Calls: 0" "missing transcript rendered"

# ─── 3. summary and result extraction ───────────────────────────────────────
node "$TRANSCRIPT_TOOL" summary "$FIXTURE" >"$TMP/summary.json"
assert_eq "$(json_get "$TMP/summary.json" 'd.calls')" "2" "summary calls"
assert_eq "$(json_get "$TMP/summary.json" 'd.cost_usd')" "0.4125" "summary cost summed"
assert_eq "$(json_get "$TMP/summary.json" 'd.tokens')" '{"input":6000,"output":1000,"cache_read":45000,"cache_creation":3000}' "summary tokens summed"
assert_eq "$(json_get "$TMP/summary.json" 'd.session_id')" "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" "summary session"
assert_eq "$(json_get "$TMP/summary.json" 'd.model')" "claude-opus-5-5" "summary model"
assert_eq "$(json_get "$TMP/summary.json" 'd.is_error')" "false" "summary is_error"
node "$TRANSCRIPT_TOOL" result "$FIXTURE" >"$TMP/last.json"
assert_eq "$(json_get "$TMP/last.json" 'd.total_cost_usd')" "0.1" "last result event"
assert_eq "$(json_get "$TMP/last.json" 'd.type')" "result" "result event type"
node "$TRANSCRIPT_TOOL" result "$FIXTURE" 1 >"$TMP/first.json"
assert_eq "$(json_get "$TMP/first.json" 'd.total_cost_usd')" "0.3125" "first result event by index"
assert_eq "$(node "$TRANSCRIPT_TOOL" result "$TMP/empty.jsonl" | wc -c | tr -d ' ')" "0" "no result event → nothing"
# The verdict parser reads the extracted result event like the old --output-format json file.
source "$FLEET_SRC_ROOT/fleet/lib/common.sh"
assert_eq "$(fleet_parse_verdict "$TMP/first.json" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.stdout.write(JSON.parse(s).classification))')" "bug" "verdict parsed from the result event"

# ─── 4. fleet_signal_fingerprint ────────────────────────────────────────────
printf '%s' '{"number":10,"body":"Summary.\n\n```json signal\n{\"source\":\"vercel\",\"fingerprint\":\"ffffffffffff\"}\n```\n<!-- fp:abc123def456 -->"}' >"$TMP/issue-marker.json"
assert_eq "$(fleet_signal_fingerprint "$TMP/issue-marker.json")" "abc123def456" "marker wins"
printf '%s' '{"number":11,"body":"```json signal\n{\"source\":\"vercel\",\"fingerprint\":\"vercel:abc\"}\n```"}' >"$TMP/issue-block.json"
assert_eq "$(fleet_signal_fingerprint "$TMP/issue-block.json")" "vercel:abc" "fingerprint from the signal block"
printf '%s' '{"number":12,"body":"plain bug report"}' >"$TMP/issue-plain.json"
assert_eq "$(fleet_signal_fingerprint "$TMP/issue-plain.json")" "" "no fingerprint"

# ─── 5. fleet_write_result: links, cost, transcript path, loki export ───────
export FLEET_RUNS_DIR="$TMP/runs"
export FLEET_REPO="o/r"
export FLEET_RUNS_EXPLORE_URL='https://g.example/explore?run={run_id}&x=1'
export RUN_DIR="$FLEET_RUNS_DIR/20261030T120000Z-fixer"
fleet_init_run fixer 2>/dev/null
cp "$TMP/scrubbed.jsonl" "$RUN_DIR/transcript.jsonl"
cp "$TMP/transcript.md" "$RUN_DIR/transcript.md"
cp "$TMP/issue-marker.json" "$RUN_DIR/issue.json"
printf '{"mode":"pr","classification":"bug","learning":"memos/fleet/learnings/2026-10-30-10.md"}\n' >"$RUN_DIR/extra.json"
fleet_write_result pr_opened 10 "https://github.com/o/r/pull/5" "" "$RUN_DIR/extra.json" 2>/dev/null
R="$RUN_DIR/result.json"
assert_eq "$(json_get "$R" 'd.run_id')" "20261030T120000Z-fixer" "run_id"
assert_eq "$(json_get "$R" 'd.issue_url')" "https://github.com/o/r/issues/10" "issue_url"
assert_eq "$(json_get "$R" 'd.signal_fingerprint')" "abc123def456" "signal_fingerprint from issue.json"
assert_eq "$(json_get "$R" 'd.pr_url')" "https://github.com/o/r/pull/5" "pr_url"
assert_eq "$(json_get "$R" 'd.commit_url')" "" "no commit_url for a PR"
assert_eq "$(json_get "$R" 'd.learning_path')" "memos/fleet/learnings/2026-10-30-10.md" "learning_path from extra.learning"
assert_eq "$(json_get "$R" 'd.transcript_path')" "$RUN_DIR/transcript.jsonl" "transcript_path"
assert_eq "$(json_get "$R" 'd.transcript_url')" "https://g.example/explore?run=20261030T120000Z-fixer&x=1" "transcript_url from the template"
assert_eq "$(json_get "$R" 'd.cost_usd')" "0.4125" "cost_usd from the transcript"
assert_eq "$(json_get "$R" 'd.tokens.cache_read')" "45000" "tokens from the transcript"
assert_eq "$(json_get "$R" 'd.calls')" "2" "calls from the transcript"
assert_eq "$(json_get "$R" 'd.session_id')" "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" "session_id falls back to the transcript"
assert_eq "$(json_get "$R" 'typeof d.started_at')" "string" "started_at recorded"
# Loki export: one line per source line, labelled with the run's outcome.
L="$RUN_DIR/loki.jsonl"
assert_file_exists "$L" "loki.jsonl written"
assert_eq "$(grep -c '"file":"result.json"' "$L")" "1" "result.json as one line"
assert_eq "$(grep -c '"file":"transcript.jsonl"' "$L")" "14" "every transcript event exported"
assert_eq "$(grep -c '"file":"transcript.md"' "$L")" "$(grep -c '' "$RUN_DIR/transcript.md")" "every transcript.md line exported"
assert_eq "$(grep -c '"file":"log.txt"' "$L" || true)" "$(grep -c '' "$RUN_DIR/log.txt")" "every log.txt line exported"
first="$(head -n 1 "$L")"
assert_contains "$first" '"routine":"fixer"' "routine label"
assert_contains "$first" '"issue":"10"' "issue label"
assert_contains "$first" '"outcome":"pr_opened"' "outcome label"
assert_contains "$first" '"run_id":"20261030T120000Z-fixer"' "run_id label"
assert_eq "$(node -e 'const fs=require("fs");const ls=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l));let ok=true,prev={};for(const l of ls){if(prev[l.file]&&Date.parse(l.ts)<=Date.parse(prev[l.file]))ok=false;prev[l.file]=l.ts}console.log(ok)' "$L")" "true" "timestamps increase within each file"
assert_eq "$(node -e 'const fs=require("fs");const l=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l)).find(l=>l.file==="transcript.jsonl"&&l.line.includes("toolu_01")&&l.line.includes("assistant"));console.log(l.ts)' "$L")" "2026-10-30T12:00:01.000Z" "transcript events keep their own timestamp"
assert_not_contains "$(cat "$L")" "hunter2hunter2hunter2" "export carries no secret"
# A commit ref gives commit_url; a run without a transcript has null cost.
export RUN_DIR="$FLEET_RUNS_DIR/20261030T130000Z-fixer"
fleet_init_run fixer 2>/dev/null
fleet_write_result pushed_main 7 "0123456789abcdef0123456789abcdef01234567" "sess-1" 2>/dev/null
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.commit_url')" "https://github.com/o/r/commit/0123456789abcdef0123456789abcdef01234567" "commit_url"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.pr_url')" "" "no pr_url for a commit"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.cost_usd')" "" "no cost without a transcript"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.signal_fingerprint')" "" "no fingerprint without issue.json"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.session_id')" "sess-1" "explicit session id kept"
assert_eq "$(grep -c '"file":"result.json"' "$RUN_DIR/loki.jsonl")" "1" "export without a transcript"
# A canary-style run: no issue, no ref.
export RUN_DIR="$FLEET_RUNS_DIR/20261030T131500Z-canary"
fleet_init_run canary 2>/dev/null
fleet_write_result ok "" "" "" 2>/dev/null
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.issue_url')" "" "no issue_url"
assert_not_contains "$(head -n 1 "$RUN_DIR/loki.jsonl")" '"issue"' "no issue key without an issue"
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.transcript_url')" "https://g.example/explore?run=20261030T131500Z-canary&x=1" "transcript_url for every routine"
# Without the template there is no URL.
export RUN_DIR="$FLEET_RUNS_DIR/20261030T132000Z-canary"
FLEET_RUNS_EXPLORE_URL="" fleet_init_run canary 2>/dev/null
FLEET_RUNS_EXPLORE_URL="" fleet_write_result ok "" "" "" 2>/dev/null
assert_eq "$(json_get "$RUN_DIR/result.json" 'd.transcript_url')" "" "no transcript_url without the template"

# ─── 6. fleet_run_line ──────────────────────────────────────────────────────
export RUN_DIR="$FLEET_RUNS_DIR/20261030T120000Z-fixer"
FLEET_RUN_STARTED_EPOCH=$(($(date +%s) - 754))
line="$(fleet_run_line needs_decision)"
assert_contains "$line" "_Run \`20261030T120000Z-fixer\` · outcome \`needs_decision\` · 12m 34s · \$0.41 · [transcript](https://g.example/explore?run=20261030T120000Z-fixer&x=1)_" "run line with link"
assert_contains "$(FLEET_RUNS_EXPLORE_URL="" fleet_run_line wontfix)" "· transcript in the run directory_" "run line without the template"
assert_not_contains "$(FLEET_RUNS_EXPLORE_URL="" fleet_run_line wontfix)" "](" "no link without the template"

# ─── 7. runs.sh ─────────────────────────────────────────────────────────────
ln -s "$FLEET_RUNS_DIR/20261030T131500Z-canary" "$FLEET_RUNS_DIR/latest-canary"
RUNS_SH="$FLEET_SRC_ROOT/fleet/bin/runs.sh"
listing="$(bash "$RUNS_SH" list 2>/dev/null)"
assert_eq "$(head -n 1 <<<"$listing" | tr -s ' ' | sed 's/ *$//')" "FINISHED (UTC) ROUTINE ISSUE OUTCOME TOOK COST SHIPPED RUN ID" "list header"
assert_eq "$(grep -cE 'fixer +#10 +pr_opened +[0-9]+s +\$0\.41 +PR #5 +20261030T120000Z-fixer$' <<<"$listing")" "1" "list row for the PR run"
assert_contains "$listing" "\$0.41" "list shows cost"
assert_contains "$listing" "PR #5" "list shows the PR"
assert_contains "$listing" "01234567" "list shows the commit"
assert_eq "$(bash "$RUNS_SH" list 2>/dev/null | tail -n 1 | awk '{print $NF}')" "20261030T120000Z-fixer" "newest first, oldest last"
assert_eq "$(bash "$RUNS_SH" list 2 2>/dev/null | grep -c 'Z-')" "2" "list honours the limit"
shown="$(bash "$RUNS_SH" show 20261030T120000Z-fixer 2>/dev/null)"
assert_contains "$shown" "outcome: pr_opened (bug)" "show prints the outcome"
assert_contains "$shown" "issue: #10  https://github.com/o/r/issues/10  fp:abc123def456" "show prints the issue"
assert_contains "$shown" "pr: https://github.com/o/r/pull/5" "show prints the PR"
assert_contains "$shown" "cost: \$0.41 over 2 call(s)" "show prints the cost"
assert_contains "$shown" "## Call 2 (resumed)" "show prints the transcript"
assert_contains "$(bash "$RUNS_SH" show canary 2>/dev/null)" "no transcript for this run; log.txt follows" "show falls back to log.txt"
assert_contains "$(bash "$RUNS_SH" show latest-canary 2>/dev/null)" "# 20261030T131500Z-canary" "latest-<routine> resolves"
assert_eq "$(bash "$RUNS_SH" path fixer 2>/dev/null)" "$(cd "$FLEET_RUNS_DIR/20261030T130000Z-fixer" && pwd -P)" "bare routine resolves to its newest run"
code=0
bash "$RUNS_SH" show nope >/dev/null 2>&1 || code=$?
assert_status "$code" 1 "unknown run fails"
code=0
bash "$RUNS_SH" >/dev/null 2>&1 || code=$?
assert_status "$code" 2 "usage"

t_done
