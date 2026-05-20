-- Create the ca_autorefresh schema + account_refresh_log table referenced by
-- public.delete_user_archive (added via 070_functions.sql). Without this, fresh
-- databases that haven't been touched by the legacy autorefresh worker error with
-- 'relation "ca_autorefresh.account_refresh_log" does not exist' partway through
-- delete_user_archive. The schemas/* declaration was added separately but never
-- generated a migration.

CREATE SCHEMA IF NOT EXISTS "ca_autorefresh";
ALTER SCHEMA "ca_autorefresh" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "ca_autorefresh"."account_refresh_log" (
    "account_id" "text" NOT NULL
);
ALTER TABLE "ca_autorefresh"."account_refresh_log" OWNER TO "postgres";
