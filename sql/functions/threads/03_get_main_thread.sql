DROP FUNCTION IF EXISTS get_main_thread;

CREATE OR REPLACE FUNCTION public.get_main_thread(p_conversation_id TEXT)
RETURNS TABLE (
    tweet_id TEXT,
    conversation_id TEXT,
    reply_to_tweet_id TEXT,
    account_id TEXT,
    depth INT,
    max_depth INT,
    favorite_count INT,
    retweet_count INT
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE main_thread AS (
        -- Base case: Select the initial tweet of the thread by the user
        SELECT tweets.tweet_id, c.conversation_id, tweets.reply_to_tweet_id,
               tweets.account_id,
               0 AS depth, tweets.favorite_count, tweets.retweet_count
        FROM tweets 
        LEFT JOIN conversations c ON tweets.tweet_id = c.tweet_id
        WHERE c.conversation_id = p_conversation_id
          AND tweets.reply_to_tweet_id IS NULL  -- This ensures we start with the first tweet in the thread
       
        UNION ALL
       
        -- Recursive case: Select direct replies by the same user to their own tweets in the main thread
        SELECT t.tweet_id, c.conversation_id, t.reply_to_tweet_id, t.account_id,
               mt.depth + 1, t.favorite_count, t.retweet_count
        FROM tweets t
        LEFT JOIN conversations c ON t.tweet_id = c.tweet_id
        JOIN main_thread mt ON t.reply_to_tweet_id = mt.tweet_id
        WHERE t.account_id = mt.account_id
          AND c.conversation_id = p_conversation_id
    ),
    thread_summary AS (
        SELECT main_thread.conversation_id,
               main_thread.account_id,
               MAX(main_thread.depth) AS max_depth
        FROM main_thread
        GROUP BY main_thread.conversation_id, main_thread.account_id
    )
    SELECT mt.tweet_id, mt.conversation_id, mt.reply_to_tweet_id, mt.account_id, 
           mt.depth, ts.max_depth, mt.favorite_count, mt.retweet_count
    FROM main_thread mt
    JOIN thread_summary ts ON mt.conversation_id = ts.conversation_id AND mt.account_id = ts.account_id;
END;
$$ LANGUAGE plpgsql;
COMMENT ON FUNCTION get_main_thread(text) IS 'Returns the main thread view for a given conversation_id';