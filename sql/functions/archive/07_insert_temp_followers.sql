CREATE OR REPLACE FUNCTION public.insert_temp_followers(p_followers JSONB, p_account_id TEXT, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role') THEN
RAISE EXCEPTION 'Not authenticated';
END IF;

RAISE NOTICE 'insert_temp_followers called with account_id: %, suffix: %', p_account_id, p_suffix;

EXECUTE format('
INSERT INTO temp.followers_%s (account_id, follower_account_id, archive_upload_id)
SELECT
$2,
(follower->''follower''->>''accountId'')::TEXT,
-1
FROM jsonb_array_elements($1) AS follower
', p_suffix)
USING p_followers, p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
