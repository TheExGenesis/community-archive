CREATE SCHEMA IF NOT EXISTS "ca_website";
ALTER SCHEMA "ca_website" OWNER TO "postgres";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE SCHEMA IF NOT EXISTS "private";
ALTER SCHEMA "private" OWNER TO "postgres";

CREATE SCHEMA IF NOT EXISTS "temp";
ALTER SCHEMA "temp" OWNER TO "postgres";

CREATE SCHEMA IF NOT EXISTS "tes";
ALTER SCHEMA "tes" OWNER TO "postgres";
