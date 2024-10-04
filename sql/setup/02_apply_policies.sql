-- Drop all policies and apply new ones for each table
DO $$
BEGIN
    -- Drop all policies
    PERFORM public.drop_all_policies('public', 'account');
    PERFORM public.drop_all_policies('public', 'archive_upload');
    PERFORM public.drop_all_policies('public', 'profile');
    PERFORM public.drop_all_policies('public', 'tweets');
    PERFORM public.drop_all_policies('public', 'likes');
    PERFORM public.drop_all_policies('public', 'followers');
    PERFORM public.drop_all_policies('public', 'following');
    PERFORM public.drop_all_policies('public', 'tweet_media');
    PERFORM public.drop_all_policies('public', 'tweet_urls');
    PERFORM public.drop_all_policies('public', 'user_mentions');

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