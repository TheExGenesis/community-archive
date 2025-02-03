CREATE OR REPLACE FUNCTION public.trigger_commit_temp_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when upload_phase changes to 'ready_for_commit'
    IF NEW.upload_phase = 'ready_for_commit' AND 
       (OLD.upload_phase IS NULL OR OLD.upload_phase != 'ready_for_commit') THEN
        -- Call commit_temp_data with the account_id
        PERFORM public.commit_temp_data(NEW.account_id);
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
