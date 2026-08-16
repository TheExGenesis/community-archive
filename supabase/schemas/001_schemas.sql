CREATE SCHEMA IF NOT EXISTS "ca_website";
ALTER SCHEMA "ca_website" OWNER TO "postgres";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE SCHEMA IF NOT EXISTS "private";
ALTER SCHEMA "private" OWNER TO "postgres";

CREATE SCHEMA IF NOT EXISTS "temp";
ALTER SCHEMA "temp" OWNER TO "postgres";
-- Legacy archive staging is retired. The empty schema remains only because the
-- local/hosted Data API configuration still names it.
REVOKE ALL PRIVILEGES ON SCHEMA "temp"
  FROM PUBLIC, "anon", "authenticated", "readclient", "service_role";

CREATE SCHEMA IF NOT EXISTS "tes";
ALTER SCHEMA "tes" OWNER TO "postgres";

CREATE SCHEMA IF NOT EXISTS "ca_autorefresh";
ALTER SCHEMA "ca_autorefresh" OWNER TO "postgres";
