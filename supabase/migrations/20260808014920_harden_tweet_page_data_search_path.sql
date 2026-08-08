-- Keep unqualified built-ins deterministic and satisfy the database security
-- advisor. All table references in the function remain explicitly qualified.
ALTER FUNCTION public.get_tweet_page_data(text)
SET search_path = public, pg_temp;
