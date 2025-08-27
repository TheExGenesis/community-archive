-- Drop duplicate and unnecessary indexes to improve performance and save space
-- This migration removes ~3GB of unnecessary indexes

-- Drop duplicate indexes on tweets table (saves ~370MB)
DROP INDEX IF EXISTS public.tweets_engagement_idx; -- duplicate of idx_tweets_engagement
DROP INDEX IF EXISTS public.idx_favorite_count; -- duplicate of idx_tweets_favorite_count

-- Drop duplicate indexes on archived_temporary_data table (saves ~1.5GB)
DROP INDEX IF EXISTS private.archived_temp_data_pk_idx; -- duplicate of pkey
DROP INDEX IF EXISTS private.archived_temp_data_timestamp_idx; -- duplicate of archived_temporary_data_timestamp_idx  
DROP INDEX IF EXISTS private.archived_temp_data_inserted_idx; -- redundant with composite index

-- Drop expensive GIN indexes that aren't used for searching (saves ~2.9GB)
-- These indexes slow down inserts significantly
DROP INDEX IF EXISTS private.archived_temporary_data_data_idx; -- 1.8GB GIN index not needed
DROP INDEX IF EXISTS public.idx_temporary_data_data; -- 1.1GB GIN index not needed

-- Log the space saved
DO $$ 
BEGIN 
    RAISE NOTICE 'Dropped duplicate and unnecessary indexes';
    RAISE NOTICE 'Estimated space saved: ~3GB';
    RAISE NOTICE 'This should significantly improve insert performance';
END 
$$;