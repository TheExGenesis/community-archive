
-- ROLLBACK STATEMENTS
-- Uncomment and use these to undo the quarantine policies

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
  PERFORM public.apply_public_entities_rls_policies('public', 'tweet_media');
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
