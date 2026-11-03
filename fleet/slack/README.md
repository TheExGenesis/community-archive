# fleet/slack: the fleet's Slack agent

A long-running service on `ca-fleet` that lets the maintainers talk to
Claude Code in Slack, with the fixer's machinery underneath. Slack Bolt in
Socket Mode (the box accepts no inbound connections), TypeScript on Node 22,
dependencies from the repository root, state in one SQLite file. Operator
steps (create the app, tokens, enable the unit) are in the control-panel
runbook `docs/ca-fleet-operations.md`, section "Slack agent"; the user view
is "Talking to the fleet in Slack" in `docs/hyperobservability.md`.

```
slack/
  INSTRUCTIONS.md   standing rules, appended to Claude's system prompt on every run; edit freely
  manifest.yaml     the Slack app, created once from this file
  src/
    index.ts        wiring: Bolt app, intake timer, signals
    bot.ts          routing: mention / DM / thread reply / button → runner or commands; the allowlist
    runner.ts       one thread = one run dir + worktree + Claude session; turn → done/question/stop → ship
    intake.ts       every 5 min: new signal/bug issues → one thread each → one-turn classification + Go ahead
    merge.ts        the merge guard (allowlist, PR open/mergeable/green, no Tier 1 path)
    commands.ts     help / status / runs / run <id>
    claude.ts       one `claude -p --output-format stream-json --verbose` call, scrubbed into transcript.jsonl
    summarise.ts    stream events → progress lines; the rate-limited batcher
    status.ts       the status checklist message
    verdict.ts      the fenced JSON block Claude ends a turn with
    fleetTask.ts    typed calls into fleet/bin/task.sh (gate, Tier 1, worktrees, PR, read-back, result, metrics)
    store.ts        SQLite (node:sqlite): threads ↔ sessions/runs/PRs, posted issues
    config.ts, github.ts, slack.ts, shell.ts, log.ts, fleetLib.ts
  test/             node:test with a fake Slack; runner.test.ts drives the real task.sh with fake claude/gh/pnpm
```

## How a task runs

1. A mention or DM from an allowed user starts a task in that thread
   (commands `help`, `status`, `runs`, `run <id>` answer instead). The agent
   posts one status message it keeps editing: `☑ understanding ▶ working ☐
gate ☐ PR ☐ waiting on you`.
2. `task.sh init-run` makes `$FLEET_RUNS_DIR/<ts>-slack/`; `task.sh
worktree-add` makes a fresh worktree of `origin/main` on
   `fleet/slack-<ts>`. Both live until the thread is merged, stopped or
   errored.
3. `claude -p` runs in the worktree with the fixer's tool policy (edit and
   test; no push, commit, gh or network), `INSTRUCTIONS.md` plus a few run
   facts as the appended system prompt, and the message as the prompt.
   Progress lines (assistant text, tool calls, tool errors) go to the thread
   at most every six seconds; the full event stream is scrubbed into
   `transcript.jsonl` and rendered to `transcript.md`.
4. Claude ends the turn with `{"status": "done" | "question" | "stop"}`.
   `question`: the text is posted, the status says "waiting on you", and
   the next reply in the thread resumes the session (`--resume`). `stop`:
   the run is closed with outcome `stopped`. `done`: the change is staged
   and shipped.
5. Shipping: Tier 1 check and changed-line count (flags, not blockers),
   `task.sh gate` (lint, type-check, security, unit; the same function the
   fixer uses), one `--resume` repair attempt on a red gate, then commit
   (`[fleet:slack] <title> (signal #n)`), push, `gh pr create`, read-back,
   `result.json`, `loki.jsonl`, metrics. The thread gets the PR link with
   **Merge** and **Not now** (no Merge button when a Tier 1 path is touched).
   Further replies land more commits on the same branch and PR.
