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

The server route refuses staging dev login against the known production Supabase host unless `ALLOW_STAGING_DEV_LOGIN_ON_PROD_SUPABASE=true`. Do not set that override for normal staging.

## Database Setup

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

## What To Verify Before Privacy PRs

- Staging login creates/signs in the configured mock user.
- `/profile` resolves the mock account and shows archive state.
- Upload and opt-in flows mutate only the staging database.
- Explicit opt-out/deletion removes or hides the mock user's public data.
- Thread pages still render acceptably when one account in the thread has been deleted or blocked.
- Public pages do not show opted-out account data after deletion/hiding.

## Thread Rendering TODO

When an opted-out account's tweets are removed from local tables, thread views can become incomplete. The intended follow-up is to add a thread fallback that can hydrate missing public tweets through the Twitter/X syndication API, while still respecting local opt-out/block state for any account that requested removal.
