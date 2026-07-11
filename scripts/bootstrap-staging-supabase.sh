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

PROJECT_NAME="${SUPABASE_STAGING_PROJECT_NAME:-community-archive-staging}"
REGION="${SUPABASE_STAGING_REGION:-eu-central-1}"
GENERATED_ENV_FILE="${SUPABASE_STAGING_ENV_FILE:-.env.staging.generated}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

urlencode() {
  node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$1"
}

require_env SUPABASE_ACCESS_TOKEN
require_env SUPABASE_STAGING_DB_PASSWORD

export SUPABASE_ACCESS_TOKEN

PROJECT_REF="${SUPABASE_STAGING_PROJECT_REF:-}"

if [[ -z "$PROJECT_REF" ]]; then
  require_env SUPABASE_STAGING_ORG_ID
  echo "Creating Supabase project '$PROJECT_NAME' in org '$SUPABASE_STAGING_ORG_ID' ($REGION)..."
  CREATE_OUTPUT="$(pnpm supabase projects create "$PROJECT_NAME" \
    --org-id "$SUPABASE_STAGING_ORG_ID" \
    --db-password "$SUPABASE_STAGING_DB_PASSWORD" \
    --region "$REGION" \
    --output json)"

  PROJECT_REF="$(node -e '
    const input = JSON.parse(process.argv[1]);
    const ref = input.ref || input.id || input.project_ref || input.projectRef;
    if (!ref) {
      console.error("Could not find project ref in Supabase CLI output:");
      console.error(JSON.stringify(input, null, 2));
      process.exit(1);
    }
    process.stdout.write(ref);
  ' "$CREATE_OUTPUT")"

  echo "Created project ref: $PROJECT_REF"
  echo "Waiting 90 seconds for the database to become reachable..."
  sleep 90
fi

ENCODED_PASSWORD="$(urlencode "$SUPABASE_STAGING_DB_PASSWORD")"
DB_URL="postgresql://postgres:${ENCODED_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres"

echo "Linking Supabase project $PROJECT_REF..."
pnpm supabase link --project-ref "$PROJECT_REF" --password "$SUPABASE_STAGING_DB_PASSWORD"

echo "Applying migrations to staging..."
pnpm supabase db push --password "$SUPABASE_STAGING_DB_PASSWORD" --include-all

echo "Loading mock seed data from supabase/seed.sql..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql

echo "Fetching staging API keys..."
KEYS_JSON="$(pnpm supabase projects api-keys --project-ref "$PROJECT_REF" --output json)"
ANON_KEY="$(node -e '
  const keys = JSON.parse(process.argv[1]);
  const key = keys.find((item) => item.name === "anon" || item.name === "anon key" || item.api_key === "anon");
  process.stdout.write(key?.api_key || key?.key || "");
' "$KEYS_JSON")"
SERVICE_ROLE_KEY="$(node -e '
  const keys = JSON.parse(process.argv[1]);
  const key = keys.find((item) => item.name === "service_role" || item.name === "service_role key" || item.api_key === "service_role");
  process.stdout.write(key?.api_key || key?.key || "");
' "$KEYS_JSON")"

if [[ -z "$ANON_KEY" || -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Could not parse Supabase API keys. Raw key metadata:" >&2
  echo "$KEYS_JSON" >&2
  exit 1
fi

cat > "$GENERATED_ENV_FILE" <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://${PROJECT_REF}.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE=${SERVICE_ROLE_KEY}

NEXT_PUBLIC_ENABLE_STAGING_DEV_LOGIN=true
ENABLE_STAGING_DEV_LOGIN=true
STAGING_DEV_LOGIN_EMAIL=${STAGING_DEV_LOGIN_EMAIL:-staging-dev@example.com}
STAGING_DEV_LOGIN_PASSWORD=${STAGING_DEV_LOGIN_PASSWORD:-$(openssl rand -base64 30 | tr -d '\n')}
STAGING_DEV_LOGIN_USERNAME=${STAGING_DEV_LOGIN_USERNAME:-alice_dev}
STAGING_DEV_LOGIN_PROVIDER_ID=${STAGING_DEV_LOGIN_PROVIDER_ID:-mock_alice}
STAGING_DEV_LOGIN_DISPLAY_NAME=${STAGING_DEV_LOGIN_DISPLAY_NAME:-Alice Staging}
EOF

echo
echo "Staging Supabase is ready."
echo "Project ref: $PROJECT_REF"
echo "Mock data loaded from supabase/seed.sql."
echo "Generated Vercel env file: $GENERATED_ENV_FILE"
echo
echo "Add those values to Vercel's Preview environment for this project."
