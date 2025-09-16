#!/bin/sh

# Pre-commit script to generate types and API docs (robust PATH + .env sourcing)
set -e
echo "🔄 Running pre-commit checks..."

# Ensure Homebrew and local bins are discoverable when Git spawns a minimal shell
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Load .env so scripts relying on env vars (e.g. NEXT_PUBLIC_SUPABASE_ANON_KEY) work
if [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

# Decide remote vs local type generation from .env content
USE_REMOTE_DB=$(grep "NEXT_PUBLIC_USE_REMOTE_DEV_DB=true" .env 2>/dev/null || true)

# Choose package runner: prefer pnpm, fallback to npm
if command -v pnpm >/dev/null 2>&1; then
  RUN_CMD=pnpm
else
  RUN_CMD="npm run -s"
fi

if [ -n "$USE_REMOTE_DB" ]; then
  echo "📝 Generating TypeScript types from remote database..."
  TYPE_GEN_CMD="$RUN_CMD gen-types"
else
  echo "📝 Generating TypeScript types from local database..."
  TYPE_GEN_CMD="$RUN_CMD dev:gen-types"
fi

# Generate TypeScript types from Supabase
if ! sh -c "$TYPE_GEN_CMD"; then
  echo "❌ Failed to generate types. Commit aborted."
  echo "💡 Tip: Make sure Supabase is configured correctly"
  echo "💡 For remote: SUPABASE_ACCESS_TOKEN must be set"
  echo "💡 For local: Run 'supabase start' first"
  exit 1
fi

# Generate API documentation (non-blocking if vars are missing)
echo "📚 Generating API docs..."
if ! sh -c "$RUN_CMD gen-api-docs"; then
  echo "⚠️  Warning: Failed to generate API docs. This is non-blocking."
  echo "💡 Tip: Ensure NEXT_PUBLIC_SUPABASE_ANON_KEY is set (or present in .env)"
fi

# Auto-stage updated artifacts if changed
if ! git diff --quiet src/database-types.ts 2>/dev/null; then
  echo "📦 Adding updated database types to commit..."
  git add src/database-types.ts
fi

if [ -f "public/openapi.json" ] && ! git diff --quiet public/openapi.json 2>/dev/null; then
  echo "📦 Adding updated API docs to commit..."
  git add public/openapi.json
fi

echo "✨ Pre-commit checks completed!"
