-- Idempotent unschedule of old cron jobs (skip if job/schema/function missing)
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- If the cron schema or job table doesn't exist (e.g., preview DB), skip
  PERFORM 1 FROM pg_namespace WHERE nspname = 'cron';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'cron' AND c.relname = 'job' AND c.relkind = 'r';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Unschedule by jobid if present; ignore errors if function signature differs
  FOR rec IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'move_to_archive',
      'insert_temporary_data_into_tables',
      'invoke_edge_function_scheduler'
    )
  LOOP
    BEGIN
      PERFORM cron.unschedule(rec.jobid);
    EXCEPTION WHEN OTHERS THEN
      -- ignore if job/function not found; this is cleanup
      NULL;
    END;
  END LOOP;
END$$;


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
