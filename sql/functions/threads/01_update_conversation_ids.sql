
CREATE OR REPLACE FUNCTION public.update_conversation_ids()
RETURNS INTEGER AS $$
DECLARE
    affected_rows INTEGER := 0;
    error_message TEXT;
BEGIN
    -- Create a temporary table to store the results
    CREATE TEMPORARY TABLE temp_conversation_ids AS
    SELECT tweet_id, conversation_id, reply_to_tweet_id
    FROM tweets;

    -- Create indexes to speed up joins and lookups
    CREATE INDEX idx_temp_in_reply_to ON temp_conversation_ids(reply_to_tweet_id);
    CREATE INDEX idx_temp_tweet_id ON temp_conversation_ids(tweet_id);

    -- Update conversation_ids
    WITH RECURSIVE conversation_chain AS
            (
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
    WHERE conversation_id IS NULL
      AND reply_to_tweet_id IS NOT NULL
      AND NOT EXISTS
    (
          SELECT 1
    FROM temp_conversation_ids
    WHERE tweet_id = t.reply_to_tweet_id
      );

    -- Update the original tweets table with the calculated conversation_ids
    WITH updated_rows AS (
    UPDATE tweets t
    SET conversation_id
    = tci.conversation_id
        FROM temp_conversation_ids tci
        WHERE t.tweet_id = tci.tweet_id AND
    (t.conversation_id IS DISTINCT FROM tci.conversation_id)
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
COMMENT ON FUNCTION public.update_conversation_ids() IS 'Updates conversation_ids for tweets';