CREATE OR REPLACE FUNCTION private.queue_update_conversation_ids()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'queue_update_conversation_ids:Queueing job: update_conversation_ids';
    INSERT INTO private.job_queue (key, status)
    VALUES ('update_conversation_ids', 'QUEUED')
    ON CONFLICT (key) DO UPDATE
    SET timestamp = CURRENT_TIMESTAMP,
        status = 'QUEUED';

    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER queue_update_conversation_ids_on_upload_complete
AFTER UPDATE OF upload_phase ON public.archive_upload
FOR EACH ROW
WHEN (NEW.upload_phase = 'completed')
EXECUTE FUNCTION private.queue_update_conversation_ids();


