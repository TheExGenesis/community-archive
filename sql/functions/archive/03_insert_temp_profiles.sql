CREATE OR REPLACE FUNCTION public.insert_temp_profiles(p_profile JSONB, p_account_id TEXT, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user != 'postgres' THEN
RAISE EXCEPTION 'Not authenticated';
END IF;
EXECUTE format('
INSERT INTO temp.profile_%s (bio, website, location, avatar_media_url, header_media_url, account_id, archive_upload_id)
SELECT
($1->''description''->>''bio'')::TEXT,
($1->''description''->>''website'')::TEXT,
($1->''description''->>''location'')::TEXT,
($1->>''avatarMediaUrl'')::TEXT,
($1->>''headerMediaUrl'')::TEXT,
$2,
-1
', p_suffix) USING p_profile, p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
