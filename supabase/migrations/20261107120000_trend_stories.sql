-- Trend stories: an AI reading of the homepage's trending terms for one day.
-- The nightly job merges terms that belong to the same story (for example
-- "ea" and "effective altruism"), explains each story, and freezes a small
-- set of evidence tweets so the story page stays stable after the trend moves.
-- Rows are kept indefinitely so days can be browsed and later stitched together.

create table "public"."trend_stories" (
  "id" uuid primary key default gen_random_uuid(),
  -- The UTC day the terms were featured on the homepage (the trend window's
  -- exclusive end; the window covers the seven days before it).
  "trend_date" date not null,
  "slug" text not null check ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("slug") <= 80),
  "position" smallint not null check ("position" between 0 and 20),
  "lane" text not null check ("lane" in ('emerging', 'rising', 'falling')),
  -- Every homepage term this story absorbed; the first is the display term.
  "terms" text[] not null check (cardinality("terms") between 1 and 6),
  "label" text not null check (length("label") between 1 and 60),
  "title" text not null check (length("title") between 4 and 140),
  "tooltip" text not null check (length("tooltip") between 10 and 280),
  "summary" text not null check (length("summary") between 20 and 1200),
  "bullets" jsonb not null default '[]'::jsonb check (jsonb_typeof("bullets") = 'array'),
  -- Frozen PortalTweet snapshots, like digest edition stories.
  "tweets" jsonb not null default '[]'::jsonb check (jsonb_typeof("tweets") = 'array'),
  -- Counts behind the terms at generation time (per-term tweets/authors/change).
  "stats" jsonb not null default '{}'::jsonb check (jsonb_typeof("stats") = 'object'),
  "window_since" date not null,
  "window_until" date not null,
  "model" text,
  "generated_at" timestamptz not null default now(),
  unique ("trend_date", "slug")
);

create index "trend_stories_date_position_idx"
  on "public"."trend_stories" ("trend_date" desc, "position");

alter table "public"."trend_stories" enable row level security;

revoke all privileges on table "public"."trend_stories" from "anon", "authenticated";
grant all privileges on table "public"."trend_stories" to "service_role";
grant select on table "public"."trend_stories" to "anon", "authenticated";

create policy "Trend stories are publicly readable"
  on "public"."trend_stories"
  for select
  to "anon", "authenticated"
  using (true);

