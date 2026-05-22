-- Create the private "admin-deleted-user-data" storage bucket.
--
-- The admin dashboard's "Opt out and delete data" action copies a user's
-- archive files + dumps their tweets table to this bucket before calling
-- delete_user_archive — so there's a recovery path if the destructive
-- step fails or was clicked by mistake.
--
-- Bucket is NOT public. Only service_role has read/write (Supabase's
-- default for storage.objects when no policy is added). The export
-- action uses createServerServiceRoleClient(), so it bypasses any
-- per-user policy.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'admin-deleted-user-data',
  'admin-deleted-user-data',
  false,
  NULL  -- inherits the project-wide cap
)
ON CONFLICT (id) DO NOTHING;
