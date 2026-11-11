# Running Community Archive as a fleet: Spawn's loop at CA scale

> Superseded in part on 2026-10-30: tiers, fleet roster and phases 1–3 are
> revised in `memos/20261030-fleet-v2-direct-to-main-and-infra.md`
> (direct to main, two tiers, one fixer, Hetzner host). Phase 0 stands.

Date: 2026-10-29
Status: proposal, nothing built yet
Source essay: "How I Built the Most AI-Pilled Company in the World" (Spawn)

## The one idea that matters

Spawn's numbers (77k changes a month, $3.1M in tokens) are not the point.
The point is a closed loop: production tells agents what is wrong, agents fix
it without a human relaying anything, and the fix is live within the hour.
Everything else in the essay (stigmergy, judges, hourly ships as SEV-0) is a
consequence of refusing to let a human sit in the middle of that loop.

CA is two people shipping about 190 commits a month, almost all of them
started by a human who noticed something, opened a Claude Code session, and
merged a PR. Every stage of the loop exists, but a human is the conveyor belt
between stages. The work is to remove that belt one stage at a time while
keeping the gates that CA genuinely needs (consent, prod migrations, spend).

## Loop audit: what CA has at each stage

| Stage              | CA today                                                                                                                                                                                                                                                                                 | Gap                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Observe**        | PostHog product events, browser `capture_exceptions`; Grafana Cloud with ten alert rules over `prod-firehose` and `ca-autorefresh`; Vercel runtime logs (no Observability Plus); autorefresh health reports and the duckdns dashboard; GitHub issues filed by hand (15 open, unlabeled). | No server-side exception capture in the Next.js app (no `instrumentation.ts`). Signals land in five places, all designed for human eyes. Nothing is replayable. |
| **Triage**         | xiq and Christine read dashboards and alerts.                                                                                                                                                                                                                                            | No fingerprinting, dedupe, or classification. An alert at 02:00 waits until morning.                                                                            |
| **Change**         | Claude Code sessions driven by a human; PR gate runs lint, type-check, security tests, unit tests; staging DB sync on schema PRs.                                                                                                                                                        | Every change waits on a human to start it and on a human to merge it.                                                                                           |
| **Verify**         | CI before merge; manual poking after deploy; gstack `qa` and `canary` skills installed but not wired to deploys.                                                                                                                                                                         | No post-deploy check, no automated revert, no "it broke in the last 15 minutes" signal.                                                                         |
| **Remember**       | `AGENTS.md`, `memos/` (dated decisions since August), `docs/dev-log`, control-panel `worklog.md`, Claude's memory dir. Unusually good.                                                                                                                                                   | Not queryable as decisions. Agents cannot ask "has this been decided?"                                                                                          |
| **Decide (taste)** | Answered live in chat by xiq and Christine.                                                                                                                                                                                                                                              | Answers are not on the record, so the same ones get asked again.                                                                                                |

Vercel already deploys `main` on merge, so "ship on merge" is free. The
missing pieces are at Observe, Triage, and Verify.

## What transfers from Spawn, and what does not

Transfers directly:

- Agents read production themselves. Nobody relays errors.
- A single error becomes a change on top, not a revert and redo, as long as
  the loop notices fast.
- Review by agents that did not write the change, before it lands.
- Decisions are recorded once and then applied by a judge, not re-asked.
- Humans do taste and entropy: saying no, deleting, asking for 100x.

Does not transfer as written:

- **"Kill PRs."** CA has a consent and privacy boundary that is enforced in
  code review today (`AGENTS.md`). Keep PRs, but let agents open, review, and
  merge the ones inside a safe tier. The PR becomes the audit trail, not the
  waiting room.
- **"Let agents break production."** Fine for UI and read paths. Not fine for
  `supabase/**`, opt-out handling, service-role code, or outbound email. Those
  stay behind the hard gates below.
- **Scale.** Spawn runs thousands of helpers a day. CA's loop can start with
  one triage routine every 30 minutes and a handful of fix sessions a day. A
  realistic token budget for the first version is hundreds of dollars a
  month, not millions.

## Hard gates (the "dumb, hard-coded" ones)

Tier 0, autonomous end to end (open PR, agent review, merge, deploy, canary):

- `src/**` outside auth, consent, admin, and API-contract paths
- `docs/**`, `memos/**`, tests, lint and type fixes, dependency patch bumps
- requires: CI green, reviewer agent pass, diff under a size cap, no new env
  vars, no new network destinations

Tier 1, agent prepares, human merges:

- `src/app/api/**`, `src/app/auth/**`, admin routes, anything that reads
  `app_metadata` or touches opt-in / opt-out state
- `services/**`, `ops/**`, CI workflows, `vercel.json`
- Anything that changes what PostHog collects

Tier 2, never autonomous (matches the existing rule in Christine's
instructions: ask before prod, ask before merging to main for big changes):

- Production migrations, anything in `supabase/migrations`
- Deleting user data, storage objects, or tombstoning
- Service-role credential use, key rotation (except disabling a key on a
  confirmed spend anomaly)
- Outbound email (digest, Bulletin), spend changes, new paid services

## The fleet: five named owners

