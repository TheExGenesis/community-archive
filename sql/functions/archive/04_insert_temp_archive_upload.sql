CREATE OR REPLACE FUNCTION public.insert_temp_archive_upload(p_account_id TEXT, p_archive_at TIMESTAMP WITH TIME ZONE, p_suffix TEXT)
RETURNS BIGINT AS $$
DECLARE
v_id BIGINT;
BEGIN
IF auth.uid() IS NULL AND current_user != 'postgres' THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
EXECUTE format('
INSERT INTO temp.archive_upload_%s (account_id, archive_at)
VALUES ($1, $2)
RETURNING id
', p_suffix)
USING p_account_id, p_archive_at
INTO v_id;
RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
