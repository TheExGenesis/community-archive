# The per-archive "Delete" button left the raw archive file in Storage

2026-10-16. Verified on a disposable local Supabase stack (`singledel`, ports
559xx) built from main's migrations, with `next dev` pointed at it. Production
was not touched.

## Before

`handleDeleteArchive` called `delete_single_archive` from the browser. The RPC
deletes the `archive_upload` row and its data, but nothing removed the object.
The row is the only record of a pinned upload's
`<owner>/<uuid>/archive.json` path, so once it was gone the object was
orphaned. Control run: RPC only, row gone, object still present.

## Change

- `DELETE /api/archive-uploads/[id]`
  (`src/app/api/archive-uploads/[id]/route.ts`) runs these steps in order:
  1. Verify the session with `auth.getUser()`.
  2. Take the folder from `getSessionTwitterUsername`, never from
     `user_metadata`.
  3. Read the row for (`id`, `app_metadata.provider_id`) with the service
     role.
  4. Run `delete_single_archive` as the user, so its own JWT check still
     applies.
  5. Remove the object with the service role.

  It isn't under `/api/archive/` because a static segment there would shadow
  `/api/archive/[username]` for a user whose handle is that segment's name.
- `removeArchiveUploadObject`
  (`src/lib/upload-archive/removeArchiveUploadObject.ts`):
  - Resolves the path with `archiveStoragePath(sessionUsername, row)`, which
    throws unless a pinned path is under `<sessionUsername>/`. Such a row
    returns `outside_owner` and Storage isn't touched.
  - Keeps the object (`referenced`) when a remaining row still resolves to
    it. For a pinned path, that's a row with the same `storage_path`. For the
    legacy `<owner>/archive.json`, it's a null-path row for this account, for
    any `all_account` holding the handle, or with `archive_upload.username`
    equal to the handle. `_` is escaped in the ILIKE, which was checked
    against PostgREST.
  - After `remove()`, re-lists the folder and throws if the object is still
    there.
- `deleteArchiveUpload` (`src/lib/archiveUploadApi.ts`) is the browser
  caller. `deleteSingleArchive` was removed from `db_insert.ts` because
  nothing else used it.
- If the data is deleted but the file isn't, the route returns 500 with
  `archiveDeleted: true`, and the UI shows the error and refreshes the list.

No schema change or migration.

## Measured on the disposable stack

| Scenario | Response | Storage afterwards |
| --- | --- | --- |
| No session | 401 | unchanged |
| Bad id `abc` | 400 | unchanged |
| Owner targets the canary's upload id | 404 | canary kept |
| Owner deletes pinned upload 1 | 200 `removed` | only `deltestowner/<u1>/archive.json` gone |
| Owner deletes legacy row A (legacy row B remains) | 200 `referenced` | `deltestowner/archive.json` kept |
| Owner deletes legacy row B | 200 `removed` | `deltestowner/archive.json` gone |
| Owner deletes an own row whose path is in the canary's folder | 200 `outside_owner` | canary kept |
| Opted-out owner (`optin.explicit_optout`), own session `remove()` | RLS error | kept |
| Same opted-out owner through the route | 200 `removed` | gone |

Every test user also had `user_metadata` claiming the canary's handle and id.
That claim was ignored.

## Testing notes

- A service-role `DELETE` on `archive_upload` through PostgREST fails, so test
  cleanup has to run as `postgres`. The identity sequence also starts behind
  the seed's max id, so call `setval` before inserting fixtures.
- The middleware blocks short or bot User-Agents. Scripted calls to API routes
  need a browser UA.

## Remaining gaps

- A pinned object under a previous handle's folder is kept (`outside_owner`)
  and logged, the same limitation as the delete-all route.
