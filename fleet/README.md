# fleet/

Bash harnesses for the autonomous fleet. Each routine does the deterministic
parts itself (GitHub, git, curl, the CI gate) and calls Claude Code headless
(`claude -p`) only for the one step that needs judgment. No Method, no agent
framework. The contract is `memos/20261030-fleet-v2-direct-to-main-and-infra.md`;
the operator view is the "Phase 1" section of `docs/hyperobservability.md`.

```
fleet/
<<<<<<< HEAD
  bin/fixer.sh        one signal/bug issue → reproduce, classify, fix, gate, ship, read back
  bin/canary.sh       six HTTP checks on production, signal on new failure, optional rollback
  bin/runs.sh         list runs and read one run's transcript from the runs directory (no Grafana needed)
  lib/common.sh       logging, run directory, gh helpers, read-back checks, verdict parser, Tier 1 guard,
                      result.json, the Loki export of a run
  lib/transcript.mjs  scrub, render, summarise a claude -p stream-json transcript
  prompts/fixer.md    the brief the fixer gives claude -p (the issue body is appended)
  test/               plain-bash tests with fake gh, claude, pnpm, curl and npx; run.sh = pnpm fleet:test
=======
  bin/fixer.sh          one signal/bug issue → reproduce, classify, fix, gate, ship, read back
  bin/canary.sh         six HTTP checks on production, signal on new failure, optional rollback
  bin/digest.sh         once a day: one GitHub issue "[fleet:digest] <date>" with what the fleet did
  lib/common.sh         logging, run directory, gh helpers, read-back checks, verdict parser, Tier 1 guard,
                        fleet_post_signal (own failures → inbox), fleet_record_metrics (Prometheus textfile)
  lib/digest-render.mjs renders the digest markdown from run directories and gh output (no network)
  prompts/fixer.md      the brief the fixer gives claude -p (the issue body is appended)
  test/                 plain-bash tests with fake gh, claude, pnpm, curl and npx; run.sh = pnpm fleet:test
>>>>>>> origin/main
```

## Running

Everything is configured through the environment; nothing is read from files
other than the repository itself.

