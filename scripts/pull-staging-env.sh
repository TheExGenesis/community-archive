#!/usr/bin/env bash
# Write .env.staging.local from the Vercel Preview environment (the staging
# Supabase project and its mock logins) for `pnpm dev:staging`.
# Drops Vercel's build/runtime markers so local dev still runs as development,
# and refuses a file that points at the production Supabase project.
set -euo pipefail
cd "$(dirname "$0")/.."
out=.env.staging.local
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
npx -y vercel@latest env pull "$tmp" --environment=preview \
  --scope theexgenesis-projects --project community-archive --yes >/dev/null
# Secret-typed values come back as "[SENSITIVE]" placeholders; drop them so
# those settings fall back to the regular .env files.
grep -vE '^(NODE_ENV|VERCEL|VERCEL_[A-Z_]+|TURBO_[A-Z_]+|NX_[A-Z_]+)=|\[SENSITIVE\]' \
  "$tmp" > "$out.next"
if grep -qE '^NEXT_PUBLIC_SUPABASE_URL=.*fabxmporizzqflnftavs' "$out.next"; then
  rm -f "$out.next"
  echo "Preview env points at production Supabase; not writing $out" >&2
  exit 1
fi
grep -qE '^ENABLE_STAGING_DEV_LOGIN="?true' "$out.next" || {
  rm -f "$out.next"
  echo "Preview env has no staging dev login; not writing $out" >&2
  exit 1
}
mv "$out.next" "$out"
chmod 600 "$out"
echo "wrote $out (staging Supabase, mock logins enabled)"
