# Development Instructions

1. Rename `.env.example` to `.env.local` and update the following:

```

NEXT_PUBLIC_SUPABASE_URL=https://fabxmporizzqflnftavs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8

```

Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be found in [your Supabase project's API settings](https://app.supabase.com/project/_/settings/api)

1. Install [node](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) and optionally [pnpm](https://pnpm.io/installation#using-npm)

2. Install dependencies

```bash
pnpm install

```

3. You can now run the Next.js local development server:

```bash
pnpm run dev
```

The app should now be running on [localhost:3000](http://localhost:3000/).

> Check out [the docs for Local Development](https://supabase.com/docs/guides/getting-started/local-development) to also run Supabase locally.

4. Run tests: `pnpm jest --selectProjects server --testPathPattern=src/lib-server -t "insertProfiles"`

   `--selectProjects server` will run tests only for the server-side code in node, and `--selectProjects client` will run tests only for the client-side code in jsdom (see `jest.config.js`)

5. If you make changes to the database schema, you'll want to update the types in `src/database-types.ts` with `pnpm gen-types`, you'll need a `SUPABASE_ACCESS_TOKEN` in your environment variables.

### Supabase local instance

Echoing [supabase's instructions](https://supabase.com/docs/guides/cli/local-development?queryGroups=access-method&access-method=postgres#access-your-projects-services):

- `supabase login`
- Make sure docker is running:
  - There are a number of different projects available to download Docker from:
    - Docker Desktop (macOS, Windows, Linux)
    - Rancher Desktop (macOS, Windows, Linux)
    - OrbStack (macOS)
      colima (macOS)
- `supabase start`

You can now visit your local Dashboard at `http://localhost:54323`, and access the database directly with any Postgres client via `postgresql://postgres:postgres@localhost:54322/postgres.`

The local Postgres instance can be accessed through psql
or any other Postgres client, such as pgadmin.

For example:

`psql 'postgresql://postgres:postgres@localhost:54322/postgres'`

### Requirements

- Node.js >= 18.17.0
- pnpm 8

### Scripts

- `pnpm dev` — Starts the application in development mode at `http://localhost:3000`.
- `pnpm build` — Creates an optimized production build of your application.
- `pnpm start` — Starts the application in production mode.
- `pnpm type-check` — Validate code using TypeScript compiler.
- `pnpm lint` — Runs ESLint for all files in the `src` directory.
- `pnpm format-check` — Runs Prettier and checks if any files have formatting issues.
- `pnpm format` — Runs Prettier and formats files.
- `pnpm test` — Runs all the jest tests in the project.
- `pnpm test:ci` — Runs all the jest tests in the project, Jest will assume it is running in a CI environment.
- `pnpm analyze` — Builds the project and opens the bundle analyzer.
- `pnpm gen-api-docs` — Generates OpenAPI docs.
- `pnpm gen-types` — Generates TypeScript types.

### Paths

TypeScript is pre-configured with custom path mappings. To import components or files, use the `@` prefix.

```tsx
import { Button } from '@/components/ui/Button'

// To import images or other files from the public folder
import avatar from '@/public/avatar.png'
```
