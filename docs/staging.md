# Staging Environment

Staging should be safe enough to exercise login, upload, opt-in, explicit opt-out, deletion, admin tools, and thread rendering without touching production data.

## Target Shape

- Separate Supabase project from production.
- Same schema as production.
- Mock seed data from `supabase/seed.sql`.
- Email/password staging login bypass instead of Twitter OAuth.
- No production archive storage files.
- No production service role key.

## Required Environment Variables

Set these in the staging deployment, for example a Vercel preview/staging environment:

```env
NEXT_PUBLIC_SUPABASE_URL=<staging-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE=<staging-service-role-key>

NEXT_PUBLIC_ENABLE_STAGING_DEV_LOGIN=true
ENABLE_STAGING_DEV_LOGIN=true
STAGING_DEV_LOGIN_EMAIL=staging-dev@example.com
STAGING_DEV_LOGIN_PASSWORD=<strong-staging-password>
STAGING_DEV_LOGIN_USERNAME=alice_dev
STAGING_DEV_LOGIN_PROVIDER_ID=mock_alice
STAGING_DEV_LOGIN_DISPLAY_NAME=Alice Staging
ALLOW_STAGING_ADMIN_ON_PROD_SUPABASE=false

# Server-side ClickHouse analytics gateway
CLICKHOUSE_ANALYTICS_API_URL=https://analytics.community-archive.org/analytics
CLICKHOUSE_SEARCH_API_URL=https://analytics.community-archive.org
CLICKHOUSE_ANALYTICS_API_TOKEN=<shared-staging-gateway-token>
CLICKHOUSE_ANALYTICS_ADMIN_TOKEN=<separate-social-graph-admin-token>

# Opt-in search/profile reads. Public counts always use the analytics gateway.
# Leave these false until the dedicated /search endpoint is deployed.
ENABLE_CLICKHOUSE_READS=false
NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH=false
```

### Testing the portal with production public data

The portal's totals, trends, and observed-stream counts come from the
server-side ClickHouse analytics gateway. Its recent tweet and banger rows can
optionally use a separate read-only Supabase source:

```env
PORTAL_READ_SUPABASE_URL=<production-supabase-url>
PORTAL_READ_SUPABASE_ANON_KEY=<production-anon-key>
```

