CREATE OR REPLACE FUNCTION public.insert_temp_account(p_account JSONB, p_suffix TEXT)
RETURNS VOID AS $$
BEGIN
IF auth.uid() IS NULL AND current_user != 'postgres' THEN
RAISE EXCEPTION 'Not authenticated';
END IF;

EXECUTE format('
INSERT INTO temp.account_%s (
    account_id, created_via, username, created_at, account_display_name,
    num_tweets, num_following, num_followers, num_likes
)
SELECT
$1->>''accountId'',
$1->>''createdVia'',
$1->>''username'',
($1->>''createdAt'')::TIMESTAMP WITH TIME ZONE,
$1->>''accountDisplayName'',
COALESCE(($1->>''numTweets'')::INTEGER, 0),
COALESCE(($1->>''numFollowing'')::INTEGER, 0),
COALESCE(($1->>''numFollowers'')::INTEGER, 0),
COALESCE(($1->>''numLikes'')::INTEGER, 0)
', p_suffix)
USING p_account;
END;
$$ LANGUAGE plpgsql;