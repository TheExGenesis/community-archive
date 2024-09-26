-- Apply RLS policies to all relevant tables

DO $$
DECLARE
    tables text[][] := ARRAY[
        ARRAY['public', 'profile'],
        ARRAY['public', 'archive_upload'],
        ARRAY['public', 'account'],
        ARRAY['public', 'tweets'],
        ARRAY['public', 'likes'],
        ARRAY['public', 'followers'],
        ARRAY['public', 'following']
    ];
    t text[];
BEGIN
    FOREACH t SLICE 1 IN ARRAY tables
    LOOP
        PERFORM public.apply_public_rls_policies(t[1], t[2]);
    END LOOP;
END $$;

-- Apply entity policies
SELECT public.apply_public_entities_rls_policies('public', 'tweet_media');
SELECT public.apply_public_entities_rls_policies('public', 'tweet_urls');
SELECT public.apply_public_entities_rls_policies('public', 'user_mentions');

SELECT public.apply_public_liked_tweets_rls_policies('public', 'liked_tweets');
SELECT public.apply_public_liked_tweets_rls_policies('public', 'mentioned_users');