<<<<<<< HEAD
| Variable | Used by | Meaning |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLEET_MODE=pr\|main` | fixer | `pr` (default): push a branch and open a PR. `main`: push straight to `main` and close the issue. |
| `FLEET_ROLLBACK=true\|false` | canary | Default `false`. `true` rolls production back to the previous deployment on a new failure of a newer deployment. |
| `RUN_DIR` | both | Where the run writes everything. Default `./.fleet-runs/<UTC timestamp>-<name>/` (gitignored). |
| `GH_TOKEN` | fixer | GitHub token for `gh` and `git push` (the host mints it per run as `FLEET_GITHUB_TOKEN`; export it as `GH_TOKEN`). |
| `SIGNALS_WEBHOOK_SECRET` | canary | Bearer for `POST /api/signals/canary`. Unset: the signal is written to the run dir but not sent. |
| `VERCEL_TOKEN` | canary | Reads production deployments; required for rollback. |
| `VERCEL_PROTECTION_BYPASS` | canary | Optional `x-vercel-protection-bypass` secret so Vercel's bot challenge does not answer instead of the app. |
| `CA_URL` | canary | Default `https://www.community-archive.org`. |
| `FLEET_REPO` | both | Default `TheExGenesis/community-archive`. |
| `FLEET_MAX_TURNS` | fixer | `claude -p --max-turns`, default 80. |
| `FLEET_CLAUDE_MODEL` | fixer | Optional `--model` for `claude -p`. |
| `FLEET_GIT_NAME/EMAIL` | fixer | Commit identity when the checkout has none configured. |
| `FLEET_LOCK_DIR` | fixer | Default `$TMPDIR/ca-fleet-fixer.lock`; a second fixer exits 0 with `outcome: locked`. |
| `FLEET_WORKTREE_BASE` | fixer | Where the run git worktree lives, default `$TMPDIR/ca-fleet-worktrees`. Outside the checkout on purpose: `next lint` fails inside a nested worktree. |
| `FLEET_RUNS_EXPLORE_URL` | both | Grafana Explore link template for a run's transcript in Loki; `{run_id}` is replaced with the run id. Unset: the Run line in comments and PR bodies has no link. |
=======
| Variable | Used by | Meaning |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLEET_MODE=pr\|main` | fixer | `pr` (default): push a branch and open a PR. `main`: push straight to `main` and close the issue. |
| `FLEET_ROLLBACK=true\|false` | canary | Default `false`. `true` rolls production back to the previous deployment on a new failure of a newer deployment. |
| `RUN_DIR` | both | Where the run writes everything. Default `./.fleet-runs/<UTC timestamp>-<name>/` (gitignored). |
| `GH_TOKEN` | fixer | GitHub token for `gh` and `git push` (the host mints it per run as `FLEET_GITHUB_TOKEN`; export it as `GH_TOKEN`). |
| `SIGNALS_WEBHOOK_SECRET` | canary | Bearer for `POST /api/signals/canary`. Unset: the signal is written to the run dir but not sent. |
| `VERCEL_TOKEN` | canary | Reads production deployments; required for rollback. |
| `VERCEL_PROTECTION_BYPASS` | canary | Optional `x-vercel-protection-bypass` secret so Vercel's bot challenge does not answer instead of the app. |
| `CA_URL` | canary | Default `https://www.community-archive.org`. |
| `FLEET_REPO` | both | Default `TheExGenesis/community-archive`. |
| `FLEET_MAX_TURNS` | fixer | `claude -p --max-turns`, default 80. |
| `FLEET_CLAUDE_MODEL` | fixer | Optional `--model` for `claude -p`. |
| `FLEET_GIT_NAME/EMAIL` | fixer | Commit identity when the checkout has none configured. |
| `FLEET_LOCK_DIR` | fixer | Default `$TMPDIR/ca-fleet-fixer.lock`; a second fixer exits 0 with `outcome: locked`. |
| `FLEET_WORKTREE_BASE` | fixer | Where the run git worktree lives, default `$TMPDIR/ca-fleet-worktrees`. Outside the checkout on purpose: `next lint` fails inside a nested worktree. |
| `FLEET_RUNS_DIR` | all | Directory holding every run. Default `$FLEET_HOME/runs` when `FLEET_HOME` is set (the host), else the parent of `RUN_DIR`, else `./.fleet-runs`. |
| `FLEET_METRICS_FILE` | all | Prometheus textfile every run appends to; default `$FLEET_RUNS_DIR/metrics.prom` (see "Metrics"). |
| `FLEET_DRY_RUN=true` | digest | Print the digest instead of posting it; closes nothing. |
| `FLEET_DIGEST_SINCE/UNTIL` | digest | The window (ISO 8601); default the 24 hours ending now. `FLEET_DIGEST_DATE` is the date in the title (default today, UTC). |
| `FLEET_DASHBOARD_URL` | all | Linked from the digest and the failure signals; default the Grafana "Fleet" dashboard. |

> > > > > > > origin/main

```bash
# one fixer pass against the real inbox, PR mode
FLEET_MODE=pr fleet/bin/fixer.sh

# one canary pass against production, rollback off
fleet/bin/canary.sh

# the daily digest, printed instead of posted
FLEET_DRY_RUN=true fleet/bin/digest.sh

# tests + shellcheck (what CI runs)
pnpm fleet:test
```

Both scripts exit 0 on every outcome they handled (including "inbox empty",
"wontfix", "gate failed → needs-decision", "canary failed → signal posted") and
non-zero only when the harness itself broke (a read-back did not find what it
just wrote, `claude -p` failed to run, git refused). That is the signal the
timer unit on `ca-fleet` watches.

## What a run leaves behind

`$RUN_DIR/result.json` always exists and always has
`{outcome, issue, pr_or_commit, session_id, duration_s}` plus what connects
the run to its context and evidence: `run`, `run_id`, `started_at`,
`finished_at`, `issue_url`, `signal_fingerprint` (the `fp:` marker of a
signal issue, else the `fingerprint` of its fenced `json signal` block),
`pr_url` or `commit_url`, `learning_path`, `transcript_path`,
`transcript_url` (from `FLEET_RUNS_EXPLORE_URL`), and from the transcript
`cost_usd`, `tokens` `{input, output, cache_read, cache_creation}` and
`calls` (how many `claude -p` calls the run made). Routines add fields.

