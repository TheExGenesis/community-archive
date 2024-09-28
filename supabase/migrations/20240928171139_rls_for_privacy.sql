CREATE OR REPLACE FUNCTION public.apply_public_rls_policies_not_private(schema_name TEXT, table_name TEXT) 
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

    EXECUTE format('CREATE POLICY "Data is publicly visible" ON %I.%I FOR SELECT USING (true)', schema_name, table_name);
    EXECUTE format('
        CREATE POLICY "Data is modifiable by their users" ON %I.%I TO authenticated 
        USING (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        ) 
        WITH CHECK (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        )', schema_name, table_name);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.apply_public_rls_policies(schema_name TEXT, table_name TEXT) 
RETURNS void AS $$
DECLARE
    policy_name TEXT;
    full_table_name TEXT;
BEGIN
    full_table_name := schema_name || '.' || table_name;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', schema_name, table_name);

    -- Drop existing policies without failing if they don't exist
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP; 

    -- Update the public visibility policy to check for keep_private more efficiently
    EXECUTE format('
        CREATE POLICY "Data is publicly visible unless marked private" ON %I.%I
        FOR SELECT
        USING (
            (SELECT COALESCE(au.keep_private, false) 
             FROM archive_upload au 
             WHERE au.id = %I.archive_upload_id) = false
            OR account_id = (SELECT auth.jwt() -> ''app_metadata'' ->> ''provider_id'')
        )', schema_name, table_name, table_name);

    -- The modification policy remains unchanged
    EXECUTE format('
        CREATE POLICY "Data is modifiable by their users" ON %I.%I TO authenticated 
        USING (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        ) 
        WITH CHECK (
            account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
        )', schema_name, table_name);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.apply_public_entities_rls_policies(schema_name TEXT, table_name TEXT) 
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

    EXECUTE format('
        CREATE POLICY "Entities are publicly visible unless marked private" ON %I.%I
        FOR SELECT
        USING (
            (SELECT COALESCE(au.keep_private, false) 
             FROM archive_upload au 
             JOIN public.tweets t ON t.archive_upload_id = au.id
             WHERE t.tweet_id = %I.tweet_id) = false
            OR EXISTS (
                SELECT 1
                FROM public.tweets t
                WHERE t.tweet_id = %I.tweet_id
                AND t.account_id = (SELECT auth.jwt() -> ''app_metadata'' ->> ''provider_id'')
            )
        )', schema_name, table_name, table_name, table_name);

    EXECUTE format('
        CREATE POLICY "Entities are modifiable by their users" ON %I.%I TO authenticated
        USING (
            EXISTS (
                SELECT 1 
                FROM public.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
            )
        ) 
        WITH CHECK (
            EXISTS (
                SELECT 1 
                FROM public.tweets dt 
                WHERE dt.tweet_id = %I.tweet_id 
                AND dt.account_id = (SELECT auth.jwt()) -> ''app_metadata'' ->> ''provider_id''
            )
        )', schema_name, table_name, table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Function to drop all policies on a table
CREATE OR REPLACE FUNCTION public.drop_all_policies(schema_name TEXT, table_name TEXT)
RETURNS void AS $$
DECLARE
    policy_name TEXT;
BEGIN
    FOR policy_name IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = schema_name AND tablename = table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, schema_name, table_name);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

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
    PERFORM public.apply_public_rls_policies('public', 'profile');
    PERFORM public.apply_public_rls_policies('public', 'tweets');
    PERFORM public.apply_public_rls_policies('public', 'likes');
    PERFORM public.apply_public_rls_policies('public', 'followers');
    PERFORM public.apply_public_rls_policies('public', 'following');

    -- Apply entity policies
    PERFORM public.apply_public_entities_rls_policies('public', 'tweet_media');
    PERFORM public.apply_public_entities_rls_policies('public', 'tweet_urls');
    PERFORM public.apply_public_entities_rls_policies('public', 'user_mentions');
END $$;