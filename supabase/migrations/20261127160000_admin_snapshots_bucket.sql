-- Create the private "admin-snapshots" storage bucket.
--
-- Operational snapshots for admin-only pages. The first is
-- backfill-progress/latest.json: per-member tweet crawl progress, written
-- every 30 minutes by ca-backfill-progress-snapshot on ca-autorefresh with the
-- service role and read by /admin/backfill after the admin check. Consent is
-- applied when the snapshot is built (no opted-out account is in it).
--
-- Bucket is NOT public and has no storage.objects policy, so only the
-- service role can read or write it. JSON only, at most 20 MB per object.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-snapshots',
  'admin-snapshots',
  false,
  20971520,
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;
