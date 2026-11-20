-- Keyword search alerts and a generic notifications inbox.
--
-- A search alert is a saved archive search. An hourly cron asks the ClickHouse
-- gateway for the newest matches of the last seven days and records each
-- tweet once per alert, so tweets that reach the archive hours or days after
-- they were posted are still reported. It keeps one unread notification per
-- alert up to date. A daily cron emails one roll-up per user for alerts with
-- email turned on.
--
-- Every table is service-role only: the API routes verify the session and
-- scope each read and write to the signed-in user.

CREATE TABLE IF NOT EXISTS "public"."search_alerts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "query" text NOT NULL,
    "mode" text NOT NULL DEFAULT 'all',
    "from_user" text,
    "email_enabled" boolean NOT NULL DEFAULT false,
    -- Last successful check; the cron checks the stalest alerts first. Which
    -- tweets are new is decided by search_alert_matches, not by this time.
    "last_checked_at" timestamptz NOT NULL DEFAULT now(),
    "last_seen_tweet_id" text,
    "last_error" text,
    "last_error_at" timestamptz,
    -- Also the history floor: tweets created before the alert are never
    -- reported, so a new alert does not flood with old matches.
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    "deleted_at" timestamptz,
    CONSTRAINT "search_alerts_query_length" CHECK (char_length(btrim("query")) BETWEEN 1 AND 200),
    CONSTRAINT "search_alerts_mode_check" CHECK ("mode" IN ('phrase', 'all')),
    CONSTRAINT "search_alerts_from_user_format" CHECK ("from_user" IS NULL OR "from_user" ~ '^[a-z0-9_]{1,15}$'),
    CONSTRAINT "search_alerts_seen_tweet_format" CHECK ("last_seen_tweet_id" IS NULL OR "last_seen_tweet_id" ~ '^[0-9]{1,20}$')
);
ALTER TABLE "public"."search_alerts" OWNER TO "postgres";
COMMENT ON TABLE "public"."search_alerts" IS 'Saved keyword searches checked hourly for new matching tweets. Service-role only; at most 10 live alerts per user.';

-- Generic in-site notifications. kind names the producer; payload is that
-- producer's JSON. search_alert rows hold {count, tweetIds, firstMatchedAt,
-- latestAt}: firstMatchedAt is when the first match of the unread batch was
-- recorded (not a tweet creation boundary). At most one unread row per alert.
CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "kind" text NOT NULL,
    "alert_id" uuid REFERENCES "public"."search_alerts"("id") ON DELETE CASCADE,
    "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    "read_at" timestamptz,
    CONSTRAINT "notifications_kind_check" CHECK ("kind" IN ('search_alert')),
    CONSTRAINT "notifications_payload_object" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "notifications_search_alert_has_alert" CHECK ("kind" <> 'search_alert' OR "alert_id" IS NOT NULL)
);
ALTER TABLE "public"."notifications" OWNER TO "postgres";

-- One row per daily roll-up email. Claiming a user's unsent matches inserts
-- the row and stamps the matches with it in one transaction, so concurrent or
-- repeated runs never send the same matches twice. A failed send deletes the
-- row, which releases its matches for the next run.
CREATE TABLE IF NOT EXISTS "public"."search_alert_email_sends" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "status" text NOT NULL DEFAULT 'sending',
    "message_id" text,
    -- Sole credential of the email's one-click unsubscribe link.
    "unsubscribe_token" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "sent_at" timestamptz,
    CONSTRAINT "search_alert_email_sends_status_check" CHECK ("status" IN ('sending', 'sent'))
);
ALTER TABLE "public"."search_alert_email_sends" OWNER TO "postgres";