Scope these overrides to the portal PR/staging branch. Keep
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE` pointed at staging so login, uploads, admin tools, and
all writes remain isolated. `PORTAL_READ_SUPABASE_ANON_KEY` is server-only and
must be the public anonymous key, never the production service-role key.

### Production reads with staging writes

Set the following on the intended staging/Preview branch. This routes server
public **and admin** database reads to production, while the existing staging
Supabase variables still own login, consent, uploads and all mutations:

```env
DATA_READ_SOURCE=production
NEXT_PUBLIC_DATA_READ_SOURCE=production
PORTAL_READ_SUPABASE_URL=<production-supabase-url>
PORTAL_READ_SUPABASE_ANON_KEY=<production-anon-key>
PUBLIC_READ_ORIGIN=https://www.community-archive.org
PUBLIC_READ_SECRET=<shared-random-secret-at-least-32-characters>
```

`DATA_READ_SOURCE=app` (or unset) restores ordinary staging reads. The public
browser flag is built into the client bundle; redeploy after either flag changes.
The normal `NEXT_PUBLIC_SUPABASE_*` variables and `SUPABASE_SERVICE_ROLE` must
remain staging credentials. The production anonymous key is public; **never put
the production service-role key in staging**.

Activation requires deploying `/api/public-data` to Production and setting the
same `PUBLIC_READ_SECRET` there first. Leave `DATA_READ_SOURCE` unset in
Production. Scope the shared secret to Production and the intended protected
Preview branch. Keep Vercel protection enabled. If Vercel challenges the
server-to-server request, set the server-only `PUBLIC_READ_PROTECTION_BYPASS`
on that branch to the project's existing Vercel automation bypass credential.
It is sent only as a header on the authenticated bridge request, never to
staging writes, Supabase or the browser. No firewall rule change is needed.
Removing the Preview flags and redeploying rolls back the read override
without any data migration.

The protected bridge accepts only GET/HEAD reads against PostgREST and the
normalized community display/cover buckets. Production credentials stay on the
production server. It preserves query, pagination and count headers, never
forwards staging cookies/JWTs, and returns `private, no-store`. Read-only RPCs
are explicitly listed in `src/utils/supabaseReadPolicy.ts` and sent as GET;
PostgREST runs GET/HEAD in a [read-only transaction](https://postgrest.org/en/stable/references/transactions.html).
Unknown POST RPCs and every INSERT/UPDATE/DELETE stay on staging. Do not add a
mutating function to that list. A misconfigured mutation targeting the production
Supabase host is rejected.

Browser public content uses the anonymous production source through a same-origin
read endpoint. Administrative reads still require the existing staging admin
check; production-read mode grants no new app permissions. Auth/session checks,
personal consent state and auth administration stay on staging so a simulated
user cannot become a production identity. Original archive files are excluded.
ClickHouse reads continue using the configured analytical gateway; point its read
URLs at production as in the configuration above. Email delivery and production
social-graph rebuilds are disabled in this mode so reading production recipients
or admin data cannot trigger those external writes.

Published Digest pages, map stories, profiles, search and admin views share this
source selection. Preview Digest fixtures turn off automatically in production
read mode; `DIGEST_MOCK_DATA=true` remains an explicit fixture override. Shared
Supabase-backed caches include source identity. Published Digest bodies are
cached across visitors, but a fresh publication/revision pointer is checked on
every request: a withdrawn or tombstoned edition cannot reappear from cache.
Story quote-post lookups stream separately after the article.

Writes apply to the staging dataset. A production object ID that is absent in
staging can return not-found when edited; this mode does not clone production
records into staging, and a reload continues to show production's version.

### Reviewing real members on the homepage map

The homepage lookup reads the existing authenticated analytical gateway directly.
The gateway's `hexMembers` applies its freshness-checked production membership
projection, including explicit opt-outs, before returning any identities. Preview
lookups use those filtered public results without rechecking them against the
unrelated staging directory. Production retains its additional live Supabase
policy check. No production website proxy, firewall bypass, or new secret is needed.

Authentication and consent writes still use staging. Development and Vercel
previews share a simulated session across the hero, account menu, navigation,
and map. Sign-in and Opt In actions update that shared UI state without OAuth
or a saved login. The homepage and map both show the Data Policy disclosure
before a single Opt In confirmation. Preview confirmation simulates both login
and consent, shows the thank-you message, and enables public map lookups.
Choose Signed out in the preview controls or account menu to reset.

Production uses the same disclosure before Twitter OAuth. A short-lived,
per-tab consent intent lets the homepage complete the authenticated opt-in on
return without asking again. A return URL alone never saves consent. The
thank-you message appears only after the consent API succeeds. Server
permissions always require real authentication and consent.

### Reviewing production Bulletin items in a protected PR preview

The Bulletin uses private Jev metadata and live production consent checks, so
an ordinary staging preview has an empty board. A production-backed preview
requires the read-only bridge in `src/app/api/bulletin/preview-board/route.ts`.
After that route has been deployed to Production, set a shared random secret
(at least 32 characters) as `BULLETIN_PREVIEW_READ_SECRET` in Production and
**only the intended PR's Preview branch**. In that Preview branch also set:

```env
BULLETIN_PRODUCTION_BOARD_URL=https://www.community-archive.org/api/bulletin/preview-board
```

Redeploy both environments after setting variables. The preview requires an
opted-in staging user, fetches fresh policy-filtered metadata from the
production site on each page request, and still checks source tweets through
the analytics gateway. Jev filters remain admin-only. Login, opt-in, writes,
and the service-role key stay on staging. Keep Vercel preview protection enabled.
If production's Vercel Firewall
challenges the server-to-server request, allow only this endpoint through the
firewall; the route itself requires the shared secret and returns no cached
response. Remove the branch secret and URL when the review is over.

The default staging login identity is configured via env:

- Email: value of `STAGING_DEV_LOGIN_EMAIL`
- Password: value of `STAGING_DEV_LOGIN_PASSWORD` (shared by every staging mock user)
- Mock Twitter username: value of `STAGING_DEV_LOGIN_USERNAME`
- Mock Twitter account id: value of `STAGING_DEV_LOGIN_PROVIDER_ID`

The staging UI shows a dropdown of seeded mock users (currently `alice_dev` and `xiq_dev`, see `supabase/seed.sql`) plus a sign-in button. Picking a user posts `{ username, providerId, displayName }` to the dev-login route; the server uses `STAGING_DEV_LOGIN_PASSWORD` from the environment as the shared password and derives the email as `<username>@staging.local`. No password is sent from the client. You can also deep-link to a specific user with `?as=<username>` on the sign-in page.

### Mocking the opt-in completion UI

While signed in through staging dev login, open `/opt-in?mockOptIn=1` to test
the completed opt-in experience without reading or writing an opt-in record.
The regular opt-in button updates only the current page; refresh to reset and
repeat the flow. The query parameter is ignored unless staging dev login is
enabled against a definitively non-production Supabase project. Open
`/opt-in` without the query parameter to exercise the real staging write path.

Do not commit the real password. The bootstrap script below writes it to an ignored `.env.staging.generated` file so it can be copied into Vercel's Preview environment.

The server route always refuses staging dev login against the known production
Supabase project. No environment flag can override that production guard.

When `ENABLE_STAGING_DEV_LOGIN=true` and the deployment is not pointed at the known production Supabase host, `/admin` is available to signed-in staging mock users. Production remains restricted to the Twitter username `exgenesis`.

## Programmatic Database Setup

If `SUPABASE_ACCESS_TOKEN` has organization/project management permissions, the repository can create and seed staging automatically.

Required local environment:

```env
SUPABASE_ACCESS_TOKEN=<valid Supabase management token>
SUPABASE_STAGING_ORG_ID=<Supabase org id>
SUPABASE_STAGING_DB_PASSWORD=<new staging database password>
SUPABASE_STAGING_REGION=eu-central-1
```

Then run:

```bash
./scripts/bootstrap-staging-supabase.sh
```

The script will:

- create a `community-archive-staging` Supabase project if `SUPABASE_STAGING_PROJECT_REF` is not set
- link the project locally
- run `supabase db push --include-all`
- load `supabase/seed.sql`
- write Preview environment values to `.env.staging.generated`

If you create the Supabase project manually, set `SUPABASE_STAGING_PROJECT_REF` and rerun the same script to apply schema, seed data, and generate the Vercel env file.

## Manual Database Setup

1. Create a new Supabase project.
2. Link the project locally:

```bash
supabase link --project-ref <staging-project-ref>
```

3. Apply the schema:

```bash
supabase db push
```

4. Load mock data:

```bash
psql '<staging-db-connection-string>' -f supabase/seed.sql
```

The default staging login identity maps to `mock_alice` / `alice_dev`, which exists in the seed data and has a multi-tweet thread.

## Vercel Preview Setup

For PR-created Vercel Preview deployments, add the values from `.env.staging.generated` to the Vercel project's Preview environment. At minimum:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE`
- `NEXT_PUBLIC_ENABLE_STAGING_DEV_LOGIN=true`
- `ENABLE_STAGING_DEV_LOGIN=true`
- `STAGING_DEV_LOGIN_EMAIL`
- `STAGING_DEV_LOGIN_PASSWORD`
- `STAGING_DEV_LOGIN_USERNAME`
- `STAGING_DEV_LOGIN_PROVIDER_ID`
- `STAGING_DEV_LOGIN_DISPLAY_NAME`
- `CLICKHOUSE_ANALYTICS_API_URL`
- `CLICKHOUSE_SEARCH_API_URL` (the standalone mirror-search gateway; falls
  back to `CLICKHOUSE_ANALYTICS_API_URL` only when omitted)
