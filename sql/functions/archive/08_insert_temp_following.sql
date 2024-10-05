CREATE OR REPLACE FUNCTION public.insert_temp_following(p_following JSONB, p_account_id TEXT, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
EXECUTE format('
INSERT INTO temp.following_%s (account_id, following_account_id, archive_upload_id)
SELECT
$2,
(following->''following''->>''accountId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS following
', p_suffix)
USING p_following, p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