-- Every tweet ever reported for an alert, one row per (alert, tweet). The
-- unique key is what makes a tweet "new": the cron inserts what it sees and
-- counts only the rows actually inserted. The matches page and the roll-up
-- email read it; email_send_id marks a row as emailed.
CREATE TABLE IF NOT EXISTS "public"."search_alert_matches" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "alert_id" uuid NOT NULL REFERENCES "public"."search_alerts"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "tweet_id" text NOT NULL,
    "reply_to_tweet_id" text,
    "tweet_created_at" timestamptz NOT NULL,
    "email_send_id" uuid REFERENCES "public"."search_alert_email_sends"("id") ON DELETE SET NULL,
    -- When the cron first saw the tweet.
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "search_alert_matches_alert_tweet_key" UNIQUE ("alert_id", "tweet_id"),
    CONSTRAINT "search_alert_matches_tweet_format" CHECK ("tweet_id" ~ '^[0-9]{1,20}$'),
    CONSTRAINT "search_alert_matches_reply_format" CHECK ("reply_to_tweet_id" IS NULL OR "reply_to_tweet_id" ~ '^[0-9]{1,20}$')
);
ALTER TABLE "public"."search_alert_matches" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "search_alerts_user_live_idx"
  ON "public"."search_alerts" ("user_id", "created_at")
  WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "search_alerts_live_checked_idx"
  ON "public"."search_alerts" ("last_checked_at")
  WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "search_alerts_user_search_key"
  ON "public"."search_alerts" ("user_id", lower("query"), "mode", coalesce("from_user", ''))
  WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_one_unread_per_alert"
  ON "public"."notifications" ("alert_id")
  WHERE "read_at" IS NULL;
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx"
  ON "public"."notifications" ("user_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "search_alert_matches_alert_idx"
  ON "public"."search_alert_matches" ("alert_id", "created_at");
CREATE INDEX IF NOT EXISTS "search_alert_matches_unsent_idx"
  ON "public"."search_alert_matches" ("user_id", "created_at")
  WHERE "email_send_id" IS NULL;
CREATE INDEX IF NOT EXISTS "search_alert_matches_send_idx"
  ON "public"."search_alert_matches" ("email_send_id")
  WHERE "email_send_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "search_alert_email_sends_user_idx"
  ON "public"."search_alert_email_sends" ("user_id", "created_at");

ALTER TABLE "public"."search_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."search_alert_matches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."search_alert_email_sends" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "public"."search_alerts" FROM "anon", "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."notifications" FROM "anon", "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."search_alert_matches" FROM "anon", "authenticated";
REVOKE ALL PRIVILEGES ON TABLE "public"."search_alert_email_sends" FROM "anon", "authenticated";
GRANT ALL PRIVILEGES ON TABLE "public"."search_alerts" TO "service_role";
GRANT ALL PRIVILEGES ON TABLE "public"."notifications" TO "service_role";
GRANT ALL PRIVILEGES ON TABLE "public"."search_alert_matches" TO "service_role";
GRANT ALL PRIVILEGES ON TABLE "public"."search_alert_email_sends" TO "service_role";

-- At most 10 live alerts per user. The per-user advisory lock makes the count
-- and the insert one step, so parallel creates cannot overshoot.
CREATE OR REPLACE FUNCTION "public"."enforce_search_alert_cap"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('search_alerts:' || NEW.user_id::text, 0));
  IF (
    SELECT count(*) FROM public.search_alerts
    WHERE user_id = NEW.user_id AND deleted_at IS NULL
      AND id IS DISTINCT FROM NEW.id
  ) >= 10 THEN
    RAISE EXCEPTION 'search alert limit reached' USING ERRCODE = 'P0001', HINT = 'search_alert_cap';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."enforce_search_alert_cap"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."enforce_search_alert_cap"() FROM PUBLIC, "anon", "authenticated";

