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
        CREATE POLICY "Data is publicly visible unless marked private" ON %I.%I
        FOR SELECT
        USING (true)', schema_name, table_name);

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