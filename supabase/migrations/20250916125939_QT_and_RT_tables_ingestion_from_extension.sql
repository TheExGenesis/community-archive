DROP VIEW IF EXISTS public.enriched_tweets;
DROP VIEW IF EXISTS public.quote_tweets;

-- Create table for Quote Tweets - stores relationships between tweets and their quoted tweets
CREATE TABLE IF NOT EXISTS public.quote_tweets (
    tweet_id TEXT NOT NULL,
    quoted_tweet_id TEXT NOT NULL,
    
    -- Composite primary key
    PRIMARY KEY (tweet_id, quoted_tweet_id),
    
    -- Foreign key constraints
    CONSTRAINT fk_quote_tweets_tweet_id FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.retweets (
    tweet_id TEXT NOT NULL PRIMARY KEY,
    retweeted_tweet_id TEXT NULL,
       
    CONSTRAINT fk_retweets_tweet_id FOREIGN KEY (tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE CASCADE,
    CONSTRAINT fk_retweets_retweeted_tweet_id FOREIGN KEY (retweeted_tweet_id) REFERENCES public.tweets (tweet_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_quote_tweets_tweet_id ON public.quote_tweets (tweet_id);
CREATE INDEX IF NOT EXISTS idx_quote_tweets_quoted_tweet_id ON public.quote_tweets (quoted_tweet_id);

CREATE INDEX IF NOT EXISTS idx_retweets_tweet_id ON public.retweets (tweet_id);
CREATE INDEX IF NOT EXISTS idx_retweets_retweeted_tweet_id ON public.retweets (retweeted_tweet_id);

COMMENT ON TABLE public.quote_tweets IS 'Stores relationships between tweets and their quoted tweets';
COMMENT ON COLUMN public.quote_tweets.tweet_id IS 'The ID of the tweet that contains the quote';
COMMENT ON COLUMN public.quote_tweets.quoted_tweet_id IS 'The ID of the tweet being quoted';

COMMENT ON TABLE public.retweets IS 'Stores relationships between tweets and their retweeted tweets';
COMMENT ON COLUMN public.retweets.tweet_id IS 'The ID of the retweet';
COMMENT ON COLUMN public.retweets.retweeted_tweet_id IS 'The ID of the original tweet being retweeted';


CREATE OR REPLACE VIEW public.enriched_tweets AS
SELECT 
    t.tweet_id,
    t.account_id,
    a.username,
    a.account_display_name,
    t.created_at,
    t.full_text,
    t.retweet_count,
    t.favorite_count,
    t.reply_to_tweet_id,
    t.reply_to_user_id,
    t.reply_to_username,
    qt.quoted_tweet_id,
    c.conversation_id,
    p.avatar_media_url,
    t.archive_upload_id
FROM tweets t
JOIN all_account a ON t.account_id = a.account_id
LEFT JOIN conversations c ON t.tweet_id = c.tweet_id
LEFT JOIN quote_tweets qt ON t.tweet_id = qt.tweet_id
LEFT JOIN LATERAL (
    SELECT avatar_media_url
    FROM all_profile
    WHERE all_profile.account_id = t.account_id
    ORDER BY archive_upload_id DESC
    LIMIT 1
) p ON true; 


-- Single transaction with batching for better memory management
-- This approach processes in batches but keeps everything in one transaction for full rollback capability
SET statement_timeout = '60min';  -- Longer timeout for complex transaction
SET lock_timeout = '10min';       -- 10 minutes for lock acquisition
SET idle_in_transaction_session_timeout = '120min';  -- Longer idle timeout

DO $$
DECLARE
    batch_size INTEGER := 10000;  -- Process 10k records at a time
    rows_processed INTEGER;
    total_processed INTEGER := 0;
    min_rowid BIGINT;
    max_rowid BIGINT;
    current_min BIGINT;
    current_max BIGINT;
    start_time TIMESTAMP;
    batch_start_time TIMESTAMP;
    temp_table_time TIMESTAMP;
BEGIN
    start_time := clock_timestamp();
    RAISE NOTICE 'Starting batch processing (single transaction) at %...', start_time;
    
    -- Create temporary table with all quote tweet data
    CREATE TEMP TABLE temp_quote_tweets_batch (
        rowid BIGSERIAL PRIMARY KEY,
        tweet_id TEXT NOT NULL,
        quoted_tweet_id TEXT NOT NULL
    );
    
    -- Populate temp table with all data
    temp_table_time := clock_timestamp();
    INSERT INTO temp_quote_tweets_batch (tweet_id, quoted_tweet_id)
    SELECT DISTINCT
        t.tweet_id,
        SUBSTRING(
            tu.expanded_url
            FROM 'status/([0-9]+)'
        ) AS quoted_tweet_id
    FROM public.tweet_urls tu
    JOIN public.tweets t ON tu.tweet_id = t.tweet_id
    WHERE 
        (tu.expanded_url LIKE '%twitter.com/%/status/%'
        OR tu.expanded_url LIKE '%x.com/%/status/%')
        AND tu.expanded_url ~ 'status/[0-9]+(/|$|\?)'
        AND SUBSTRING(tu.expanded_url FROM 'status/([0-9]+)') IS NOT NULL;
    
    -- Get the range of row IDs to process
    SELECT MIN(rowid), MAX(rowid) INTO min_rowid, max_rowid FROM temp_quote_tweets_batch;
    
    RAISE NOTICE 'Temp table created with % rows (rowid range: % to %, creation time: %s)', 
                 max_rowid - min_rowid + 1, min_rowid, max_rowid,
                 EXTRACT(EPOCH FROM (clock_timestamp() - temp_table_time));
    
    -- Process in batches using rowid ranges
    current_min := min_rowid;
    
    WHILE current_min <= max_rowid LOOP
        current_max := current_min + batch_size - 1;
        batch_start_time := clock_timestamp();
        
        INSERT INTO public.quote_tweets (tweet_id, quoted_tweet_id)
        SELECT tweet_id, quoted_tweet_id
        FROM temp_quote_tweets_batch
        WHERE rowid BETWEEN current_min AND current_max
        ON CONFLICT (tweet_id, quoted_tweet_id) DO NOTHING;
        
        GET DIAGNOSTICS rows_processed = ROW_COUNT;
        total_processed := total_processed + rows_processed;
        
        RAISE NOTICE 'Processed batch: % rows (rowid range: % to %, total so far: %, batch time: %s)', 
                     rows_processed, current_min, current_max, total_processed,
                     EXTRACT(EPOCH FROM (clock_timestamp() - batch_start_time));
        
        current_min := current_max + 1;

        PERFORM pg_sleep(1);
    END LOOP;
    
    -- Clean up temp table
    DROP TABLE temp_quote_tweets_batch;
    
    RAISE NOTICE 'Batch processing complete. Total rows processed: %, total time: %s', 
                 total_processed, EXTRACT(EPOCH FROM (clock_timestamp() - start_time));
END $$;


-- Reset timeout settings back to defaults after processing
RESET statement_timeout;
RESET lock_timeout;
RESET idle_in_transaction_session_timeout;


DROP TRIGGER IF EXISTS trigger_commit_temp_data ON public.archive_upload;
DROP FUNCTION IF EXISTS public.trigger_commit_temp_data;
