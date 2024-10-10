CREATE OR REPLACE FUNCTION public.post_upload_update_conversation_ids()
RETURNS void AS $$
BEGIN
    
    RAISE NOTICE 'Updating conversation ids';
    PERFORM public.update_conversation_ids();
   
   
   RAISE NOTICE 'Refreshing materialized view: main_thread_view';
    REFRESH MATERIALIZED VIEW main_thread_view;
END;
$$ LANGUAGE plpgsql;