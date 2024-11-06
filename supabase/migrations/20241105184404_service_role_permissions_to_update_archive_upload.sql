GRANT ALL ON private.job_queue TO service_role;
--
--
GRANT USAGE ON SCHEMA private TO service_role;
--
---- Grant EXECUTE permission on functions
--GRANT EXECUTE ON FUNCTION private.queue_refresh_activity_summary TO service_role;
--GRANT EXECUTE ON FUNCTION private.update_conversation_ids TO service_role;
--GRANT EXECUTE ON FUNCTION private.post_upload_update_conversation_ids TO service_role;
--GRANT EXECUTE ON FUNCTION private.queue_update_conversation_ids TO service_role;
--
---- If the triggers use any tables in the private schema, you'll also need:
---- Replace 'table_name' with actual table names used by these functions
--GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA private TO service_role;
--

