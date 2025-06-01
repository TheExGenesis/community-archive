# Directory Map

This document outlines the directory structure of the Community Archive project.

```
.
├── .github/workflows/           # GitHub Actions workflows for CI/CD
├── .husky/                      # Git hooks
├── .next/                       # Next.js build output
├── .nvmrc                       # Node version specification
├── .vscode/                     # VSCode editor settings
├── context_for_llms/            # Documentation and context for LLMs
│   ├── context_for_llms.md      # Main context document for LLMs
│   ├── dev-plan.md              # Detailed plan for feature implementation and project development.
│   ├── directory-map.md         # This file - a map of the directory structure.
│   └── style-guide.md           # Guide to website visual styling, color palettes, typography, and layout patterns.
├── data/                        # Local data, potentially including downloaded archives
├── docs/                        # Project documentation
│   ├── examples/                # Example files or scripts
│   ├── api-doc.md               # Documentation for the API
│   ├── apps.md                  # Information about applications using the archive
│   ├── archive_data.md          # Details about the data in the archive
│   ├── local-setup.md           # Instructions for setting up a local development environment
│   └── README.md                # Overview of the documentation
├── node_modules/                # Project dependencies
├── public/                      # Static assets served by the Next.js application
│   ├── placeholder.jpg          # Placeholder image
│   ├── mockServiceWorker.js     # Mock service worker for testing or development
│   └── openapi.json             # OpenAPI specification for the API
├── scratchpad/                  # Temporary files or experimental code
├── scripts/                     # Various scripts for development, data processing, etc.
│   ├── circle-mitigation/       # Scripts related to CircleCI mitigations
│   ├── delete_user_archives.mts # Script to delete user archives
│   ├── download_profile_pics.mts # Script to download profile pictures
│   ├── download_supabase_storage.mts # Script to download data from Supabase storage
│   ├── get_all_tweets_paginated.mts # Script to fetch all tweets with pagination
│   ├── import_from_files_to_db.ts # Script to import data from files into the database
│   ├── populate_db_from_storage.mts # Script to populate the database from storage
│   ├── process_sql_dump.py      # Python script for processing SQL dumps
│   ├── rename_buckets.mts       # Script for renaming Supabase storage buckets
│   ├── test_conversation_ids.ts # Script for testing conversation IDs
│   ├── tsconfig.json            # TypeScript configuration for scripts
│   ├── upload_archive_json.mts  # Script to upload archive data in JSON format
│   ├── upload_archive_zip.mts   # Script to upload archive data in ZIP format
│   └── validate_db_import.ts    # Script to validate database imports
├── src/                         # Source code for the application
│   ├── app/                     # Next.js app directory (routing, pages, layouts)
│   │   ├── api/                 # API route handlers
│   │   │   ├── auth/            # Authentication-related API routes
│   │   │   │   ├── callback/    # Handles OAuth callbacks from Supabase
│   │   │   │   │   └── route.ts # Exchanges auth code for session (using admin client), updates user_metadata (provider_id, user_name) in Supabase, and redirects. Critical for completing OAuth flow.
│   │   │   │   └── changeuserid/
│   │   │   │       └── route.ts # POST API route (admin access) to update a user's app_metadata and user_metadata (provider_id, user_name) in Supabase. Used by the mock sign-in flow in SignIn.tsx for local development user simulation.
│   │   │   ├── message/         # API routes for handling messages (e.g., fetching, sending - needs confirmation)
│   │   │   └── reference/       # API routes for reference data or OpenAPI spec (assumption)
│   │   ├── data-policy/         # Data policy page
│   │   │   └── page.tsx         # Page component for displaying the data policy
│   │   ├── mission-control/     # Admin/mission control related pages
│   │   │   └── page.tsx         # Page component for the mission control dashboard
│   │   ├── remove-dms/          # Page/functionality for removing DMs (assumption)
│   │   │   └── page.tsx         # Page component for the remove DMs feature
│   │   ├── search/              # Search page and related components
│   │   │   └── page.tsx         # Page component for the main search interface
│   │   ├── test-examples/       # Example pages and components for testing purposes
│   │   │   ├── counter.test.tsx # Test file for the counter component
│   │   │   ├── counter.tsx      # Example counter component
│   │   │   ├── page.test.tsx    # Test file for the example page
│   │   │   └── page.tsx         # Example page for testing
│   │   ├── tweets/              # Pages related to displaying tweets
│   │   │   ├── [tweet_id]/      # Dynamic route for individual tweet pages
│   │   │   └── page.tsx         # Main page for displaying a list of tweets (or a general tweets section)
│   │   ├── upload-archive/      # Pages for uploading user archives
│   │   │   └── page.tsx         # Page component for the archive upload interface
│   │   ├── user/                # User profile and related pages
│   │   │   └── [account_id]/    # Dynamic route for individual user profile pages
│   │   ├── user-dir/            # User directory or listing page (assumption)
│   │   │   └── page.tsx         # Page component for the user directory
│   │   ├── favicon.ico          # Application favicon
│   │   ├── globals.css          # Global CSS styles
│   │   ├── layout.tsx           # Root layout. Sets up HTML shell, global styles (`globals.css`), Next.js top loader, Vercel Analytics. Wraps children with `ThemeProvider` (from `next-themes` via `@/providers/ThemeProvider`) for light/dark mode and `ReactQueryProvider` (from `@/providers/ReactQueryProvider`) for client-side data fetching. Includes main navigation menu (Home, User Directory, Advanced Search, Apps) and dynamically imports `SignIn` component for authentication status/actions.
│   │   └── page.tsx             # Root page component (homepage). Displays project title, description, community stats (fetched server-side via Supabase), list of most followed accounts, links/instructions for uploading Twitter data (using `DynamicSignIn` and `UploadHomepageSection` components), links to docs, GitHub, Discord, and project info. Includes `Footer` component.
│   ├── components/              # Reusable UI components
│   │   ├── ui/                  # Base UI components (likely from a library like shadcn/ui)
│   │   │   └── sheet.tsx        # shadcn/ui component for side panels/drawers, used for mobile navigation.
│   │   ├── AdvancedSearchForm.tsx # Component for advanced search functionality
│   │   ├── AuthButton.tsx       # Authentication button component
│   │   ├── AvatarList.tsx       # Component to display a list of avatars
│   │   ├── Code.tsx             # Component for displaying code snippets
│   │   ├── CommunityStats.tsx   # Component to display community statistics
│   │   ├── ConnectSupabaseSteps.tsx # Component guiding users through Supabase connection
│   │   ├── copy-button.tsx      # Button to copy text to clipboard
│   │   ├── file-upload-dialog.tsx # Dialog component for file uploads
│   │   ├── Footer.tsx           # Application footer component
│   │   ├── Header.tsx           # Application header component
│   │   ├── HeaderNavigation.tsx # Desktop navigation menu component.
│   │   ├── MobileMenu.tsx       # Mobile navigation menu component, uses a sheet (drawer) for links.
│   │   ├── NextLogo.tsx         # Next.js logo component
│   │   ├── OpenCollectiveContributors.tsx # Component to display Open Collective members (functionality largely merged into/superseded by TieredSupportersDisplay).
│   │   ├── ReactQueryExample.test.tsx # Test for ReactQueryExample component
│   │   ├── ReactQueryExample.tsx  # Example component using React Query
│   │   ├── SearchTweets.tsx     # Component for searching tweets
│   │   ├── ShowcasedApps.tsx    # Displays applications built with the archive, typically in a carousel.
│   │   ├── SignIn.tsx           # Client component for user authentication. Uses `useAuthAndArchive` hook. Provides mock sign-in (email/password to `/api/auth/changeuserid`) for local dev (without remote DB) and Twitter OAuth via Supabase for other environments. Handles sign-out. Displays user status and auth actions.
│   │   ├── Step.tsx             # Component for displaying a step in a process
│   │   ├── SupabaseLogo.tsx     # Supabase logo component
│   │   ├── ThemeToggle.tsx      # Component to toggle light/dark theme
│   │   ├── TieredSupportersDisplay.tsx # Displays Open Collective financial contributors with a tiered image stack and donation summary.
│   │   ├── TopMentionedMissingUsers.tsx # Component displaying top mentioned users not in the archive
│   │   ├── Tweet.tsx            # Component for displaying a single tweet. Shows user avatar, name, username, tweet text, engagement counts (likes, retweets), date. Provides permalink within the app and link to original tweet. Handles display of replies. (Incorporates previous TweetRefactor.tsx functionality)
│   │   ├── UploadHomepageSection.tsx # Section of the homepage related to uploads
│   │   └── activity-tracker.tsx # Component for tracking user activity (assumption)
│   ├── hooks/                   # Custom React hooks
│   │   ├── useAuthAndArchive.tsx # Custom hook to manage user authentication state (subscribes to Supabase `onAuthStateChange`, fetches session) and checks if the current user has uploaded their archive by querying the `archive_upload` table using `userMetadata.provider_id`. Returns `userMetadata` and `isArchiveUploaded`.
│   │   └── useGetMessage.ts     # Hook for retrieving messages (e.g., for internationalization or notifications)
│   ├── lib/                     # Core logic, utility functions, and Supabase client setup
│   │   ├── queries/             # Database query functions/utilities
│   │   ├── upload-archive/      # Logic related to uploading archives
│   │   ├── db_insert.ts         # CRITICAL: Handles the entire archive import process. Manages batch insertion (tweets, user mentions, media, URLs, followers, following, likes) into temporary Supabase tables with retry logic, patches tweets with noteTweets (for long tweets), manages upload phases (uploading, ready_for_commit, committed, failed), inserts account info, and commits data from temp to public tables. Includes a deleteArchive function.
│   │   ├── devLog.ts            # Development logging utility
│   │   ├── formatNumber.ts      # Utility for formatting numbers
│   │   ├── fp.ts                # Functional programming utilities (assumption)
│   │   ├── getTableName.ts      # Utility for getting database table names
│   │   ├── pgSearch.ts          # PostgreSQL search utilities
│   │   ├── refreshSession.ts    # Function to refresh user sessions
│   │   ├── removeProblematicChars.ts # Utility to remove problematic characters from strings
│   │   ├── stats.ts             # Functions for calculating or retrieving statistics
│   │   ├── tweet.ts             # Tweet related utility functions
│   │   ├── types.ts             # Custom TypeScript types for the application
│   │   ├── user.ts              # User related utility functions
│   │   └── user-utils.ts        # Additional user-related utilities
│   ├── mocks/                   # Mock data or service implementations for testing (likely with MSW - Mock Service Worker)
│   │   ├── browser.ts           # MSW setup for browser environments
│   │   ├── handlers.ts          # MSW request handlers
│   │   ├── index.ts             # Main export for mocks
│   │   └── server.ts            # MSW setup for server environments (e.g., Node tests)
│   ├── providers/               # React context providers
│   │   ├── ReactQueryProvider.tsx # Client component that initializes and provides a `QueryClient` from `@tanstack/react-query` for client-side server state management (fetching, caching).
│   │   └── ThemeProvider.tsx      # Client component wrapper around `next-themes/ThemeProvider` to enable light/dark mode switching.
│   ├── test/                    # Test files and configurations
│   │   └── test-utils.tsx       # Utility functions for testing
│   ├── database-explicit-types.ts # Explicitly defined database types
│   ├── database-types.ts        # Auto-generated database types from Supabase schema
│   └── middleware.ts            # Next.js middleware. Primarily used to refresh Supabase authentication sessions for server components. Applies to most request paths except static assets and images.
├── sql/                         # SQL scripts, potentially for database setup or migrations
├── supabase/                    # Supabase configuration and local development files
│   ├── functions/               # Supabase edge functions
│   ├── migrations/              # Database migration files (skipped in this map)
│   ├── .temp/                   # Temporary files for Supabase CLI
│   ├── config.toml              # Supabase project configuration
│   └── seed.sql                 # SQL script for seeding the database
├── .DS_Store                    # macOS specific file
├── .eslintrc.json               # ESLint configuration
├── .gitattributes               # Git attributes configuration
├── .gitignore                   # Files and directories to be ignored by Git
├── .lintstagedrc.js             # Lint-staged configuration for pre-commit checks
├── .prettierignore              # Files and directories to be ignored by Prettier
├── .prettierrc.yaml             # Prettier configuration
├── .testenv                     # Environment variables for testing
├── components.json              # Configuration for UI components (e.g., shadcn/ui)
├── database.types.ts            # (Potentially duplicated or older version of src/database-types.ts)
├── jest.config.js               # Jest test runner configuration
├── jest.polyfills.js            # Polyfills for Jest tests
├── jest.setup.server.ts         # Jest setup for server-side tests
├── jest.setup.ts                # General Jest setup file
├── LICENSE                      # Project license
├── next-env.d.ts                # TypeScript definitions for Next.js
├── next.config.js               # Next.js configuration. Includes `@next/bundle-analyzer` (toggleable with `ANALYZE=true` env var) for inspecting bundle sizes. No other custom Next.js configs apparent.
├── package.json                 # Project metadata and dependencies. Defines scripts like `dev` (starts Next.js dev server with specific env vars), `build`, `test`, `lint`, `gen-types` (for Supabase type generation).
├── pnpm-lock.yaml               # PNPM lock file
├── postcss.config.js            # PostCSS configuration
├── README.md                    # Main project README file
├── tailwind.config.js           # Tailwind CSS configuration
└── tsconfig.json                # TypeScript configuration
``` 