- `CLICKHOUSE_ANALYTICS_API_TOKEN`
- `CLICKHOUSE_ANALYTICS_ADMIN_TOKEN` (server-only; required for the admin-only
  social-graph full refresh control)
- `ENABLE_CLICKHOUSE_READS=false` (set true when testing homepage/search reads)
- `NEXT_PUBLIC_ENABLE_CLICKHOUSE_SEARCH=false` (set true in the same build that
  should try ClickHouse text search)

After updating Preview env vars, redeploy the PR preview so the new values are picked up.

### Programmatic smoke checks for protected previews

The project's Vercel Preview deployments require SSO. For a non-interactive
smoke check, run `vercel curl` from a checkout linked to the project through
`.vercel/project.json`; it supplies deployment-protection access without
disabling the protection setting.

In Codex desktop, treat the connected Vercel app and the in-app browser as
separate authenticated surfaces. Use the Vercel connection first for deployment
status and build logs, then use the in-app browser's existing signed-in Vercel
session for interactive preview QA. A temporary Vercel share URL can still be
rejected by Community Archive's request middleware when opened in standalone
Playwright; that does not mean the Codex Vercel connection is logged out. Fall
back to the signed-in in-app browser or the `vercel curl` flow below, and never
disable deployment protection for verification.

Treat any URL containing `_vercel_share` as a temporary credential: do not
print, persist, or commit it.

