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