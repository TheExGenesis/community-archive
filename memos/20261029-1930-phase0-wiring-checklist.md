# Phase 0 wiring checklist

Human-only steps (Tier 1) that turn PR #1177 on in production. Do them in
this order; each step is verified before the next. Budget: about 40 minutes.
Reference: `docs/hyperobservability.md`.

Facts checked on 2026-10-29:

- Vercel project `community-archive`, team `theexgenesis-projects`.
  `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` are
  already set, so server exception capture needs nothing new.
- PostHog project 546185 on `us.posthog.com`.
- The GitHub label `signal` already exists on `TheExGenesis/community-archive`.
- None of `SIGNALS_WEBHOOK_SECRET`, `SIGNALS_GITHUB_TOKEN`,
  `SIGNALS_GITHUB_REPO` exist in Vercel yet.

## 1. Mint the two secrets

**Webhook secret.** Any random string; it is shared by every source.

```bash
openssl rand -hex 32
```

**GitHub token.** The issue filer. Requirements:

- Fine-grained token: Resource owner must be the account that owns the repo
  (`TheExGenesis`), Repository access "Only select repositories" →
  `community-archive`, Permissions → Issues: Read and write (Metadata: read
  is added automatically). Expiration: 1 year; put the date in your calendar.
- If you cannot pick `TheExGenesis` as resource owner (a fine-grained token
  can only target repos the token's own account or its orgs own), use a
  classic token with the single `public_repo` scope from any collaborator.
- Issues will show that account as author. A dedicated bot account is
  nicer but optional.

Page: https://github.com/settings/personal-access-tokens/new

## 2. Set the env vars in Vercel, then merge

Dashboard: Project → Settings → Environment Variables, environment
**Production** only (sources only ever point at the production URL). Or from
a terminal, each one prompts for the value:

```bash
npx vercel@65 env add SIGNALS_WEBHOOK_SECRET production --scope theexgenesis-projects --project community-archive
```

```bash
npx vercel@65 env add SIGNALS_GITHUB_TOKEN production --scope theexgenesis-projects --project community-archive
```

`SIGNALS_GITHUB_REPO` can stay unset; the default is the product repo.

Then merge PR #1177. The production deploy it triggers picks the vars up.
If you merge first, redeploy once after adding the vars.

## 3. Smoke-test the inbox

With `SIGNALS_WEBHOOK_SECRET` exported in your shell:

```bash
curl -sS -X POST https://www.community-archive.org/api/signals/generic -H "Authorization: Bearer $SIGNALS_WEBHOOK_SECRET" -H 'content-type: application/json' --data '{"title":"Wiring smoke test","key":"smoke-test","severity":"info","summary":"Delete me"}'
```

Expected: `{"accepted":1,"routed":true,"outcomes":[{"action":"created",...}]}`
and a new issue `[signal:generic] Wiring smoke test`. Run the same command
again: `action` becomes `commented`, no second issue. Without the header you
get 401. Close the test issue when done.

`"routed":false` means the GitHub token is missing or the deploy predates
the env vars. A 502 means the token lacks Issues write; the request id in
the body finds the log line in Vercel.

## 4. PostHog error tracking → issues

Page: https://us.posthog.com/project/546185/error_tracking/configuration#selectedSetting=error-tracking-alerting

**New notification → Webhook**, trigger **Issue created**.

- URL: `https://www.community-archive.org/api/signals/posthog`
- Headers: `Authorization: Bearer <secret>`, `Content-Type: application/json`
- Body:

```json
{
  "issue": {
    "id": "{event.distinct_id}",
    "name": "{event.properties.name}",
    "description": "{substring(event.properties.description, 1, 600)}",
    "status": "{event.properties.status}",
    "url": "{project.url}/error_tracking/{event.distinct_id}"
  },
  "side": "{event.properties.side}",
  "route": "{event.properties.route}",
  "exception_type": "{event.properties.$exception_types}"
}
```

`side` and `route` are filled for server exceptions (captured with those
properties) and empty for browser ones; the adapter tolerates both.

Click **Test function**, confirm an issue appears, **Create & enable**.
Repeat for trigger **Issue reopened** with the same body. Skip "spiking"
for now; it needs a project-wide threshold and the created/reopened pair
already covers new signal.

## 5. Grafana Cloud → issues

Alerting → Contact points → **Add contact point**, integration **Webhook**.

- URL: `https://www.community-archive.org/api/signals/grafana`
- Authorization header: scheme `Bearer`, credentials `<secret>`
- HTTP method POST, leave the payload as the default alerting template.

**Test** it (Grafana sends a synthetic firing alert; it will file one issue
titled `[signal:grafana] TestAlert`, close it afterwards).

Then Alerting → Notification policies: either make this the default
contact point, or add a child policy matching the ten rules in
`ops/monitoring/alerts/service-health.json` (control-panel repo) and keep
the existing Slack/email route for humans. Resolved notifications comment
on the open issue, they do not close it.

## 6. Vercel log drain → issues

Team settings → **Drains** → Add drain (the newer "Drains" page, not the deprecated integration log drains).

- Sources: `lambda`, `edge`, `external` (not `build`, `static`)
- Delivery format: `json` (or `ndjson`)
- Endpoint: `https://www.community-archive.org/api/signals/vercel`
- Custom secret: the same `SIGNALS_WEBHOOK_SECRET` value. Vercel signs the
  body with it (`x-vercel-signature`); no header needed.
- Environment: Production only.
- Project: `community-archive`.

Use the drain's **Test** action: it sends signed sample events, which
should come back `200` with `accepted` ≥ 0 (sample logs are usually 2xx,
so often nothing is filed). Only 5xx and error-level lines become signals,
grouped per route, so a normal day files nothing.

## 7. Autorefresh host

Not required for phase 0 to be useful, and it touches the host. When you
are on `ca-autorefresh`, drop `SIGNALS_WEBHOOK_SECRET` into the pipeline's
env and have the health report step POST failures to
`/api/signals/autorefresh` with the body shape in the doc. Keep `key`
stable per problem (`drop-rate`, `fetch-timeout`), not per run.

## Done when

- The smoke-test curl created then commented on one issue.
- PostHog Test function, Grafana Test, and the drain each filed one issue.
- `gh issue list --label signal --state open` shows only real signals after
  the test issues are closed.
