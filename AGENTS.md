# Repository Guidelines

## Project Structure & Modules
- App (Next.js): `src/app` (routes, pages, API routes).
- UI components: `src/components` (PascalCase files, co-located tests when needed).
- Logic & data: `src/lib` and `src/utils` (TypeScript helpers, queries).
- Hooks: `src/hooks`.
- Tests: `src/**/*.test.{ts,tsx}` with client/server split via Jest projects.
- Static/public assets: `public/`.
- Database & SQL: `supabase/`, `sql/`, and generated types `src/database-types.ts`.
- Scripts & tooling: `scripts/` (import/validation, pre-commit automation).

## Build, Test, and Development
- Install: `pnpm install` (Node `v18.17.0`, see `.nvmrc`).
- Develop: `pnpm dev` (local DB) or `pnpm dev-remote-db`.
- Build: `pnpm build` then `pnpm start`.
- Lint: `pnpm lint` (Next.js + ESLint). Format: `pnpm format` or `pnpm format-check`.
- Type check: `pnpm type-check`.
- Tests: `pnpm test` (all), `pnpm test:server`, `pnpm test:ci`.
- Pre-commit hooks: run `pnpm prepare` once; Husky will generate Supabase types and API docs on commit.

## Coding Style & Naming
- TypeScript, strict mode. 2-space indent, no semicolons, single quotes, 80 cols (see `.prettierrc.yaml`).
- Components: PascalCase (e.g., `UserCard.tsx`). Hooks: `useX` (e.g., `useAuth.ts`). Utilities: camelCase.
- Next.js app router files follow lowercase route conventions (e.g., `src/app/tweets/page.tsx`).
- Import alias: use `@/` for `src/` (e.g., `import { foo } from '@/lib/foo'`).

## Testing Guidelines
- Framework: Jest with SWC; Testing Library for React; `jsdom` for client, `node` for server.
- Location: place tests next to code or under `src/test/`.
- Names: `*.test.ts`/`*.test.tsx`.
- Run focused suites: `pnpm test:server` for `src/lib/**`.

## Commit & Pull Requests
- Commits: imperative, concise subjects (≤72 chars). Example: `Add archive import limit flag`.
- PRs: include a clear description, linked issues, and screenshots/GIFs for UI changes.
- If touching DB/SQL or `src/database-types.ts`, note migration/typing implications and local test steps.
- CI expects lint, type check, and tests to pass.

## Security & Configuration
- Copy `.env.example` to `.env`/`.env.local`. Never commit secrets.
- Supabase CLI is required for type generation (`pnpm dev:gen-types` / `pnpm gen-types`).
- Large data imports and storage tasks live in `scripts/`; run via `pnpm script <file.mts>` or provided `dev:*` scripts.
