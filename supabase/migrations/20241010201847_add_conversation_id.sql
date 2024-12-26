CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "tweet_id" text NOT NULL PRIMARY KEY,
    "conversation_id" text,
    FOREIGN KEY (tweet_id) REFERENCES public.tweets(tweet_id)
);
CREATE OR REPLACE FUNCTION private.update_conversation_ids()
RETURNS INTEGER AS $$
DECLARE
    affected_rows INTEGER := 0;
    current_tweet RECORD;
    current_conversation_id BIGINT;
    error_message TEXT;
    lock_key BIGINT;
BEGIN

    lock_key := hashtext('private' || '.' || 'update_conversation_ids')::BIGINT;
    
    -- Obtain an advisory lock using the calculated key
    PERFORM pg_advisory_lock(lock_key);
    -- Create a temporary table to store processed tweets
    CREATE TEMPORARY TABLE temp_processed_tweets (
        tweet_id text PRIMARY KEY,
        conversation_id text
    );

    -- Create an index on the temporary table
    CREATE INDEX idx_temp_conversation_id ON temp_processed_tweets(conversation_id);

    -- Process tweets in order
    FOR current_tweet IN (SELECT tweet_id, reply_to_tweet_id FROM tweets ORDER BY tweet_id) LOOP
        IF current_tweet.reply_to_tweet_id IS NULL THEN
            -- This tweet is not a reply, so it starts its own conversation
            current_conversation_id := current_tweet.tweet_id;
        ELSE
            -- Check if the tweet this is replying to has been processed
            SELECT conversation_id INTO current_conversation_id
            FROM temp_processed_tweets
            WHERE tweet_id = current_tweet.reply_to_tweet_id;

            IF current_conversation_id IS NULL THEN
                -- The tweet this is replying to hasn't been processed yet, so skip this tweet
                CONTINUE;
            END IF;
        END IF;

        -- Insert or update the conversation record
        INSERT INTO conversations (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id)
        ON CONFLICT (tweet_id) DO UPDATE
        SET conversation_id = EXCLUDED.conversation_id
        WHERE conversations.conversation_id IS DISTINCT FROM EXCLUDED.conversation_id;

        -- Insert into the temporary table
        INSERT INTO temp_processed_tweets (tweet_id, conversation_id)
        VALUES (current_tweet.tweet_id, current_conversation_id);

        affected_rows := affected_rows + 1;
    END LOOP;

    -- Clean up
    DROP TABLE temp_processed_tweets;
    -- Release the advisory lock
    PERFORM pg_advisory_unlock(lock_key);

    RETURN affected_rows;
EXCEPTION
    WHEN OTHERS THEN
        -- Clean up the temporary table if it exists
        DROP TABLE IF EXISTS temp_processed_tweets;

        -- Release the advisory lock
        PERFORM pg_advisory_unlock(lock_key);

        GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
        RAISE EXCEPTION 'An error occurred in update_conversation_ids: %', error_message;
END;
$$ LANGUAGE plpgsql;
-- Add a comment to explain the purpose of this function
COMMENT ON FUNCTION private.update_conversation_ids() IS 'Updates conversation_ids for tweets';
CREATE OR REPLACE VIEW public.tweets_w_conversation_id AS
SELECT tweets.*, c.conversation_id
FROM tweets LEFT JOIN conversations c ON tweets.tweet_id = c.tweet_id;
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
CREATE OR REPLACE FUNCTION private.post_upload_update_conversation_ids()
RETURNS void AS $$
BEGIN
    
    RAISE NOTICE 'Updating conversation ids';
    PERFORM private.update_conversation_ids();
   
END;
$$ LANGUAGE plpgsql;
-- Run the function to update the conversation_ids and main_thread_view when the migration is applied
SELECT private.post_upload_update_conversation_ids();
CREATE OR REPLACE FUNCTION private.queue_update_conversation_ids()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'queue_update_conversation_ids:Queueing job: update_conversation_ids';
    INSERT INTO private.job_queue (key, status)
    VALUES ('update_conversation_ids', 'QUEUED')
    ON CONFLICT (key) DO UPDATE
    SET timestamp = CURRENT_TIMESTAMP,
        status = 'QUEUED';

    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER queue_update_conversation_ids_on_upload_complete
AFTER UPDATE OF upload_phase ON public.archive_upload
FOR EACH ROW
WHEN (NEW.upload_phase = 'completed')
EXECUTE FUNCTION private.queue_update_conversation_ids();
CREATE OR REPLACE FUNCTION private.process_jobs()
RETURNS void AS $$
DECLARE
v_job RECORD;
BEGIN
RAISE NOTICE 'Starting process_jobs';

-- Check for a job
SELECT * INTO v_job
FROM private.job_queue
WHERE status = 'QUEUED'
ORDER BY timestamp
LIMIT 1
FOR UPDATE SKIP LOCKED;

-- If no job, exit
IF NOT FOUND THEN
    RAISE NOTICE 'No jobs found, exiting';
    RETURN;
END IF;

RAISE NOTICE 'Processing job: %', v_job.key;

-- Update job status to PROCESSING
UPDATE private.job_queue
SET status = 'PROCESSING'
WHERE key = v_job.key;

-- Do the job
IF v_job.key = 'refresh_activity_summary' THEN
    RAISE NOTICE 'Refreshing materialized views';
    REFRESH MATERIALIZED VIEW public.global_activity_summary;
    REFRESH MATERIALIZED VIEW public.account_activity_summary;
END IF;


IF v_job.key = 'update_conversation_ids' THEN
    RAISE NOTICE 'Updating conversation ids';
    PERFORM private.post_upload_update_conversation_ids();
END IF;

-- Delete the job
DELETE FROM private.job_queue WHERE key = v_job.key;
RAISE NOTICE 'Job completed and removed from queue: %', v_job.key;

END;
$$ LANGUAGE plpgsql;
