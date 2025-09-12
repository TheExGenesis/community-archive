select cron.unschedule('move_to_archive');
select cron.unschedule('insert_temporary_data_into_tables');
select cron.unschedule('invoke_edge_function_scheduler');


drop table if exists public.temporary_data;
drop table if exists private.archived_temporary_data;

DROP FUNCTION IF EXISTS private.tes_process_account_records();
DROP FUNCTION IF EXISTS private.tes_process_profile_records();
DROP FUNCTION IF EXISTS private.tes_process_tweet_records();
DROP FUNCTION IF EXISTS private.tes_process_media_records();
DROP FUNCTION IF EXISTS private.tes_process_url_records();
DROP FUNCTION IF EXISTS private.tes_process_mention_records();
DROP FUNCTION IF EXISTS private.tes_complete_group_insertions();
DROP FUNCTION IF EXISTS private.tes_import_temporary_data_into_tables();

DROP FUNCTION IF EXISTS private.tes_complete_group_insertions(timestamp without time zone);
DROP FUNCTION IF EXISTS private.tes_invoke_edge_function_move_data_to_storage();           
DROP FUNCTION IF EXISTS private.tes_process_account_records(timestamp without time zone);  
DROP FUNCTION IF EXISTS private.tes_process_media_records(timestamp without time zone);    
DROP FUNCTION IF EXISTS private.tes_process_mention_records(timestamp without time zone);  
DROP FUNCTION IF EXISTS private.tes_process_profile_records(timestamp without time zone);  
DROP FUNCTION IF EXISTS private.tes_process_tweet_records(timestamp without time zone);    
DROP FUNCTION IF EXISTS private.tes_process_url_records(timestamp without time zone);      