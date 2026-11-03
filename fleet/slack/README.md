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
    summarise.ts    stream events → the status line's progress note (and the batcher)
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
3. `claude -p` runs in the worktree with Read/Edit/Write/Grep/Glob and
   Bash allowed and the write verbs denied (`git push`, `git commit`, every
   `gh` write, `curl`, the web; `claude.ts`), `INSTRUCTIONS.md` plus a few
   run facts as the appended system prompt, and the message as the prompt.
   `GH_TOKEN` is in its environment so `gh issue view` and friends work.
   Progress is one line on the status message (`working · 12 tool calls ·
Grep ...`), edited at most every six seconds, never a thread message per
   tool call; the full event stream is scrubbed into `transcript.jsonl` and
   rendered to `transcript.md`.
4. Claude ends the turn with `{"status": "done" | "question" | "stop",
"close": [...]}`. `question`: the text is posted, the status says
   "waiting on you", and the next reply in the thread resumes the session
   (`--resume`). `stop`: the run is closed with outcome `stopped`. `done`:
   the change is staged and shipped. `close` lists issues Claude found
   outdated or already fixed; `task.sh issue-close` closes each with the
   reason and reads back `CLOSED`. `done` with no file changes but a `close`
   list is a `stop`.
5. Shipping: Tier 1 check and changed-line count (flags, not blockers),
   `task.sh gate` (lint, type-check, security, unit; the same function the
   fixer uses), one `--resume` repair attempt on a red gate, then commit
   (`[fleet:slack] <title> (signal #n)`), push, `gh pr create`, read-back,
   `result.json`, `loki.jsonl`, metrics. Further replies land more commits
   on the same branch and PR.
6. Merging. A Tier 0 PR under the line cap gets a **Hold** button and the
   service polls `task.sh pr-view` every `FLEET_SLACK_MERGE_POLL_S` (30)
   until the merge guard passes (open, not a draft, on a `fleet/` branch
   into `main`, `MERGEABLE`, every check green, `task.sh tier1-paths` finds
   nothing), then `gh pr merge --squash --delete-branch`, read back
   `MERGED`, close the linked issue, drop the worktree. Red CI, conflicts or
   `FLEET_SLACK_MERGE_WAIT_MIN` (40) elapsed: the thread gets **Merge** and
   **Hold** and a human decides. Hold, a new turn, or a click retires the
   wait. Tier 1 or large PRs get **Merge** / **Not now** (no Merge button
   on a Tier 1 path); **Merge** is honoured only for an allowed user and
   runs the same guard. `FLEET_SLACK_AUTOMERGE=false` turns the waiting off
   and every PR gets the buttons.

Intake: every `FLEET_SLACK_INTAKE_INTERVAL_S` (300) the service lists open
`signal` and `bug` issues with `task.sh issues-list`, posts each one it has
not posted before into `SLACK_SIGNALS_CHANNEL` (title, severity, route,
source, labels, summary, links), remembers it in SQLite, and replies in the
thread with a one-turn, tool-less classification ("looks obvious, shall I
fix it?" / "needs a decision: …" / "probably wontfix because …") and a **Go
ahead** button. A click, or any reply in that thread, starts the fix task
there with the issue attached. Nothing starts without a human.

## Environment

| Variable                                                                          | Meaning                                                                                                                            |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`                                              | `xoxb-…` bot token and `xapp-…` app-level token (Socket Mode) of the app created from `manifest.yaml`.                             |
| `SLACK_SIGNALS_CHANNEL`                                                           | Channel id (`C…`) the inbox issues are posted to; invite the bot there.                                                            |
| `SLACK_ALLOWED_USER_IDS`                                                          | Comma-separated member ids. Only these users' messages and clicks are acted on; everyone else is ignored.                          |
| `FLEET_GITHUB_TOKEN` or `FLEET_GITHUB_APP_*`                                      | Static token, or App credentials re-minted hourly through `$FLEET_HOME/bin/fleet-github-token` (installation tokens last an hour). |
| `FLEET_HOME`, `FLEET_ROOT`, `FLEET_RUNS_DIR`, `FLEET_WORKTREE_BASE`               | Box layout; defaults `~/services/ca-fleet`, `$FLEET_HOME/repo`, `$FLEET_HOME/runs`, `$TMPDIR/ca-fleet-worktrees`.                  |
| `FLEET_SLACK_DB`                                                                  | SQLite file, default `$FLEET_HOME/slack.db`. Delete it and the agent forgets its threads and re-posts every open issue once.       |
| `FLEET_SLACK_INSTRUCTIONS`                                                        | Path of the rules file, default `fleet/slack/INSTRUCTIONS.md` in the checkout; read per run.                                       |
| `FLEET_SLACK_INTAKE`, `FLEET_SLACK_INTAKE_INTERVAL_S`                             | `false` disables intake; interval in seconds (300).                                                                                |
| `FLEET_SLACK_MAX_CONCURRENT`, `FLEET_SLACK_PROGRESS_INTERVAL_S`                   | Concurrent Claude tasks (2; others queue with a note in their thread); seconds between status-line edits (6).                      |
| `FLEET_SLACK_AUTOMERGE`, `FLEET_SLACK_MERGE_POLL_S`, `FLEET_SLACK_MERGE_WAIT_MIN` | Merge Tier 0 PRs when CI is green (`true`); poll every 30 s; give up waiting after 40 min and hand the PR to a human.              |
| `FLEET_MAX_TURNS`, `FLEET_CLAUDE_MODEL`, `FLEET_MAX_CHANGED_LINES`                | As for the fixer (80, unset, 300).                                                                                                 |
| `FLEET_RUNS_EXPLORE_URL`                                                          | Grafana Explore template; when set, every finished task posts a transcript link.                                                   |
| `FLEET_REPO`, `FLEET_BASE_BRANCH`, `FLEET_CLAUDE_BIN`                             | `TheExGenesis/community-archive`, `main`, `claude`.                                                                                |

`FLEET_MODE=main` is not used by this service: it always opens a PR; the
service merges Tier 0 once CI is green, a human merges Tier 1 on GitHub.

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
