-- Global roles seeded before migrations on local resets.
-- Keep this file minimal and idempotent; it is not synced to remote.

-- Ensure the group role used by GRANTs exists locally
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readclient') THEN
    CREATE ROLE "readclient" NOLOGIN;
  END IF;
END
$$;

