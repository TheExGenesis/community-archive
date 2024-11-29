-- Drop all policies and apply new ones for each table
DO $$
DECLARE
    tables TEXT[] := ARRAY['account', 'archive_upload', 'profile', 'tweets', 'likes', 'followers', 'following', 'tweet_media', 'tweet_urls', 'user_mentions'];
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY tables
    LOOP
        PERFORM public.drop_all_policies('public', table_name);
    END LOOP;

    -- Apply new policies
    PERFORM public.apply_public_rls_policies_not_private('public', 'account');
    PERFORM public.apply_public_rls_policies_not_private('public', 'archive_upload');
    PERFORM public.apply_public_rls_policies_not_private('public', 'profile');
    PERFORM public.apply_public_rls_policies('public', 'tweets');
    PERFORM public.apply_public_rls_policies('public', 'likes');
    PERFORM public.apply_public_rls_policies('public', 'followers');
    PERFORM public.apply_public_rls_policies('public', 'following');

    -- Apply entity policies
    PERFORM public.apply_public_entities_rls_policies('public', 'tweet_media');
    PERFORM public.apply_public_entities_rls_policies('public', 'tweet_urls');
    PERFORM public.apply_public_entities_rls_policies('public', 'user_mentions');
END $$;
