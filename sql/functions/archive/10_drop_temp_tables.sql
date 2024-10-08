CREATE OR REPLACE FUNCTION public.drop_temp_tables(p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
RAISE NOTICE 'drop_temp_tables called with suffix: %', p_suffix;

EXECUTE format('DROP TABLE IF EXISTS temp.account_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.archive_upload_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.profile_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.tweets_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.mentioned_users_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.user_mentions_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.tweet_urls_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.tweet_media_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.followers_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.following_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.liked_tweets_%s', p_suffix);
EXECUTE format('DROP TABLE IF EXISTS temp.likes_%s', p_suffix);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
