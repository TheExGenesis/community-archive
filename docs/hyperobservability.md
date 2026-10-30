# Hyperobservability: phase 0

Goal: everything production says is readable by an agent, in text, in one
place, with enough context to replay it. This is the first stage of the loop
described in `memos/20261029-1830-autonomous-fleet-roadmap.md`. Phase 1 (a
triage routine that turns signals into fix PRs) builds on the contracts here.

## The three pieces

| Piece                    | Where                                                                   | What it does                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server exception capture | `src/instrumentation.ts`, `src/lib/observability/serverErrorCapture.ts` | Every unhandled error in a route handler, server component, action or middleware is sent to PostHog error tracking, fingerprinted and grouped like browser exceptions already are. Node runtime only; the edge runtime logs the same line and stops. |
| Replayable API errors    | `src/lib/observability/apiError.ts`                                     | `reportApiError` turns a handled 5xx into one JSON log line (`kind: "api_error"`), a PostHog exception, and a response whose body carries `request_id`.                                                                                              |
| Signal inbox             | `src/app/api/signals/[source]/route.ts`, `src/lib/signals/`             | Webhooks from PostHog, Grafana, the Vercel log drain, the autorefresh host and scripts become GitHub issues labelled `signal`, one per fingerprint.                                                                                                  |

Nothing here changes what PostHog collects from browsers. Server events carry
no bodies, headers, cookies, query strings, IPs or user ids; the only
user-related field is `user_state` (`guest`, `signed_in`, `unknown`), read
from the presence of a Supabase auth cookie and nothing else.

## Environment

| Variable                                                        | Scope    | Purpose                                                                                                                                     |
| --------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | existing | Reused by the server SDK. No token means no server capture.                                                                                 |
| `SERVER_ERROR_CAPTURE=off`                                      | server   | Keep server exceptions out of PostHog; log lines still emit.                                                                                |
| `SIGNALS_WEBHOOK_SECRET`                                        | server   | Bearer token every source sends. Also the Vercel drain secret (HMAC-SHA1 of the body in `x-vercel-signature`).                              |
| `SIGNALS_GITHUB_TOKEN`                                          | server   | Fine-grained token with Issues read/write on the product repo. Unset: the route accepts, logs `kind: "signal_unrouted"`, and files nothing. |
| `SIGNALS_GITHUB_REPO`                                           | server   | Defaults to `TheExGenesis/community-archive`.                                                                                               |

Setting these in Vercel is a production configuration change: Tier 1 in the
roadmap, so a human does it.

## The log line contract

Handled API failures:

```json
{
  "level": "error",
  "kind": "api_error",
  "ts": "2026-10-29T18:40:00.000Z",
  "request_id": "iad1::k7s2d-1761763200000-3f1a",
  "route": "/api/tweet-search",
  "method": "GET",
  "status": 502,
  "upstream": "gateway",
  "user_state": "guest",
  "error": { "name": "TypeError", "message": "fetch failed" },
  "message": "Tweet search is temporarily unavailable"
}
```

Unhandled errors (from `onRequestError`) use `kind: "unhandled_error"` and
add `router_kind`, `route_type`, `render_source` and `revalidate_reason`.

`route` is the route pattern, never the request URL. `upstream` is one of
`supabase`, `gateway`, `clickhouse`, `twitter`, `modal`, `email`, `storage`,
`github`, `none`, `unknown`. `request_id` is Vercel's `x-vercel-id` when
present, so the same id finds the request in Vercel logs.

Adopting it in a route:

```ts
} catch (error) {
  return reportApiError({
    request,
    route: '/api/user-directory',
    status: 502,
    message: 'The user directory is temporarily unavailable',
    upstream: 'gateway',
    error,
  })
}
```

Routes converted so far: tweet-search, portal/stream, hex-map/heat,
user-directory, tweet-counts, search/related, conversation-map, strands,
scraping-stats. The remaining 5xx `catch` blocks under `src/app/api` still
use bare `console.error`; convert them when you touch them. `public-data`
keeps its `message` body key on purpose, because the read bridge parses it.

