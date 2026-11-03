#!/usr/bin/env bash
# Fleet runs, read from the runs directory: the fallback for when Grafana is
# not wired yet, and the quickest look on the host itself.
#
#   runs.sh list [N]                 newest N runs (default 40): finished, routine, issue, outcome, took, cost, shipped, run id
#   runs.sh show <run-id>            result summary and the transcript (transcript.md, else log.txt)
#   runs.sh path <run-id>            print the run directory
#   runs.sh log <run-id>             print log.txt
#
# <run-id> is the directory name (`20261030T120000Z-fixer`), `latest-<routine>`
# (the wrapper's symlink) or just `fixer`/`canary` for the newest run of that
# routine. The runs directory is $FLEET_RUNS_DIR, else $FLEET_HOME/runs, else
# ~/services/ca-fleet/runs when it exists (the ca-fleet host), else
# ./.fleet-runs in the checkout.
#
#   ssh fleet@ca-fleet 'bash -lc "~/services/ca-fleet/repo/fleet/bin/runs.sh list"'
#   ssh fleet@ca-fleet 'bash -lc "~/services/ca-fleet/repo/fleet/bin/runs.sh show fixer"' | less
set -euo pipefail

FLEET_BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "${FLEET_RUNS_DIR:-}" ]]; then
  if [[ -n "${FLEET_HOME:-}" ]]; then
    FLEET_RUNS_DIR="$FLEET_HOME/runs"
  elif [[ -d "$HOME/services/ca-fleet/runs" ]]; then
    FLEET_RUNS_DIR="$HOME/services/ca-fleet/runs"
  fi
fi
# shellcheck source=../lib/common.sh
source "$FLEET_BIN_DIR/../lib/common.sh"

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

# resolve_run <run-id> : prints the run directory or fails.
resolve_run() {
  local id="$1" dir
  if [[ "$id" == */* ]]; then
    dir="$id"
  elif [[ -d "$FLEET_RUNS_DIR/$id" ]]; then
    dir="$FLEET_RUNS_DIR/$id"
  elif [[ -d "$FLEET_RUNS_DIR/latest-$id" ]]; then
    dir="$FLEET_RUNS_DIR/latest-$id"
  else
    dir="$(ls -1d "$FLEET_RUNS_DIR"/*-"$id" 2>/dev/null | sort | tail -n 1 || true)"
  fi
  [[ -n "$dir" && -d "$dir" ]] || fleet_die "no run '$id' under $FLEET_RUNS_DIR"
  printf '%s\n' "$(cd "$dir" && pwd -P)"
}

cmd_list() {
  local limit="${1:-40}"
  [[ "$limit" =~ ^[0-9]+$ ]] || usage
  [[ -d "$FLEET_RUNS_DIR" ]] || fleet_die "no runs directory at $FLEET_RUNS_DIR"
  RUNS="$FLEET_RUNS_DIR" LIMIT="$limit" node -e '
    const fs = require("fs"); const path = require("path");
    const root = process.env.RUNS;
    const dirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("latest-") && /^\d{8}T\d{6}Z-/.test(d.name))
      .map((d) => d.name).sort().reverse().slice(0, Number(process.env.LIMIT));
    const rows = [];
    for (const name of dirs) {
      let r = null;
      try { r = JSON.parse(fs.readFileSync(path.join(root, name, "result.json"), "utf8")); } catch {}
      const routine = (r && r.run) || name.replace(/^\d{8}T\d{6}Z-/, "");
      const finished = r && r.finished_at ? r.finished_at.replace("T", " ").slice(0, 16) + "Z" : "(running or crashed)";
      const dur = (s) => { s = Number(s) || 0; return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m${s % 60}s` : `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`; };
      let shipped = "";
      if (r && r.pr_url) shipped = "PR #" + r.pr_url.split("/").pop();
      else if (r && r.commit_url) shipped = String(r.pr_or_commit).slice(0, 8);
      else if (r && r.pr_or_commit) shipped = String(r.pr_or_commit).slice(0, 40);
      const cost = r && typeof r.cost_usd === "number" ? "$" + r.cost_usd.toFixed(2)
        : r && r.usage && typeof r.usage.cost_usd === "number" ? "$" + r.usage.cost_usd.toFixed(2) : "";
      rows.push([finished, routine, r && r.issue ? "#" + r.issue : "", r ? String(r.outcome) : "?", r ? dur(r.duration_s) : "", cost, shipped, name]);
    }
    const head = ["FINISHED (UTC)", "ROUTINE", "ISSUE", "OUTCOME", "TOOK", "COST", "SHIPPED", "RUN ID"];
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
    const fmt = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join("  ").trimEnd();
    console.log(fmt(head));
    for (const r of rows) console.log(fmt(r));
    if (!rows.length) console.log(`(no runs under ${root})`);
  '
}

cmd_show() {
  local dir
  dir="$(resolve_run "${1:?usage: runs.sh show <run-id>}")"
  echo "# $(basename "$dir")"
  echo "# $dir"
  if [[ -s "$dir/result.json" ]]; then
    fleet_json_get "$dir/result.json" '
      [
        "outcome: " + d.outcome + (d.classification ? " (" + d.classification + ")" : ""),
        "routine: " + (d.run || "?") + "   took: " + (d.duration_s ?? "?") + "s   finished: " + (d.finished_at || "?"),
        d.issue ? "issue: #" + d.issue + (d.issue_url ? "  " + d.issue_url : "") + (d.signal_fingerprint ? "  fp:" + d.signal_fingerprint : "") : "issue: none",
        d.pr_url ? "pr: " + d.pr_url : d.commit_url ? "commit: " + d.commit_url : "shipped: nothing",
        d.learning_path ? "learning: " + d.learning_path : null,
        d.cost_usd != null ? "cost: $" + Number(d.cost_usd).toFixed(2) + " over " + (d.calls || 0) + " call(s)"
          + (d.tokens ? "   tokens: " + d.tokens.input + " in, " + d.tokens.output + " out, " + d.tokens.cache_read + " cache read" : "") : null,
        d.session_id ? "session: " + d.session_id : null,
        d.transcript_url ? "grafana: " + d.transcript_url : null,
      ].filter(Boolean).join("\n")'
    echo
  else
    echo "no result.json (still running, or the harness died before its exit handler)"
  fi
  echo
  if [[ -s "$dir/transcript.md" ]]; then
    cat "$dir/transcript.md"
  elif [[ -s "$dir/transcript.jsonl" ]]; then
    fleet_transcript_render "$dir/transcript.jsonl" /dev/stdout "Fleet transcript · $(basename "$dir")"
  elif [[ -s "$dir/log.txt" ]]; then
    echo "(no transcript for this run; log.txt follows)"
    echo
    cat "$dir/log.txt"
  else
    echo "(no transcript and no log.txt)"
  fi
}

case "${1:-}" in
  list) cmd_list "${2:-40}" ;;
  show) cmd_show "${2:-}" ;;
  path) resolve_run "${2:?usage: runs.sh path <run-id>}" ;;
  log)
    dir="$(resolve_run "${2:?usage: runs.sh log <run-id>}")"
    cat "$dir/log.txt"
    ;;
  *) usage ;;
esac
