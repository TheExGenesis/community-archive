# CLAUDE.md - Open Birdsite DB

## Commands
- Development: `pnpm dev`
- Build: `pnpm build`
- Start production: `pnpm start`
- Lint: `pnpm lint`
- Format: `pnpm format` (check: `pnpm format-check`)
- Type checking: `pnpm type-check`
- Run all tests: `pnpm test`
- Run single test: `pnpm test -- -t "test name"` 
- Server tests: `pnpm test:server`

## Code Style
- **Formatting**: 2 spaces, no semi, single quotes, 80 char width
- **TypeScript**: Use strict typing, explicit return types for functions
- **Imports**: Group imports (React/Next, lib/utils, components, types)
- **Components**: Functional components with explicit type declarations
- **Naming**: PascalCase for components/types, camelCase for variables/functions
- **Error handling**: Use try/catch with specific error types
- **State**: Prefer hooks over class components

## Project Context
Community archive for tweet histories using Next.js, Supabase and TypeScript.