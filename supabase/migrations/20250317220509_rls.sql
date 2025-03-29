CREATE OR REPLACE FUNCTION public.apply_public_rls_policies(schema_name TEXT, table_name TEXT) 
RETURNS void AS $$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 

    -- Update the public visibility policy to check for keep_private more efficiently
    EXECUTE format('
        CREATE POLICY "Data is publicly visible" ON %I.%I
        FOR SELECT
        USING (true)', schema_name, table_name);

    -- Special case for tweet_media table which needs to join with tweets table
    IF table_name = 'tweet_media' THEN
        EXECUTE format('
            CREATE POLICY "Data is modifiable by their users" ON %I.%I TO authenticated 
            USING (
                EXISTS (
                    SELECT 1 FROM public.tweets t
                    WHERE t.tweet_id = tweet_media.tweet_id
                    AND t.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
                )
            ) 
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.tweets t
                    WHERE t.tweet_id = tweet_media.tweet_id
                    AND t.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
                )
            )', schema_name, table_name);
    ELSE
        -- The modification policy remains unchanged for other tables
        EXECUTE format('
            CREATE POLICY "Data is modifiable by their users" ON %I.%I TO authenticated 
            USING (
                account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
            ) 
            WITH CHECK (
                account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
            )', schema_name, table_name);
    END IF;
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
    PERFORM public.apply_public_rls_policies('public', 'tweets');
    PERFORM public.apply_public_rls_policies('public', 'likes');
    PERFORM public.apply_public_rls_policies('public', 'followers');
    PERFORM public.apply_public_rls_policies('public', 'following');
    PERFORM public.apply_public_rls_policies('public', 'tweet_media');
END $$;