Community Archive's request middleware blocks the default curl user agent and
JavaScript-challenges ordinary first-time page requests. Use one of the
middleware's intentional social-preview user agents when checking rendered
HTML or archive permalinks:

```bash
PREVIEW_URL=https://example-preview.vercel.app

npx --yes vercel@latest curl / \
  --deployment "$PREVIEW_URL" \
  -- --silent --show-error --user-agent Twitterbot/1.0 \
  --write-out '\nHTTP_STATUS:%{http_code}\n'

npx --yes vercel@latest curl /tweets/<tweet-id> \
  --deployment "$PREVIEW_URL" \
  -- --silent --show-error --user-agent Twitterbot/1.0 \
  --write-out '\nHTTP_STATUS:%{http_code}\n'
```

This verifies deployed server-rendered HTML and route availability. It does not
replace a visual browser check; use an authenticated Vercel browser session for
interactive preview QA, or perform the responsive visual pass locally before
the remote smoke check.

## Keeping Staging Schema Current

The `Sync staging database` GitHub Action soft-resets staging from the repo schema and mock seed data:

- It runs manually via `workflow_dispatch`.
- It runs on pushes to `main` that touch `supabase/**` or `scripts/sync-staging-db.sh`.
- It refuses to run if `STAGING_DATABASE_URL` does not include `SUPABASE_STAGING_PROJECT_REF`.
- It refuses the production project ref.
- "Soft reset" means: drop every schema not on the Supabase-managed allowlist (so `auth`, `storage`, `realtime`, etc. are left intact), recreate `public`, then run `supabase db push --include-all` and load `supabase/seed.sql`. This avoids the "must be owner of …" errors `supabase db reset` hits against the hosted pooler role. `auth.users` carries over between runs — clean it manually from the Supabase dashboard if you want to wipe mock accounts.

Required GitHub repository secrets (configured on the `Preview` GitHub Environment):

- `SUPABASE_STAGING_PROJECT_REF`
- `STAGING_DATABASE_URL`

Use the Supabase Dashboard connection string for `STAGING_DATABASE_URL`. Prefer the session pooler connection string if direct database connections fail locally or in GitHub Actions because of IPv6 routing.

## What To Verify Before Privacy PRs

- Staging login creates/signs in the picked mock user (alice_dev, xiq_dev, etc.).
- `/profile` resolves the mock account and shows archive state.
- Upload and opt-in flows mutate only the staging database.
- Explicit opt-out/deletion removes or hides the mock user's public data, **including** orphan rows inserted with NULL `archive_upload_id` (the seed includes a few of these in `followers`, `following`, and `likes` so the fix can be exercised).
- Thread pages still render acceptably when one account in the thread (e.g. `alice_dev` participating in the postgres-RPC conversation with `bob_writes` and `xiq_dev`) has been deleted or blocked.
- Public pages do not show opted-out account data after deletion/hiding.
- Quote-tweet relationships across two staging users (`alice_dev` quotes `xiq_dev`'s `t_xiq_1`; `eve_data` quotes `quoteduser`'s `t_quoted_1`) survive or are removed as expected.

## Thread Rendering TODO

When an opted-out account's tweets are removed from local tables, thread views can become incomplete. The intended follow-up is to add a thread fallback that can hydrate missing public tweets through the Twitter/X syndication API, while still respecting local opt-out/block state for any account that requested removal.
