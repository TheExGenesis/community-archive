-- Define policies to deny access to tweets and media between Aug 2022 and Nov 2023
-- and deny access to archives .json files. Service role and postgres can still access everything.

-- First, modify the tweet access policies
DO $$
BEGIN
  -- Remove existing policies
  PERFORM public.apply_public_rls_policies('public', 'tweets');
  
  -- Add quarantine policy for tweets
  CREATE POLICY "Quarantine tweets from Aug 2022 to Nov 2023" ON public.tweets
  FOR SELECT 
  USING (
    NOT (created_at >= '2022-08-01'::timestamp AND created_at <= '2023-11-30'::timestamp)
    OR auth.role() IN ('service_role', 'postgres')
  );
END
$$;

-- Apply similar policy to tweet_media
DO $$
BEGIN
  -- Remove existing policies
  PERFORM public.apply_public_rls_policies('public', 'tweet_media');
  
  -- Add quarantine policy for tweet media based on tweet creation date
  CREATE POLICY "Quarantine media from tweets between Aug 2022 and Nov 2023" ON public.tweet_media
  FOR SELECT 
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.tweets t
      WHERE t.tweet_id = tweet_media.tweet_id
      AND t.created_at >= '2022-08-01'::timestamp 
      AND t.created_at <= '2023-11-30'::timestamp
    )
    OR auth.role() IN ('service_role', 'postgres')
  );
END
$$;

-- Modify storage policies to deny access to archives .json files
DO $$
BEGIN
  -- Drop the policy that allows general archive access
  DROP POLICY IF EXISTS "Allow archive access generally" ON storage.objects;
  
  -- Create a new policy that allows access except for .json files
  CREATE POLICY "Allow archive access except json files" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'archives'::text 
    AND (
      NOT name LIKE '%.json' 
      OR auth.role() IN ('service_role', 'postgres')
    )
  );
END
$$; 

-- ROLLBACK STATEMENTS
-- Uncomment and use these to undo the quarantine policies
/*
-- Undo tweet quarantine
DO $$
BEGIN
  -- Remove quarantine policy
  DROP POLICY IF EXISTS "Quarantine tweets from Aug 2022 to Nov 2023" ON public.tweets;
  
  -- Restore standard policies
  PERFORM public.apply_public_rls_policies('public', 'tweets');
END
$$;

-- Undo media quarantine
DO $$
BEGIN
  -- Remove quarantine policy
  DROP POLICY IF EXISTS "Quarantine media from tweets between Aug 2022 and Nov 2023" ON public.tweet_media;
  
  -- Restore standard policies
  PERFORM public.apply_public_rls_policies('public', 'tweet_media');
END
$$;

-- Undo storage policy changes
DO $$
BEGIN
  -- Remove restricted policy
  DROP POLICY IF EXISTS "Allow archive access except json files" ON storage.objects;
  
  -- Restore general access policy
  CREATE POLICY "Allow archive access generally" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'archives'::text);
END
$$;
*/ 