6. **Merge** is honoured only when the clicking user is in
   `SLACK_ALLOWED_USER_IDS`, the PR is open, not a draft, on a `fleet/`
   branch into `main`, `MERGEABLE`, every check green, and `task.sh
tier1-paths` finds nothing in the PR's files. Then `gh pr merge --squash
--delete-branch`, read back `MERGED`, close the linked issue, drop the
   worktree.

Intake: every `FLEET_SLACK_INTAKE_INTERVAL_S` (300) the service lists open
`signal` and `bug` issues with `task.sh issues-list`, posts each one it has
not posted before into `SLACK_SIGNALS_CHANNEL` (title, severity, route,
source, labels, summary, links), remembers it in SQLite, and replies in the
thread with a one-turn, tool-less classification ("looks obvious, shall I
fix it?" / "needs a decision: …" / "probably wontfix because …") and a **Go
ahead** button. A click, or any reply in that thread, starts the fix task
there with the issue attached. Nothing starts without a human.

## Environment

| Variable                                                            | Meaning                                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`                                | `xoxb-…` bot token and `xapp-…` app-level token (Socket Mode) of the app created from `manifest.yaml`.                             |
| `SLACK_SIGNALS_CHANNEL`                                             | Channel id (`C…`) the inbox issues are posted to; invite the bot there.                                                            |
| `SLACK_ALLOWED_USER_IDS`                                            | Comma-separated member ids. Only these users' messages and clicks are acted on; everyone else is ignored.                          |
| `FLEET_GITHUB_TOKEN` or `FLEET_GITHUB_APP_*`                        | Static token, or App credentials re-minted hourly through `$FLEET_HOME/bin/fleet-github-token` (installation tokens last an hour). |
| `FLEET_HOME`, `FLEET_ROOT`, `FLEET_RUNS_DIR`, `FLEET_WORKTREE_BASE` | Box layout; defaults `~/services/ca-fleet`, `$FLEET_HOME/repo`, `$FLEET_HOME/runs`, `$TMPDIR/ca-fleet-worktrees`.                  |
| `FLEET_SLACK_DB`                                                    | SQLite file, default `$FLEET_HOME/slack.db`. Delete it and the agent forgets its threads and re-posts every open issue once.       |
| `FLEET_SLACK_INSTRUCTIONS`                                          | Path of the rules file, default `fleet/slack/INSTRUCTIONS.md` in the checkout; read per run.                                       |
| `FLEET_SLACK_INTAKE`, `FLEET_SLACK_INTAKE_INTERVAL_S`               | `false` disables intake; interval in seconds (300).                                                                                |
| `FLEET_SLACK_MAX_CONCURRENT`, `FLEET_SLACK_PROGRESS_INTERVAL_S`     | Concurrent Claude tasks (1; others queue with a note in their thread); seconds between progress posts (6).                         |
| `FLEET_MAX_TURNS`, `FLEET_CLAUDE_MODEL`, `FLEET_MAX_CHANGED_LINES`  | As for the fixer (80, unset, 300).                                                                                                 |
| `FLEET_RUNS_EXPLORE_URL`                                            | Grafana Explore template; when set, every finished task posts a transcript link.                                                   |
| `FLEET_REPO`, `FLEET_BASE_BRANCH`, `FLEET_CLAUDE_BIN`               | `TheExGenesis/community-archive`, `main`, `claude`.                                                                                |

`FLEET_MODE=main` is not used by this service: it always opens a PR and a
human merges, from Slack (Tier 0) or on GitHub (Tier 1).

## Running and testing

```bash
pnpm fleet:slack:build        # tsc → fleet/slack/dist (gitignored)
pnpm fleet:slack:start        # node fleet/slack/dist/src/index.js
pnpm fleet:test               # type-check + node:test for fleet/slack, then the bash suites
```

On the box the user unit `fleet-slack.service` runs `fleet-run slack`, which
loads the env file, builds `fleet/slack` when `dist/` is missing or older
than the sources, and execs the service with `RUN_DIR` unset (each task
makes its own run directory). Logs: `journalctl --user -u fleet-slack`.
