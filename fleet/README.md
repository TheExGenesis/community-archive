# fleet/

Bash harnesses for the autonomous fleet. Each routine does the deterministic
parts itself (GitHub, git, curl, the CI gate) and calls Claude Code headless
(`claude -p`) only for the one step that needs judgment. No Method, no agent
framework. The contract is `memos/20261030-fleet-v2-direct-to-main-and-infra.md`;
the operator view is the "Phase 1" section of `docs/hyperobservability.md`.

```
fleet/
  bin/fixer.sh        one signal/bug issue → reproduce, classify, fix, gate, ship, read back
  bin/canary.sh       six HTTP checks on production, signal on new failure, optional rollback
  lib/common.sh       logging, run directory, gh helpers, read-back checks, verdict parser, Tier 1 guard
  prompts/fixer.md    the brief the fixer gives claude -p (the issue body is appended)
  test/               plain-bash tests with fake gh, claude, pnpm, curl and npx; run.sh = pnpm fleet:test
```

## Running

Everything is configured through the environment; nothing is read from files
other than the repository itself.

| Variable                     | Used by | Meaning                                                                                                                                              |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLEET_MODE=pr\|main`        | fixer   | `pr` (default): push a branch and open a PR. `main`: push straight to `main` and close the issue.                                                    |
| `FLEET_ROLLBACK=true\|false` | canary  | Default `false`. `true` rolls production back to the previous deployment on a new failure of a newer deployment.                                     |
| `RUN_DIR`                    | both    | Where the run writes everything. Default `./.fleet-runs/<UTC timestamp>-<name>/` (gitignored).                                                       |
| `GH_TOKEN`                   | fixer   | GitHub token for `gh` and `git push` (the host mints it per run as `FLEET_GITHUB_TOKEN`; export it as `GH_TOKEN`).                                   |
| `SIGNALS_WEBHOOK_SECRET`     | canary  | Bearer for `POST /api/signals/canary`. Unset: the signal is written to the run dir but not sent.                                                     |
| `VERCEL_TOKEN`               | canary  | Reads production deployments; required for rollback.                                                                                                 |
| `VERCEL_PROTECTION_BYPASS`   | canary  | Optional `x-vercel-protection-bypass` secret so Vercel's bot challenge does not answer instead of the app.                                           |
| `CA_URL`                     | canary  | Default `https://www.community-archive.org`.                                                                                                         |
| `FLEET_REPO`                 | both    | Default `TheExGenesis/community-archive`.                                                                                                            |
| `FLEET_MAX_TURNS`            | fixer   | `claude -p --max-turns`, default 80.                                                                                                                 |
| `FLEET_CLAUDE_MODEL`         | fixer   | Optional `--model` for `claude -p`.                                                                                                                  |
| `FLEET_GIT_NAME/EMAIL`       | fixer   | Commit identity when the checkout has none configured.                                                                                               |
| `FLEET_LOCK_DIR`             | fixer   | Default `$TMPDIR/ca-fleet-fixer.lock`; a second fixer exits 0 with `outcome: locked`.                                                                |
| `FLEET_WORKTREE_BASE`        | fixer   | Where the run git worktree lives, default `$TMPDIR/ca-fleet-worktrees`. Outside the checkout on purpose: `next lint` fails inside a nested worktree. |

```bash
# one fixer pass against the real inbox, PR mode
FLEET_MODE=pr fleet/bin/fixer.sh

# one canary pass against production, rollback off
fleet/bin/canary.sh

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
`{outcome, issue, pr_or_commit, session_id, duration_s}`; routines add fields.

Fixer: `issue.json` (the picked issue), `candidates.json`, `prompt.md`,
`claude-invocations.txt` (the exact commands), `claude-output.json`
(`--output-format json`, holds `session_id`), `claude-stderr.txt`,
`verdict.json`, `fix.patch` (staged diff before the gate), `gate-1/` and
`gate-2/` (one log per check plus `summary.txt`), `prompt-retry.md` and
`claude-output-2.json` when the gate failed once, `comment.md`,
`commit-message.txt`, `pr-body.md`, `final-diff.patch`, `log.txt`.
Outcomes: `idle`, `locked`, `wontfix`, `needs_decision`, `gate_failed`,
`pr_opened`, `pushed_main`, `error`.

Canary: `checks.json`, one `<check>.headers` per request, `deployments.json`,
`signal.json` (what was or would have been posted), `signal.response`,
`signal-rollback.json`, `rollback.log`, `rollback-command.txt` (token
redacted), `log.txt`. Outcomes: `ok`, `failed`, `inconclusive` (Vercel's bot
challenge answered instead of the app), `error`.

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

## Tests

`fleet/test/run.sh` runs `shellcheck` over `fleet/` and then every
`test_*.sh`. The fakes in `fleet/test/fakes/` stand in for `gh` (JSON state
on disk), `claude` (canned `--output-format json` output and an optional
"edit" snippet), `pnpm` (configurable failures), `curl` (canned statuses and
timings, captured POST bodies) and `npx`. The fixer tests use a real bare git
repository as `origin`. Requires `shellcheck` and `node`; no bats.
