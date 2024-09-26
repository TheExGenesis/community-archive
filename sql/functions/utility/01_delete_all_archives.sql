CREATE OR REPLACE FUNCTION public.delete_all_archives(p_account_id TEXT)
RETURNS VOID AS $$
DECLARE
v_schema_name TEXT := 'public';
BEGIN
-- Use a single transaction for all operations
BEGIN
EXECUTE format('
-- Delete from dependent tables first
DELETE FROM %I.user_mentions WHERE tweet_id IN (SELECT tweet_id FROM %I.tweets WHERE account_id = $1);
DELETE FROM %I.tweet_urls WHERE tweet_id IN (SELECT tweet_id FROM %I.tweets WHERE account_id = $1);
DELETE FROM %I.tweet_media WHERE tweet_id IN (SELECT tweet_id FROM %I.tweets WHERE account_id = $1);
DELETE FROM %I.likes WHERE account_id = $1;
DELETE FROM %I.tweets WHERE account_id = $1;
DELETE FROM %I.followers WHERE account_id = $1;
DELETE FROM %I.following WHERE account_id = $1;
DELETE FROM %I.profile WHERE account_id = $1;
DELETE FROM %I.archive_upload WHERE account_id = $1;
DELETE FROM %I.account WHERE account_id = $1;
', v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name,
v_schema_name, v_schema_name, v_schema_name, v_schema_name, v_schema_name)
USING p_account_id;
EXCEPTION WHEN OTHERS THEN
-- Log the error and re-raise
RAISE NOTICE 'Error deleting archives for account %: %', p_account_id, SQLERRM;
RAISE;
END;
END;
$$ LANGUAGE plpgsql
SET statement_timeout TO '20min';
