CREATE SCHEMA IF NOT EXISTS tes;
 -- Grant schema usage to all roles
GRANT USAGE ON SCHEMA tes TO anon, authenticated, service_role;
-- For existing tables: full access to service_role, read-only to others
GRANT ALL ON ALL TABLES IN SCHEMA tes TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA tes TO anon, authenticated;
-- For existing routines: full access to service_role only
GRANT ALL ON ALL ROUTINES IN SCHEMA tes TO service_role;
-- For existing sequences: full access to service_role only
GRANT ALL ON ALL SEQUENCES IN SCHEMA tes TO service_role;
-- For future tables: full access to service_role, read-only to others
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tes 
    GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tes 
    GRANT SELECT ON TABLES TO anon, authenticated;
-- For future routines: full access to service_role only
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tes 
    GRANT ALL ON ROUTINES TO service_role;
-- For future sequences: full access to service_role only
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tes 
    GRANT ALL ON SEQUENCES TO service_role;