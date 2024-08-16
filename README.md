# open-birdsite-db

<div align="center">
<img alt="GitHub License" src="https://img.shields.io/github/license/michaeltroya/supa-next-starter">
</div>

<br/>

## Instructions

1. Rename `.env.example` to `.env.local` and update the following:

   ```
   NEXT_PUBLIC_SUPABASE_URL=[INSERT SUPABASE PROJECT URL]
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[INSERT SUPABASE PROJECT API ANON KEY]
   ```

   Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` can be found in [your Supabase project's API settings](https://app.supabase.com/project/_/settings/api)

2. You can now run the Next.js local development server:

   ```bash
   pnpm run dev
   ```

   The starter kit should now be running on [localhost:3000](http://localhost:3000/).

> Check out [the docs for Local Development](https://supabase.com/docs/guides/getting-started/local-development) to also run Supabase locally.

3. Run tests: `pnpm jest --selectProjects server --testPathPattern=src/lib-server -t "insertProfiles"`

   `--selectProjects server` will run tests only for the server-side code in node, and `--selectProjects client` will run tests only for the client-side code in jsdom (see `jest.config.js`)

4. If you make changes to the database schema, you'll want to update the types in `src/database-types.ts` with `pnpm gen-types`, you'll need a `SUPABASE_ACCESS_TOKEN` in your environment variables.

## Deployment

Hosted on Vercel.

## Showcase

Websites started using this template:

- [mainspring.pro](https://www.mainspring.pro/)
- [Add yours](https://github.com/michaeltroya/supa-next-starter/edit/main/README.md)

# Documentation

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

### Paths

TypeScript is pre-configured with custom path mappings. To import components or files, use the `@` prefix.

```tsx
import { Button } from '@/components/ui/Button'

// To import images or other files from the public folder
import avatar from '@/public/avatar.png'
```
