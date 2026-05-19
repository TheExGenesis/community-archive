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

echo "Resetting staging database and loading repo migrations + supabase/seed.sql..."
yes | pnpm supabase db reset --db-url "$STAGING_DATABASE_URL"
echo "Staging database is in sync with the current repo schema and mock seed data."
