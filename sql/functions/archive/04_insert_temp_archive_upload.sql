CREATE OR REPLACE FUNCTION public.insert_temp_archive_upload(
    p_account_id TEXT,
    p_archive_at TIMESTAMP WITH TIME ZONE,
    p_keep_private BOOLEAN,
    p_upload_likes BOOLEAN,
    p_start_date DATE,
    p_end_date DATE,
    p_suffix TEXT
)
RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
BEGIN
    IF auth.uid() IS NULL AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    EXECUTE format('
        INSERT INTO temp.archive_upload_%s (
            account_id,
            archive_at,
            keep_private,
            upload_likes,
            start_date,
            end_date
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
    ', p_suffix)
    USING
        p_account_id,
        p_archive_at,
        p_keep_private,
        p_upload_likes,
        p_start_date,
        p_end_date
    INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
