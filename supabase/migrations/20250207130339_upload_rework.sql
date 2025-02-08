
CREATE OR REPLACE FUNCTION private.process_jobs()
RETURNS void AS $$
DECLARE
v_job RECORD;
BEGIN
RAISE NOTICE 'Starting process_jobs';

-- Check for a job
SELECT * INTO v_job
FROM private.job_queue
WHERE status = 'QUEUED'
ORDER BY timestamp
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- If no job, exit
IF NOT FOUND THEN
    RAISE NOTICE 'No jobs found, exiting';
    RETURN;
END IF;

RAISE NOTICE 'Processing job: %', v_job.key;

-- Update job status to PROCESSING
UPDATE private.job_queue
SET status = 'PROCESSING'
WHERE key = v_job.key;

BEGIN  -- Start exception block
    -- Do the job
    IF v_job.key = 'archive_changes' THEN
        RAISE NOTICE 'Refreshing materialized views concurrently';
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_activity_summary;
        -- REFRESH MATERIALIZED VIEW CONCURRENTLY public.account_activity_summary;
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.quote_tweets_mv;
        PERFORM private.post_upload_update_conversation_ids();
    END IF;

    IF v_job.key = 'update_conversation_ids' THEN
        RAISE NOTICE 'Updating conversation ids';
        
    END IF;

    -- Delete the job only if successful
    DELETE FROM private.job_queue WHERE key = v_job.key;
    RAISE NOTICE 'Job completed and removed from queue: %', v_job.key;

EXCEPTION WHEN OTHERS THEN
    -- On any error, mark the job as failed
    UPDATE private.job_queue 
    SET status = 'FAILED'
    WHERE key = v_job.key;
    
    RAISE NOTICE 'Job failed with error: %', SQLERRM;
END;

END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_commit_temp_data ON public.archive_upload;
