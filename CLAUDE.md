# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Commit & PR Best Practices

**IMPORTANT: Help maintain clean git history by reminding about commits at natural points:**
- After fixing a specific bug or completing a discrete feature
- When switching context to a different area of the codebase  
- After making 3-5 related file changes
- Before starting work on a different issue or feature
- When refactoring is complete but before adding new features

**Suggest creating a new PR when:**
- The current changes address a complete, standalone issue
- Switching from bug fixes to feature development (or vice versa)
- Changes exceed ~200-300 lines of code
- Working on a different subsystem or module

**Branch hygiene — check before coding:**
- When the user brings up a new topic/feature that is unrelated to the current branch, **stop and ask whether to create a new branch from main before writing any code**
- Do NOT commit unrelated work to the current feature branch and cherry-pick later — it's cleaner to switch branches upfront
- If the current branch has a pending PR, the new work should almost always go on a separate branch

**Commit message guidelines:**
- Keep commits atomic - one logical change per commit
- Suggest descriptive commit messages that explain the "why"
- Remind to commit before context switching

## Development Commands

**CRITICAL: Node.js Version Requirement:**
- **MUST use Node.js >= v18.17.0** (Next.js 14 strict requirement)
- **ALWAYS verify Node version before running builds** - `pnpm build` will fail with older versions
- **Automatic switching:** Project has `.nvmrc` file - if you have auto-switching enabled, it will use Node v20 automatically
- If using older version, switch with NVM: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 20`
- **System configured:** NVM default is now set to Node v20, shell profile updated for auto-switching

**Build & Development:**
- `pnpm dev` - Start development server with local database
- `pnpm dev-remote-db` - Start development server with remote database
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm dev:gen-types` - Generate TypeScript types from local Supabase schema

**Code Quality:**
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier
- `pnpm format-check` - Check code formatting
- `pnpm type-check` - Run TypeScript compiler checks

**Testing:**
- `pnpm test` - Run all tests
- `pnpm test:ci` - Run tests in CI mode
- `pnpm test:server` - Run server-side tests only
- `pnpm test -- -t "test name"` - Run specific test by name

**Data Management Scripts:**
- `pnpm dev:importfiles` - Import archive files to database
- `pnpm dev:validateimport` - Validate database import
- `pnpm dev:downloadarchive` - Download archives from Supabase storage

## Architecture Overview

This is a **Twitter Community Archive** built with Next.js 14, Supabase, and TypeScript. The app allows users to upload their Twitter archives to create a searchable public database.

### Core Technologies
- **Frontend**: Next.js 14 with App Router, React 18, TailwindCSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Data Processing**: Server-side archive processing with worker functions
- **State Management**: TanStack Query (React Query) for server state
- **Testing**: Jest with Testing Library

### Key Architecture Components

**Database Layer (`src/utils/supabase.ts`):**
- Multiple Supabase client configurations for different environments
- `createBrowserClient()` - Client-side operations
- `createServerClient()` - Server-side operations with cookies
- `createDbScriptClient()` - Admin operations for scripts (dev only)
- Automatic local vs remote database switching via `NEXT_PUBLIC_USE_REMOTE_DEV_DB`

**Archive Processing Pipeline:**
1. **Upload** (`src/lib/upload-archive/`) - Handle zip file uploads and validation
2. **Storage** - Files stored in Supabase Storage buckets
3. **Processing** - Background workers extract and insert data into PostgreSQL
4. **Temporary Tables** - Data staged in temp tables before committing to main schema

**Database Schema:**
- `public` schema - Main application tables (tweets, accounts, profiles, etc.)
- `dev` schema - Development/staging tables
- `private` schema - Internal system tables (tweet_user mapping, etc.)
- Database table definitions can be found in `sql/tables/`
- Complex SQL functions in `sql/functions/` for data processing
- Row Level Security (RLS) policies for privacy controls

**API Structure:**
- REST API endpoints in `src/app/api/`
- Supabase PostgREST for database operations
- Edge functions for background processing

### Important File Locations

**Core Configuration:**
- `database.types.ts` - Generated TypeScript types from Supabase schema
- `src/utils/supabase.ts` - Database client configurations
- `supabase/config.toml` - Supabase local configuration

