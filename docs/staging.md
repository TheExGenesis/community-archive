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
ALLOW_STAGING_DEV_LOGIN_ON_PROD_SUPABASE=false
```

The default staging login identity is:

- Email: value of `STAGING_DEV_LOGIN_EMAIL`
- Password: value of `STAGING_DEV_LOGIN_PASSWORD`
- Mock Twitter username: value of `STAGING_DEV_LOGIN_USERNAME`
- Mock Twitter account id: value of `STAGING_DEV_LOGIN_PROVIDER_ID`

The staging UI does not ask for these credentials. When `NEXT_PUBLIC_ENABLE_STAGING_DEV_LOGIN=true`, the sign-in button calls the server-side staging login route with no client-side password. The server uses `STAGING_DEV_LOGIN_PASSWORD` from the staging environment.

Do not commit the real password. The bootstrap script below writes it to an ignored `.env.staging.generated` file so it can be copied into Vercel's Preview environment.

The server route refuses staging dev login against the known production Supabase host unless `ALLOW_STAGING_DEV_LOGIN_ON_PROD_SUPABASE=true`. Do not set that override for normal staging.

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
- `ALLOW_STAGING_DEV_LOGIN_ON_PROD_SUPABASE=false`

After updating Preview env vars, redeploy the PR preview so the new values are picked up.

## Keeping Staging Schema Current

The `Sync staging database` GitHub Action resets staging from the repo schema and mock seed data:

- It runs manually via `workflow_dispatch`.
- It runs on pushes to `main` that touch `supabase/**` or `scripts/sync-staging-db.sh`.
- It refuses to run if `STAGING_DATABASE_URL` does not include `SUPABASE_STAGING_PROJECT_REF`.
- It refuses the production project ref.

Required GitHub repository secrets (configured on the `Preview` GitHub Environment):

- `SUPABASE_STAGING_PROJECT_REF`
- `STAGING_DATABASE_URL`

Use the Supabase Dashboard connection string for `STAGING_DATABASE_URL`. Prefer the session pooler connection string if direct database connections fail locally or in GitHub Actions because of IPv6 routing.

## What To Verify Before Privacy PRs

- Staging login creates/signs in the configured mock user.
- `/profile` resolves the mock account and shows archive state.
- Upload and opt-in flows mutate only the staging database.
- Explicit opt-out/deletion removes or hides the mock user's public data.
- Thread pages still render acceptably when one account in the thread has been deleted or blocked.
- Public pages do not show opted-out account data after deletion/hiding.

## Thread Rendering TODO

When an opted-out account's tweets are removed from local tables, thread views can become incomplete. The intended follow-up is to add a thread fallback that can hydrate missing public tweets through the Twitter/X syndication API, while still respecting local opt-out/block state for any account that requested removal.
