-- Explicit, owner-controlled archive completion email notifications.
-- Auth remains authoritative for recipient identity; clients cannot supply an email.

CREATE TABLE public.archive_completion_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL UNIQUE CHECK (account_id ~ '^[0-9]{1,20}$'),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.archive_completion_notification_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  archive_upload_id bigint NOT NULL UNIQUE
    REFERENCES public.archive_upload(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL CHECK (account_id ~ '^[0-9]{1,20}$'),
  recipient_email text NOT NULL CHECK (char_length(recipient_email) BETWEEN 3 AND 320),
  archive_username text,
  archive_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'retry', 'sent', 'dead', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX archive_completion_notification_outbox_ready_idx
  ON public.archive_completion_notification_outbox (available_at, id)
  WHERE status IN ('queued', 'retry');

CREATE INDEX archive_completion_notification_outbox_status_created_idx
  ON public.archive_completion_notification_outbox (status, created_at);

ALTER TABLE public.archive_completion_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_completion_notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read archive completion notification preference"
  ON public.archive_completion_notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL PRIVILEGES ON TABLE public.archive_completion_notification_preferences
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.archive_completion_notification_outbox
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE public.archive_completion_notification_outbox_id_seq
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.archive_completion_notification_preferences TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.archive_completion_notification_preferences TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.archive_completion_notification_outbox TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.archive_completion_notification_outbox_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.set_archive_completion_notification(p_enabled boolean)
RETURNS TABLE(enabled boolean, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_account_id text;
  v_email text;
  v_email_confirmed_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT
    NULLIF(BTRIM(u.raw_app_meta_data->>'provider_id'), ''),
    NULLIF(BTRIM(LOWER(u.email)), ''),
    u.email_confirmed_at
  INTO v_account_id, v_email, v_email_confirmed_at
  FROM auth.users AS u
  WHERE u.id = v_user_id;

  -- Disabling must remain possible even if an identity later loses its email or
  -- provider metadata. Do not create a preference row for a never-opted-in user.
  IF NOT p_enabled THEN
    UPDATE public.archive_completion_notification_preferences
    SET enabled = false, updated_at = now()
    WHERE user_id = v_user_id;

    UPDATE public.archive_completion_notification_outbox
    SET status = 'cancelled',
        locked_at = NULL,
        updated_at = now(),
        last_error = 'Cancelled after the owner disabled notifications'
    WHERE user_id = v_user_id
      AND status IN ('queued', 'retry');

    RETURN QUERY SELECT false, v_email;
    RETURN;
  END IF;

  IF v_account_id IS NULL OR v_account_id !~ '^[0-9]{1,20}$' THEN
    RAISE EXCEPTION 'A verified X account is required' USING ERRCODE = '22023';
  END IF;

  IF v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'A confirmed email address is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.archive_completion_notification_preferences (
    user_id, account_id, email, enabled, updated_at
  )
  VALUES (v_user_id, v_account_id, v_email, true, now())
  ON CONFLICT (user_id) DO UPDATE
  SET account_id = EXCLUDED.account_id,
      email = EXCLUDED.email,
      enabled = true,
      updated_at = now();

  RETURN QUERY SELECT true, v_email;
END;
$$;
ALTER FUNCTION public.set_archive_completion_notification(boolean) OWNER TO postgres;

CREATE OR REPLACE FUNCTION private.queue_archive_completion_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_preference public.archive_completion_notification_preferences%ROWTYPE;
BEGIN
  IF NEW.upload_phase = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.upload_phase IS DISTINCT FROM 'completed')
  THEN
    SELECT * INTO v_preference
    FROM public.archive_completion_notification_preferences
    WHERE account_id = NEW.account_id
      AND enabled IS TRUE;

    IF FOUND THEN
      INSERT INTO public.archive_completion_notification_outbox (
        archive_upload_id,
        user_id,
        account_id,
        recipient_email,
        archive_username,
        archive_at
      ) VALUES (
        NEW.id,
        v_preference.user_id,
        NEW.account_id,
        v_preference.email,
        NEW.username,
        NEW.archive_at
      ) ON CONFLICT (archive_upload_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION private.queue_archive_completion_notification() OWNER TO postgres;

CREATE TRIGGER queue_archive_completion_notification
  AFTER INSERT OR UPDATE OF upload_phase ON public.archive_upload
  FOR EACH ROW EXECUTE FUNCTION private.queue_archive_completion_notification();

CREATE OR REPLACE FUNCTION public.claim_archive_completion_notifications(p_limit integer DEFAULT 20)
RETURNS TABLE(
  id bigint,
  recipient_email text,
  account_id text,
  archive_username text,
  archive_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  UPDATE public.archive_completion_notification_outbox AS stale
  SET status = 'retry',
      available_at = now(),
      locked_at = NULL,
      updated_at = now(),
      last_error = COALESCE(stale.last_error, 'Recovered an abandoned delivery claim')
  WHERE stale.status = 'processing'
    AND stale.locked_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH ready AS (
    SELECT candidate.id
    FROM public.archive_completion_notification_outbox AS candidate
    WHERE candidate.status IN ('queued', 'retry')
      AND candidate.available_at <= now()
    ORDER BY candidate.available_at, candidate.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.archive_completion_notification_outbox AS claimed
  SET status = 'processing',
      attempt_count = claimed.attempt_count + 1,
      locked_at = now(),
      updated_at = now()
  FROM ready
  WHERE claimed.id = ready.id
  RETURNING
    claimed.id,
    claimed.recipient_email,
    claimed.account_id,
    claimed.archive_username,
    claimed.archive_at;
END;
$$;
ALTER FUNCTION public.claim_archive_completion_notifications(integer) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.finish_archive_completion_notification(
  p_id bigint,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_error IS NULL THEN
    UPDATE public.archive_completion_notification_outbox
    SET status = 'sent',
        sent_at = now(),
        locked_at = NULL,
        provider_message_id = NULLIF(BTRIM(p_provider_message_id), ''),
        last_error = NULL,
        updated_at = now()
    WHERE id = p_id AND status = 'processing';
  ELSE
    UPDATE public.archive_completion_notification_outbox
    SET status = CASE WHEN attempt_count >= 5 THEN 'dead' ELSE 'retry' END,
        available_at = now() + CASE attempt_count
          WHEN 1 THEN interval '1 minute'
          WHEN 2 THEN interval '5 minutes'
          WHEN 3 THEN interval '30 minutes'
          WHEN 4 THEN interval '2 hours'
          ELSE interval '6 hours'
        END,
        locked_at = NULL,
        last_error = LEFT(p_error, 2000),
        updated_at = now()
    WHERE id = p_id AND status = 'processing';
  END IF;
END;
$$;
ALTER FUNCTION public.finish_archive_completion_notification(bigint, text, text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.community_archive_monitoring_completion_notifications()
RETURNS TABLE(
  ready_count bigint,
  processing_count bigint,
  dead_24h_count bigint,
  oldest_ready_seconds double precision,
  seconds_since_last_sent double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status IN ('queued', 'retry') AND available_at <= now()),
    COUNT(*) FILTER (WHERE status = 'processing'),
    COUNT(*) FILTER (WHERE status = 'dead' AND updated_at >= now() - interval '24 hours'),
    EXTRACT(EPOCH FROM now() - MIN(created_at) FILTER (WHERE status IN ('queued', 'retry'))),
    EXTRACT(EPOCH FROM now() - MAX(sent_at) FILTER (WHERE status = 'sent'))
  FROM public.archive_completion_notification_outbox;
$$;
ALTER FUNCTION public.community_archive_monitoring_completion_notifications() OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.set_archive_completion_notification(boolean)
  FROM PUBLIC, anon, service_role;
REVOKE EXECUTE ON FUNCTION private.queue_archive_completion_notification()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_archive_completion_notifications(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_archive_completion_notification(bigint, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.community_archive_monitoring_completion_notifications()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_archive_completion_notification(boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_archive_completion_notifications(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_archive_completion_notification(bigint, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.community_archive_monitoring_completion_notifications()
  TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'community_archive_metrics') THEN
    GRANT EXECUTE ON FUNCTION public.community_archive_monitoring_completion_notifications()
      TO community_archive_metrics;
  END IF;
END
$$;
