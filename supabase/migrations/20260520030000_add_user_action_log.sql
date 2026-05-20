-- public.user_action_log: append-only event stream for archive uploads, opt-in/out
-- changes, and deletes. Mirrors the declarative schema additions in:
--   supabase/schemas/020_tables.sql, 030_indexes.sql, 060_policies.sql,
--   070_functions.sql, 080_triggers.sql.
-- If you change the declarative schema later, run `supabase db diff -f <name>` to
-- regenerate a migration cleanly; this hand-written one matches the current schemas/*.

CREATE TABLE IF NOT EXISTS "public"."user_action_log" (
    "id"          BIGSERIAL PRIMARY KEY,
    "account_id"  TEXT,
    "user_id"     UUID,
    "action_type" TEXT NOT NULL,
    "metadata"    JSONB,
    "notes"       TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "public"."user_action_log" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS user_action_log_account_id_created_at_idx
  ON public.user_action_log (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_action_log_user_id_created_at_idx
  ON public.user_action_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_action_log_action_type_created_at_idx
  ON public.user_action_log (action_type, created_at DESC);

-- RLS: users can read+append their own actions; service role bypasses RLS.
ALTER TABLE "public"."user_action_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own action log" ON "public"."user_action_log"
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR account_id = ((auth.jwt()->'app_metadata'->>'provider_id')::text)
  );

CREATE POLICY "Users can read own action log" ON "public"."user_action_log"
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR account_id = ((auth.jwt()->'app_metadata'->>'provider_id')::text)
  );

GRANT SELECT, INSERT ON public.user_action_log TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_action_log_id_seq TO authenticated, service_role;

-- Trigger that logs an 'archive_upload' event when an archive_upload row hits the
-- 'completed' phase (either on insert with that phase or on update from another phase).
CREATE OR REPLACE FUNCTION public.log_archive_upload_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.upload_phase = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.upload_phase IS DISTINCT FROM 'completed')
  THEN
    INSERT INTO public.user_action_log (account_id, action_type, metadata)
    VALUES (
      NEW.account_id,
      'archive_upload',
      jsonb_build_object(
        'archive_upload_id', NEW.id,
        'archive_at',        NEW.archive_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.log_archive_upload_event() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_log_archive_upload_event ON public.archive_upload;
CREATE TRIGGER trg_log_archive_upload_event
  AFTER INSERT OR UPDATE OF upload_phase ON public.archive_upload
  FOR EACH ROW EXECUTE FUNCTION public.log_archive_upload_event();