-- Records one successful check of one alert in a single transaction: inserts
-- the tweets not yet recorded for it (never ones created before the alert),
-- folds the newly inserted ones into the alert's unread notification, and
-- stamps the check. p_tweets is [{id, replyToId, createdAt}]. Overlapping
-- runs are harmless: the (alert_id, tweet_id) key lets each tweet in once.
-- Returns how many tweets were new, or -1 when the alert no longer exists.
CREATE OR REPLACE FUNCTION "public"."record_search_alert_check"(
  "p_alert_id" uuid,
  "p_checked_at" timestamptz,
  "p_tweets" jsonb
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_alert public.search_alerts%ROWTYPE;
  v_inserted integer;
  v_new_ids jsonb;
BEGIN
  SELECT * INTO v_alert
  FROM public.search_alerts
  WHERE id = p_alert_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  WITH incoming AS (
    SELECT t.value ->> 'id' AS tweet_id,
           nullif(t.value ->> 'replyToId', '') AS reply_to_tweet_id,
           (t.value ->> 'createdAt')::timestamptz AS tweet_created_at
    FROM jsonb_array_elements(coalesce(p_tweets, '[]'::jsonb)) AS t(value)
  ),
  inserted AS (
    INSERT INTO public.search_alert_matches
      (alert_id, user_id, tweet_id, reply_to_tweet_id, tweet_created_at)
    SELECT v_alert.id, v_alert.user_id, i.tweet_id, i.reply_to_tweet_id, i.tweet_created_at
    FROM incoming i
    WHERE i.tweet_created_at >= v_alert.created_at
    ON CONFLICT ("alert_id", "tweet_id") DO NOTHING
    RETURNING tweet_id, tweet_created_at
  )
  SELECT count(*)::integer,
         coalesce(
           (SELECT jsonb_agg(n.tweet_id ORDER BY n.tweet_created_at DESC, n.tweet_id DESC)
            FROM (SELECT * FROM inserted ORDER BY tweet_created_at DESC, tweet_id DESC LIMIT 5) n),
           '[]'::jsonb)
  INTO v_inserted, v_new_ids
  FROM inserted;

  UPDATE public.search_alerts
  SET last_checked_at = greatest(last_checked_at, p_checked_at),
      last_seen_tweet_id = coalesce(v_new_ids ->> 0, last_seen_tweet_id),
      last_error = NULL,
      last_error_at = NULL
  WHERE id = v_alert.id;

  IF v_inserted = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notifications (user_id, kind, alert_id, payload)
  VALUES (
    v_alert.user_id,
    'search_alert',
    v_alert.id,
    jsonb_build_object(
      'count', v_inserted,
      'tweetIds', v_new_ids,
      'firstMatchedAt', now(),
      'latestAt', p_checked_at
    )
  )
  ON CONFLICT ("alert_id") WHERE "read_at" IS NULL DO UPDATE
  SET payload = jsonb_build_object(
        'count', coalesce((public.notifications.payload ->> 'count')::integer, 0) + v_inserted,
        'tweetIds', (
          SELECT coalesce(jsonb_agg(ids.value ORDER BY ids.ordinality), '[]'::jsonb)
          FROM jsonb_array_elements(
            v_new_ids || coalesce(public.notifications.payload -> 'tweetIds', '[]'::jsonb)
          ) WITH ORDINALITY AS ids(value, ordinality)
          WHERE ids.ordinality <= 5
        ),
        'firstMatchedAt', coalesce(public.notifications.payload -> 'firstMatchedAt', to_jsonb(now())),
        'latestAt', p_checked_at
      ),
      updated_at = now();
  RETURN v_inserted;
END;
$$;
ALTER FUNCTION "public"."record_search_alert_check"(uuid, timestamptz, jsonb) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."record_search_alert_check"(uuid, timestamptz, jsonb) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."record_search_alert_check"(uuid, timestamptz, jsonb) TO "service_role";

-- Claims one user's unsent matches on email-enabled live alerts from the last
-- p_max_age for a roll-up email. Returns the send id, or NULL when there is
-- nothing new (no row is left behind).
CREATE OR REPLACE FUNCTION "public"."claim_search_alert_email"(
  "p_user_id" uuid,
  "p_max_age" interval DEFAULT interval '7 days'
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_send_id uuid;
  v_claimed integer;
BEGIN
  INSERT INTO public.search_alert_email_sends (user_id)
  VALUES (p_user_id)
  RETURNING id INTO v_send_id;

  UPDATE public.search_alert_matches m
  SET email_send_id = v_send_id
  FROM public.search_alerts a
  WHERE m.alert_id = a.id
    AND m.user_id = p_user_id
    AND m.email_send_id IS NULL
    AND m.created_at > now() - p_max_age
    AND a.deleted_at IS NULL
    AND a.email_enabled;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  IF v_claimed = 0 THEN
    DELETE FROM public.search_alert_email_sends WHERE id = v_send_id;
    RETURN NULL;
  END IF;
  RETURN v_send_id;
END;
$$;
ALTER FUNCTION "public"."claim_search_alert_email"(uuid, interval) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."claim_search_alert_email"(uuid, interval) FROM PUBLIC, "anon", "authenticated";
GRANT EXECUTE ON FUNCTION "public"."claim_search_alert_email"(uuid, interval) TO "service_role";

DROP TRIGGER IF EXISTS "search_alerts_enforce_cap" ON "public"."search_alerts";
CREATE TRIGGER "search_alerts_enforce_cap"
  BEFORE INSERT ON "public"."search_alerts"
  FOR EACH ROW EXECUTE FUNCTION "public"."enforce_search_alert_cap"();