`$RUN_DIR/loki.jsonl` is written right after `result.json` by every routine:
one JSON line per line of `result.json` (compacted to one line), `log.txt`,
`transcript.md` and `transcript.jsonl`, each carrying `{ts, routine, issue,
outcome, run_id, file}` (`issue` only when the run had one). Alloy on `ca-fleet` tails these files and ships them
to Grafana Cloud Loki with those keys as labels (control-panel
`ops/monitoring/alloy/config-fleet.alloy`), so Explore shows one run with
`{job="fleet-runs", run_id="<run id>"}`. It is written once, at the end, so
every line knows the run's outcome; a run killed before its exit handler
ships nothing (its metrics and the failure signal still say it died).

Fixer: `issue.json` (the picked issue), `candidates.json`, `prompt.md`,
`claude-invocations.txt` (the exact commands), `transcript.jsonl` (the full
`claude -p --output-format stream-json --verbose` event stream of every call
of the run, a `--resume` appended to the first, piped through
`lib/transcript.mjs scrub` before it touches disk), `transcript.md` (the same,
readable: each assistant turn, every tool call with its input summarised,
tool results truncated, the result line and final message of each call),
`claude-output.json` (that call's `result` event, the same object
`--output-format json` prints, holds `session_id`), `claude-stderr.txt`,
`verdict.json`, `fix.patch` (staged diff before the gate), `gate-1/` and
`gate-2/` (one log per check plus `summary.txt`), `prompt-retry.md` and
`claude-output-2.json` when the gate failed once, `comment.md`,
`commit-message.txt`, `pr-body.md`, `final-diff.patch`, `log.txt`.
Outcomes: `idle`, `locked`, `wontfix`, `needs_decision`, `gate_failed`,
`pr_opened`, `pushed_main`, `error`.

Scrubbing (`lib/transcript.mjs scrub`): the literal values of `GH_TOKEN`,
`FLEET_GITHUB_TOKEN`, `SIGNALS_WEBHOOK_SECRET`, `VERCEL_TOKEN`,
`VERCEL_PROTECTION_BYPASS`, `ANTHROPIC_API_KEY` and the Grafana keys present
in the harness environment; `Authorization` headers and `NAME=value` /
`NAME: value` assignments of secret-looking names; GitHub, Anthropic, OpenAI,
Slack, Grafana Cloud and AWS token shapes, JWTs and PEM private keys; and
every string under a secret-named key of a tool input (`Authorization`,
`api_key`, `*token*`, `*secret*`, `*password*`). Each stream-json line is
parsed, scrubbed string by string and re-serialised, so the transcript stays
valid JSONL. The transcript still contains code and issue text, which is why
it goes to the private Loki stack and never into this repository.

Every issue comment and PR body the fixer writes ends with a Run line:
`_Run `<run id>`· outcome`<outcome>` · <took> · $<cost> · [transcript](…)_`
(the link only with `FLEET_RUNS_EXPLORE_URL`). The daily digest's fixer
table has a Run column with the same link, read from `result.json`'s
`transcript_url` (the run id when there is none).

Canary: `checks.json`, one `<check>.headers` per request, `deployments.json`,
`signal.json` (what was or would have been posted), `signal.response`,
`signal-rollback.json`, `rollback.log`, `rollback-command.txt` (token
redacted), `log.txt`. Outcomes: `ok`, `failed`, `inconclusive` (Vercel's bot
challenge answered instead of the app), `error`.

Digest: the `gh` answers it rendered from (`signals-created.json`,
`signals-open.json`, `needs-decision.json`, `prs.json`, `commits.json`,
`digests-open.json`), `runs.json` (every `result.json` under `FLEET_RUNS_DIR`),
`digest.md`, `gauges.json`. Outcomes: `posted`, `dry_run`, `error`.

