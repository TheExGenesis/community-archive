DROP MATERIALIZED VIEW IF EXISTS main_thread_view CASCADE;


CREATE MATERIALIZED VIEW main_thread_view AS
WITH RECURSIVE main_thread AS (
    -- Base case: Select the initial tweet of each thread by the user
    SELECT tweets.tweet_id, tweets.conversation_id, tweets.reply_to_tweet_id,
           tweets.account_id,
           0 AS depth, tweets.favorite_count, tweets.retweet_count
    FROM tweets
    WHERE tweets.conversation_id IS NOT NULL
      AND tweets.reply_to_tweet_id IS NULL  -- This ensures we start with the first tweet in the thread
   
    UNION ALL
   
    -- Recursive case: Select direct replies by the same user to their own tweets in the main thread
    SELECT t.tweet_id, t.conversation_id, t.reply_to_tweet_id, t.account_id,
           mt.depth + 1, t.favorite_count, t.retweet_count
    FROM tweets t
    JOIN main_thread mt ON t.reply_to_tweet_id = mt.tweet_id
    WHERE t.account_id = mt.account_id
      AND t.conversation_id = mt.conversation_id
),
thread_summary AS (
    SELECT main_thread.conversation_id,
           main_thread.account_id,
           --COUNT(*) AS tweet_count,
           MAX(main_thread.depth) AS max_depth
           --SUM(favorite_count) AS total_favorite_count,
           --SUM(retweet_count) AS total_retweet_count
    FROM main_thread
    GROUP BY main_thread.conversation_id, main_thread.account_id
)
SELECT mt.tweet_id, mt.conversation_id, mt.reply_to_tweet_id, mt.account_id, mt.depth, ts.max_depth, mt.favorite_count, mt.retweet_count
FROM main_thread mt
JOIN thread_summary ts ON mt.conversation_id = ts.conversation_id AND mt.account_id = ts.account_id;

CREATE INDEX idx_main_thread_view_account_id ON main_thread_view (account_id);
CREATE INDEX idx_main_thread_view_conversation_id ON main_thread_view (conversation_id);