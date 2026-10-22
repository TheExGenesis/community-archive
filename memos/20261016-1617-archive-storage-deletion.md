# Raw archive files survived "Delete All Your Data" and "Opt out and delete"

2026-10-16. Reproduced on a disposable local Supabase stack (`storagedel`,
ports 547xx) built from main's migrations. Production was not touched.

## What happened before the fix

Seed: `deltestowner/archive.json` (legacy), two
`deltestowner/<uuid>/archive.json` (pinned), and a canary
`canaryowner/<uuid>/archive.json`. Uploads went through the browser client, so
the INSERT policy applied. The cleanup was a verbatim copy of the old
`deleteStorageFiles`.

| Flow | What the old code did | Result |
| --- | --- | --- |
| Delete All Your Data (`ProfileContent`, `UploadHomepageSection`) | `list(provider_id)`: the numeric account id, not the username folder | Empty list, nothing removed, UI said "All data deleted successfully". All 3 objects remained. |
| Old helper given the right username | `list('deltestowner')` returns `archive.json` plus two `<uuid>` folder entries (`id: null`); `remove()` of folder paths is a silent no-op | Only the legacy object was removed. Both pinned objects remained. |
| Opt out and delete | `persistOptOut(true)` first, then `list('deltestowner')` from the browser | `list()` threw "new row violates row-level security policy". All 3 objects remained. |

Two independent bugs in "Delete All": the wrong folder name and the one-level
`list()`.

## Why browser-side deletion can't be made reliable

The `archives` DELETE policy (`060_policies.sql`) does allow nested
`<owner>/<uuid>/archive.json` deletes. With explicit paths, a non-opted-out
user removed 3 of 3. But PostgreSQL also applies SELECT policies to
`DELETE … WHERE`, and the SELECT policy calls
`assert_archive_upload_allowed`, which raises once the account is blocked.
After opt-out, both `list()` and `remove()` fail. Reordering to delete before
opting out would break the "opt-out persists first" invariant, so cleanup has
to run with the service role.

On main's local schema the opt-out also did not enqueue an
`admin_delete_with_export` job. The `pg_trigger_depth() > 1` guard in
`apply_policy_block_tombstone` skips `tombstone_policy_account`. So nothing,
not even the async worker, removes the raw objects in that path. A fix for
that guard is in progress separately.

## Fix

- `DELETE /api/archive` (`src/app/api/archive/route.ts`): verifies the session
  with `auth.getUser()` and derives the folder only from
  `getSessionTwitterUsername` (Twitter identity data; app_metadata only for
  non-production mock logins). It removes the folder with the service-role
  client and takes no input.
- `removeArchiveObjects` (`src/lib/upload-archive/removeArchiveObjects.ts`):
  validates the owner (an empty prefix would list the bucket root), lowercases
  it, walks folders and pages, removes in batches of 100, then re-lists and
  throws if anything remains, because `remove()` doesn't report paths it
  skipped.
- `deleteOwnArchiveFiles` (`src/lib/archiveStorageApi.ts`): the one browser
  helper, used by both components in place of the two copies.

The same seeded scenarios through the real route on `next dev`: 401 without a
session, `200 {"removed":3}` for both flows, canary kept.

No schema change or migration.

## Remaining gaps (not in this change)

- The per-archive "Delete" button (`delete_single_archive`) doesn't touch
  storage, so that upload's pinned object remains.
- Objects under a previous handle's folder (after a username change) or under
  a mixed-case legacy folder aren't found, because Storage prefixes are
  case-sensitive. The admin-delete-worker has the same limitation.
- `UploadHomepageSection` isn't imported anywhere. It was switched to the
  shared helper, not deleted.
- `services/admin-delete-worker` keeps its own recursive copy because it's a
  separately deployed package.
