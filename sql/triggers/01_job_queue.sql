DROP TRIGGER IF EXISTS update_global_activity_summary ON public.archive_upload;
DROP FUNCTION IF EXISTS refresh_global_activity_summary() CASCADE;
DROP FUNCTION IF EXISTS refresh_account_activity_summary() CASCADE;
DROP TRIGGER IF EXISTS update_account_activity_summary ON public.archive_upload;
DROP TRIGGER IF EXISTS queue_job_on_upload_complete ON public.archive_upload;
DROP TRIGGER IF EXISTS queue_job_on_upload_delete ON public.archive_upload;
DROP FUNCTION IF EXISTS private.queue_archive_changes_on_upload_complete() CASCADE;
DROP FUNCTION IF EXISTS private.process_jobs() CASCADE;
DROP TABLE IF EXISTS private.job_queue CASCADE;

CREATE TABLE private.job_queue (
    key TEXT PRIMARY KEY,
    job_name TEXT,
    args JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK (status IN ('QUEUED', 'PROCESSING', 'DONE', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status_timestamp ON private.job_queue (status, timestamp);

CREATE OR REPLACE FUNCTION private.queue_archive_changes()
RETURNS TRIGGER AS $$
BEGIN
RAISE NOTICE 'queue_archive_changes:Queueing job: archive_changes';
INSERT INTO private.job_queue (key, job_name, status)
VALUES ('archive_changes', 'archive_changes', 'QUEUED')
ON CONFLICT (key) DO UPDATE
SET timestamp = CURRENT_TIMESTAMP,
    status = 'QUEUED';

RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER queue_job_on_upload_complete
AFTER UPDATE OF upload_phase ON public.archive_upload
FOR EACH ROW
WHEN (NEW.upload_phase = 'completed')
EXECUTE FUNCTION private.queue_archive_changes();

CREATE TRIGGER queue_job_on_upload_delete
AFTER DELETE ON public.archive_upload
FOR EACH ROW
EXECUTE FUNCTION private.queue_archive_changes();


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

-- trigger_commit_temp_data function
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

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_commit_temp_data ON public.archive_upload;
CREATE TRIGGER trigger_commit_temp_data
    AFTER UPDATE OF upload_phase ON public.archive_upload
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_commit_temp_data();


-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
DECLARE
    job_id bigint;
BEGIN
    FOR job_id IN 
        SELECT jobid 
        FROM cron.job 
        WHERE command LIKE '%SELECT private.process_jobs();%'
    LOOP
        PERFORM cron.unschedule(job_id);
        RAISE NOTICE 'Unscheduled job with ID: %', job_id;
    END LOOP;
END $$;
-- Schedule job to run every minute
SELECT cron.schedule('* * * * *', $$
SELECT private.process_jobs();
$$);