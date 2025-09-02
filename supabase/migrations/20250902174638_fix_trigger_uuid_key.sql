-- Fix trigger function to use UUID for job_queue key column
-- The job_queue.key column is UUID type, but the trigger was passing TEXT

CREATE OR REPLACE FUNCTION public.trigger_commit_temp_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when upload_phase changes to 'ready_for_commit'
    IF NEW.upload_phase = 'ready_for_commit' AND 
       (OLD.upload_phase IS NULL OR OLD.upload_phase != 'ready_for_commit') THEN
        RAISE NOTICE 'trigger_commit_temp_data: Running for account_id %', NEW.account_id;
        -- Queue the commit job with UUID key instead of TEXT
        INSERT INTO private.job_queue (key, job_name, status, args)
        VALUES (
            gen_random_uuid(),  -- Generate UUID instead of TEXT
            'commit_temp_data', 
            'QUEUED', 
            jsonb_build_object('account_id', NEW.account_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update queue_archive_changes function as well (from the archive_changes_fix migration)
CREATE OR REPLACE FUNCTION private.queue_archive_changes()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'queue_archive_changes:Queueing job: archive_changes';
    INSERT INTO private.job_queue (key, job_name, status)
    VALUES (gen_random_uuid(), 'archive_changes', 'QUEUED')  -- Use UUID instead of TEXT 'archive_changes'
    ON CONFLICT (key) DO UPDATE
    SET timestamp = CURRENT_TIMESTAMP,
        status = 'QUEUED';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;