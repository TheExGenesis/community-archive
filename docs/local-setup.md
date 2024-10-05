# Development Instructions

1. Rename `.env.example` to `.env.local` and update the following:

```

NEXT_PUBLIC_SUPABASE_URL=https://fabxmporizzqflnftavs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8
NEXT_PUBLIC_USE_REMOTE_DEV_DB=false # Set to true to use the remote development database, false to use the local development database
NEXT_PUBLIC_LOCAL_SUPABASE_URL='http://localhost:54321'
NEXT_PUBLIC_LOCAL_ANON_KEY=<>
NEXT_PUBLIC_LOCAL_SERVICE_ROLE=<>
SUPABASE_SERVICE_ROLE=<> #same as above, is needed for vercel in the server
NEXT_PUBLIC_USER_ID=<>
NEXT_PUBLIC_USER_NAME=<>>

ARCHIVE_PATH=<path_to_archive_folder>


```

Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be found in [your Supabase project's API settings](https://app.supabase.com/project/_/settings/api)

1. Install [node](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) and optionally [pnpm](https://pnpm.io/installation#using-npm)

2. Install dependencies

```bash
pnpm install

```

3. You can now run the Next.js local development server:

```**bash**
pnpm run dev
```

The app should now be running on [localhost:3000](http://localhost:3000/).

> Check out [the docs for Local Development](https://supabase.com/docs/guides/getting-started/local-development) to also run Supabase locally.

4. Run tests: `pnpm jest --selectProjects server --testPathPattern=src/lib-server -t "insertProfiles"`

   `--selectProjects server` will run tests only for the server-side code in node, and `--selectProjects client` will run tests only for the client-side code in jsdom (see `jest.config.js`)

5. If you make changes to the database schema, you'll want to update the types in `src/database-types.ts` with `pnpm gen-types`, you'll need a `SUPABASE_ACCESS_TOKEN` in your environment variables.

### Supabase local instance setup

Echoing [Supabase's Local Development instructions](https://supabase.com/docs/guides/cli/local-development?queryGroups=access-method&access-method=postgres#access-your-projects-services):

- `supabase login`
- Make sure docker is running:
  - There are a number of different projects available to download Docker from:
    - Docker Desktop (macOS, Windows, Linux)
    - Rancher Desktop (macOS, Windows, Linux)
    - OrbStack (macOS)
      colima (macOS)
- `supabase start`

6. Download the last export from [the Github Releases](https://github.com/TheExGenesis/community-archive/releases)
  6.1 set the `ARCHIVE_PATH` environment variable to the path of the archive folder
  6.2 run the script `pnpm dev:importdata`
  6.3 wait a bit and then you should be able to see the data in the local supabase studio at http://localhost:54323/project/default/editor


You can now visit your local Dashboard at `http://localhost:54323`, and access the database directly with any Postgres client via `postgresql://postgres:postgres@localhost:54322/postgres.`

`supabase start` will give you the url, anon key, and service role key for your local db.

The local Postgres instance can be accessed through psql
or any other Postgres client, such as pgadmin.

For example:

`psql 'postgresql://postgres:postgres@localhost:54322/postgres'`

### Manage remote migrations

We can use Supabase's CLI to manage migrations locally, and then push them to the remote database. To do this fully you'll need a db password, so ask admins in the Discord.

Setup:

---

1. Associate your project with your remote project using `supabase link --project-ref fabxmporizzqflnftavs`
2. Pull the latest migrations from the remote database using `supabase migration pull` and if you want to manage auth and storage locally: `supabase db pull --schema auth,storage`,

For each change you make to the db:

3. Create your migration file: `supabase migration new create_employees_table`
4. Add the SQL to your migration file
5. Apply the new migration to your local database `supabase migration up` or `supabase db reset`
6. CAREFUL: Deploy any local database migrations directly to prod `supabase db push`

### Sign-in in dev mode

You might to test archive uploads in dev mode. Set these env variables to the user id and name of the user whose archive you want to upload.

```
NEXT_PUBLIC_USER_ID=<>
NEXT_PUBLIC_USER_NAME=<>>
```

Then go to your supabase dashboard and in `Authentication`, press `Add user`:

```
email: dev@gmail.com
password: dev
```

### Dumping the database to file

Use `scripts/download_storage.ts` to download the storage files from the database to a local directory.

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
- `pnpm gen-types` — Generates TypeScript types from the remote Supabase instance.
- `pnpm dev:gen-types` — Generates TypeScript types from the local Supabase instance.
- `pnpm dev:importdata` — Imports data from the archive folder into the local database.

### Paths

TypeScript is pre-configured with custom path mappings. To import components or files, use the `@` prefix.

```tsx
import { Button } from '@/components/ui/Button'

// To import images or other files from the public folder
import avatar from '@/public/avatar.png'
```
