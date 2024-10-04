
CREATE OR REPLACE FUNCTION public.drop_all_policies(schema_name TEXT, table_name TEXT) RETURNS VOID AS $$
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