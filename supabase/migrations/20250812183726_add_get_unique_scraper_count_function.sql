-- Create function to get unique scraper count from private.tweet_user table
CREATE OR REPLACE FUNCTION "public"."get_unique_scraper_count"(
  "start_date" timestamp with time zone,
  "end_date" timestamp with time zone
)
RETURNS bigint
SECURITY DEFINER
SET search_path = private, public
LANGUAGE plpgsql
AS $$
DECLARE
  scraper_count bigint;
BEGIN
  -- Count unique user_ids from private.tweet_user table, excluding 'system'
  SELECT COUNT(DISTINCT user_id)
  INTO scraper_count
  FROM private.tweet_user
  WHERE created_at >= start_date
    AND created_at < end_date
    AND user_id != 'system';
  
  RETURN COALESCE(scraper_count, 0);
END;
$$;

-- Grant execution permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION "public"."get_unique_scraper_count"(timestamp with time zone, timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION "public"."get_unique_scraper_count"(timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."get_unique_scraper_count"(timestamp with time zone, timestamp with time zone) TO service_role;