CREATE OR REPLACE FUNCTION private.post_upload_update_conversation_ids()
RETURNS void AS $$
BEGIN
    
    RAISE NOTICE 'Updating conversation ids';
    PERFORM private.update_conversation_ids();
   
   
   RAISE NOTICE 'Refreshing materialized view: main_thread_view';
    REFRESH MATERIALIZED VIEW CONCURRENTLY main_thread_view;
END;
$$ LANGUAGE plpgsql;