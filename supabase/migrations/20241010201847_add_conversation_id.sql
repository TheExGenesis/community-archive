CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "tweet_id" text NOT NULL PRIMARY KEY,
    "conversation_id" text,
    FOREIGN KEY (tweet_id) REFERENCES public.tweets(tweet_id)
);

CREATE OR REPLACE FUNCTION private.update_conversation_ids()
RETURNS INTEGER AS $$
DECLARE
    affected_rows INTEGER := 0;
    error_message TEXT;
BEGIN
    -- Create a temporary table to store the results
    CREATE TEMPORARY TABLE temp_conversation_ids AS
    SELECT t.tweet_id, c.conversation_id, t.reply_to_tweet_id
    FROM tweets t
    LEFT JOIN conversations c ON t.tweet_id = c.tweet_id;

    -- Create indexes to speed up joins and lookups
    CREATE INDEX idx_temp_in_reply_to ON temp_conversation_ids(reply_to_tweet_id);
    CREATE INDEX idx_temp_tweet_id ON temp_conversation_ids(tweet_id);

    -- Update conversation_ids
    WITH RECURSIVE conversation_chain AS (
        -- Base case: tweets that are start of conversations or already have conversation_ids
        SELECT tweet_id, COALESCE(conversation_id, tweet_id) AS conversation_id, reply_to_tweet_id
        FROM temp_conversation_ids
        WHERE reply_to_tweet_id IS NULL OR conversation_id IS NOT NULL
        UNION ALL
        -- Recursive case: tweets that are replies
        SELECT t.tweet_id, cc.conversation_id, t.reply_to_tweet_id
        FROM temp_conversation_ids t
        JOIN conversation_chain cc ON t.reply_to_tweet_id = cc.tweet_id
        WHERE t.conversation_id IS NULL
    )
    UPDATE temp_conversation_ids t
    SET conversation_id = cc.conversation_id
    FROM conversation_chain cc
    WHERE t.tweet_id = cc.tweet_id;

    -- Handle tweets replying to non-existent tweets (keep conversation_id as NULL)
    UPDATE temp_conversation_ids t
    SET conversation_id = NULL
    WHERE conversation_id IS NOT NULL
      AND reply_to_tweet_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM temp_conversation_ids
          WHERE tweet_id = t.reply_to_tweet_id
      );

    -- Update the conversations table with the calculated conversation_ids
    WITH updated_rows AS (
        INSERT INTO conversations (tweet_id, conversation_id)
        SELECT tci.tweet_id, tci.conversation_id
        FROM temp_conversation_ids tci
        WHERE tci.conversation_id is not null
        ON CONFLICT (tweet_id) DO UPDATE
        SET conversation_id = EXCLUDED.conversation_id
        WHERE conversations.conversation_id IS DISTINCT FROM EXCLUDED.conversation_id
        RETURNING 1
    )
    SELECT COUNT(*)
    INTO affected_rows
    FROM updated_rows;

    -- Clean up
    DROP TABLE temp_conversation_ids;

    RETURN affected_rows;
EXCEPTION
    WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
        RAISE EXCEPTION 'An error occurred: %', error_message;
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
   
   
   --RAISE NOTICE 'Refreshing materialized view: main_thread_view';
   --REFRESH MATERIALIZED VIEW CONCURRENTLY main_thread_view;
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

    -- Call process_jobs directly
    PERFORM private.process_jobs();
    
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