# Daily Digest feature architecture

Date: 2026-08-12 17:22 PDT

## Outcome

The first Daily Digest slice is one public reading experience plus one private
editorial lab in the existing Community Archive application. It does not create
a second deployed app or enable unattended publishing yet.

## Selected design

- The public mental model is a static publication: one versioned daily edition,
  dedicated story URLs, mostly posts, and minimal connective prose.
- The experimental mental model is a lab: frozen candidate snapshots,
  inclusion checkboxes, immutable prompt versions, structured outputs, and a
  visible event/usage trace.
- ClickHouse supplies ranked 24-hour bangers and quote-post commentary.
  PostgreSQL owns editorial state and publication status.
- A published edition stores complete tweet snapshots. It remains readable and
  historically stable if the live gateway is unavailable or metrics change.
- Model output may reference only supplied IDs. Story keywords must occur
  verbatim in the supplied posts. Both rules are validated before staging.
- Edition staging is versioned. Publishing uses one transaction so replacing a
  date never leaves two published rows or an accidental gap.

## Alternatives considered

1. A separate temporary web app. Rejected for the first slice because it would
   duplicate auth, secrets, deployment, and data-access code while obscuring the
   path from experiment to publication.
2. Store all state only in a local JSON workspace. Rejected because deployed
   editors need shared run history, reproducibility, and safe publication state.
3. Generate directly from the live gateway on every digest page. Rejected
   because a “static digest” should not change after publication and should not
   inherit ClickHouse availability at read time.
4. Enable a daily cron immediately. Deferred until representative prompt
   evaluation exists; a scheduler is a production timer that requires service
   catalog, freshness monitoring, failure alerting, and a separately authorized
   auto-publish policy.

## Current boundaries

The implementation includes manual end-to-end operation through the lab and a
homepage/public route integration. The production migration, provider secret,
daily timer, email preference system, and Substack delivery adapter remain
rollout work. See [the operational runbook](../docs/daily-digest.md).
