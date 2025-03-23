-- First, ensure the private schema exists
CREATE SCHEMA IF NOT EXISTS private;

-- Create the archive table in private schema if it doesn't exist
CREATE TABLE IF NOT EXISTS private.archived_temporary_data (LIKE public.temporary_data INCLUDING ALL);

-- Disable identity column behavior for inserts
ALTER TABLE private.archived_temporary_data ALTER COLUMN id DROP IDENTITY IF EXISTS;

-- Create the archiving function in private schema with better batch handling
CREATE OR REPLACE FUNCTION private.archive_temp_data(
    batch_size INT DEFAULT 10000,
    max_runtime_seconds INT DEFAULT 300,
    age_interval INTERVAL DEFAULT '1 week'
) RETURNS TABLE (
    archived_count BIGINT,
    remaining_count BIGINT
) LANGUAGE plpgsql AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    total_archived BIGINT := 0;
    batch_archived INT;
    remaining BIGINT;
    current_id INT := 0;
BEGIN
    -- Record start time for runtime limit enforcement
    start_time := clock_timestamp();
    end_time := start_time + (max_runtime_seconds * interval '1 second');
    
    -- Get initial count of records to archive
    SELECT COUNT(*) INTO remaining
    FROM public.temporary_data
    WHERE inserted IS NOT NULL 
      AND timestamp < NOW() - age_interval;
    
    -- Stop if nothing to archive
    IF remaining = 0 THEN
        archived_count := 0;
        remaining_count := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Process in batches until done or time limit reached
    LOOP
        -- Exit if runtime limit reached
        IF clock_timestamp() > end_time THEN
            EXIT;
        END IF;
        
        -- Temporarily store IDs to process in this batch
        CREATE TEMPORARY TABLE IF NOT EXISTS temp_batch_ids ON COMMIT DROP AS
        SELECT id 
        FROM public.temporary_data
        WHERE inserted IS NOT NULL 
          AND timestamp < NOW() - age_interval
          AND id > current_id
        ORDER BY id
        LIMIT batch_size;
        
        -- Get number of records in this batch
        SELECT COUNT(*) INTO batch_archived FROM temp_batch_ids;
        
        -- Exit loop if no more records to process
        IF batch_archived = 0 THEN
            EXIT;
        END IF;
        
        -- Get max ID in this batch to track progress
        SELECT MAX(id) INTO current_id FROM temp_batch_ids;
        
        -- Insert batch into archive table
        INSERT INTO private.archived_temporary_data
        SELECT t.*
        FROM public.temporary_data t
        JOIN temp_batch_ids b ON t.id = b.id;
        
        -- Delete the archived records
        DELETE FROM public.temporary_data t
        USING temp_batch_ids b
        WHERE t.id = b.id;
        
        -- Update running total
        total_archived := total_archived + batch_archived;
        
        -- Clean up the temporary table (will be dropped on COMMIT anyway)
        DROP TABLE temp_batch_ids;
    END LOOP;
    
    -- Get remaining count
    SELECT COUNT(*) INTO remaining
    FROM public.temporary_data
    WHERE inserted IS NOT NULL 
      AND timestamp < NOW() - age_interval;
    
    -- Return statistics
    archived_count := total_archived;
    remaining_count := remaining;
    RETURN NEXT;
    
    RETURN;
END;
$$;

-- Create an index on the archive table to match the primary key of the source
CREATE INDEX IF NOT EXISTS archived_temp_data_pk_idx ON 
    private.archived_temporary_data(type, originator_id, item_id, timestamp);

-- Create additional indexes to optimize queries on the archive table
CREATE INDEX IF NOT EXISTS archived_temp_data_timestamp_idx ON 
    private.archived_temporary_data(timestamp);
CREATE INDEX IF NOT EXISTS archived_temp_data_inserted_idx ON 
    private.archived_temporary_data(inserted);

-- Add a comment to document the function
COMMENT ON FUNCTION private.archive_temp_data IS 
    'Archives records from public.temporary_data to private.archived_temporary_data where inserted IS NOT NULL and timestamp is older than the specified interval. Processes data in batches using ID ranges for efficiency.';

-- Example usage:
-- SELECT * FROM private.archive_temp_data(batch_size := 5000, max_runtime_seconds := 600, age_interval := interval '2 weeks');