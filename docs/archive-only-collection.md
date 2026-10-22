# Archive-only collection

“Archive only” preserves an uploaded archive and membership while suppressing
new automatic observations from autorefresh and browser-extension ingestion.
It does not track deletions on X or remove already archived tweets. A fetch or
write already in progress may finish.

## Data and owner controls

`public.account_collection_preferences` is keyed by verified X account ID.
A missing row preserves legacy behavior. A false `enabled` value is an independent
collection restriction, never an explicit opt-out or administrator block.
Do not feed it into `policy_account_is_blocked`, the scrape blocklist, or deletion
triggers: those deliberately remove content and reject archive uploads.

The authenticated API derives ownership from provider identity/app metadata,
checks the requested account, and writes through the service-role client. The
table denies direct anonymous/authenticated reads and writes. No new public
view or membership projection is required.

Upload confirmation loads the saved preference. With no preference, existing
uploaders/opt-ins retain collection and new contributors default to archive only.
Saving the preference must succeed before upload starts; a failed upload leaves
the successfully saved preference in effect. Reuploads do not silently reenable
collection. Settings exposes the same independent preference. Full opt-out and
administrator blocks continue to take precedence.

## Coordinated rollout (requires separate production approval)

1. Apply migration `20261022013936_archive_only_collection` and verify its grants.
2. Deploy the companion firehose change to every intake/worker/replay/canonical
   consumer and the companion autorefresh change to every scheduler and writer.
   Both fail closed if the new table is absent. Keep the UI flag disabled.
3. Verify an isolated staging account: save off, upload and read its archive,
   attempt a direct/nested extension observation and an autorefresh run, replay a
   queued observation, and check that no new content or deletion records appear.
   Verify reenable, reupload, legacy behavior and full opt-out precedence.
4. Set `NEXT_PUBLIC_ARCHIVE_ONLY_COLLECTION_ENABLED=true` and rebuild the website.
   This gates both the UI and preference API; never enable it ahead of enforcement.

After users have saved off, hiding the UI alone is not a safe ingestion rollback.
Keep honoring stored preferences or pause automated collection. Do not delete
preferences, convert them into full opt-outs, or roll workers back to versions
that ignore them.

Local verification covers authenticated API behavior, upload ordering/failure,
settings controls, database grants and upserts, nested/queued observation filtering,
and canonical source distinctions. A production rollout still needs the staging
acceptance check above against the versions actually deployed.
