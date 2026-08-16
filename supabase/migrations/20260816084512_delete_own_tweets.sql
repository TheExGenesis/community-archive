-- Allow authenticated members to delete only tweets owned by the Twitter
-- account in their server-controlled app_metadata. The underlying broad
-- delete_tweets routine remains service_role-only.

CREATE OR REPLACE FUNCTION public.delete_own_tweets(p_tweet_ids text[])
RETURNS TABLE(
  deleted_tweets integer,
  deleted_conversations integer,
  deleted_tweet_media integer,
  deleted_user_mentions integer,
  deleted_tweet_urls integer,
  deleted_private_tweet_user integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
SET search_path = ''
AS $$
DECLARE
  v_provider_id text;
  v_tweet_ids text[];
BEGIN
  v_provider_id := nullif(auth.jwt()->'app_metadata'->>'provider_id', '');

  IF auth.uid() IS NULL OR v_provider_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'A linked Twitter account is required';
  END IF;

  SELECT array_agg(tweet_id ORDER BY tweet_id)
  INTO v_tweet_ids
  FROM (
    SELECT DISTINCT btrim(candidate) AS tweet_id
    FROM unnest(p_tweet_ids) AS requested(candidate)
    WHERE candidate IS NOT NULL AND btrim(candidate) <> ''
  ) normalized;

  IF coalesce(cardinality(v_tweet_ids), 0) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'At least one tweet ID is required';
  END IF;

  IF cardinality(v_tweet_ids) > 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'At most 100 tweets can be deleted at once';
  END IF;

  -- Fail the whole request if any ID is missing or belongs to another account.
  -- The intentionally generic error does not disclose whether another tweet
  -- exists in the archive.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_tweet_ids) AS requested(tweet_id)
    LEFT JOIN public.tweets AS owned
      ON owned.tweet_id = requested.tweet_id
     AND owned.account_id = v_provider_id
    WHERE owned.tweet_id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'One or more tweets cannot be deleted';
  END IF;

  RETURN QUERY
  SELECT * FROM public.delete_tweets(v_tweet_ids);
END;
$$;

ALTER FUNCTION public.delete_own_tweets(text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_own_tweets(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_tweets(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_tweets(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_tweets(text[]) TO service_role;

COMMENT ON FUNCTION public.delete_own_tweets(text[]) IS
  'Deletes up to 100 tweets only when every ID belongs to the authenticated Twitter account in app_metadata.provider_id.';