Every routine: `usage.json` when it called Claude (also merged into
`result.json` as `usage`), `gauges.json` when it recorded repo-wide gauges,
`signal-failure.json` + `.response` when it filed its own failure.

## When the fleet itself breaks

A run that ends in `outcome: error` (Claude could not run, a read-back did not
find what was just written, git refused, the digest could not render) files a
signal on `POST $CA_URL/api/signals/generic` through `fleet_post_signal`, so it
appears in the same inbox as production signals:
`[signal:generic] Fleet <routine> failed: <kind>` with `key =
fleet:<routine>:<kind>` (kinds: `claude`, `readback`, `toolchain`, `harness`),
`severity: warning`, the run name, host, message and the log tail. Repeats of
the same kind comment on the open issue. Handled outcomes (`idle`, `wontfix`,
`needs_decision`, `gate_failed`, canary `failed`) are not fleet failures and
file nothing here; the canary's production failures go to
`/api/signals/canary` as before.

## Metrics

Every run ends by calling `fleet_record_metrics`, which rewrites
`$FLEET_METRICS_FILE` (`/home/fleet/services/ca-fleet/runs/metrics.prom` on
the host) in Prometheus textfile format, under a lock, via a temp file and
rename. Alloy's node exporter reads the directory with its textfile collector
(control-panel `ops/monitoring/alloy/config-fleet.alloy`) and the Grafana
"Fleet" dashboard is built on these series:

| Series                                                                                                                                                                         | Type          | Meaning                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------- |
| `fleet_run_total{routine,outcome}`                                                                                                                                             | counter       | Runs finished.                                                                                            |
| `fleet_run_duration_seconds{routine}`                                                                                                                                          | gauge         | Duration of the last run.                                                                                 |
| `fleet_last_success_timestamp{routine}`                                                                                                                                        | gauge         | Last run that was not an `error` (a canary that found production broken still counts: the canary worked). |
| `fleet_last_outcome_timestamp{routine,outcome}`                                                                                                                                | gauge         | Last run with this outcome (`routine="canary",outcome="ok"` is "production last seen healthy").           |
| `fleet_consecutive_failures{routine}`                                                                                                                                          | gauge         | Errors in a row; reset by any handled outcome.                                                            |
| `fleet_tokens_total{routine,kind}`                                                                                                                                             | counter       | From `claude -p --output-format json` `usage`; kinds `input`, `output`, `cache_read`, `cache_creation`.   |
| `fleet_cost_usd_total{routine}`                                                                                                                                                | counter       | From `total_cost_usd` (list-price equivalent even on a Max login).                                        |
| `fleet_signal_to_fix_seconds{routine}` + `_sum`/`_count`                                                                                                                       | gauge/counter | Issue `createdAt` → PR opened or commit pushed.                                                           |
| `fleet_failure_signals_total{routine,kind}`                                                                                                                                    | counter       | Failure signals the fleet filed about itself.                                                             |
| `fleet_canary_check_ok{check}`, `fleet_canary_failed_checks`, `fleet_canary_inconclusive_checks`, `fleet_canary_new_failures_total`, `fleet_canary_rollbacks_total`            | gauge/counter | Per-check production state as the canary sees it.                                                         |
| `fleet_needs_decision_issues`, `fleet_open_fixer_prs`, `fleet_signals_open`, `fleet_inbox_open`                                                                                | gauge         | What waits on a human; refreshed by every fixer run and by the digest.                                    |
| `fleet_prs_opened_24h`, `fleet_prs_merged_24h`, `fleet_prs_closed_unmerged_24h`, `fleet_reverts_24h`, `fleet_signals_received_24h`, `fleet_failures_24h`, `fleet_cost_usd_24h` | gauge         | The digest's daily GitHub-derived counts (updated once a day).                                            |

The textfile only changes when a run finishes, so `increase()` over a day
counts runs correctly and gauges hold their last value between runs.

## The digest

