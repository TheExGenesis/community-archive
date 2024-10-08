
CREATE TABLE IF NOT EXISTS private.job_queue (
    key TEXT PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK (status IN ('QUEUED', 'PROCESSING', 'DONE'))
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status_timestamp ON private.job_queue (status, timestamp);

CREATE OR REPLACE FUNCTION private.queue_refresh_activity_summary()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'queue_refresh_activity_summary:Queueing job: refresh_activity_summary';
    INSERT INTO private.job_queue (key, status)
    VALUES ('refresh_activity_summary', 'QUEUED')
    ON CONFLICT (key) DO UPDATE
    SET timestamp = CURRENT_TIMESTAMP,
        status = 'QUEUED';

    -- Call process_jobs directly
    PERFORM public.process_jobs();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER queue_job_on_upload_complete
AFTER UPDATE OF upload_phase ON public.archive_upload
FOR EACH ROW
WHEN (NEW.upload_phase = 'completed')
EXECUTE FUNCTION private.queue_refresh_activity_summary();

CREATE TRIGGER queue_job_on_upload_delete
AFTER DELETE ON public.archive_upload
FOR EACH ROW
EXECUTE FUNCTION private.queue_refresh_activity_summary();

CREATE OR REPLACE FUNCTION private.process_jobs(p_delay_seconds INTEGER DEFAULT 5)
RETURNS void AS $$
DECLARE
    v_job RECORD;
BEGIN
    RAISE NOTICE 'Starting process_jobs with delay: % seconds', p_delay_seconds;
    LOOP
        -- Sleep for p_delay_seconds
        PERFORM pg_sleep(p_delay_seconds);
        
        -- Check for a job
        SELECT * INTO v_job
        FROM private.job_queue
        WHERE status = 'QUEUED'
          AND timestamp <= (CURRENT_TIMESTAMP - (p_delay_seconds || ' seconds')::INTERVAL)
        ORDER BY timestamp
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
        
        -- If no job, exit loop
        IF NOT FOUND THEN
            RAISE NOTICE 'No jobs found, exiting loop';
            EXIT;
        END IF;
        
        RAISE NOTICE 'Processing job: %', v_job.key;
        
        -- Update job status to PROCESSING
        UPDATE private.job_queue
        SET status = 'PROCESSING'
        WHERE key = v_job.key;
        
        -- Do the job
        IF v_job.key = 'refresh_activity_summary' THEN
            RAISE NOTICE 'Refreshing materialized views';
            REFRESH MATERIALIZED VIEW public.global_activity_summary;
            REFRESH MATERIALIZED VIEW public.account_activity_summary;
        END IF;
        
        -- Delete the job
        DELETE FROM private.job_queue WHERE key = v_job.key;
        RAISE NOTICE 'Job completed and removed from queue: %', v_job.key;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
