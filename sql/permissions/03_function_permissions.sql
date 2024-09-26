-- Grant execute permissions on RLS functions
GRANT EXECUTE ON FUNCTION public.apply_public_rls_policies(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_public_entities_rls_policies(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_public_liked_tweets_rls_policies(TEXT, TEXT) TO anon, authenticated, service_role;
-- Grant execute permissions on Archive functions
GRANT EXECUTE ON FUNCTION public.create_temp_tables(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_temp_account(JSONB, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_temp_profiles(JSONB, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_temp_archive_upload(TEXT, TIMESTAMP WITH TIME ZONE, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_temp_tweets(JSONB, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_and_insert_tweet_entities(JSONB, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_temp_followers(JSONB, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_temp_following(JSONB, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_temp_likes(JSONB, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.drop_temp_tables(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_temp_data(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_archive(JSONB) TO anon, authenticated, service_role;
-- Grant execute permissions on Utility functions
GRANT EXECUTE ON FUNCTION public.delete_all_archives(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.drop_function_if_exists(text, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_latest_tweets(integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tweet_count_by_date(timestamp with time zone, timestamp with time zone, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tweet_count_by_account(timestamp with time zone, timestamp with time zone, text) TO anon, authenticated, service_role;