-- Update job_queue table to use job_name and args
ALTER TABLE private.job_queue 
ADD COLUMN IF NOT EXISTS job_name TEXT,
ADD COLUMN IF NOT EXISTS args JSONB;

-- Update existing rows if needed
UPDATE private.job_queue 
SET job_name = key 
WHERE job_name IS NULL;

-- Update the process_jobs function to use job_name
CREATE OR REPLACE FUNCTION private.process_jobs()
RETURNS void AS $$
DECLARE
    v_job RECORD;
    v_start_time TIMESTAMP;
BEGIN
    RAISE NOTICE 'Starting process_jobs';

    -- Check for a job using job_name
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

    RAISE NOTICE 'Processing job: %', v_job.job_name;

    -- Update job status to PROCESSING
    UPDATE private.job_queue
    SET status = 'PROCESSING'
    WHERE key = v_job.key;

    BEGIN  -- Start exception block
        -- Set 30 minute timeout for this job's execution
        SET LOCAL statement_timeout TO '1800000';  -- 30 minutes in milliseconds

        -- Do the job based on job_name instead of key
        IF v_job.job_name = 'archive_changes' THEN
            RAISE NOTICE 'Refreshing materialized views concurrently';
            v_start_time := clock_timestamp();
            REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_activity_summary;
            RAISE NOTICE 'Refreshing materialized view took: %', clock_timestamp() - v_start_time;
            
        END IF;

        IF v_job.job_name = 'update_conversation_ids' THEN
            RAISE NOTICE 'Not updating conversation ids, update_conversation_ids needs optimization to not time out';
            -- v_start_time := clock_timestamp();
            -- PERFORM private.post_upload_update_conversation_ids();
            -- RAISE NOTICE 'Updating conversation IDs took: %', clock_timestamp() - v_start_time;
        END IF;

        IF v_job.job_name = 'commit_temp_data' THEN
            RAISE NOTICE 'Committing temp data for account: %', v_job.args->>'account_id';
            v_start_time := clock_timestamp();
            
            PERFORM public.commit_temp_data(cast(v_job.args->>'account_id' as text));
            
            RAISE NOTICE 'Commit processing took: %', clock_timestamp() - v_start_time;
        END IF;

        -- Update status using key
        UPDATE private.job_queue 
        SET status = 'DONE'
        WHERE key = v_job.key;
        RAISE NOTICE 'Job completed and marked as done: %', v_job.job_name;

    EXCEPTION WHEN OTHERS THEN
        -- On any error, mark the job as failed
        UPDATE private.job_queue 
        SET status = 'FAILED'
        WHERE key = v_job.key;
        
        RAISE NOTICE 'Job failed with error: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;

-- Update the trigger_commit_temp_data function to queue a job instead of running directly
CREATE OR REPLACE FUNCTION public.trigger_commit_temp_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when upload_phase changes to 'ready_for_commit'
    IF NEW.upload_phase = 'ready_for_commit' AND 
       (OLD.upload_phase IS NULL OR OLD.upload_phase != 'ready_for_commit') THEN
        RAISE NOTICE 'trigger_commit_temp_data: Running for account_id %', NEW.account_id;
        -- Queue the commit job instead of running directly
        INSERT INTO private.job_queue (key, job_name, status, args)
        VALUES (
            'commit_temp_data_' || NEW.account_id || '_' || extract(epoch from now())::text,
            'commit_temp_data', 
            'QUEUED', 
            jsonb_build_object('account_id', NEW.account_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to document the changes
COMMENT ON FUNCTION private.process_jobs() IS 'Process queued jobs with job_name-based routing and proper error handling';
COMMENT ON FUNCTION public.trigger_commit_temp_data() IS 'Queue commit_temp_data job when archive upload is ready for commit';