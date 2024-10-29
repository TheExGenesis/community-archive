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