## The signal contract

Every source is normalized to a `Signal` (`src/lib/signals/types.ts`) and
filed as an issue titled `[signal:<source>] <title>` with the `signal` label.
The body has a one-paragraph summary, a fenced `json signal` block that is
the machine-readable record, and an HTML comment `fp:<fingerprint>` used for
dedupe. A repeat of an open fingerprint is a comment, never a second issue.
A `resolved` signal comments on the open issue and is otherwise ignored.

Fingerprint = first 12 hex of sha256(`source|key`), where the key is stable
across repeats: PostHog issue id, Grafana alert fingerprint, Vercel
`route|status|error name`. Numeric ids and UUIDs in paths collapse to `:id`.

Reading the inbox as an agent:

```bash
gh issue list --label signal --state open --json number,title,body,createdAt
```

## Wiring each source

All sources POST to `https://www.community-archive.org/api/signals/<source>`
with `Authorization: Bearer <SIGNALS_WEBHOOK_SECRET>` unless noted. The
route caps a request at 512 KB and 20 signals.

### PostHog error tracking → `/api/signals/posthog`

Create a webhook destination on the error tracking "issue created" and
"issue reopened" triggers with this body template (adjust the variable names
to what the destination exposes; the adapter also accepts the same keys
flattened at the top level):

```json
{
  "issue": {
    "id": "{issue.id}",
    "name": "{issue.name}",
    "description": "{issue.description}",
    "url": "{issue.url}",
    "status": "{issue.status}"
  },
  "side": "{event.properties.side}",
  "route": "{event.properties.route}"
}
```

### Grafana Cloud → `/api/signals/grafana`

Add a webhook contact point with the URL above and the bearer token in the
Authorization header, then route the ten rules in `ops/monitoring/alerts/`
(control-panel repo) to it. The standard Grafana alerting payload is read
as-is: `alertname`, `instance`, `service_id`, `check_id`, `severity` labels
and `summary`, `description`, `runbook_url` annotations. Resolved
notifications comment on the open issue.

### Vercel log drain → `/api/signals/vercel`

Project settings → Log Drains → add a drain with format `json` (or
`ndjson`), sources `lambda`, `edge`, `external`, and the drain secret set to
`SIGNALS_WEBHOOK_SECRET`. Vercel signs each delivery; no bearer header is
needed. Only 5xx responses and error-level lines become signals, grouped per
route per delivery. Lines produced by `reportApiError` are parsed, so the
issue carries `upstream`, `user_state` and the request id.

### Autorefresh host and scripts → `/api/signals/autorefresh`, `/api/signals/canary`, `/api/signals/generic`

One object or an array of:

```json
{
  "title": "Autorefresh run dropped 40% of fetched tweets",
  "key": "drop-rate",
  "severity": "critical",
  "state": "firing",
  "summary": "health_reports/2026-10-29T03.json: 1,912 of 4,780 tweets failed validation",
  "link": "https://ca-dashboard.duckdns.org/",
  "details": { "run": "2026-10-29T03:00:00Z", "dropped_ratio": 0.4 }
}
```

`key` is what makes repeats group; leave it stable per problem, not per run.

```bash
curl -sS -X POST "$CA_URL/api/signals/autorefresh" \
  -H "Authorization: Bearer $SIGNALS_WEBHOOK_SECRET" \
  -H 'content-type: application/json' \
  --data @signal.json
```

Humans file the same shape through the "Production signal" issue template.

## What phase 1 adds

A triage routine reads open `signal` issues every 30 minutes, dedupes
against each other, classifies (bug / wontfix / needs-decision), and for
Tier 0 paths starts a fix session with the issue as the brief; the fix PR
closes the issue with `Fixes #n`. A post-deploy canary posts to
`/api/signals/canary`. Neither exists yet.