-- Opt-out enforcement. Stories freeze tweet snapshots, durable JSON copies
-- outside the normalized-table tombstone triggers (like digest editions).
-- Their input comes from the policy-safe ClickHouse serving tables; when an
-- account is later blocked, tombstone_policy_account deletes every stored
-- story citing it. Same body as 20261016180000 plus that one DELETE.
CREATE OR REPLACE FUNCTION public.tombstone_policy_account(p_account_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '20min'
SET search_path = ''
AS $$
DECLARE
  v_provider_id text;
  v_username text;
  v_archive_upload_ids bigint[];
  v_archive_usernames text[];
  v_archive_username text;
  v_tweet_ids text[];
BEGIN
  IF p_account_id IS NULL OR BTRIM(p_account_id) = '' THEN
    RAISE EXCEPTION 'p_account_id is required';
  END IF;

  SELECT auth.jwt()->'app_metadata'->>'provider_id' INTO v_provider_id;
  IF current_role NOT IN ('postgres', 'service_role')
     AND (v_provider_id IS NULL OR v_provider_id <> p_account_id) THEN
    RAISE EXCEPTION
      'Unauthorized: provider_id % does not match account_id %',
      v_provider_id,
      p_account_id;
  END IF;

  SELECT COALESCE(
    NULLIF(BTRIM(account.username), ''),
    NULLIF(BTRIM(blocked.username), ''),
    NULLIF(BTRIM(consent.username), ''),
    NULLIF(BTRIM(archive.username), '')
  )
  INTO v_username
  FROM (SELECT p_account_id AS account_id) AS identity
  LEFT JOIN public.all_account AS account
    ON account.account_id = identity.account_id
  LEFT JOIN LATERAL (
    SELECT candidate.username
    FROM tes.blocked_scraping_users AS candidate
    WHERE candidate.account_id = identity.account_id
      AND NULLIF(BTRIM(candidate.username), '') IS NOT NULL
    LIMIT 1
  ) AS blocked ON true
  LEFT JOIN LATERAL (
    SELECT candidate.username
    FROM public.optin AS candidate
    WHERE candidate.twitter_user_id = identity.account_id
    ORDER BY candidate.updated_at DESC NULLS LAST
    LIMIT 1
  ) AS consent ON true
  LEFT JOIN LATERAL (
    SELECT candidate.username
    FROM public.archive_upload AS candidate
    WHERE candidate.account_id = identity.account_id
      AND NULLIF(BTRIM(candidate.username), '') IS NOT NULL
    ORDER BY candidate.id DESC
    LIMIT 1
  ) AS archive ON true;

  UPDATE tes.blocked_scraping_users
  SET username = v_username
  WHERE account_id = p_account_id
    AND NULLIF(BTRIM(username), '') IS NULL
    AND NULLIF(BTRIM(v_username), '') IS NOT NULL;

  SELECT COALESCE(array_agg(id), ARRAY[]::bigint[])
  INTO v_archive_upload_ids
  FROM public.archive_upload
  WHERE account_id = p_account_id;

  SELECT COALESCE(
    array_agg(DISTINCT BTRIM(username) ORDER BY BTRIM(username)),
    ARRAY[]::text[]
  )
  INTO v_archive_usernames
  FROM public.archive_upload
  WHERE account_id = p_account_id
    AND NULLIF(BTRIM(username), '') IS NOT NULL;

  SELECT COALESCE(array_agg(tweet_id), ARRAY[]::text[])
  INTO v_tweet_ids
  FROM public.tweets
  WHERE account_id = p_account_id;

  DELETE FROM public.conversations WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.tweet_media WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.user_mentions WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.tweet_urls WHERE tweet_id = ANY(v_tweet_ids);
  -- Delete only relationships authored by the blocked outer tweet. Inbound
  -- allowed quote/retweet relationships keep pointing at the tombstone ID.
  DELETE FROM public.quote_tweets WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM public.retweets WHERE tweet_id = ANY(v_tweet_ids);
  DELETE FROM private.tweet_user WHERE tweet_id = ANY(v_tweet_ids);

  DELETE FROM public.likes
  WHERE account_id = p_account_id
     OR archive_upload_id = ANY(v_archive_upload_ids);
  DELETE FROM public.followers
  WHERE account_id = p_account_id
     OR archive_upload_id = ANY(v_archive_upload_ids);
  DELETE FROM public.following
  WHERE account_id = p_account_id
     OR archive_upload_id = ANY(v_archive_upload_ids);

  -- Remove the account's ClickHouse likes and follows, and tombstone liked
  -- tweet text it authored, once the archive processor drains this request.
  PERFORM private.enqueue_archive_clickhouse_graph_purge(
    'account', p_account_id, NULL, 'policy_tombstone'
  );
  DELETE FROM public.all_profile WHERE account_id = p_account_id;
  DELETE FROM public.profile_settings WHERE account_id = p_account_id;
  DELETE FROM public.profile_curation WHERE account_id = p_account_id;

  -- Legacy temporary rows and digest snapshots are durable JSON copies that
  -- bypass the normalized-table tombstone triggers. Remove or replace the
  -- complete snapshot when it contains any blocked nested author.
  IF to_regclass('private.archived_temporary_data') IS NOT NULL THEN
    EXECUTE
      'DELETE FROM private.archived_temporary_data AS archived '
      'WHERE archived.originator_id = $1 '
      'OR public.policy_json_contains_blocked_author(archived.data)'
    USING p_account_id;
  END IF;

  UPDATE public.digest_editions AS edition
  SET status = 'archived',
      published_at = NULL,
      content = jsonb_build_object(
        'policy_tombstone', true,
        'stable_account_id', p_account_id
      )
  WHERE public.policy_json_contains_blocked_author(edition.content);

  UPDATE public.digest_runs AS run
  SET candidates = '[]'::jsonb,
      model_request = NULL,
      raw_response = NULL,
      parsed_output = NULL,
      events = '[]'::jsonb,
      response_id = NULL,
      error = NULL
  WHERE public.policy_json_contains_blocked_author(
    jsonb_build_array(
      run.candidates,
      run.model_request,
      run.raw_response,
      run.parsed_output
    )
  );

  -- Trend stories freeze tweet snapshots; drop any story that cites the account.
  DELETE FROM public.trend_stories AS story
  WHERE public.policy_json_contains_blocked_author(story.tweets);

  UPDATE public.tweet_media
  SET archive_upload_id = NULL
  WHERE archive_upload_id = ANY(v_archive_upload_ids);
  UPDATE public.all_profile
  SET archive_upload_id = NULL
  WHERE archive_upload_id = ANY(v_archive_upload_ids);
  UPDATE public.tweets
  SET archive_upload_id = NULL
  WHERE archive_upload_id = ANY(v_archive_upload_ids);

  DELETE FROM public.archive_upload WHERE id = ANY(v_archive_upload_ids);
  DELETE FROM ca_autorefresh.account_refresh_log WHERE account_id = p_account_id;

  UPDATE public.tweets
  SET created_at = '1970-01-01 00:00:00+00',
      full_text = '',
      favorite_count = 0,
      retweet_count = 0,
      reply_to_tweet_id = NULL,
      reply_to_user_id = NULL,
      reply_to_username = NULL,
      archive_upload_id = NULL,
      is_tombstone = true
  WHERE account_id = p_account_id;

  -- Never fall back to a full corpus scan inside an opt-out transaction. The
  -- release operator builds these exact-expression indexes concurrently.
  IF v_username ~ '^[A-Za-z0-9_]{1,15}$'
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS candidate
       WHERE candidate.indexrelid = pg_catalog.to_regclass(
         'public.tweets_retweeted_username_lower_idx'
       )
         AND candidate.indisvalid
         AND candidate.indisready
     ) THEN
    UPDATE public.tweets
    SET full_text = ''
    WHERE account_id <> p_account_id
      AND full_text ~ '^RT @[A-Za-z0-9_]{1,15}:'
      AND lower(substring(
        full_text FROM '^RT @([A-Za-z0-9_]{1,15}):'
      )) = lower(v_username);
  END IF;

  UPDATE public.tweets
  SET reply_to_username = NULL
  WHERE account_id <> p_account_id
    AND reply_to_user_id = p_account_id;

  IF NULLIF(BTRIM(v_username), '') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS candidate
       WHERE candidate.indexrelid = pg_catalog.to_regclass(
         'public.tweets_reply_to_username_lower_idx'
       )
         AND candidate.indisvalid
         AND candidate.indisready
     ) THEN
    UPDATE public.tweets
    SET reply_to_username = NULL
    WHERE account_id <> p_account_id
      AND reply_to_username IS NOT NULL
      AND lower(reply_to_username) = lower(v_username);
  END IF;

  INSERT INTO public.all_account (
    account_id,
    created_via,
    username,
    created_at,
    account_display_name,
    num_tweets,
    num_following,
    num_followers,
    num_likes,
    is_tombstone
  ) VALUES (
    p_account_id,
    'policy_tombstone',
    '',
    '1970-01-01 00:00:00+00',
    '',
    0,
    0,
    0,
    0,
    true
  )
  ON CONFLICT (account_id) DO UPDATE
  SET created_via = EXCLUDED.created_via,
      username = EXCLUDED.username,
      created_at = EXCLUDED.created_at,
      account_display_name = EXCLUDED.account_display_name,
      num_tweets = 0,
      num_following = 0,
      num_followers = 0,
      num_likes = 0,
      is_tombstone = true;

  UPDATE public.mentioned_users
  SET name = '', screen_name = '', is_tombstone = true
  WHERE user_id = p_account_id;

  IF NULLIF(BTRIM(v_username), '') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_index AS candidate
       WHERE candidate.indexrelid = pg_catalog.to_regclass(
         'public.mentioned_users_screen_name_lower_idx'
       )
         AND candidate.indisvalid
         AND candidate.indisready
     ) THEN
    UPDATE public.mentioned_users
    SET name = '', screen_name = '', is_tombstone = true
    WHERE screen_name <> ''
      AND lower(screen_name) = lower(v_username);
  END IF;

  -- Never sequential-scan the legacy liked-tweet table from an opt-out
  -- transaction. The release operator creates this index concurrently and
  -- reruns the blocked-account sweep before writers resume.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS candidate
    WHERE candidate.indexrelid = pg_catalog.to_regclass(
      'public.liked_tweets_author_account_id_idx'
    )
      AND candidate.indisvalid
      AND candidate.indisready
  ) THEN
    UPDATE public.liked_tweets
    SET full_text = '', is_tombstone = true
    WHERE author_account_id IS NOT NULL
      AND author_account_id = p_account_id;
  END IF;

  FOREACH v_archive_username IN ARRAY v_archive_usernames LOOP
    PERFORM public.enqueue_policy_archive_cleanup(
      p_account_id,
      v_archive_username,
      'Policy tombstone cleanup'
    );
  END LOOP;
  PERFORM public.enqueue_policy_archive_cleanup(
    p_account_id,
    v_username,
    'Policy tombstone cleanup'
  );
END;
$$;

ALTER FUNCTION public.tombstone_policy_account(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.tombstone_policy_account(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tombstone_policy_account(text)
  TO service_role;
