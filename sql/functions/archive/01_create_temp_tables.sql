CREATE OR REPLACE FUNCTION public.create_temp_tables(p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
RAISE NOTICE 'create_temp_tables called with suffix: %', p_suffix;
-- Check if the user is authenticated or is the postgres role
IF auth.uid() IS NULL AND current_user != 'postgres' THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
IF p_suffix != ((SELECT auth.jwt()) -> 'app_metadata' ->> 'provider_id') AND current_user != 'postgres' THEN
RAISE EXCEPTION 'Not authorized to process this archive';
END IF;
-- Drop the temporary tables if they exist
PERFORM public.drop_temp_tables(p_suffix);
-- Create new tables
EXECUTE format('CREATE TABLE temp.archive_upload_%s (LIKE public.archive_upload INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.account_%s (LIKE public.account INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.profile_%s (LIKE public.profile INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.tweets_%s (LIKE public.tweets INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.mentioned_users_%s (LIKE public.mentioned_users INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.user_mentions_%s (LIKE public.user_mentions INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.tweet_urls_%s (LIKE public.tweet_urls INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.tweet_media_%s (LIKE public.tweet_media INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.followers_%s (LIKE public.followers INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.following_%s (LIKE public.following INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.liked_tweets_%s (LIKE public.liked_tweets INCLUDING ALL)', p_suffix);
EXECUTE format('CREATE TABLE temp.likes_%s (LIKE public.likes INCLUDING ALL)', p_suffix);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
