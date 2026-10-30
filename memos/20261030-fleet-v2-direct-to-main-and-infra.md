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

Methods are the unit of work regardless of host (`fleet/fixer.method`,
`fleet/canary.method`, `fleet/pipeline.method`, `fleet/recompile.method`),
run by `method run`. The question is where `method run` executes.

| Option                                      | Fits                                                              | Cost                   | Against                                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. One Hetzner VM, `ca-fleet`**           | Fixer, canary, pipeline (via private network to `ca-autorefresh`) | ~€8–15/mo (CPX21–CX32) | One more host to patch and monitor; it is in the control-panel repo's ops already, so the marginal cost is small.                                                                               |
| B. Method's hosted runner (`method deploy`) | Fixer, canary, recompile                                          | Unknown until tried    | Young product in the critical path of production writes; no host access for the pipeline routine; secrets live with a third party.                                                              |
| C. Claude Code cloud scheduled routines     | Canary, fixer                                                     | Tokens only            | Prompt-driven, not Method-driven, which your rule forbids as a parallel system; no host access; ephemeral sandbox so memory must be the repo (fine) and secrets must be re-provisioned per run. |
| D. GitHub Actions cron running Claude Code  | Canary                                                            | Runner minutes         | 6-hour job cap, awkward for a continuous fixer, secrets in Actions, no host access.                                                                                                             |

**Recommendation: A.** One small Hetzner VM in the same project as
`prod-firehose` and `ca-autorefresh`, on the private network, provisioned
from the control-panel repo like the others. It runs:

- Node, `method`, Claude Code CLI logged in with an **API key** (not a
  subscription seat: unattended server use is API billing, and the Console
  spend limit is the budget guard), `gh`, `vercel@65`.
- A GitHub App installation token with Contents write and Issues write on
  the product repo, scoped to that one repo. Not a personal token.
- systemd timers: `fleet-fixer` (every 10 min, exits at once if a run is
  already active or the inbox is empty), `fleet-canary` (15 min),
  `fleet-pipeline` (hourly), `fleet-recompile` (monthly, manual at first).
- Each run's evidence in `.method-runs/` on the host, rotated weekly;
  learnings and digests committed to the repo so they survive the host.

B becomes attractive once the Methods are stable and you want to stop
owning a box; moving is `method deploy --from-run`, so nothing is wasted.

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

1. `fleet/fixer.method`: inbox → fix → gate → push → close → learning.
   Start it with a Tier 1-only mode for the first week (opens PRs), flip
   to direct-to-main once ten PRs in a row needed no change.
2. `fleet/canary.method` on production with rollback.
3. `ca-fleet` host in control-panel, GitHub App, API key, timers.
4. First `vision/VISION.md` draft for you to edit; first two specs.

Phase 0 wiring (`memos/20261029-1930-phase0-wiring-checklist.md`) comes
first; the fixer has nothing to read until the inbox fills.
