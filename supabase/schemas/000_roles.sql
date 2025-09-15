-- Local dev role(s) required by GRANT statements in schema
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readclient') THEN
        CREATE ROLE "readclient" NOLOGIN;
    END IF;
END
$$;

