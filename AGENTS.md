# Community Archive

## Orientation

- Start with `README.md`, `CONTRIBUTING.md`, and `docs/README.md`. Use
  `docs/local-setup.md` for local development.
- Treat executable code, `supabase/config.toml`, schemas, migrations, package
  scripts, and CI workflows as authoritative. Dated notes and audits are not
  current configuration.

## Data Authority And Privacy

- Supabase/PostgreSQL is authoritative for authentication, membership, consent,
  uploads, opt-outs, and transactional policy state. ClickHouse is a rebuildable
  analytical projection, never the write authority for those decisions.
- A member has uploaded an archive or explicitly opted in. Explicit opt-out
  takes precedence in every public, ingestion, and analytical serving path.
- Preserve the archive privacy boundary: process archive data locally where
  designed and never add private messages or unrelated sensitive data to
  uploaded or public datasets.
- For text-fidelity diagnosis, treat the stored archive JSON as original and
  `public.tweets.full_text` as a normalized projection. Compare the archive
  object before seeking an external recovery source.

## Authentication And Data Access

- Never trust `user_metadata` for authorization or identity; it is
  client-mutable. Use trusted provider identity from `app_metadata` or
  `auth.users.identities[].identity_data`.
- `createServerAdminClient` carries the user's session and is not elevated.
  Use `createServerServiceRoleClient` only for explicitly authorized server-side
  operations, and never expose service-role credentials to clients.
- PostgREST may cap result sets. Any path that must return every matching row
  must paginate with stable ordering; counts should use a head-only exact count.

## Supabase Schema Changes

- `supabase/schemas/` is the declarative source of truth,
  `supabase/migrations/` is applied history, and `src/database-types.ts` is the
  generated client contract. Keep all affected artifacts aligned.
- Follow `docs/supabase-declarative-schemas.md` and `docs/staging.md`. Same-repo
  pull requests that change `supabase/**` synchronize the shared staging
  database; fork pull requests do not receive its secrets.
- Production migration is manual. Before merging a pull request with migrations,
  run `pnpm migrations:check`; apply to production only when explicitly
  authorized, then verify the ledger again. Otherwise mark the pull request as
  requiring a production migration.

## Conversation Recovery

- Persist source conversation and reply metadata at ingestion. When a parent or
  conversation ID is missing, record pending recovery in the same PostgreSQL
  transaction; ingestion writers must not call Twitter/X syndication directly.
- The dedicated recovery service owns traversal, retries, and persistence.
  Apply consent independently to every recovered author at the final write
  boundary, and never persist an opted-out node's content or identifying data.
- Keep renderer hydration external and non-persistent; do not reuse it for
  recovery-service writes.

## Analytics And Rendering

- Use ClickHouse for supported corpus-scale reads and Supabase for auth, writes,
  consent, editorial data, and records absent from ClickHouse. Add a narrow
  gateway endpoint rather than falling back to production Supabase corpus reads.
- Keep a portal record on the same source for its list and detail routes. A
  cacheable analytical API must return a non-cacheable non-2xx on upstream
  failure, never a successful empty payload.
- Treat new gateway routes as gateway-first dependencies: verify and release the
  gateway before a frontend that requires them. The gateway contract and
  production procedure live in the control-panel repository.
- Use `src/components/TweetCard.tsx` for full-fidelity tweet rendering and
  `src/lib/tweetText.ts` for archive text normalization. Preserve complete text,
  media, and quoted-tweet payloads in adapters.

## Community Gallery Design Authority

For changes to `src/app/community/**`, `src/components/community/**`, or
`src/lib/communityProjects*`, treat
`docs/design/community-gallery/README.md` as the visual and interaction source
of truth. Reproduce the supplied prototype at high fidelity; do not use generic
site-building guidance or the existing implementation to redesign, simplify,
consolidate, or add decorative treatments absent from the prototype. The
repository-wide style guide applies only where the prototype is silent, and
current user instructions always take precedence.

The approved product scope is the gallery landing, project modal, and
submission flow only. Do not add project-detail or creator pages, first-party
Community Archive tools, fictional projects, or fictional engagement metrics.
Verify affected desktop and mobile states against the prototype before handoff.

## Validation

- Use the focused checks in `CONTRIBUTING.md` for the changed hot path. Ask
  before broad tests, live writes, production migration, or deployment.
- For archive-worker commands and deployment requirements, follow
  `services/process_archive/README_DOCKER.md`.