Each agent is a scheduled routine with a memory file in `memos/fleet/<name>.md`
that it reads first and appends to last. Helpers are spawned per task.

| Agent        | Owns                      | Reads                                                                                                        | May do                                                                                                                  |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Triage**   | The signal inbox          | PostHog error tracking, Vercel runtime errors, Grafana alerts, autorefresh health reports, new GitHub issues | Dedupe, fingerprint, classify into bug / wontfix / needs-decision; start a Tier 0 fix session; label Tier 1 for a human |
| **Janitor**  | Repo health               | CI, lint, type-check, test flakiness, docs drift, format drift                                               | Tier 0 fixes; `document-release` after merges                                                                           |
| **Pipeline** | Ingest and data freshness | autorefresh run logs, ClickHouse canonical lag, digest and Bulletin job outcomes, archive upload phases      | Diagnose and write runbook-shaped reports; Tier 1 PRs; never restart or write to prod on its own                        |
| **Product**  | Funnels and experience    | PostHog weekly engaged people, upload acceptance, search failure rate, sign-in success                       | Open a signal when a metric regresses after a deploy; propose, never ship, product changes                              |
| **Steward**  | Spend and quotas          | Vercel usage and billing, PostHog quota, Anthropic spend, RapidAPI, Hetzner                                  | Alert on anomalies; disable a leaked key; everything else is a report                                                   |

## Judges (phase 3, but worth naming now)

CA already has the raw material: `memos/` holds dated decisions with
rationale, `AGENTS.md` is a principles file, GitHub issues carry xiq's
product calls, and the dev-log and worklog carry two years of context. A
judge is an agent that takes a question from a fleet agent and does one of
three things: cites a recorded decision and rules; sends the question back as
malformed; or holds it for a human. Humans answer only the held ones, and
each answer becomes a new memo so it is never asked twice.

First step is not building the judge. It is a small change of habit: when
xiq or Christine answer a taste question in chat, the session writes a memo
under `memos/decisions/`. The judge reads that folder.

## Roadmap

### Phase 0, this week: make the world legible (Observe)

1. Server-side exception capture. Add `instrumentation.ts` with
   `onRequestError` reporting to PostHog error tracking, so API route and
   server component failures are fingerprinted and grouped like client ones.
2. One inbox. Use GitHub issues with a `signal` label and a structured body
   (source, fingerprint, first seen, count, replay link, affected route).
   Feed it from PostHog error-tracking webhooks, a Vercel log drain filtered
   to 5xx, Grafana's contact point, and the autorefresh health report. Issues
   are already where humans look, and `gh` makes them agent-readable.
3. Replayability. Every API error log line carries request id, route, user
   state (signed in / member / guest), and upstream (Supabase, gateway,
   ClickHouse). Agents cannot fix what they cannot reconstruct.

### Phase 1, weeks 2 to 3: close the loop once (Triage, Change, Verify)

4. Triage routine every 30 minutes. Reads unlabeled `signal` issues, dedupes
   against open ones, classifies, and for Tier 0 starts a fix session with
   the issue as the brief. Written as a Method (`fleet/triage.method`) so
   each run has evidence, effects, and a replayable record; the fix itself
   runs as a Claude Code session.
5. Reviewer agent on every agent-authored PR: tries to break it, checks the
   tier rules, posts a verdict. Auto-merge on green CI plus verdict for
   Tier 0 only.
6. Post-deploy canary. On each production deploy, run the gstack `canary`
   check against the live site and the PostHog error rate for 15 minutes.
   Regression opens a `signal` issue tagged with the deploy, which Triage
   routes to a fix-forward session. Vercel instant rollback is the backstop.
7. Close the loop visibly: the fix PR links the issue, the issue gets the
   deploy URL and canary result, and the issue closes itself.

### Phase 2, weeks 3 to 5: name the owners

8. Split Triage into the five fleet agents above, each with a memory file
   and a schedule. Pipeline and Steward start read-only.
9. Weekly fleet report memo: what each owner saw, did, and held for a human.

### Phase 3, weeks 5 to 8: judges and cadence

10. `memos/decisions/` habit plus a judge routine that answers fleet
    questions from the record.
11. Measure and push: signal-to-fix latency, share of changes that started
    from a production signal, ships per day, revert rate, human decisions per
    week. Spawn's 0.9% revert rate is the bar for whether Tier 0 can widen.

## What this costs and what it needs from you two

- Tokens: a 30-minute triage cadence plus a few fix sessions a day lands in
  the low hundreds of dollars a month at the start. It scales with signals,
  which is the right thing to scale with.
- Infra: PostHog error tracking (already on the plan), a Vercel log drain,
  one small host or cloud routine to run the schedules. `ca-autorefresh`
  already runs systemd timers and could run the Methods.
- Decisions only you can make: the exact Tier 0 path list; whether the inbox
  is GitHub issues or a table; the monthly token ceiling; who the taste judge
  learns from first (xiq's product calls are the densest record).

## What stays human

Spawn's two remaining human jobs apply unchanged. Taste: using the product,
saying no, deleting what the last model generation needed. Entropy: halo
projects that ask for 100x rather than 2%, the kind of question that produced
the hex map and agentic search. Everything that is a reaction to something
production already said should stop needing a human by the end of phase 1.
