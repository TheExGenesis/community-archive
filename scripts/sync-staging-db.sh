#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

require_env SUPABASE_STAGING_PROJECT_REF
require_env STAGING_DATABASE_URL

if [[ "$STAGING_DATABASE_URL" != *"$SUPABASE_STAGING_PROJECT_REF"* ]]; then
  echo "Refusing to sync: STAGING_DATABASE_URL does not contain SUPABASE_STAGING_PROJECT_REF." >&2
  exit 1
fi

if [[ "$STAGING_DATABASE_URL" == *"fabxmporizzqflnftavs"* ]]; then
  echo "Refusing to sync: STAGING_DATABASE_URL appears to point at production." >&2
  exit 1
fi

if [[ "$SUPABASE_STAGING_PROJECT_REF" == "fabxmporizzqflnftavs" ]]; then
  echo "Refusing to sync: SUPABASE_STAGING_PROJECT_REF is production." >&2
  exit 1
fi

echo "Soft-resetting staging: dropping project-owned schemas + migration history..."
# `supabase db reset` against a hosted project fails because the pooler `postgres` role does
# not own objects in auth/storage/realtime/cron/etc. Instead, drop only schemas owned by us
# (current_user), then recreate `public` and re-run migrations. `extensions` is owned by
# `postgres` on Supabase but is Supabase-managed (holds installed extensions), so it's kept.
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare r record;
begin
  for r in
    select n.nspname
    from pg_namespace n
    join pg_roles a on n.nspowner = a.oid
    where a.rolname = current_user
      and n.nspname <> 'extensions'
  loop
    execute format('drop schema if exists %I cascade', r.nspname);
  end loop;
end $$;

create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
comment on schema public is 'standard public schema';
SQL

if [[ -f supabase/roles.sql ]]; then
  echo "Seeding global roles (supabase/roles.sql)..."
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/roles.sql
fi

echo "Applying repo migrations to staging..."
# `yes` keeps writing after pnpm exits and dies with SIGPIPE (141); pipefail would surface
# that as a script failure even though the push succeeded. Toggle pipefail around the call.
set +o pipefail
yes | pnpm supabase db push --include-all --db-url "$STAGING_DATABASE_URL"
push_status=${PIPESTATUS[1]}
set -o pipefail
if [[ $push_status -ne 0 ]]; then
  echo "supabase db push failed with status $push_status" >&2
  exit $push_status
fi

for seed_file in supabase/seed.sql scripts/fixtures/staging-heavy-seed.sql; do
  if [[ -f "$seed_file" ]]; then
    echo "Loading mock seed data from $seed_file..."
    psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$seed_file"
  else
    echo "$seed_file not found; skipping."
  fi
done

# `global_activity_summary` and friends use `pg_class.reltuples` for tweet/like/mention
# counts (returns -1 until ANALYZE runs) and freeze their data at REFRESH time. Without
# this, the homepage renders "-1 tweets and -1 liked tweets from 0 accounts".
echo "Analyzing tables and refreshing materialized views..."
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
analyze public.all_account;
analyze public.tweets;
analyze public.liked_tweets;
analyze public.user_mentions;
do $$
declare r record;
begin
  for r in select schemaname, matviewname from pg_matviews where schemaname = 'public' loop
    execute format('refresh materialized view %I.%I', r.schemaname, r.matviewname);
  end loop;
end $$;
SQL

echo "Staging database is in sync with the current repo schema and mock seed data."
