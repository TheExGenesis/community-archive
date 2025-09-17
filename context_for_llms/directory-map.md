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
│   ├── circle-mitigation/       # Scripts to identify and remove Twitter Circle tweets from the database.
│   │   ├── README.md            # Explains the process for finding and removing Twitter Circle tweets.
│   │   ├── 01_fetch_potential_circle_tweets_from_ca.mjs # Script to fetch potential Circle tweets from the Community Archive database based on date range.
│   │   ├── 02_check_potential_tweets_against_syndication_api.mjs # Script to check potential Circle tweets against a syndication API to confirm their status.
│   │   ├── 03_clean_archive_jsons.py # Python script to remove suspected Circle tweets and their associated likes from user archive JSON files. It identifies these tweets by combining a list of known suspected Circle tweets with conversation data from Supabase and insights from a "rerequest" process.
│   │   ├── 04_upload_clean_archive_jsons.py # Python script to upload the cleaned user archive JSON files (output from `03_clean_archive_jsons.py`) to the 'archives' bucket in Supabase Storage, overwriting existing files.
│   │   ├── 05_delete_circle_tweets_from_db.py # Python script to delete identified Circle tweets from the database.
│   │   └── twitter-syndication/ # Subdirectory for Twitter syndication related scripts/data.
│   │       ├── README-twitter-syndication.md # Documentation for the Twitter Syndication API client, detailing its features, usage, and API reference.
│   │       ├── twitter-syndication.mjs # JavaScript version of the Twitter Syndication API client (likely compiled from the .ts version or an older version).
│   │       └── twitter-syndication.ts  # TypeScript source code for the Twitter Syndication API client used to fetch public tweet/timeline data.
│   ├── delete_user_archives.mts # Script to delete specified users' archives (all files in their folder) from the Supabase Storage 'archives' bucket. Contains a hardcoded list of usernames.
│   ├── download_profile_pics.mts # Script to download profile pictures
│   ├── download_supabase_storage.mts # Script to download data from Supabase storage
│   ├── get_all_tweets_paginated.mts # Script to fetch all tweets with pagination
│   ├── import_from_files_to_db.ts # TypeScript script to import data from local Twitter archive JSON files (structured by user) into Supabase public tables, handling various data types like accounts, tweets, media, likes, followers, etc., with batch upsert logic.
│   ├── populate_db_from_storage.mts # Script to populate the database from storage
│   ├── process_sql_dump.py      # Python script to parse a PostgreSQL SQL dump file, extract data from `INSERT` statements for public tables, and convert each table's data into a CSV file.
│   ├── rename_buckets.mts       # Script to rename objects within a Supabase Storage bucket (specifically 'archives'). It lists objects and renames them to a consistent `<username>/archive.json` format.
│   ├── test_conversation_ids.ts # Script for testing conversation IDs
│   ├── tsconfig.json            # TypeScript configuration for scripts
│   ├── upload_archive_json.mts  # Script to upload a local Twitter archive JSON file. It uploads the file to Supabase Storage and then attempts to insert its data into temporary database tables. (Note: Auth issues might affect DB insertion when run as a script).
│   ├── upload_archive_zip.mts   # Script to process and upload a Twitter archive ZIP file. It extracts data from JS files within the ZIP (tweets, account, likes, etc.), uploads the combined data to Supabase Storage, and attempts to insert it into temporary database tables.
│   └── validate_db_import.ts    # TypeScript script to validate the completeness of Twitter archive data imported into Supabase. It compares data from local archive JSON files against corresponding Supabase public tables (tweets, likes, media, followers, etc.) to ensure all items were imported and identify discrepancies.
├── src/                         # Source code for the application
│   ├── app/                     # Next.js app directory (routing, pages, layouts)
│   │   ├── api/                 # API route handlers
│   │   │   ├── auth/            # Authentication-related API routes
│   │   │   │   ├── callback/    # Handles OAuth callbacks from Supabase
│   │   │   │   │   └── route.ts # GET route for OAuth callback. Exchanges auth code for session (admin client), then updates user's `app_metadata` with `provider_id` and lowercase `user_name` (from initial `user_metadata`). Redirects to complete OAuth flow.
│   │   │   │   └── changeuserid/
│   │   │   │       └── route.ts # POST API route (admin access) to update a user's app_metadata and user_metadata (provider_id, user_name) in Supabase. Used by the mock sign-in flow in SignIn.tsx for local development user simulation.
│   │   │   ├── message/         # Example API route directory.
│   │   │   │   └── route.ts     # Basic GET API route that returns a static JSON greeting.
│   │   │   └── reference/       # Serves an interactive API reference page.
│   │   │       └── route.ts     # GET route using `@scalar/nextjs-api-reference` to display API documentation based on `/openapi.json`.
│   │   ├── data-policy/         # Data policy page
│   │   │   └── page.tsx         # Page component for displaying the data policy
│   │   ├── mission-control/     # Admin/mission control related pages
│   │   │   └── page.tsx         # Page component for the mission control dashboard
│   │   ├── remove-dms/          # Informational page about manually removing DMs from Twitter archives.
│   │   │   └── page.tsx         # Page component providing instructions for users to manually delete DMs from their Twitter archive prior to upload.
│   │   ├── search/              # Search page and related components
│   │   │   └── page.tsx         # Page component for the main search interface. Uses `AdvancedSearchForm` and `TweetList` to display results based on URL query params.
│   │   ├── test-examples/       # Example pages and components for testing purposes
│   │   │   ├── counter.test.tsx # Test file for the counter component
│   │   │   ├── counter.tsx      # Example counter component
│   │   │   ├── page.test.tsx    # Test file for the example page
│   │   │   └── page.tsx         # Example page for testing
│   │   ├── tweets/              # Pages related to displaying tweets
│   │   │   ├── [tweet_id]/      # Dynamic route for individual tweet permalink pages
│   │   │   │   └── page.tsx     # Page component for displaying a single tweet specified by `tweet_id`.
│   │   │   └── page.tsx         # Main page for displaying a list of recent root tweets (timeline). Uses `TweetList` with `isRootTweet: true`.
│   │   ├── upload-archive/      # Route that renders the main homepage, which contains the archive upload functionality.
│   │   │   └── page.tsx         # Re-exports the main Homepage component (`src/app/page.tsx`). The `/upload-archive` path displays the homepage, where upload features are integrated.
│   │   ├── user/                # User profile and related pages
│   │   │   └── [account_id]/    # Dynamic route for individual user profile pages. Displays user info and their tweets using `TweetList`.
│   │   ├── user-dir/            # User directory or listing page (assumption)
│   │   │   └── page.tsx         # Page component for the user directory
│   │   ├── favicon.ico          # Application favicon
│   │   ├── globals.css          # Global CSS styles
│   │   ├── layout.tsx           # Root layout. Sets up HTML, global styles, `GeistSans` font, `NextTopLoader`, Vercel `Analytics`. Wraps children with `ThemeProvider` (light/dark mode) and `ReactQueryProvider` (client-side data fetching with `ReactQueryDevtools`). Includes `HeaderNavigation`, `MobileMenu`, dynamic `SignIn`, and `ThemeToggle`.
│   │   └── page.tsx             # Root page (homepage). Displays project title, mission, community stats (Supabase), most followed accounts (`AvatarList`), and data upload instructions (`DynamicSignIn`, `UploadHomepageSection`). Features `ShowcasedApps`, Open Collective supporters (`TieredSupportersDisplay`), info panels (docs, GitHub, Discord), and a link to the Data Policy. Includes `Footer`.
│   ├── components/              # Reusable UI components
│   │   ├── ui/                  # Base UI components (likely from a library like shadcn/ui)
│   │   │   └── sheet.tsx        # shadcn/ui component for side panels/drawers, used for mobile navigation.
│   │   ├── AdvancedSearchForm.tsx # Component for advanced search functionality. Updates URL query parameters on submit and pre-fills from them.
│   │   ├── AuthButton.tsx       # Server component displaying a "Login" link or user greeting with a "Logout" button based on auth state. Logout uses a server action.
│   │   ├── AvatarList.tsx       # Client component that displays a list of user avatars, each linking to a user profile and showing username and stats (followers, tweets).
│   │   ├── Code.tsx             # Client component for displaying code snippets with a copy-to-clipboard button.
│   │   ├── CommunityStats.tsx   # Component that displays community-wide statistics: total tweets, total liked tweets, and total accounts. Can optionally show a 'next milestone' goal for account count.
│   │   ├── ConnectSupabaseSteps.tsx # Component guiding users through Supabase connection
│   │   ├── copy-button.tsx      # Client component that renders an icon button with a tooltip to copy provided text to the clipboard. Displays a checkmark icon on successful copy.
│   │   ├── file-upload-dialog.tsx # Dialog component for file uploads, showing archive stats, Circle Tweet warning, and advanced options (date range, upload likes). Handles upload progress, success/error states, and modal persistence.
│   │   ├── Footer.tsx           # Application footer component, contains a link to the Data Policy page.
│   │   ├── Header.tsx           # Promotional header component showcasing Supabase and Next.js logos and links (likely from initial template).
│   │   ├── HeaderNavigation.tsx # Desktop navigation menu component.
│   │   ├── MobileMenu.tsx       # Mobile navigation menu component, uses a sheet (drawer) for links.
│   │   ├── NextLogo.tsx         # Next.js logo component
│   │   ├── OpenCollectiveContributors.tsx # Component to display Open Collective members (functionality largely merged into/superseded by TieredSupportersDisplay).
│   │   ├── ReactQueryExample.test.tsx # Test for ReactQueryExample component
│   │   ├── ReactQueryExample.tsx  # Example component using React Query
│   │   ├── SearchTweets.tsx     # Older/alternative component for searching tweets, using direct search functions from `pgSearch.ts`. Displays results using the `Tweet` component. Not the primary search interface.
│   │   ├── ShowcasedApps.tsx    # Displays applications built with the archive, typically in a carousel.
│   │   ├── SignIn.tsx           # Client component for user authentication. Uses `useAuthAndArchive` hook. Provides mock sign-in (email/password to `/api/auth/changeuserid`) for local dev (without remote DB) and Twitter OAuth via Supabase for other environments. Handles sign-out. Displays user status and auth actions.
│   │   ├── Step.tsx             # Component for displaying a step in a process
│   │   ├── SupabaseLogo.tsx     # Supabase logo component
│   │   ├── ThemeToggle.tsx      # Component to toggle light/dark theme
│   │   ├── TieredSupportersDisplay.tsx # Displays Open Collective financial contributors with a tiered image stack and donation summary.
│   │   ├── TopMentionedMissingUsers.tsx # Client component that displays top mentioned users, enriching them with archive status and profile data. Links to app profile or Twitter. Can filter to show only users whose archives are not uploaded.
│   │   ├── Tweet.tsx            # Component for displaying a single tweet. Shows user avatar, name, username, tweet text, engagement counts, date, and embedded media (images). Provides permalink and link to original tweet. Handles replies.
│   │   ├── TweetList.tsx        # Generic client component for fetching, displaying, and paginating lists of tweets based on `filterCriteria`. Includes "Load More" and "Download CSV" functionality. Used on timeline (`/tweets`), user profiles, and search results.
│   │   ├── UploadHomepageSection.tsx # Client component for the homepage managing archive uploads. Shows previous upload status, handles new .zip file selection and initial processing, then opens `FileUploadDialog`. Includes archive deletion functionality.
│   │   └── activity-tracker.tsx # Client component that renders a GitHub-style activity calendar/heatmap. Displays daily activity counts with color-coded intensity and tooltips for details.
│   ├── hooks/                   # Custom React hooks
│   │   ├── useAuthAndArchive.tsx # Custom hook to manage user authentication state (subscribes to Supabase `onAuthStateChange`, fetches session) and checks if the current user has uploaded their archive by querying the `archive_upload` table using `userMetadata.provider_id`. Returns `userMetadata` and `isArchiveUploaded`.
│   │   └── useGetMessage.ts     # Custom React Query hook that fetches data from the example `/api/message` endpoint using `axios`. Used by `ReactQueryExample.tsx`.
│   ├── lib/                     # Core logic, utility functions, and Supabase client setup
│   │   ├── queries/             # Database query functions/utilities
│   │   │   └── tweetQueries.ts  # Contains `fetchTweets` function for generalized tweet fetching with `FilterCriteria`, used by `TweetList.tsx`.
│   │   ├── upload-archive/      # Logic related to uploading archives
│   │   │   ├── applyOptionsToArchive.ts # Exports `applyOptionsToArchive` which modifies an archive based on user-selected upload options (date range, upload likes). Includes helpers `emptyLikesList` and `filterArchiveTweetsByDate`.
│   │   │   ├── calculateArchiveStats.ts # Exports `calculateArchiveStats` which computes various statistics (username, tweet/like counts, date range, etc.) from a processed Twitter archive object.
│   │   │   ├── filterArchiveTweetsByDate.ts # Exports `filterArchiveTweetsByDate` which filters tweets in an archive object to include only those within a specified date range.
│   │   │   ├── handleFileUpload.ts    # Exports `handleFileUpload` for client-side processing of uploaded Twitter archive ZIP files. Extracts, parses, and validates data from JS files (tweets, account, likes, etc.) within the archive.
│   │   │   ├── uploadArchive.ts       # Exports `uploadArchive` which orchestrates server-side upload: uploads processed archive to storage (`uploadArchiveToStorage`) and inserts data into temporary DB tables (`insertArchiveForProcessing`), providing progress updates.
│   │   │   ├── uploadArchiveToStorage.ts # Exports `uploadArchiveToStorage` which uploads the processed archive object as `archive.json` to the 'archives' bucket in Supabase Storage, organized by username.
│   │   │   └── validateContent.ts     # Exports functions to validate the structure of parsed Twitter archive files (`validateContent`, `validateFileContents`) against predefined schemas.
│   │   ├── db_insert.ts         # CRITICAL: Handles the entire archive import process. Manages batch insertion (tweets, user mentions, media, URLs, followers, following, likes) into temporary Supabase tables with retry logic, patches tweets with noteTweets (for long tweets), manages upload phases (uploading, ready_for_commit, committed, failed), inserts account info, and commits data from temp to public tables. Includes a deleteArchive function.
│   │   ├── devLog.ts            # Development logging utility
│   │   ├── formatNumber.ts      # Utility function to format numbers (e.g., for display)
│   │   ├── fp.ts                  # Functional programming utilities (e.g., pipe)
│   │   ├── getTableName.ts      # Exports `getTableName`, a utility function that returns the provided table name. Type definitions suggest potential for schema distinction (public/dev) but no prefixing is implemented.
│   │   ├── pgSearch.ts          # PostgreSQL search utilities, including calling the `search_tweets` RPC. Updated to handle pagination (offset) and media.
│   │   ├── refreshSession.ts    # Function to refresh Supabase user sessions, typically for server-side operations.
│   │   ├── removeProblematicChars.ts # Utility to remove problematic characters from strings
│   │   ├── stats.ts             # Exports `getStats` function to fetch global activity summary (total accounts, tweets, likes, mentions) from the `global_activity_summary` view.
│   │   ├── tweet.ts             # Tweet related utility functions, including `getTweet` for fetching single tweets with media.
│   │   ├── types.ts             # Custom TypeScript types for the application, including `TimelineTweet`, `FilterCriteria`, `TweetMediaItem`, etc.
│   │   ├── user.ts              # Exports utility functions `getFirstTweets` and `getTopTweets` to fetch a user's initial or most popular tweets.
│   │   └── user-utils.ts        # Exports `formatUserData` function to transform raw user data into a `FormattedUser` type, handling potentially array-based profile information.
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
│   ├── utils/                   # General utility functions for the application.
│   │   ├── supabase.ts          # Utility functions for creating Supabase clients (browser, server, admin, middleware) with environment-aware configurations.
│   │   └── tailwind.ts          # Utility function `cn` for conditionally merging Tailwind CSS classes using `clsx` and `tailwind-merge`.
│   ├── database-explicit-types.ts # Manually defined TypeScript types for database tables, leveraging auto-generated base types.
│   ├── database-types.ts        # Auto-generated database types from Supabase schema
│   └── middleware.ts            # Next.js middleware. Primarily used to refresh Supabase authentication sessions for server components. Applies to most request paths except static assets and images.
├── sql/                         # SQL scripts, potentially for database setup or migrations
│   ├── functions/               # Supabase edge functions (PostgreSQL functions)
│   │   └── search/
│   │       └── 01_search_tweets.sql # PostgreSQL function for advanced tweet search. Updated to return media data and support pagination (offset).
├── supabase/                    # Supabase configuration and local development files
│   ├── functions/               # Supabase edge functions (typically serverless TypeScript functions, distinct from DB functions)
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