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

echo "Applying repo migrations to staging..."
yes | pnpm supabase db push --include-all --db-url "$STAGING_DATABASE_URL"

if [[ -f supabase/seed.sql ]]; then
  echo "Loading mock seed data..."
  psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
else
  echo "supabase/seed.sql not found; skipping seed load."
fi

echo "Staging database is in sync with the current repo schema and mock seed data."
