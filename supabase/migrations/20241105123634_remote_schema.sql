set check_function_bodies = off;
CREATE OR REPLACE FUNCTION private.get_tweets_in_user_conversations(username_ text)
 RETURNS TABLE(conversation_id text, tweet_id text, created_at timestamp with time zone, full_text text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT c.conversation_id, 
           t.tweet_id, 
           t.created_at, 
           t.full_text
    FROM tweets t
    JOIN conversations c ON t.tweet_id = c.tweet_id
    WHERE c.conversation_id IN (
        SELECT c.conversation_id
        FROM tweets t
        JOIN account a ON t.account_id = a.account_id
        JOIN conversations c ON t.tweet_id = c.tweet_id
        WHERE a.username = username_
    );
END;
$function$;
CREATE OR REPLACE FUNCTION private.get_user_conversations(username_ text)
 RETURNS TABLE(conversation_id text, tweet_id text, created_at timestamp with time zone, full_text text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT c.conversation_id, 
           t.tweet_id, 
           t.created_at, 
           t.full_text
    FROM tweets t
    JOIN account a ON t.account_id = a.account_id
    JOIN conversations c ON t.tweet_id = c.tweet_id
    WHERE a.username = username_;
END;
$function$;
CREATE OR REPLACE FUNCTION private.process_jobs()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
v_job RECORD;
BEGIN
RAISE NOTICE 'Starting process_jobs';

-- Check for a job
SELECT * INTO v_job
FROM private.job_queue
WHERE status = 'QUEUED'
ORDER BY timestamp
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- If no job, exit
IF NOT FOUND THEN
    RAISE NOTICE 'No jobs found, exiting';
    RETURN;
END IF;

RAISE NOTICE 'Processing job: %', v_job.key;

-- Update job status to PROCESSING
UPDATE private.job_queue
SET status = 'PROCESSING'
WHERE key = v_job.key;

-- Do the job
IF v_job.key = 'refresh_activity_summary' THEN
    RAISE NOTICE 'Refreshing materialized views';
    REFRESH MATERIALIZED VIEW public.global_activity_summary;
    REFRESH MATERIALIZED VIEW public.account_activity_summary;
END IF;


IF v_job.key = 'update_conversation_ids' THEN
    RAISE NOTICE 'Updating conversation ids';
    PERFORM private.post_upload_update_conversation_ids();
END IF;

-- Delete the job
DELETE FROM private.job_queue WHERE key = v_job.key;
RAISE NOTICE 'Job completed and removed from queue: %', v_job.key;

END;
$function$;
CREATE INDEX idx_conversation_id ON public.conversations USING btree (conversation_id);
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.get_monthly_tweet_counts()
 RETURNS TABLE(month timestamp with time zone, tweet_count bigint)
 LANGUAGE plpgsql
 SET statement_timeout TO '5min'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        DATE_TRUNC('month', created_at) AS month,
        COUNT(tweet_id) AS tweet_count
    FROM 
        public.tweets
    GROUP BY 
        month
    ORDER BY 
        month;
END;
$function$;
CREATE OR REPLACE FUNCTION public.pg_search_tweets(search_query text, p_account_id text DEFAULT NULL::text)
 RETURNS TABLE(tweet_id text, account_id text, created_at timestamp with time zone, full_text text, retweet_count integer, favorite_count integer, username text, account_display_name text, avatar_media_url text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        t.tweet_id, 
        t.account_id, 
        t.created_at, 
        t.full_text, 
        t.retweet_count, 
        t.favorite_count, 
        a.username, 
        a.account_display_name, 
        p.avatar_media_url
    FROM 
        public.tweets t
    INNER JOIN 
        public.account a ON t.account_id = a.account_id
    LEFT JOIN 
        public.profile p ON a.account_id = p.account_id
    WHERE 
        to_tsvector('english', t.full_text) @@ to_tsquery('english', '''' || replace(search_query, '''', '''''') || '''')
        OR t.full_text ILIKE '%' || search_query || '%'
    ORDER BY 
        t.created_at DESC
    LIMIT 100;
END; 
$function$;
CREATE OR REPLACE FUNCTION public.search_tweets(search_query text, from_user text DEFAULT NULL::text, to_user text DEFAULT NULL::text, since_date date DEFAULT NULL::date, until_date date DEFAULT NULL::date, limit_ integer DEFAULT 50)
 RETURNS TABLE(tweet_id text, account_id text, created_at timestamp with time zone, full_text text, retweet_count integer, favorite_count integer, reply_to_tweet_id text, avatar_media_url text, archive_upload_id bigint, username text, account_display_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '5min'
AS $function$
DECLARE
  from_account_id TEXT;
  to_account_id TEXT;
BEGIN
  -- Get account_id for from_user
  IF from_user IS NOT NULL THEN
    SELECT a.account_id INTO from_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(from_user);
    
    -- Return empty if from_user not found
    IF from_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Get account_id for to_user
  IF to_user IS NOT NULL THEN
    SELECT a.account_id INTO to_account_id
    FROM account as a
    WHERE LOWER(a.username) = LOWER(to_user);
    
    -- Return empty if to_user not found
    IF to_account_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH matching_tweets AS (
    SELECT t.tweet_id
    FROM tweets t
    WHERE (search_query = '' OR t.fts @@ to_tsquery('english', search_query))
      AND (from_account_id IS NULL OR t.account_id = from_account_id)
      AND (to_account_id IS NULL OR t.reply_to_user_id = to_account_id)
      AND (since_date IS NULL OR t.created_at >= since_date)
      AND (until_date IS NULL OR t.created_at <= until_date)
    ORDER BY t.created_at DESC
    LIMIT limit_
  )
  SELECT 
    t.tweet_id, 
    t.account_id, 
    t.created_at, 
    t.full_text, 
    t.retweet_count, 
    t.favorite_count,
    t.reply_to_tweet_id,
    p.avatar_media_url,
    p.archive_upload_id,
    a.username,
    a.account_display_name
  FROM matching_tweets mt
  JOIN tweets t ON mt.tweet_id = t.tweet_id
  JOIN account a ON t.account_id = a.account_id
  LEFT JOIN LATERAL (
    SELECT p.avatar_media_url, p.archive_upload_id
    FROM profile as p
    WHERE p.account_id = t.account_id
    ORDER BY p.archive_upload_id DESC
    LIMIT 1
  ) p ON true
  ORDER BY t.created_at DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.word_occurrences(search_word text, start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, user_ids text[] DEFAULT NULL::text[])
 RETURNS TABLE(month text, word_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '5min'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        to_char(t.created_at, 'YYYY-MM') AS month,
        COUNT(*) AS word_count
    FROM
        public.tweets t
    WHERE
        t.fts @@ to_tsquery(replace(search_word, ' ', '+'))  -- Full-text search
        AND (start_date IS NULL OR end_date IS NULL OR t.created_at BETWEEN start_date AND end_date)  -- Date range filtering
        AND (user_ids IS NULL OR t.account_id = ANY(user_ids))  -- User filtering
    GROUP BY
        month
    ORDER BY
        month;
END; $function$;