**Data Processing:**
- `src/lib/upload-archive/` - Archive upload and processing logic
- `src/lib/db_insert.ts` - Database insertion utilities
- `scripts/` - Data management and migration scripts
- `sql/` - SQL functions, triggers, and schema definitions

**UI Components:**
- `src/components/ui/` - shadcn/ui base components
- `src/components/` - Application-specific components
- `src/app/` - Next.js App Router pages and layouts

## Development Environment

**Local Database Setup:**
1. Install Docker and Supabase CLI
2. Run `supabase start` to start local Supabase instance
3. Set `NEXT_PUBLIC_USE_REMOTE_DEV_DB=false` in `.env`
4. Use `pnpm dev` to start with local database

**Remote Database Setup:**
1. Set `NEXT_PUBLIC_USE_REMOTE_DEV_DB=true` in `.env`
2. Configure remote Supabase credentials
3. Use `pnpm dev-remote-db` to start with remote database

**CURRENT DEVELOPMENT NOTE:**
We are currently working directly with the remote database.

**Database Schema Change Workflow (Declarative):**
1. Edit the schema files in `supabase/schemas/` (e.g., add a function to `070_functions.sql`, a table to `020_tables.sql`)
2. Run `supabase db diff -f <descriptive_name>` to auto-generate a migration from your schema changes
3. Review the generated migration file in `supabase/migrations/`
4. Use `supabase db push` to apply the migration to the remote database
5. Do NOT use local database reset commands
6. **ALWAYS ask for permission before creating new tables or functions**

**Schema files in `supabase/schemas/`:**
- `000_extensions.sql` - PostgreSQL extensions
- `000_roles.sql` - Database roles
- `001_schemas.sql` - Schema definitions
- `010_types.sql` - Custom types
- `020_tables.sql` - Table definitions
- `030_indexes.sql` - Indexes
- `040_views.sql` - Views (including `enriched_tweets`)
- `050_constraints.sql` - Constraints
- `060_grants.sql` / `060_policies.sql` - Permissions and RLS
- `070_functions.sql` - SQL functions
- `080_triggers.sql` - Triggers

**Database Work Guidelines:**
- **ALWAYS** edit schema files in `supabase/schemas/` first, then generate migrations with `supabase db diff -f <name>`
- Never manually create or edit migration files - always use `supabase db diff` to generate them from schema changes
- Use descriptive migration names (e.g., `add_user_analytics_table`, `fix_tweet_mentions_index`)
- Test queries against existing schema before making changes
- The schema files in `supabase/schemas/` ARE the source of truth for the database schema

**Type Generation:**
- Run `pnpm dev:gen-types` after schema changes to update TypeScript types
- Local: generates from local Supabase instance
- Remote: requires `SUPABASE_ACCESS_TOKEN` environment variable

## Code Patterns & Conventions

**React Components & JSX:**
- **CRITICAL**: Always escape apostrophes in JSX text content to avoid React ESLint errors
  - Use `&apos;` instead of `'` in JSX text (e.g., `You&apos;re` instead of `You're`)
  - This prevents the error: `react/no-unescaped-entities`
  - Common cases: contractions like "don't", "can't", "won't", "you're", "it's", etc.
  - Example: `<p>You haven&apos;t uploaded any archives yet</p>`

**Database Operations:**
- Use appropriate Supabase client for context (browser/server/admin)
- Always handle authentication state for user-specific operations
- Leverage Supabase RLS policies for data security

**File Organization:**
- `src/lib/` - Utility functions and business logic
- `src/lib/queries/` - Data fetching functions
- `src/hooks/` - Custom React hooks
- Components follow atomic design principles

**Error Handling:**
- Use try/catch blocks for async operations
- Implement proper error boundaries for React components
- Log errors appropriately without exposing sensitive data

**Performance:**
- Use React Query for caching and background updates
- Implement proper loading states and skeleton components
- Optimize database queries with proper indexing

## Privacy & Security

The application handles sensitive Twitter archive data with strict privacy controls:
- Data processing happens locally before upload
- RLS policies control data access
- No DMs or sensitive personal data stored
- Users control privacy settings for their uploaded data