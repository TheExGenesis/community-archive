# Archive owner binding

_2026-10-17 09:47_

## Problem

`public.archive_upload.account_id` is bound to the caller by RLS
(`app_metadata.provider_id`, derived from `auth.identities` since
`20261016192016`). `username` and `storage_path` were not. The archive worker
took the Storage folder from the row's `username` and read the object with the
service role, so a signed-in user could insert a row naming another user's
handle and pinned path, and the worker would read that object for them.

## Changes

- **Worker** (`services/process_archive/process_archive_upload.ts`): every
  archive read (initial processing, canonical queue-first/shadow retries,
  ClickHouse delivery retries) resolves the object through
  `trustedArchiveStoragePath(row, lookupTrustedArchiveOwner(sql, row.account_id))`.
  The trusted handle comes from the account's Twitter/X identity in
  `auth.identities` (`user_name`, then `preferred_username`, the same keys
  `sync_meta_data()` uses), or `app_metadata.user_name` for an auth user with
  no Twitter identity (staging dev-login). The job fails, with the log line
  `Archive owner check failed (archive_upload_id=…, code=archive_owner_mismatch)`,
  when `lower(row.username)` differs, or `archive_owner_unverified` when the
  account has no trusted handle. ClickHouse retries record the same codes in
  `last_error_code`. Legacy rows (null `storage_path`) resolve to
  `<trusted-handle>/archive.json`.
- **Worker, added:** the main path now also rejects an archive whose
  `account[0].account.accountId` differs from the row's `account_id`
  (`code=archive_account_mismatch`). Previously only the ClickHouse and
  queue-first paths compared them, so a user's own crafted file could write
  another account's tweets and profile through `processSingleArchive`.
- **Verifier** (`verify_archive_graph.ts`): applies the same rule per account;
  an account with any mismatched row is reported as `skipped_owner_mismatch`
  and none of its objects are downloaded. The summary gains
  `owner_mismatch_accounts`.
- **Database** (`20261017165014_bind_archive_upload_owner.sql`, mirrored in
  `schemas/070_functions.sql` and `schemas/080_triggers.sql`):
  `private.enforce_archive_upload_owner()`, a `BEFORE INSERT OR UPDATE OF
  username, storage_path` trigger. For callers that are not trusted it requires
  `lower(NEW.username) = lower(app_metadata.user_name)` and, when
  `storage_path` is set, `split_part(storage_path,'/',1) = lower(username)`
  (both raise 42501). Trusted callers are a `service_role` JWT, or no request
  JWT with `session_user <> 'authenticator'` (direct database logins, which
  includes the worker and seeds). An UPDATE that leaves `username` and
  `storage_path` unchanged is never checked, so existing rows, including the
  production rows whose username predates a handle rename, are not
  re-validated.

## Upload client

No change needed. A pinned upload writes `username` = the storage folder =
`getSessionTwitterUsername(user)` lowercased, and the archives Storage INSERT
policy already requires that folder to equal `app_metadata.user_name`, so any
session the trigger would reject is already rejected by Storage. The legacy
no-reference branch in `db_insert.ts` is only reached by service-role scripts,
which are exempt.

## Verification (disposable stack `ownerbind`, ports 571xx)

Rebased onto origin/main `6208728b` (after #1110, #1111, #1112, #1116); the
migration was renamed to sort after `20261017163247`.

- A fresh stack applies every migration; `supabase test db` passes all 7
  files (99 assertions), including the new
  `archive_upload_owner_binding.test.sql` (16). With the trigger disabled, 10
  of its 16 assertions fail.
- `supabase db diff` (CLI 2.39.2) against that stack: "No schema changes
  found". The function and trigger blocks are also byte-identical between the
  migration and the schema files.
- PostgREST end to end with a real local user that has a Twitter identity:
  mismatched username, own handle with another folder, and mismatched legacy
  row each return 403/42501; a matching pinned row returns 201; service role
  returns 201.
- Worker lookup run against that DB returns the identity handle and rejects
  the service-role row with a foreign username.
- Service unit tests (`node --import tsx --test`, with the service's own
  `node_modules`): 34 pass, 1 skipped (ClickHouse URL). `pnpm type-check`,
  focused jest (upload-archive, 17 tests), and eslint on changed files pass.

## Open points

- Renamed handles: the identity holds the current handle, so a pending
  ClickHouse or canonical retry for a row uploaded under an old handle now
  stays pending with `archive_owner_mismatch`, and those accounts are skipped
  by the verifier. That is the fail-closed reading of the rule; accepting
  previous handles would need a trusted history of them (all_account.username
  comes from archive content, so it is not one).
- Staging dev-login: locally, an admin-created user's `app_metadata`
  `provider_id`/`user_name` were stripped by `sync_meta_data()` (GoTrue inserts,
  then updates; the UPDATE branch pins OLD values). `src/app/api/auth/dev-login`
  creates users the same way (`admin.createUser` with `app_metadata`), so new
  dev-login users likely carry no `provider_id`/`user_name`, and RLS, Storage
  and this trigger all reject their uploads. This predates this change and was
  not verified on staging.
- Requires a production migration before the worker deploy is relied on; the
  worker change is independent and safe to deploy first.
