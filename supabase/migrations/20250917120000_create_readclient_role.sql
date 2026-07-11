-- Supabase preview branches replay migrations without running supabase/roles.sql
-- or the declarative schema files. Ensure this non-login group role exists before
-- later migrations grant table privileges to it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'readclient'
  ) THEN
    CREATE ROLE "readclient" NOLOGIN;
  END IF;
END
$$;