`fleet/bin/digest.sh` runs daily (07:00 UTC on `ca-fleet`), reads the run
directories of the last 24 hours and a handful of `gh` lists, renders
`digest.md` with `lib/digest-render.mjs` and opens one issue
`[fleet:digest] <date>` labelled `fleet:digest`; the previous open digest is
closed with a pointer to the new one. Sections: signals received and their
state, fixer runs with PR/commit/learning links, fleet PRs opened/merged/closed
and reverts on `main`, canary status, cost, the fleet's own failures, and what
needs Christine (needs-decision issues, fleet PRs awaiting merge). No LLM
anywhere in it. `gh` failures render as "unknown" rather than zero.

## The fixer's rules of engagement

The prompt (`prompts/fixer.md`) asks for reproduce → root cause → classify
(`bug`, `wontfix`, `needs-decision`) → fix under Tier 0 → fenced JSON verdict.
The harness enforces what the prompt asks for:

- `claude -p` runs with `--allowedTools` limited to Read, Edit, Write, Grep,
  Glob and Bash for `pnpm lint|type-check|test*`, `npx jest|eslint|tsc`,
  `node --test`, `git status|diff|log`; `git push`, `git commit`, `gh`, `curl`
  and the web tools are disallowed; `--permission-mode dontAsk` denies
  anything else; `--max-turns` caps the session.
- After a `bug` verdict the staged diff is checked: no path under
  `supabase/`, opt-in/opt-out, email, data deletion, workflows, `package.json`
  or lockfiles; no added line that introduces service-role use, opt-out or
  consent logic, deletes, key handling or email sending; no renames; at most
  300 changed lines (the learning memo excluded). Any hit becomes a
  `fleet:needs-decision` comment with the reasons and the patch stays in the
  run directory.
- The gate is the same four commands as CI (`pnpm lint`, `pnpm type-check`,
  `pnpm test:security`, `pnpm test:ci`). On failure the session is resumed
  once (`claude -p --resume <session_id>`) with the failing output; a second
  failure is a `fleet:needs-decision` comment.
- The learning (`memos/fleet/learnings/<date>-<issue>.md`) is written by the
  harness from the verdict and committed in the same change.
- Every GitHub write is read back (`gh pr view`, `gh api .../compare`,
  `gh issue view`) before the run is called a success.

Labels: `fleet:in-progress` (taken; removed again if the harness crashes),
`fleet:pr-open`, `fleet:wontfix`, `fleet:needs-decision`. The fixer skips
issues that carry any of the last three or `fleet:in-progress`.

## Reading a run without Grafana

```bash
fleet/bin/runs.sh list            # newest runs: finished, routine, issue, outcome, took, cost, shipped, run id
fleet/bin/runs.sh show fixer      # result summary + transcript.md of the newest fixer run
fleet/bin/runs.sh show 20261030T120000Z-fixer
fleet/bin/runs.sh log canary      # log.txt of the newest canary run
```

On the host: `ssh fleet@ca-fleet 'bash -lc "~/services/ca-fleet/repo/fleet/bin/runs.sh list"'`.
The runs directory is `$FLEET_RUNS_DIR`, else `$FLEET_HOME/runs`, else
`~/services/ca-fleet/runs` when it exists, else `./.fleet-runs`.

## Tests

`fleet/test/run.sh` runs `shellcheck` over `fleet/` and then every
<<<<<<< HEAD
`test_*.sh`. The fakes in `fleet/test/fakes/` stand in for `gh` (JSON state
on disk), `claude` (a canned `result` object turned into a short stream-json
event stream, an optional "edit" snippet and an optional leaked secret), `pnpm` (configurable failures), `curl` (canned statuses and
=======
`test_*.sh` (selection, verdict parsing, read-back, Tier 1 guard, fixer and
canary end to end, metrics/signals, digest). The fakes in `fleet/test/fakes/` stand in for `gh` (JSON state
on disk), `claude` (canned `--output-format json` output and an optional
"edit" snippet), `pnpm` (configurable failures), `curl` (canned statuses and

> > > > > > > origin/main
> > > > > > > timings, captured POST bodies) and `npx`. The fixer tests use a real bare git
> > > > > > > repository as `origin`. Requires `shellcheck` and `node`; no bats.
