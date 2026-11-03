# Fleet v2: direct to main, two tiers, one fixer, and where it runs

Supersedes the tiers, fleet roster and phase 1–2 shape in
`memos/20261029-1830-autonomous-fleet-roadmap.md`. Phase 0 (PR #1177) is
unchanged. Decisions are Christine's from 2026-10-30; the mechanics and the
infra recommendation are mine.

## Decisions

1. Agents commit to `main` directly. No PRs for autonomous work.
2. Former Tier 1 becomes Tier 0 (autonomous). Former Tier 2 becomes Tier 1
   (agent prepares, human merges). There is no "never" tier.
3. Fewer agents: one fixer working through signals and bugs continuously,
   not a parallel fleet.
4. The 15-minute canary watches production only, not every branch.
5. Monthly "recompile from vision": rebuild areas from vision, specs and
   learnings rather than patching forever.

## What replaces PR review

Direct-to-main is safe when something else does what review did. `main`
has no branch protection today (checked), so this is a token and a
Method, not a GitHub setting.

| Review used to catch  | Replacement                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broken build or tests | Local gate before push: lint, type-check, unit and security tests, the same four CI jobs. Red means no push. CI still runs on `main`; if it goes red anyway the fixer reverts its own commit.     |
| Broken production     | Canary every 15 minutes on production and once right after each deploy. Failure: roll back to the previous Vercel deployment, file a signal, and the fixer treats it as a bug.                    |
| Scope creep           | One signal per commit, a size cap (300 changed lines), no dependency bumps, no file moves. Larger work becomes a Tier 1 PR.                                                                       |
| Taste                 | Post-hoc: a daily digest issue lists what shipped with the diff links. Humans review after the fact, and a correction becomes a learning the fixer reads next time.                               |
| Consent and data      | Stays Tier 1 (below).                                                                                                                                                                             |
| Secrets               | The gate greps the diff for key shapes; the security tests already cover service-role use. Pushing to a public repo publishes immediately, so the fixer is never given anything it must not leak. |

Commit convention: `[fleet:fixer] <what> (signal #n)`, with the learning
written in the same commit under `memos/fleet/learnings/`. Never force-push,
never rewrite history, never touch another agent's in-flight files.

## Tiers

**Tier 0, autonomous, straight to main.** Everything in the repo including
`src/app/api/**`, auth and admin routes, `services/**`, `ops/**`, CI
workflows, `vercel.json`, PostHog collection, docs, tests.

**Tier 1, agent prepares a PR, human merges.** Production migrations
(`supabase/migrations`, `supabase/schemas`), anything that deletes or
exports user data, changes to opt-out or consent semantics, new
service-role usage, key rotation (disabling a leaked key stays
autonomous), outbound email content or recipients, and spend (new paid
services, plan changes).

One thing I would keep in Tier 1 that the decision moves to Tier 0:
consent and opt-out semantics. AGENTS.md makes Supabase the authority for
consent and the ingestion-time opt-out check is the one invariant users
rely on. A fixer "fixing" a flaky opt-out test by loosening it is the
failure I would least like to discover post-hoc. The list above keeps it
in Tier 1; delete that line if you disagree.

## The fleet, smaller

| Routine       | Cadence                                          | Does                                                                                                                                                                                | LLM?                                     |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Fixer**     | Continuous, one issue at a time, idle when empty | Take the oldest open `signal` or `bug` issue, reproduce, root-cause, fix, run the gate, push to main, close the issue with the commit, write a learning. Tier 1 work becomes a PR.  | Yes, the only continuously running agent |
| **Canary**    | Every 15 min on production, plus post-deploy     | Script: homepage, search, one user page, one API, sign-in page, upload page render; status and latency budgets. On failure: rollback, signal. LLM only to write the signal summary. | Barely                                   |
| **Pipeline**  | Hourly script, agent on anomaly                  | Autorefresh run health, ClickHouse canonical lag, digest job. Reports and files signals; restarts nothing. Runs on the Hetzner side because it needs host access.                   | On anomaly                               |
| **Recompile** | Monthly, one area per run                        | See below.                                                                                                                                                                          | Yes, bounded                             |

Dropped from the roadmap: separate Triage, Janitor, Product and Steward
agents. Triage folds into the fixer (dedupe is already done by the inbox).
Product and spend stay human until there are judges to delegate to.

## Recompile from vision

The goal: the code is a derived artifact; vision, specs and learnings are
the source. Monthly, an area is rebuilt from those, and the rebuild
replaces the current code if it passes the area's contract.

What has to exist first, in order:

1. **`vision/VISION.md`** (one page, human-written) and **`specs/<area>.md`**
   per area: purpose, user-visible behaviour, invariants, acceptance
   criteria, what it must not do. The fixer drafts the first versions from
   the current code; humans edit them. That editing is the taste work.
2. **Contract tests per area**: API golden responses, page smoke tests,
   privacy invariants. The recompile is only as safe as these.
3. **Learnings** already accumulate in `memos/fleet/learnings/` from the
   fixer; the recompile reads the area's.

The monthly run, per area, in a worktree: read vision + spec + learnings

- the area's contract tests, rebuild the area from scratch, run the
  contract and the canary against a preview deploy, then either replace the
  area on `main` (Tier 0 areas) or open a PR (Tier 1) or file a
  "spec drift" issue when the spec and the tests disagree.

Out of scope for recompilation, permanently: the Supabase schema, the
ClickHouse data, the consent model. Those are state, not derived code.

Pilot with one leaf area that has a clear contract and no consent
surface: the digest email or the hex map. Twelve areas at one a month is
a year; two areas a month once the first two land cleanly.

## Infra

**Decision (Christine, 2026-10-30): no Method.** It was the planned unit
of work, but it is too immature to sit in a loop that pushes to `main`
unattended. Each routine is instead a bash harness under `fleet/bin/` in
the product repo that does the deterministic parts itself and calls Claude
Code headless (`claude -p`) for the one step that needs judgment:

- `fleet/bin/fixer.sh`: pick the oldest open signal with `gh`, label it,
  make a run directory under `~/services/ca-fleet/runs/<ts>-<issue>/`, run
  `claude -p` with `fleet/prompts/fixer.md` and the issue body, in the
  repo checkout, with an allowed-tools list and a turn cap; then the gate
  (lint, types, security tests, unit tests) as plain commands; then push
  or open the PR with `gh`; then **read back** with `gh` that the PR or
  commit and the issue comment exist before declaring success; write the
  learning; everything the run printed stays in the run directory.
- `fleet/bin/canary.sh`: `curl` checks and budgets, rollback via
  `vercel rollback`, signal via `curl`. No agent.
- `fleet/bin/pipeline.sh`: health checks over SSH; `claude -p` only to
  write the signal summary on anomaly.
- `fleet/bin/recompile.sh`: later; same shape as the fixer with a spec
  instead of an issue.

What Method would have given (effect observers, resumable runs, evidence
folders) the harness does by hand in the three places it matters: read
back after every write, keep the run directory, and `claude -p --resume`
on the session id when a gate fails and the agent should fix its own
work. Revisit Method when it is stable.

The question is where the harness executes.

| Option                                      | Fits                                                     | Cost           | Against                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **A. One Hetzner VM, `ca-fleet`**           | Fixer, canary, pipeline (public SSH to `ca-autorefresh`) | ~€10/mo (cx33) | One more host to patch and monitor; it is in the control-panel repo's ops already, so the marginal cost is small.                      |
| B. Method's hosted runner (`method deploy`) | (dropped with Method)                                    | Unknown        | Young product in the critical path of production writes; no host access for the pipeline routine; secrets live with a third party.     |
| C. Claude Code cloud scheduled routines     | Canary, fixer                                            | Tokens only    | No host access; ephemeral sandbox so memory must be the repo (fine) and secrets must be re-provisioned per run; no subscription login. |
| D. GitHub Actions cron running Claude Code  | Canary                                                   | Runner minutes | 6-hour job cap, awkward for a continuous fixer, secrets in Actions, no host access.                                                    |

**Decision (Christine, 2026-10-30): A, on its own box.** `agent-experiments`
(`ssh hetzner`) was considered and rejected: it is near idle, but it hosts
the cuties production profile service on 2 vCPU / 3.7 GB with a 93% full
disk, and a fixer running type-checks next to someone else's production is
the wrong neighbour.

**Created 2026-10-30:** `ca-fleet`, Hetzner `cx33` (4 vCPU / 8 GB / 80 GB,
€10.44/mo gross; the CX32 name no longer exists), Ubuntu 24.04, `hel1`,
IPv4 `89.167.70.10`, SSH alias `ca-fleet` (root, key `ca_stream_hetzner`).
It lives in Christine's personal Hetzner project next to
`agent-experiments`, not in the project that holds `prod-firehose` and
`ca-autorefresh`, so there is no shared private network: the pipeline
routine reaches those hosts over public SSH with the same key, as the Mac
does. Host definition, bootstrap, units and runbook: control-panel PR #302
(`ops/ca-fleet/`, `docs/ca-fleet-operations.md`).

- Node 22, `pnpm`, `gh`, `vercel@65`, Claude Code, Docker for Alloy,
  installed by `ops/ca-fleet/bootstrap-remote.sh` (idempotent). Method was
  installed by the first bootstrap and is removed again (decision below).
- CA checkout at `/home/fleet/services/ca-fleet/repo`, secrets in
  `/home/fleet/services/ca-fleet/env` mode 600, a one-repo GitHub App token
  minted per run by `bin/fleet-github-token`.
- Fleet units as user systemd timers, shipped disabled; `MemoryMax` on the
  fixer so a runaway build fails the run rather than the box.
- `.method-runs/` rotated weekly; learnings and digests live in the repo.

The runtime on the box is Claude Code CLI itself, called headless by the
bash harness, which is what makes a subscription login an option, below.

## Subscription instead of tokens

**Decision (Christine, 2026-10-30): a dedicated Claude Max login on
`ca-fleet`, `ANTHROPIC_API_KEY` left empty in the env file, with an API key
kept ready as the fallback for the weekly cap.**

A Claude Max login on the box instead of an API key is workable and
cheaper, with two caveats.

- **Use a dedicated account for the fleet**, not Christine's. The weekly
  cap is per account; a 24/7 fixer on your login eats your own quota, and
  a separate account keeps "one person's interactive use" true.
- **Policy.** Anthropic introduced the weekly caps in 2025 specifically to
  curb Claude Code running in the background around the clock, and steers
  CI and automation to API keys; subscription credentials are only allowed
  inside Claude Code itself (a bash harness shelling out to `claude -p` is
  Claude Code; a third-party agent framework using the login would not be). Check the current Claude Code
  docs on subscription use in automation before relying on it, and keep an
  API key in the Method runtime config as the fallback when the weekly cap
  is hit or the policy changes.

Sizing: Max 20x ($200/mo) was published at roughly 240–480 Sonnet-hours
or 24–40 Opus-hours a week. A sequential fixer active ~4 hours a day is
~28 agent-hours a week: fine on a Sonnet-class model for reproduce and
classify with the strong model only for the fix step, tight on all-Opus.
The cap doubles as the spend limit. Measured against the $300–900 token
estimate below, Max 20x is the floor and the cap is the ceiling.

## Spend

The only continuously running LLM is the fixer, and it is sequential. The
levers that matter, in order: one at a time, idle when the inbox is empty,
model choice per step (cheap model for reproduce-and-classify, strong
model for the fix), and the size cap. A rough budget for 3–5 fixes a day:

| Item                | Monthly                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| Hetzner VM          | €8–15                                                                       |
| Fixer tokens        | $300–900 (measure for 2 weeks, then set the Console limit at 1.5× observed) |
| Canary, pipeline    | < $20 (scripts; LLM only on anomaly)                                        |
| Recompile, one area | $50–150 per run                                                             |

## Phase 1, revised

1. `fleet/bin/fixer.sh` + `fleet/prompts/fixer.md`: inbox → fix → gate →
   push → read back → close → learning. Start it in PR mode for the first
   week, flip to direct-to-main once ten PRs in a row needed no change.
2. `fleet/bin/canary.sh` on production with rollback.
3. `ca-fleet` host in control-panel, GitHub App, API key, timers.
4. First `vision/VISION.md` draft for you to edit; first two specs.

Phase 0 wiring (`memos/20261029-1930-phase0-wiring-checklist.md`) comes
first; the fixer has nothing to read until the inbox fills.
