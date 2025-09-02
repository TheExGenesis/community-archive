-- Comprehensive fix for all trigger functions using job_queue
-- The issue is that job_queue.key is UUID but functions are passing TEXT values

-- Fix 1: Update trigger_commit_temp_data function 
CREATE OR REPLACE FUNCTION public.trigger_commit_temp_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when upload_phase changes to 'ready_for_commit'
    IF NEW.upload_phase = 'ready_for_commit' AND 
       (OLD.upload_phase IS NULL OR OLD.upload_phase != 'ready_for_commit') THEN
        RAISE NOTICE 'trigger_commit_temp_data: Running for account_id %', NEW.account_id;
        -- Queue the commit job with UUID key
        INSERT INTO private.job_queue (key, job_name, status, args)
        VALUES (
            gen_random_uuid(),
            'commit_temp_data', 
            'QUEUED', 
            jsonb_build_object('account_id', NEW.account_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 2: Update queue_archive_changes function (remove ON CONFLICT since UUIDs don't conflict)
CREATE OR REPLACE FUNCTION private.queue_archive_changes()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'queue_archive_changes: Queueing job: archive_changes';
    -- Insert with UUID key - no ON CONFLICT since UUIDs are unique
    INSERT INTO private.job_queue (key, job_name, status)
    VALUES (gen_random_uuid(), 'archive_changes', 'QUEUED');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix 3: Check if there are other functions that might need fixing
-- Update queue_refresh_activity_summary function as well
CREATE OR REPLACE FUNCTION private.queue_refresh_activity_summary()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'queue_refresh_activity_summary: Queueing job: refresh_activity_summary';
    -- Insert with UUID key
    INSERT INTO private.job_queue (key, job_name, status)
    VALUES (gen_random_uuid(), 'refresh_activity_summary', 'QUEUED');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix 4: Update queue_update_conversation_ids function if it exists
CREATE OR REPLACE FUNCTION private.queue_update_conversation_ids()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'queue_update_conversation_ids: Queueing job: update_conversation_ids';
    -- Insert with UUID key
    INSERT INTO private.job_queue (key, job_name, status)
    VALUES (gen_random_uuid(), 'update_conversation_ids', 'QUEUED');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;