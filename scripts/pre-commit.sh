#!/bin/sh

# Pre-commit script to generate types and API docs
echo "🔄 Running pre-commit checks..."

# Check if we're using remote or local DB for type generation
USE_REMOTE_DB=$(grep "NEXT_PUBLIC_USE_REMOTE_DEV_DB=true" .env 2>/dev/null)

if [ -n "$USE_REMOTE_DB" ]; then
    echo "📝 Generating TypeScript types from remote database..."
    TYPE_GEN_CMD="pnpm gen-types"
else
    echo "📝 Generating TypeScript types from local database..."
    TYPE_GEN_CMD="pnpm dev:gen-types"
fi

# Generate TypeScript types from Supabase
if ! $TYPE_GEN_CMD; then
    echo "❌ Failed to generate types. Commit aborted."
    echo "💡 Tip: Make sure Supabase is configured correctly"
    echo "💡 For remote: SUPABASE_ACCESS_TOKEN must be set"
    echo "💡 For local: Run 'supabase start' first"
    exit 1
fi

# Generate API documentation
echo "📚 Generating API docs..."
if ! pnpm gen-api-docs; then
    echo "⚠️  Warning: Failed to generate API docs. This is non-blocking."
    echo "💡 Tip: Make sure NEXT_PUBLIC_SUPABASE_ANON_KEY is set in your environment"
    # Don't exit on API docs failure as it's less critical
fi

# Check if database types changed
if ! git diff --quiet src/database-types.ts 2>/dev/null; then
    echo "📦 Adding updated database types to commit..."
    git add src/database-types.ts
fi

# Check if API docs changed
if [ -f "public/openapi.json" ]; then
    if ! git diff --quiet public/openapi.json 2>/dev/null; then
        echo "📦 Adding updated API docs to commit..."
        git add public/openapi.json
    fi
fi

echo "✨ Pre-commit checks completed!"